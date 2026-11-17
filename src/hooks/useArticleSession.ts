/**
 * @file 文章编辑会话 Hook。管理草稿加载、本地恢复、保存、封面上传和发布。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/authContext';
import { message, Modal } from 'antd';
import type { Editor } from '@tiptap/core';
import {
  articleAccountKey,
  createArticle,
  getArticle,
  publishArticle,
  saveArticle,
  uploadArticleAsset,
  type ArticleContent,
  type ArticleDraft,
} from '@/api/articles';
import { fetchDocumentAssetBlob, type TipTapDocument } from '@/api/rag';
import {
  collectAssetIds,
  editorHtmlToMarkdown,
  hydrateEditorContent,
  hydrateMarkdownAssets,
  persistInlineImages,
  stabilizeEditorContent,
  revokeAssetBlobs,
  type AssetBlobMap,
} from '@/lib/knowledge-editor';
import {
  articleError,
  articleRecoveryKey,
  readArticleRecovery,
  validateArticle,
} from '@/lib/article-draft';
import marked from '@/utils/marked';

type SaveState = 'idle' | 'loading' | 'dirty' | 'saving' | 'saved' | 'error';
/**
 * 创建尚未保存文章的初始草稿数据。
 *
 * @returns ArticleContent 类型的处理结果。
 */
const emptyDraft = (): ArticleContent => ({
  title: '',
  content: '',
  editor_content: null,
  summary: '',
  tags: [],
  cover_asset_id: null,
  asset_ids: [],
});
/**
 * 读取当前登录身份，生成草稿恢复使用的账号标识。
 *
 * @returns 整理后的文本或标识。
 */
async function resolveAccount() {
  const key = await articleAccountKey();
  sessionStorage.setItem(
    'livedoc:article-account',
    JSON.stringify({ key, token: sessionStorage.getItem('token') }),
  );
  return key;
}
/**
 * 从本地已缓存的身份信息取得账号标识。
 *
 * @returns 整理后的文本或标识。
 */
function cachedAccount() {
  try {
    const cached = JSON.parse(
      sessionStorage.getItem('livedoc:article-account') || 'null',
    );
    return cached?.token && cached.token === sessionStorage.getItem('token')
      ? String(cached.key)
      : null;
  } catch {
    return null;
  }
}

/**
 * 连接编辑器与文章草稿，管理恢复、保存、图片上传和发布。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param enabled 是否启用当前功能。
 * @returns 供后续操作使用的回调或清理函数。
 */
