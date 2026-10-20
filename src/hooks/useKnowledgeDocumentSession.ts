// ==================== 导入依赖 ====================
import {
  confirmDocumentImport, // 确认导入文档并创建正式文档
  createKnowledgeDocument, // 创建知识文档
  fetchDocumentAssetBlob, // 获取文档资源的 Blob 数据
  getDocumentImport, // 获取导入记录
  getKnowledgeDocument, // 获取知识文档
  reindexKnowledgeDocument, // 重新索引知识文档
  updateDocumentImport, // 更新导入记录
  updateKnowledgeDocument, // 更新知识文档
  uploadDocumentAsset, // 上传文档资源
  type DocumentImportRecord, // 导入记录类型
  type DocumentRecord, // 文档记录类型
  type TipTapDocument, // TipTap 文档结构类型
} from '@/api/rag';
import {
  collectAssetIds, // 收集文档中所有资源 ID
  editorHtmlToMarkdown, // 将编辑器 HTML 转换为 Markdown
  hydrateEditorContent, // 填充编辑器内容(替换资源 URL 为 Blob URL)
  hydrateMarkdownAssets, // 填充 Markdown 中的资源引用
  persistInlineImages, // 持久化内联图片(上传到服务器)
  revokeAssetBlobs, // 释放 Blob URL(防止内存泄漏)
  type AssetBlobMap, // 资源 ID 到 Blob URL 的映射
} from '@/lib/knowledge-editor';
import { locateCitationRange } from '@/lib/citation-location'; // 引用定位工具
import type { Editor } from '@tiptap/core';
import { message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCategoryTree, getTemplates, categoryMutation } from '@/api/workspace';

// 保存状态枚举:空闲、加载中、有未保存修改、保存中、已保存、错误
type SaveState = 'idle' | 'loading' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * 知识文档会话管理 Hook
 * 负责知识文档编辑器的完整生命周期管理,包括:
 * 1. 文档加载(新建/已有/导入)
 * 2. 草稿恢复(防止浏览器崩溃导致数据丢失)
 * 3. 内容保存(图片上传、版本控制、索引触发)
 * 4. 冲突处理(乐观锁、幂等性检查)
 * 5. 引用定位(高亮跳转到引用来源)
 *
 * @param editor TipTap 编辑器实例
 * @returns 会话状态和操作方法
 */
