import {
  confirmDocumentImport,
  createKnowledgeDocument,
  fetchDocumentAssetBlob,
  getDocumentImport,
  getKnowledgeDocument,
  reindexKnowledgeDocument,
  updateDocumentImport,
  updateKnowledgeDocument,
  uploadDocumentAsset,
  type DocumentImportRecord,
  type DocumentRecord,
  type TipTapDocument,
} from '@/api/rag';
import {
  collectAssetIds,
  editorHtmlToMarkdown,
  hydrateEditorContent,
  hydrateMarkdownAssets,
  persistInlineImages,
  revokeAssetBlobs,
  type AssetBlobMap,
} from '@/lib/knowledge-editor';
import marked from '@/utils/marked';
import { locateCitationRange } from '@/lib/citation-location';
import type { Editor } from '@tiptap/core';
import { message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

type SaveState = 'idle' | 'loading' | 'dirty' | 'saving' | 'saved' | 'error';

export function useKnowledgeDocumentSession(editor: Editor | null) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get('mode');
  const docId = searchParams.get('docId') || undefined;
  const importId = searchParams.get('importId') || undefined;
  const focusCitationKey = searchParams.get('focusCitation') || undefined;
  const isKnowledgeMode = mode === 'knowledge';
  const [title, setTitleState] = useState('');
  const [saveState, setSaveState] = useState<SaveState>(
    isKnowledgeMode ? 'loading' : 'idle',
  );
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(
    null,
  );
  const [importRecord, setImportRecord] = useState<DocumentImportRecord | null>(
    null,
  );
  const hydrating = useRef(false);
  const blobUrls = useRef<AssetBlobMap>(new Map());
  const saveInFlight = useRef(false);
  const expectedVersion = useRef<number | null>(null);

  const defaults = useMemo(() => {
    const space = searchParams.get('space') || 'private';
    const folder = searchParams.get('folder') || '';
    const team = space.startsWith('team:') ? space.slice(5) : undefined;
    return {
      visibility: team
        ? ('team' as const)
        : space === 'public'
          ? ('public' as const)
          : ('private' as const),
      teamId: team,
      tags: folder && !['全部文档', '未分类'].includes(folder) ? [folder] : [],
    };
  }, [searchParams]);

  const setTitle = useCallback((value: string) => {
    setTitleState(value);
    if (isKnowledgeMode && !hydrating.current) setSaveState('dirty');
  }, [isKnowledgeMode]);

  useEffect(() => {
    if (!editor || !isKnowledgeMode) return;
    let canceled = false;
    const load = async () => {
      const preserveLocalChanges =
        saveState === 'dirty' || saveState === 'error';
      hydrating.current = true;
      setSaveState('loading');
      try {
        if (docId) {
          const record = await getKnowledgeDocument(docId);
          if (canceled) return;
          setDocumentRecord(record);
          expectedVersion.current = record.document_version;
          const recovery = readRecoveryDraft(docId);
          if (recovery && recovery.markdown !== record.content) {
            setTitleState(recovery.title);
            editor.commands.setContent(
              await hydrateEditorContent(
                recovery.editorContent,
                fetchDocumentAssetBlob,
                blobUrls.current,
              ),
            );
            setSaveState('dirty');
            message.warning(
              recovery.baseVersion === record.document_version
                ? '已恢复浏览器中未保存的文档修改'
                : `已恢复本地草稿；服务器文档已从 v${recovery.baseVersion} 更新到 v${record.document_version}，保存前请确认内容`,
            );
            return;
          }
          clearRecoveryDraft(docId);
          setTitleState(record.title);
          if (record.editor_content) {
            editor.commands.setContent(
              await hydrateEditorContent(
                record.editor_content,
                fetchDocumentAssetBlob,
                blobUrls.current,
              ),
            );
          } else {
            const markdown = await hydrateMarkdownAssets(
              record.content,
              fetchDocumentAssetBlob,
              blobUrls.current,
            );
            editor.commands.setContent(String(marked.parse(markdown)));
          }
          focusStoredCitation(editor, record, focusCitationKey);
        } else if (importId) {
          expectedVersion.current = null;
          const record = await getDocumentImport(importId);
          if (canceled) return;
          if (record.status === 'confirmed' && record.document_id) {
            setImportRecord(record);
            if (preserveLocalChanges) {
              setSaveState('dirty');
              message.info('导入已经确认；点击保存会将当前修改写入正式文档');
              return;
            }
            navigate(
              `/editor/draft?mode=knowledge&docId=${encodeURIComponent(record.document_id)}`,
              { replace: true },
            );
            return;
          }
          setImportRecord(record);
          setTitleState(record.title);
          if (record.editor_content) {
            editor.commands.setContent(
              await hydrateEditorContent(
                record.editor_content,
                fetchDocumentAssetBlob,
                blobUrls.current,
              ),
            );
          } else {
            const markdown = await hydrateMarkdownAssets(
              record.parsed_content,
              fetchDocumentAssetBlob,
              blobUrls.current,
            );
            editor.commands.setContent(String(marked.parse(markdown)));
          }
        } else {
          expectedVersion.current = null;
          setDocumentRecord(null);
          setImportRecord(null);
          setTitleState('');
          editor.commands.clearContent();
        }
        setSaveState('saved');
      } catch (error) {
        console.error(error);
        if (!canceled) {
          setSaveState('error');
          message.error('知识文档加载失败');
        }
      } finally {
        hydrating.current = false;
      }
    };
    void load();
    return () => {
      canceled = true;
    };
  }, [docId, editor, focusCitationKey, importId, isKnowledgeMode, navigate]);

  useEffect(() => {
    if (!editor || !isKnowledgeMode) return;
    const onUpdate = () => {
      if (!hydrating.current) setSaveState('dirty');
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor, isKnowledgeMode]);

  useEffect(() => {
    if (!isKnowledgeMode || saveState !== 'dirty') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isKnowledgeMode, saveState]);

  useEffect(
    () => () => revokeAssetBlobs(blobUrls.current),
    [],
  );

  const prepareContent = useCallback(async () => {
    if (!editor) throw new Error('编辑器尚未加载');
    const parent = importId
      ? { import_id: importId }
      : docId
        ? { doc_id: docId }
        : {};
    const stable = await persistInlineImages(
      editor.getJSON() as TipTapDocument,
      (file) => uploadDocumentAsset(file, parent),
      blobUrls.current,
    );
    hydrating.current = true;
    try {
      editor.commands.setContent(
        await hydrateEditorContent(
          stable,
          fetchDocumentAssetBlob,
          blobUrls.current,
        ),
      );
    } finally {
      hydrating.current = false;
    }
    return {
      editorContent: stable,
      markdown: editorHtmlToMarkdown(editor.getHTML(), blobUrls.current),
      assetIds: collectAssetIds(stable, blobUrls.current),
    };
  }, [docId, editor, importId]);

  const save = useCallback(
    async (confirmImport = true) => {
      if (
        !editor ||
        !isKnowledgeMode ||
        saveState === 'saving' ||
        saveInFlight.current
      ) return;
      if (!title.trim()) {
        message.warning('请先填写文档标题');
        return;
      }
      saveInFlight.current = true;
      setSaveState('saving');
      let prepared: Awaited<ReturnType<typeof prepareContent>> | undefined;
      try {
        prepared = await prepareContent();
        if (importId) {
          try {
            await updateDocumentImport(importId, {
              title: title.trim(),
              content: prepared.markdown,
              editor_content: prepared.editorContent,
              asset_ids: prepared.assetIds,
            });
          } catch (importUpdateError) {
            if ((importUpdateError as any)?.response?.status !== 409) {
              throw importUpdateError;
            }
            const currentImport = await getDocumentImport(importId);
            if (
              currentImport.status !== 'confirmed' ||
              !currentImport.document_id
            ) {
              throw importUpdateError;
            }
            const latest = await getKnowledgeDocument(currentImport.document_id);
            const record = await updateKnowledgeDocument(
              currentImport.document_id,
              {
                title: title.trim(),
                content: prepared.markdown,
                editor_content: prepared.editorContent,
                asset_ids: prepared.assetIds,
                expected_version: latest.document_version,
              },
            );
            setDocumentRecord(record);
            expectedVersion.current = record.document_version;
            setImportRecord(currentImport);
            clearRecoveryDraft(record.doc_id);
            setSaveState('saved');
            try {
              await reindexKnowledgeDocument(record.doc_id);
              message.success('导入已确认，当前修改已直接保存到正式文档');
            } catch (indexError) {
              console.error(indexError);
              message.warning('正文已经保存，但索引任务启动失败，请在知识库中重新索引');
            }
            navigate(
              `/editor/draft?mode=knowledge&docId=${encodeURIComponent(record.doc_id)}`,
              { replace: true },
            );
            return;
          }
          if (!confirmImport) {
            setSaveState('saved');
            message.success('预览修改已保存');
            return;
          }
          const result = await confirmDocumentImport(importId);
          setDocumentRecord(result.document);
          expectedVersion.current = result.document.document_version;
          setImportRecord((current) =>
            current
              ? { ...current, status: 'confirmed', document_id: result.document.doc_id }
              : current,
          );
          setSaveState('saved');
          message.success('已保存到知识库并发起索引');
          navigate(
            `/editor/draft?mode=knowledge&docId=${encodeURIComponent(result.document.doc_id)}`,
            { replace: true },
          );
          return;
        }

        if (docId) {
          const record = await updateKnowledgeDocument(docId, {
            title: title.trim(),
            content: prepared.markdown,
            editor_content: prepared.editorContent,
            asset_ids: prepared.assetIds,
            expected_version:
              expectedVersion.current ?? documentRecord?.document_version,
          });
          setDocumentRecord(record);
          expectedVersion.current = record.document_version;
          clearRecoveryDraft(docId);
          setSaveState('saved');
          try {
            await reindexKnowledgeDocument(docId);
            message.success('文档已保存并发起索引');
          } catch (indexError) {
            console.error(indexError);
            message.warning('正文已经保存，但索引任务启动失败，请在知识库中重新索引');
          }
          return;
        }

        const record = await createKnowledgeDocument({
          title: title.trim(),
          content: prepared.markdown,
          editor_content: prepared.editorContent,
          asset_ids: prepared.assetIds,
          visibility: defaults.visibility,
          source_type:
            defaults.visibility === 'team'
              ? 'team_doc'
              : defaults.visibility === 'public'
                ? 'public_article'
                : 'note',
          team_id: defaults.teamId,
          tags: defaults.tags,
          index_now: true,
        });
        setDocumentRecord(record);
        expectedVersion.current = record.document_version;
        setSaveState('saved');
        message.success('文档已保存到知识库');
        navigate(
          `/editor/draft?mode=knowledge&docId=${encodeURIComponent(record.doc_id)}`,
          { replace: true },
        );
      } catch (error) {
        console.error(error);
        if (prepared && docId) {
          writeRecoveryDraft(docId, {
            title: title.trim(),
            markdown: prepared.markdown,
            editorContent: prepared.editorContent,
            assetIds: prepared.assetIds,
            baseVersion:
              expectedVersion.current ?? documentRecord?.document_version ?? 0,
          });
        }
        if ((error as any)?.response?.status === 409) {
          if (prepared && docId) {
            try {
              const latest = await getKnowledgeDocument(docId);
              if (
                latest.title === title.trim() &&
                latest.content === prepared.markdown
              ) {
                setDocumentRecord(latest);
                expectedVersion.current = latest.document_version;
                clearRecoveryDraft(docId);
                setSaveState('saved');
                try {
                  await reindexKnowledgeDocument(docId);
                  message.success('正文此前已保存，已同步最新版本并重新发起索引');
                } catch (indexError) {
                  console.error(indexError);
                  message.warning('正文已经保存，但索引任务启动失败，请在知识库中重新索引');
                }
                return;
              }
              // Personal/private and owner-managed public documents are edited
              // as a single full-document draft. A stale client version here is
              // normally caused by an earlier successful PATCH whose reindex
              // step failed. Rebase once onto the latest server version so the
              // user's current editor content remains the source of truth.
              if (latest.visibility !== 'team') {
                const retried = await updateKnowledgeDocument(docId, {
                  title: title.trim(),
                  content: prepared.markdown,
                  editor_content: prepared.editorContent,
                  asset_ids: prepared.assetIds,
                  expected_version: latest.document_version,
                });
                setDocumentRecord(retried);
                expectedVersion.current = retried.document_version;
                clearRecoveryDraft(docId);
                setSaveState('saved');
                try {
                  await reindexKnowledgeDocument(docId);
                  message.success('已同步服务器最新版本并保存当前内容');
                } catch (indexError) {
                  console.error(indexError);
                  message.warning('正文已经保存，但索引任务启动失败，请在知识库中重新索引');
                }
                return;
              }
            } catch (refreshError) {
              console.error(refreshError);
            }
          }
          setSaveState('dirty');
          message.error('服务器存在不同版本；当前修改已保留为本地恢复草稿，刷新后不会丢失');
        } else {
          setSaveState('error');
          message.error(error instanceof Error ? error.message : '保存失败');
        }
      } finally {
        saveInFlight.current = false;
      }
    }, [
      defaults,
      docId,
      editor,
      importId,
      isKnowledgeMode,
      navigate,
      prepareContent,
      saveState,
      title,
    ],
  );

  const leave = useCallback(() => {
    if (saveState === 'dirty' && !window.confirm('当前修改尚未保存，确定返回知识库吗？')) {
      return;
    }
    navigate('/knowledge');
  }, [navigate, saveState]);

  const statusText = {
    idle: '保存成功',
    loading: '正在加载',
    dirty: '有未保存修改',
    saving: '正在保存',
    saved: '已保存',
    error: '保存失败',
  }[saveState];

  return {
    isKnowledgeMode,
    title,
    setTitle,
    saveState,
    statusText,
    documentRecord,
    importRecord,
    saveToKnowledge: () => save(true),
    saveDraft: () => save(false),
    leave,
  };
}

function focusStoredCitation(
  editor: Editor,
  record: DocumentRecord,
  storageKey?: string,
) {
  if (!storageKey) return;
  const raw = sessionStorage.getItem(storageKey);
  sessionStorage.removeItem(storageKey);
  if (!raw) return;
  let citation: {
    document_version: number;
    snippet: string;
    source_anchor?: string;
    chunk_id?: string;
    start_offset?: number | null;
    end_offset?: number | null;
  };
  try {
    citation = JSON.parse(raw) as typeof citation;
  } catch {
    message.warning('引用定位信息已失效');
    return;
  }
  if (record.document_version !== citation.document_version) {
    message.warning(
      `该引用来自文档 v${citation.document_version}，当前已是 v${record.document_version}，为避免误定位已停止自动跳转`,
    );
    return;
  }
  window.setTimeout(() => {
    const range = locateCitationRange(editor, record.content, {
      snippet: citation.snippet,
      startOffset: citation.start_offset,
      endOffset: citation.end_offset,
    });
    if (range) {
      editor
        .chain()
        .focus()
        .setTextSelection(range)
        .scrollIntoView()
        .run();
    }
    if (range) {
      message.success(
        range.strategy === 'source_offset'
          ? '已按来源位置定位并高亮引用原文'
          : '来源偏移不可用，已通过片段定位引用原文',
      );
    }
    else message.warning(`文档版本一致，但未找到片段位置（${citation.source_anchor || citation.chunk_id || 'unknown'}）`);
  }, 0);
}

interface KnowledgeRecoveryDraft {
  title: string;
  markdown: string;
  editorContent: TipTapDocument;
  assetIds: string[];
  baseVersion: number;
  savedAt: string;
}

function recoveryDraftKey(docId: string) {
  return `livedoc:knowledge-recovery:${docId}`;
}

function writeRecoveryDraft(
  docId: string,
  draft: Omit<KnowledgeRecoveryDraft, 'savedAt'>,
) {
  try {
    localStorage.setItem(
      recoveryDraftKey(docId),
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
  } catch (error) {
    console.error('Unable to persist knowledge recovery draft', error);
    message.warning('保存失败且浏览器恢复草稿写入失败，请先复制当前内容');
  }
}

function readRecoveryDraft(docId: string): KnowledgeRecoveryDraft | null {
  const raw = localStorage.getItem(recoveryDraftKey(docId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<KnowledgeRecoveryDraft>;
    if (
      typeof value.title !== 'string' ||
      typeof value.markdown !== 'string' ||
      !value.editorContent ||
      value.editorContent.type !== 'doc' ||
      !Array.isArray(value.assetIds) ||
      typeof value.baseVersion !== 'number' ||
      typeof value.savedAt !== 'string'
    ) {
      clearRecoveryDraft(docId);
      return null;
    }
    return value as KnowledgeRecoveryDraft;
  } catch {
    clearRecoveryDraft(docId);
    return null;
  }
}

function clearRecoveryDraft(docId: string) {
  localStorage.removeItem(recoveryDraftKey(docId));
}