export function useArticleSession(editor: Editor | null, enabled: boolean) {
  const [params, setParams] = useSearchParams();
  const urlId = params.get('articleId');
  const navigate = useNavigate();
  const { isLoggedIn, requireAuth } = useAuth();
  const [draft, setDraftState] = useState<ArticleContent>(emptyDraft);
  const [record, setRecordState] = useState<ArticleDraft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const current = useRef(emptyDraft());
  const recordRef = useRef<ArticleDraft | null>(null);
  const idRef = useRef(urlId || crypto.randomUUID().replaceAll('-', ''));
  const account = useRef('guest');
  const revision = useRef(0);
  const hydrating = useRef(false);
  const loadedId = useRef<string | null>(null);
  const blobUrls = useRef<AssetBlobMap>(new Map());
  const inFlight = useRef<Promise<ArticleDraft | null> | null>(null);
  const mounted = useRef(true);
  const blocked = useRef(false);
  const recoveryVersion = useRef<number | null>(null);

  /**
   * 更新当前文章记录，并同步会话内部的版本引用。
   *
   * @param value 待校验或转换的值。
   */
  const setRecord = (value: ArticleDraft) => {
    recordRef.current = value;
    if (mounted.current) setRecordState(value);
  };
  /**
   * 从编辑器与表单收集当前草稿，稳定图片资源引用后生成保存快照。
   *
   * @returns TipTap 文档 JSON列表；未找到或不可用时可能为空。
   */
  const snapshot = useCallback(
    () => ({
      ...current.current,
      editor_content: editor
        ? stabilizeEditorContent(
            editor.getJSON() as TipTapDocument,
            blobUrls.current,
          )
        : null,
      content: editor
        ? editorHtmlToMarkdown(editor.getHTML(), blobUrls.current)
        : current.current.content,
    }),
    [editor],
  );
  /**
   * 从账号隔离的本地备份恢复尚未保存的草稿。
   */
  const recover = useCallback(() => {
    try {
      localStorage.setItem(
        articleRecoveryKey(account.current, idRef.current),
        JSON.stringify({
          article_id: idRef.current,
          expected_version:
            recoveryVersion.current ?? recordRef.current?.draft_version ?? 1,
          draft: snapshot(),
          saved_at: Date.now(),
        }),
      );
      if (!recordRef.current)
        localStorage.setItem(
          articleRecoveryKey(account.current, 'new'),
          idRef.current,
        );
    } catch {
      /* The unsaved page remains usable when local storage is full. */
    }
  }, [snapshot]);
  /**
   * 在用户编辑后更新草稿状态并标记未保存修改。
   *
   * @param patch 仅包含待修改字段的补丁对象。
   */
  const change = useCallback(
    (patch: Partial<ArticleContent>) => {
      current.current = { ...current.current, ...patch };
      setDraftState(current.current);
      revision.current += 1;
      setSaveState('dirty');
      recover();
    },
    [recover],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revokeAssetBlobs(blobUrls.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !editor || (urlId && loadedId.current === urlId)) return;
    let cancelled = false;
    hydrating.current = true;
    blocked.current = false;
    setError('');
    setSaveState(urlId ? 'loading' : 'idle');
    if (!urlId) {
      idRef.current = crypto.randomUUID().replaceAll('-', '');
      recordRef.current = null;
      setRecordState(null);
      current.current = emptyDraft();
      setDraftState(current.current);
      editor.commands.clearContent(false);
      hydrating.current = false;
      loadedId.current = null;
      const startRevision = revision.current;
      void (async () => {
        try {
          account.current = isLoggedIn ? await resolveAccount() : 'guest';
          const pendingId = localStorage.getItem(
            articleRecoveryKey(account.current, 'new'),
          );
          const recovery = pendingId
            ? readArticleRecovery(
                localStorage.getItem(
                  articleRecoveryKey(account.current, pendingId),
                ),
                pendingId,
              )
            : null;
          if (!recovery || cancelled || revision.current !== startRevision)
            return;
          const json = recovery.draft.editor_content
            ? await hydrateEditorContent(
                recovery.draft.editor_content,
                fetchDocumentAssetBlob,
                blobUrls.current,
              )
            : null;
          if (cancelled || revision.current !== startRevision) return;
          idRef.current = recovery.article_id;
          current.current = recovery.draft;
          setDraftState(current.current);
          hydrating.current = true;
          editor.commands.setContent(
            json ?? marked.parse(recovery.draft.content),
            { emitUpdate: false },
          );
          hydrating.current = false;
          setSaveState('dirty');
          message.info('已恢复尚未保存的文章');
        } catch {
          /* An empty new article stays editable when recovery is unavailable. */
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    idRef.current = urlId;
    editor.setEditable(false);
    void (async () => {
      try {
        // Recover text before a network request; an unavailable API must not turn a saved local draft into a blank editor.
        const previousAccount = cachedAccount();
        if (previousAccount) {
          account.current = previousAccount;
          const local = readArticleRecovery(
            localStorage.getItem(articleRecoveryKey(previousAccount, urlId)),
            urlId,
          );
          if (local && !cancelled) {
            current.current = local.draft;
            setDraftState(local.draft);
            recoveryVersion.current = local.expected_version;
            editor.commands.setContent(
              local.draft.editor_content ?? marked.parse(local.draft.content),
              { emitUpdate: false },
            );
          }
        }
        account.current = await resolveAccount();
        const loaded = await getArticle(urlId);
        let recovery = null;
        try {
          recovery = readArticleRecovery(
            localStorage.getItem(articleRecoveryKey(account.current, urlId)),
            urlId,
          );
        } catch {
          /* no recovery */
        }
        const content = recovery?.draft ?? loaded.draft;
        if (cancelled) return;
        current.current = content;
        setDraftState(content);
        setRecord(loaded);
        editor.commands.setContent(
          content.editor_content ?? marked.parse(content.content),
          { emitUpdate: false },
        );
        const json = content.editor_content
          ? await hydrateEditorContent(
              content.editor_content,
              fetchDocumentAssetBlob,
              blobUrls.current,
            )
          : null;
        const markdown = json
          ? ''
          : await hydrateMarkdownAssets(
              content.content,
              fetchDocumentAssetBlob,
              blobUrls.current,
            );
        if (cancelled) return;
        current.current = content;
        setDraftState(content);
        setRecord(loaded);
        editor.commands.setContent(json ?? marked.parse(markdown), {
          emitUpdate: false,
        });
        loadedId.current = urlId;
        recoveryVersion.current = recovery?.expected_version ?? null;
        if (recovery && recovery.expected_version !== loaded.draft_version) {
          blocked.current = true;
          setError(
            '恢复了本地修改，但服务器已有新版本。请复制修改后重新加载服务器版本。',
          );
        } else if (recovery) message.info('已恢复未保存的本地修改');
        setSaveState(recovery ? 'dirty' : 'saved');
      } catch (cause) {
        if (!cancelled) {
          const status = (cause as any)?.response?.status;
          blocked.current =
            recoveryVersion.current === null ||
            status === 403 ||
            status === 404;
          setError(articleError(cause));
          setSaveState('error');
        }
      } finally {
        if (!cancelled) {
          hydrating.current = false;
          editor.setEditable(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, editor, urlId]);

  useEffect(() => {
    if (!enabled || !editor) return;
    /**
     * 响应用户编辑并标记草稿已修改，忽略初始化填充造成的更新。
     */
    const update = () => {
      if (!hydrating.current) change({});
    };
    editor.on('update', update);
    /**
     * 在离开页面时处理尚未保存的草稿。
     *
     * @param event 需要处理的事件。
     */
    const unload = (event: BeforeUnloadEvent) => {
      if (
        saveState === 'dirty' ||
        saveState === 'saving' ||
        saveState === 'error'
      ) {
        recover();
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      editor.off('update', update);
      window.removeEventListener('beforeunload', unload);
    };
  }, [enabled, editor, change, recover, saveState]);

  /**
   * 在需要服务端身份时先创建草稿记录。
   *
   * @returns 文章草稿记录。
   */
  const ensureRecord = useCallback(async () => {
    const signedInAccount = await resolveAccount();
    if (recordRef.current) {
      if (
        signedInAccount !==
        `${recordRef.current.space_id}:${recordRef.current.owner_id}`
      )
        throw { response: { status: 403 } };
      return recordRef.current;
    }
    account.current = signedInAccount;
    const created = await createArticle(idRef.current);
    setRecord(created);
    loadedId.current = created.article_id;
    setParams({ articleId: created.article_id }, { replace: true });
    recover();
    try {
      localStorage.removeItem(articleRecoveryKey(account.current, 'new'));
    } catch {
      /* no pending pointer */
    }
    return created;
  }, [setParams, recover]);

  /**
   * 复用进行中的保存请求，处理图片上传与草稿版本更新。
   *
   * @returns 文章草稿记录。
   */
  const save = useCallback(async (): Promise<ArticleDraft | null> => {
    if (inFlight.current) return inFlight.current;
    if (!editor || !enabled || hydrating.current || blocked.current)
      return null;
    const startedRevision = revision.current;
    const raw = snapshot();
    setError('');
    setSaveState('saving');
    recover();
    const work = (async () => {
      try {
        const base = await ensureRecord();
        const original = raw.editor_content!;
        const stable = await persistInlineImages(
          stabilizeEditorContent(original, blobUrls.current),
          (file) => uploadArticleAsset(base.article_id, file),
          blobUrls.current,
        );
        // Cache data URLs as well as blob URLs so autosave does not upload the same inline image repeatedly.
        const originalImages: string[] = [];
        const savedImages: string[] = [];
        /**
         * 收集编辑器与发布表单中的当前文章内容。
         *
         * @param node 当前语法树或编辑器节点。
         * @param target 本次操作或定位的目标。
         */
        const collect = (node: any, target: string[]) => {
          if (node.type === 'image') target.push(node.attrs.src);
          node.content?.forEach((child: any) => collect(child, target));
        };
        collect(original, originalImages);
        collect(stable, savedImages);
        originalImages.forEach((src, index) => {
          const match = savedImages[index]?.match(/\/assets\/([^/]+)\/content/);
          if (match) blobUrls.current.set(src, match[1]);
        });
        let markdown = raw.content;
        originalImages.forEach((src) => {
          const assetId = blobUrls.current.get(src);
          if (assetId)
            markdown = markdown.replaceAll(src, `/assets/${assetId}/content`);
        });
        const prepared = {
          ...raw,
          content: markdown,
          editor_content: stable,
          asset_ids: collectAssetIds(stable, blobUrls.current),
        };
        if (prepared.cover_asset_id)
          prepared.asset_ids.push(prepared.cover_asset_id);
        const saved = await saveArticle(
          base.article_id,
          prepared,
          recoveryVersion.current ?? base.draft_version,
        );
        setRecord(saved);
        recoveryVersion.current = null;
        if (revision.current === startedRevision) {
          current.current = { ...current.current, content: markdown };
          try {
            localStorage.removeItem(
              articleRecoveryKey(account.current, base.article_id),
            );
          } catch {
            /* keep saved content */
          }
          if (mounted.current) setSaveState('saved');
        } else {
          recover();
          if (mounted.current) setSaveState('dirty');
        }
        return saved;
      } catch (cause) {
        if ((cause as any)?.response?.status === 409) blocked.current = true;
        recover();
        if (mounted.current) {
          setError(articleError(cause));
          setSaveState('error');
        }
        return null;
      }
    })();
    inFlight.current = work;
    try {
      return await work;
    } finally {
      inFlight.current = null;
    }
  }, [editor, enabled, ensureRecord, snapshot, recover]);

  useEffect(() => {
    if (!enabled || !isLoggedIn || saveState !== 'dirty' || blocked.current)
      return;
    const timer = setTimeout(() => void save(), 2000);
    return () => clearTimeout(timer);
  }, [draft, enabled, isLoggedIn, saveState, save]);

  /**
   * 请求保存当前草稿，并协调进行中的保存操作。
   */
  const requestSave = useCallback(
    () =>
      requireAuth(() => {
        void save();
      }),
    [requireAuth, save],
  );
  /**
   * 先保存当前草稿，再按校验结果提交正式发布请求。
   *
   * @param includeInKnowledge 发布后是否将文章纳入知识库检索（可选）。
   */
  const publish = useCallback(
    (includeInKnowledge?: boolean) =>
      requireAuth(() => {
        void (async () => {
          const validation = validateArticle(
            current.current,
            Boolean(
              editor?.getText().trim() || editor?.getHTML().includes('<img'),
            ),
          );
          if (validation) {
            message.warning(validation);
            return;
          }
          editor?.setEditable(false);
          let saved = await save();
          if (!saved) {
            editor?.setEditable(true);
            return;
          }
          // Flush edits that arrived during an in-flight autosave before publishing that version.
          if (inFlight.current) await inFlight.current;
          saved = await save();
          if (!saved) {
            editor?.setEditable(true);
            return;
          }
          setSaveState('saving');
          try {
            const published = await publishArticle(
              saved.article_id,
              saved.draft_version,
              includeInKnowledge,
            );
            setRecord(published);
            setSaveState('saved');
            message.success(
              published.include_in_knowledge
                ? '文章已发布，正在同步到知识库'
                : '文章已发布',
            );
            navigate(`/post/${saved.article_id}`);
          } catch (cause) {
            setError(articleError(cause));
            setSaveState('error');
            recover();
          } finally {
            editor?.setEditable(true);
          }
        })();
      }),
    [editor, requireAuth, save, navigate, recover],
  );

  /**
   * 上传封面图片并更新草稿中的封面资源标识。
   *
   * @param file 待上传或解析的文件。
   * @returns 整理后的文本或标识。
   */
  const uploadCover = useCallback(
    async (file: File) => {
      if (!isLoggedIn) {
        requireAuth(() => undefined);
        throw new Error('请先登录后上传封面');
      }
      const base = await ensureRecord();
      const asset = await uploadArticleAsset(base.article_id, file);
      const blob = URL.createObjectURL(file);
      blobUrls.current.set(blob, asset.asset_id);
      change({ cover_asset_id: asset.asset_id });
      return blob;
    },
    [isLoggedIn, requireAuth, ensureRecord, change],
  );
  /**
   * 检查未保存内容后执行离开编辑页的操作。
   */
  const leave = useCallback(() => {
    /**
     * 执行用户确认后的页面导航。
     */
    const go = () => {
      recover();
      navigate('/creator/articles');
    };
    if (['dirty', 'saving', 'error'].includes(saveState))
      Modal.confirm({
        title: '离开编辑器？',
        content: '未保存的修改会保留在当前浏览器，可以返回继续编辑。',
        okText: '离开',
        cancelText: '继续编辑',
        onOk: go,
      });
    else navigate('/creator/articles');
  }, [saveState, recover, navigate]);
  return {
    draft,
    record,
    saveState,
    error,
    change,
    requestSave,
    publish,
    uploadCover,
    leave,
    statusText: {
      idle: '尚未保存',
      loading: '正在加载',
      dirty: '有未保存修改',
      saving: '正在保存',
      saved: '草稿已保存',
      error: '保存失败',
    }[saveState],
  };
}