export function useKnowledgeDocumentSession(editor: Editor | null) {
  // ==================== URL 参数解析 ====================
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mode = searchParams.get('mode'); // 编辑模式: 'knowledge' 表示知识库模式
  const docId = searchParams.get('docId') || undefined; // 文档 ID(已有文档)
  const importId = searchParams.get('importId') || undefined; // 导入 ID(导入文档)
  const focusCitationKey = searchParams.get('focusCitation') || undefined; // 引用定位键(从 session storage 读取引用信息)
  const templateId = searchParams.get('templateId') || undefined;
  const categoryId = searchParams.get('categoryId') || undefined;
  const isKnowledgeMode = mode === 'knowledge';

  // ==================== 状态定义 ====================
  const [title, setTitleState] = useState(''); // 文档标题
  const [saveState, setSaveState] = useState<SaveState>(
    // 知识库模式初始化为 loading,普通编辑器模式为 idle
    isKnowledgeMode ? 'loading' : 'idle',
  );

  // 文档元数据记录(用于 PATCH 时传递 expected_version)
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(
    null,
  );

  // 导入记录(用于导入流程)
  const [importRecord, setImportRecord] = useState<DocumentImportRecord | null>(
    null,
  );

  // ==================== Ref 引用(避免触发重新渲染) ====================
  const hydrating = useRef(false); // 是否正在填充编辑器内容(防止 editor.on('update') 误触发 dirty)
  const blobUrls = useRef<AssetBlobMap>(new Map()); // 内联图片 Blob URL 映射(用于预览和清理)
  const saveInFlight = useRef(false); // 防止保存按钮重复点击
  const expectedVersion = useRef<number | null>(null); // 乐观锁版本号(更新时必须传给后端)

  // ==================== 默认值计算(新建文档时使用) ====================
  const defaults = useMemo(() => {
    // 从 URL 参数读取空间类型(私有/公开/团队)
    const space = searchParams.get('space') || 'private';
    // 从 URL 参数读取文件夹名称(用于标签)
    const folder = searchParams.get('folder') || '';
    // 解析团队 ID(格式为 'team:team_id')
    const team = space.startsWith('team:') ? space.slice(5) : undefined;

    return {
      // 可见性:团队/公开/私有
      visibility: team
        ? ('team' as const)
        : space === 'public'
          ? ('public' as const)
          : ('private' as const),
      teamId: team, // 团队 ID(仅团队空间时填充)
      // 标签:过滤掉"全部文档"和"未分类"等虚拟文件夹
      tags: folder && !['全部文档', '未分类'].includes(folder) ? [folder] : [],
    };
  }, [searchParams]);

  // ==================== 标题更新(触发 dirty 状态) ====================
  const setTitle = useCallback(
    (value: string) => {
      setTitleState(value); // 更新标题状态
      // 知识库模式且非填充期间,标记为 dirty(有未保存修改)
      if (isKnowledgeMode && !hydrating.current) setSaveState('dirty');
    },
    [isKnowledgeMode],
  );

  // ==================== 文档加载核心逻辑 ====================
  useEffect(() => {
    // 非知识库模式或编辑器未初始化时跳过
    if (!editor || !isKnowledgeMode) return;

    let canceled = false; // 取消标志(用于异步清理)

    const load = async () => {
      // 是否保留本地修改(dirty 或 error 状态时不清空)
      const preserveLocalChanges =
        saveState === 'dirty' || saveState === 'error';

      // 标记为填充状态,防止 editor.on('update') 误触发 dirty
      hydrating.current = true;
      setSaveState('loading');

      try {
        // ========== 分支 1: 已有文档(docId 存在) ==========
        if (docId) {
          // 1. 从服务端读取最新可访问版本
          const record = await getKnowledgeDocument(docId);
          if (canceled) return; // 检查是否已取消

          // 2. 保存完整服务端对象,按钮文案从"创建"变为"保存并索引"
          setDocumentRecord(record);

          // 3. 记录读取时版本,PATCH 时作为 expected_version(乐观锁)
          expectedVersion.current = record.document_version;

          // 4. 尝试恢复浏览器本地草稿(防止浏览器崩溃导致数据丢失)
          const recovery = readRecoveryDraft(docId);

          // 本地草稿的正文和服务器当前正文不一样时,恢复草稿
          if (recovery && recovery.markdown !== record.content) {
            setTitleState(recovery.title); // 恢复标题
            // 填充编辑器内容(将资源 URL 替换为 Blob URL)
            editor.commands.setContent(
              await hydrateEditorContent(
                recovery.editorContent,
                fetchDocumentAssetBlob,
                blobUrls.current,
              ),
            );
            setSaveState('dirty'); // 标记为有未保存修改
            message.warning(
              // 版本一致:已恢复未保存修改
              recovery.baseVersion === record.document_version
                ? '已恢复浏览器中未保存的文档修改'
                // 版本不一致:提示用户确认内容
                : `已恢复本地草稿；服务器文档已从 v${recovery.baseVersion} 更新到 v${record.document_version}，保存前请确认内容`,
            );
            return; // 恢复草稿后提前返回
          }

          // 5. 清除恢复草稿(内容一致或不存在)
          clearRecoveryDraft(docId);

          // 6. 设置标题
          setTitleState(record.title);

          // 7. 填充编辑器内容
          if (record.editor_content) {
            // 优先恢复 TipTap JSON 结构化内容
            editor.commands.setContent(
              await hydrateEditorContent(
                record.editor_content,
                fetchDocumentAssetBlob,
                blobUrls.current,
              ),
            );
          } else {
            // 降级:解析 Markdown
            const markdown = await hydrateMarkdownAssets(
              record.content,
              fetchDocumentAssetBlob,
              blobUrls.current,
            );
            editor.commands.setContent(markdown, { contentType: 'markdown' });
          }

          // 8. 引用定位(高亮跳转到引用来源)
          focusStoredCitation(editor, record, focusCitationKey);
        }
        // ========== 分支 2: 导入文档(importId 存在) ==========
        else if (importId) {
          // 导入文档不需要版本号
          expectedVersion.current = null;

          // 1. 获取导入记录
          const record = await getDocumentImport(importId);
          if (canceled) return;

          // 2. 检查导入是否已确认
          if (record.status === 'confirmed' && record.document_id) {
            setImportRecord(record);

            // 如果有本地修改,保留编辑器内容
            if (preserveLocalChanges) {
              setSaveState('dirty');
              message.info('导入已经确认；点击保存会将当前修改写入正式文档');
              return;
            }

            // 导入已确认,跳转到正式文档
            navigate(
              `/editor/draft?mode=knowledge&docId=${encodeURIComponent(record.document_id)}`,
              { replace: true },
            );
            return;
          }

          // 3. 导入未确认,填充编辑器内容
          setImportRecord(record);
          setTitleState(record.title);

          if (record.editor_content) {
            // 优先恢复 TipTap JSON
            editor.commands.setContent(
              await hydrateEditorContent(
                record.editor_content,
                fetchDocumentAssetBlob,
                blobUrls.current,
              ),
            );
          } else {
            // 降级:解析 parsed_content
            const markdown = await hydrateMarkdownAssets(
              record.parsed_content,
              fetchDocumentAssetBlob,
              blobUrls.current,
            );
            editor.commands.setContent(markdown, { contentType: 'markdown' });
          }
        }
        // ========== 分支 3: 新建文档 ==========
        else {
          // 清空编辑器和所有状态
          expectedVersion.current = null;
          setDocumentRecord(null);
          setImportRecord(null);
          setTitleState('');
          editor.commands.clearContent();
          if(templateId) {
            const template=(await getTemplates()).find(t=>t.template_id===templateId);
            if(!template) throw new Error('模板不存在');
            editor.commands.setContent(template.markdown,{contentType:'markdown'});
            setTitleState(template.name);
          }
        }

        // 标记为已保存
        setSaveState(templateId && !docId && !importId ? 'dirty' : 'saved');
      } catch (error) {
        console.error(error);
        if (!canceled) {
          setSaveState('error');
          message.error('知识文档加载失败');
        }
      } finally {
        // 结束填充状态
        hydrating.current = false;
      }
    };

    void load(); // 执行加载函数

    // 清理函数:标记为已取消,防止异步操作覆盖后续状态
    return () => {
      canceled = true;
    };
  }, [docId, editor, focusCitationKey, importId, isKnowledgeMode, navigate, templateId]);

  // ==================== 编辑器更新监听(标记 dirty) ====================
  useEffect(() => {
    if (!editor || !isKnowledgeMode) return;

    const onUpdate = () => {
      // 非填充期间才标记为 dirty,防止误触发
      if (!hydrating.current) setSaveState('dirty');
    };

    editor.on('update', onUpdate); // 监听编辑器更新事件

    return () => {
      editor.off('update', onUpdate); // 清理监听器
    };
  }, [editor, isKnowledgeMode]);

  // ==================== 页面关闭警告(防止丢失未保存内容) ====================
  useEffect(() => {
    // 非知识库模式或无未保存修改时跳过
    if (!isKnowledgeMode || saveState !== 'dirty') return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault(); // 阻止默认行为
      event.returnValue = ''; // Chrome 需要设置 returnValue
    };

    window.addEventListener('beforeunload', warn); // 添加页面关闭监听器

    return () => window.removeEventListener('beforeunload', warn); // 清理监听器
  }, [isKnowledgeMode, saveState]);

  // ==================== Blob URL 清理(防止内存泄漏) ====================
  useEffect(
    () => () => revokeAssetBlobs(blobUrls.current), // 组件卸载时释放所有 Blob URL
    [],
  );

  // ==================== 内容准备(图片上传、Markdown 转换) ====================
  const prepareContent = useCallback(async () => {
    if (!editor) throw new Error('编辑器尚未加载');

    // 确定父对象类型(导入/文档/新建)
    const parent = importId
      ? { import_id: importId }
      : docId
        ? { doc_id: docId }
        : {};

    // 1. 持久化内联图片(上传到服务器并替换 URL)
    const stable = await persistInlineImages(
      editor.getJSON() as TipTapDocument,
      (file) => uploadDocumentAsset(file, parent),
      blobUrls.current,
    );

    // 2. 重新填充编辑器内容(将资源 URL 替换为 Blob URL 用于预览)
    hydrating.current = true;
    try {
      // 2.1 重新填充编辑器内容(将资源 URL 替换为 Blob URL 用于预览)
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

    // 3. 返回准备好的内容
    return {
      editorContent: stable, // TipTap JSON 结构化内容
      markdown: editorHtmlToMarkdown(editor.getHTML(), blobUrls.current), // Markdown 纯文本
      assetIds: collectAssetIds(stable, blobUrls.current), // 关联资源 ID 列表
    };
  }, [docId, editor, importId]);

  // ==================== 保存函数 ====================
  const save = useCallback(
    async (confirmImport = true) => {
      // 1. 前置校验
      if (
        !editor ||
        !isKnowledgeMode ||
        saveState === 'saving' ||
        saveInFlight.current
      )
        return; // 编辑器未加载/非知识库模式/已在保存中/请求进行中时跳过

      if (!title.trim()) {
        message.warning('请先填写文档标题');
        return;
      }

      // 2. 标记为保存中
      saveInFlight.current = true;
      setSaveState('saving');

      let prepared: Awaited<ReturnType<typeof prepareContent>> | undefined;

      try {
        // 3. 准备内容(上传图片、生成 Markdown)
        prepared = await prepareContent();

        // ========== 分支 1: 导入文档(importId 存在) ==========
        if (importId) {
          try {
            // 1. 更新导入记录
            await updateDocumentImport(importId, {
              title: title.trim(),
              content: prepared.markdown,
              editor_content: prepared.editorContent,
              asset_ids: prepared.assetIds,
            });
          } catch (importUpdateError) {
            // 2. 处理 409 冲突(导入已确认)
            if ((importUpdateError as any)?.response?.status !== 409) {
              throw importUpdateError; // 非 409 错误直接抛出
            }

            // 3. 获取当前导入状态
            const currentImport = await getDocumentImport(importId);
            if (
              currentImport.status !== 'confirmed' ||
              !currentImport.document_id
            ) {
              throw importUpdateError; // 导入未确认,抛出原错误
            }

            // 4. 导入已确认,直接更新正式文档
            const latest = await getKnowledgeDocument(
              currentImport.document_id,
            );
            const record = await updateKnowledgeDocument(
              currentImport.document_id,
              {
                title: title.trim(),
                content: prepared.markdown,
                editor_content: prepared.editorContent,
                asset_ids: prepared.assetIds,
                expected_version: latest.document_version, // 使用最新版本号
              },
            );

            // 5. 更新本地状态
            setDocumentRecord(record);
            expectedVersion.current = record.document_version;
            setImportRecord(currentImport);
            clearRecoveryDraft(record.doc_id);
            setSaveState('saved');

            // 6. 触发索引任务
            try {
              await reindexKnowledgeDocument(record.doc_id);
              message.success('导入已确认，当前修改已直接保存到正式文档');
            } catch (indexError) {
              console.error(indexError);
              message.warning(
                '正文已经保存，但索引任务启动失败，请在知识库中重新索引',
              );
            }

            // 7. 跳转到正式文档
            navigate(
              `/editor/draft?mode=knowledge&docId=${encodeURIComponent(record.doc_id)}`,
              { replace: true },
            );
            return;
          }

          // 4. 更新成功,检查是否需要确认导入
          if (!confirmImport) {
            setSaveState('saved');
            message.success('预览修改已保存');
            return;
          }

          // 5. 确认导入并创建正式文档
          const result = await confirmDocumentImport(importId);
          setDocumentRecord(result.document);
          expectedVersion.current = result.document.document_version;

          // 6. 更新导入记录状态
          setImportRecord((current) =>
            current
              ? {
                  ...current,
                  status: 'confirmed',
                  document_id: result.document.doc_id,
                }
              : current,
          );

          setSaveState('saved');
          message.success('已保存到知识库并发起索引');

          // 7. 跳转到正式文档
          navigate(
            `/editor/draft?mode=knowledge&docId=${encodeURIComponent(result.document.doc_id)}`,
            { replace: true },
          );
          return;
        }

        // ========== 分支 2: 已有文档(docId 存在) ==========
        if (docId) {
          // 1. 更新文档(使用乐观锁)
          const record = await updateKnowledgeDocument(docId, {
            title: title.trim(),
            content: prepared.markdown,
            editor_content: prepared.editorContent,
            asset_ids: prepared.assetIds,
            expected_version:
              expectedVersion.current ?? documentRecord?.document_version,
          });

          // 2. 更新本地状态
          setDocumentRecord(record);
          expectedVersion.current = record.document_version;
          clearRecoveryDraft(docId);
          setSaveState('saved');

          // 3. 触发索引任务
          try {
            await reindexKnowledgeDocument(docId);
            message.success('文档已保存并发起索引');
          } catch (indexError) {
            console.error(indexError);
            message.warning(
              '正文已经保存，但索引任务启动失败，请在知识库中重新索引',
            );
          }
          return;
        }

        // ========== 分支 3: 新建文档 ==========
        const record = await createKnowledgeDocument({
          title: title.trim(),
          content: prepared.markdown,
          editor_content: prepared.editorContent,
          asset_ids: prepared.assetIds,
          visibility: defaults.visibility, // 可见性
          source_type:
            // 根据 visibility 映射 source_type
            defaults.visibility === 'team'
              ? 'team_doc'
              : defaults.visibility === 'public'
                ? 'public_article'
                : 'note',
          team_id: defaults.teamId, // 团队 ID
          tags: defaults.tags, // 标签
          index_now: true, // 立即索引
        });
        if(categoryId && defaults.visibility==='private') {
          try {const tree=await getCategoryTree();await categoryMutation('/assign',{ids:[record.doc_id],category_id:categoryId,expected_tree_revision:tree.revision});record.category_id=categoryId;}
          catch {message.warning('文档已保存，分类分配失败，可在知识库重新移动');}
        }

        // 更新本地状态
        setDocumentRecord(record);
        expectedVersion.current = record.document_version;
        setSaveState('saved');
        message.success('文档已保存到知识库');

        // 跳转到文档编辑页
        navigate(
          `/editor/draft?mode=knowledge&docId=${encodeURIComponent(record.doc_id)}`,
          { replace: true },
        );
      } catch (error) {
        console.error(error);

        // 保存失败时写入恢复草稿
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

        // 处理 409 冲突(版本不一致)
        if ((error as any)?.response?.status === 409) {
          if (prepared && docId) {
            try {
              const latest = await getKnowledgeDocument(docId);

              // 1. 幂等性检查:如果内容完全相同,认为保存成功
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
                  message.success(
                    '正文此前已保存，已同步最新版本并重新发起索引',
                  );
                } catch (indexError) {
                  console.error(indexError);
                  message.warning(
                    '正文已经保存，但索引任务启动失败，请在知识库中重新索引',
                  );
                }
                return;
              }

              // 2. 非团队文档:单编辑者场景,用最新版本号重试一次
              // 个人/私有文档和所有者管理的公开文档作为单一全文档草稿进行编辑。
              // 此处的过时客户端版本通常由之前成功的 PATCH(其重新索引步骤失败)导致。
              // 重新基于最新服务器版本进行一次变基,使用户当前编辑器内容保持为真实来源。
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
                  message.warning(
                    '正文已经保存，但索引任务启动失败，请在知识库中重新索引',
                  );
                }
                return;
              }
            } catch (refreshError) {
              console.error(refreshError);
            }
          }

          // 3. 团队文档冲突:保留本地草稿,提示用户手动合并
          setSaveState('dirty');
          message.error(
            '服务器存在不同版本；当前修改已保留为本地恢复草稿，刷新后不会丢失',
          );
        } else {
          // 其他错误
          setSaveState('error');
          message.error(error instanceof Error ? error.message : '保存失败');
        }
      } finally {
        // 结束保存中状态
        saveInFlight.current = false;
      }
    },
    [
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

  // ==================== 离开页面函数 ====================
  const leave = useCallback(() => {
    // 有未保存修改时弹出确认对话框
    if (
      saveState === 'dirty' &&
      !window.confirm('当前修改尚未保存，确定返回知识库吗？')
    ) {
      return;
    }
    navigate('/knowledge');
  }, [navigate, saveState]);

  // ==================== 状态文本映射 ====================
  const statusText = {
    idle: '保存成功',
    loading: '正在加载',
    dirty: '有未保存修改',
    saving: '正在保存',
    saved: '已保存',
    error: '保存失败',
  }[saveState];

  // ==================== 导出接口 ====================
  return {
    isKnowledgeMode, // 是否知识库模式
    title, // 文档标题
    setTitle, // 设置标题(触发 dirty)
    saveState, // 保存状态
    statusText, // 状态文本(用于 UI 显示)
    documentRecord, // 文档记录(用于 PATCH)
    importRecord, // 导入记录
    saveToKnowledge: () => save(true), // 保存到知识库(确认导入)
    saveDraft: () => save(false), // 保存草稿(不确认导入)
    leave, // 离开页面
  };
}

// ==================== 引用定位辅助函数 ====================
/**
 * 高亮跳转到引用来源
 * @param editor 编辑器实例
 * @param record 文档记录
 * @param storageKey session storage 键名(存储引用信息)
 */
function focusStoredCitation(
  editor: Editor,
  record: DocumentRecord,
  storageKey?: string,
) {
  if (!storageKey) return;

  // 1. 从 session storage 读取引用信息
  const raw = sessionStorage.getItem(storageKey);
  sessionStorage.removeItem(storageKey); // 立即清理
  if (!raw) return;

  // 2. 解析引用信息
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

  // 3. 版本校验:防止定位到错误版本
  if (record.document_version !== citation.document_version) {
    message.warning(
      `该引用来自文档 v${citation.document_version}，当前已是 v${record.document_version}，为避免误定位已停止自动跳转`,
    );
    return;
  }

  // 4. 异步定位(等待编辑器渲染完成)
  window.setTimeout(() => {
    const range = locateCitationRange(editor, record.content, {
      snippet: citation.snippet,
      startOffset: citation.start_offset,
      endOffset: citation.end_offset,
    });

    if (range) {
      // 设置选区并滚动到视图
      editor.chain().focus().setTextSelection(range).scrollIntoView().run();
    }

    if (range) {
      message.success(
        range.strategy === 'source_offset'
          ? '已按来源位置定位并高亮引用原文'
          : '来源偏移不可用，已通过片段定位引用原文',
      );
    } else {
      message.warning(
        `文档版本一致，但未找到片段位置（${citation.source_anchor || citation.chunk_id || 'unknown'}）`,
      );
    }
  }, 0);
}

// ==================== 恢复草稿接口定义 ====================
interface KnowledgeRecoveryDraft {
  title: string; // 标题
  markdown: string; // Markdown 内容
  editorContent: TipTapDocument; // TipTap JSON 内容
  assetIds: string[]; // 资源 ID 列表
  baseVersion: number; // 基准版本号
  savedAt: string; // 保存时间
}

// ==================== 恢复草稿键名生成 ====================
function recoveryDraftKey(docId: string) {
  return `livedoc:knowledge-recovery:${docId}`;
}

// ==================== 写入恢复草稿 ====================
/**
 * 将当前编辑内容写入浏览器本地存储
 * 用于防止浏览器崩溃导致数据丢失
 */
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

// ==================== 读取恢复草稿 ====================
/**
 * 从浏览器本地存储读取知识库恢复草稿
 * @param docId 文档 ID
 * @returns 恢复草稿或 null
 */
function readRecoveryDraft(docId: string): KnowledgeRecoveryDraft | null {
  // 1. 从 localStorage 读原始字符串
  const raw = localStorage.getItem(recoveryDraftKey(docId));
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<KnowledgeRecoveryDraft>;

    // 2. 校验字段类型,防止脏数据
    if (
      typeof value.title !== 'string' ||
      typeof value.markdown !== 'string' ||
      !value.editorContent ||
      value.editorContent.type !== 'doc' ||
      !Array.isArray(value.assetIds) ||
      typeof value.baseVersion !== 'number' ||
      typeof value.savedAt !== 'string'
    ) {
      // 数据不合法时清理掉
      clearRecoveryDraft(docId);
      return null;
    }

    return value as KnowledgeRecoveryDraft;
  } catch {
    clearRecoveryDraft(docId);
    return null;
  }
}

// ==================== 清除恢复草稿 ====================
/**
 * 删除浏览器本地存储中的恢复草稿
 */
function clearRecoveryDraft(docId: string) {
  localStorage.removeItem(recoveryDraftKey(docId));
}
