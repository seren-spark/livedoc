/**
 * @file 知识问答会话 Hook。维护问答轮次、SSE 生成、取消、来源展开和回答采纳。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  streamAiWrite,
  submitAiFeedback,
  type AgentToolCall,
  type Citation,
  type RetrievalDomain,
  type RetrievalTrace,
} from '@/api/rag';
import { locateCitationRange } from '@/lib/citation-location';
import { citationVisibilityLabel } from './CitationList';

export type TurnStatus =
  | 'retrieving'
  | 'streaming'
  | 'done'
  | 'error'
  | 'stopped';

export interface ConversationTurn {
  id: string;
  question: string;
  citations: Citation[];
  retrievedDocumentCount: number;
  answer: string;
  status: TurnStatus;
  sourcesExpanded: boolean;
  hasEvidence: boolean;
  canInsert: boolean;
  toolCall?: AgentToolCall;
  trace?: RetrievalTrace;
  feedback?: 'inserted' | 'helpful' | 'unhelpful';
  error?: string;
}

export type RenderedConversationTurn = ConversationTurn & {
  markdown: string;
};

interface UseRagChatSessionParams {
  editor: Editor | null;
  title: string;
  documentId?: string;
  documentVersion?: number;
  isLoggedIn: boolean;
  onClose: () => void;
  onRequireLogin: (callback: () => void) => void;
}

/**
 * 生成本地消息或会话使用的唯一标识。
 *
 * @param prefix 需要匹配或补入的前缀。
 * @returns 整理后的文本或标识。
 */
function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 读取当前编辑器内容，构造问答需要的文档上下文。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @returns 整理后的状态与操作结果对象。
 */
function getEditorContext(editor: Editor | null) {
  if (!editor || editor.isDestroyed) {
    return { content: '', selectedText: '', before: '', after: '' };
  }
  const { from, to } = editor.state.selection;
  const content = editor.state.doc.textBetween(
    0,
    editor.state.doc.content.size,
    '\n',
  );
  return {
    content,
    selectedText:
      from === to ? '' : editor.state.doc.textBetween(from, to, '\n'),
    before: editor.state.doc.textBetween(Math.max(0, from - 800), from, '\n'),
    after: editor.state.doc.textBetween(
      to,
      Math.min(editor.state.doc.content.size, to + 400),
      '\n',
    ),
  };
}

/**
 * 管理问答轮次、流式请求、取消与回答采纳操作。
 *
 * @param options 控制本次行为的可选配置。
 * @returns 供后续操作使用的回调或清理函数。
 */
export function useRagChatSession({
  editor,
  title,
  documentId,
  documentVersion,
  isLoggedIn,
  onClose,
  onRequireLogin,
}: UseRagChatSessionParams) {
  const navigate = useNavigate();
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<RetrievalDomain>('public');
  const [conversationId, setConversationId] = useState(() =>
    createId('conversation'),
  );
  const abortRef = useRef<AbortController | null>(null);

  const isGenerating = turns.some(
    (turn) => turn.status === 'retrieving' || turn.status === 'streaming',
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * 只更新指定问答轮次，保留其他消息状态。
   *
   * @param turnId turn 对应的唯一标识。
   * @param update 状态更新时执行的回调。
   */
  const updateTurn = useCallback(
    (turnId: string, update: Partial<ConversationTurn>) => {
      setTurns((items) =>
        items.map((turn) =>
          turn.id === turnId ? { ...turn, ...update } : turn,
        ),
      );
    },
    [],
  );

  /**
   * 建立问答轮次并发起带当前上下文的生成请求。
   *
   * @param question 需要回答或继续检索的问题。
   */
  const submitQuestion = useCallback(
    async (question: string) => {
      if (isGenerating) return;
      const editorContext = getEditorContext(editor);
      if (domain === 'current_document' && !editorContext.content.trim()) {
        message.warning('当前文档暂无可检索内容');
        return;
      }

      const turnId = createId('turn');
      setTurns((items) => [
        ...items,
        {
          id: turnId,
          question,
          citations: [],
          retrievedDocumentCount: 0,
          answer: '',
          status: 'retrieving',
          sourcesExpanded: true,
          hasEvidence: false,
          canInsert: false,
        },
      ]);
      setQuery('');

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamAiWrite(
          {
            query: question,
            retrieval_domain: domain,
            conversation_id: conversationId,
            current_context: {
              title: title || '未命名文档',
              cursor_before: editorContext.before,
              cursor_after: editorContext.after,
              selected_text: editorContext.selectedText,
            },
            current_document: {
              doc_id: documentId,
              document_version: documentVersion,
              title: title || '当前打开文档',
              content: editorContext.content,
            },
          },
          {
            onToolCall: (toolCall) => updateTurn(turnId, { toolCall }),
            onMeta: (meta) => {
              const patch: Partial<ConversationTurn> = {
                toolCall: meta.tool_call,
                trace: meta.retrieval_trace,
                retrievedDocumentCount: meta.retrieved_document_count,
                hasEvidence: meta.has_evidence,
                canInsert: meta.can_insert,
                status: 'streaming',
              };
              if (meta.citations) patch.citations = meta.citations;
              updateTurn(turnId, patch);
            },
            onCitations: (citations) => updateTurn(turnId, { citations }),
            onDelta: (delta) =>
              setTurns((items) =>
                items.map((turn) =>
                  turn.id === turnId
                    ? {
                        ...turn,
                        answer: turn.answer + delta,
                        status: 'streaming',
                      }
                    : turn,
                ),
              ),
            onDone: (result) =>
              updateTurn(turnId, {
                status: 'done',
                hasEvidence: result.has_evidence,
                canInsert: result.can_insert,
              }),
            onError: (errorMessage) =>
              updateTurn(turnId, {
                status: 'error',
                error: errorMessage,
                answer: '',
                citations: [],
                hasEvidence: false,
                canInsert: false,
              }),
          },
          controller.signal,
        );
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          updateTurn(turnId, { status: 'stopped' });
        } else {
          updateTurn(turnId, {
            status: 'error',
            error: error?.message || '知识库问答请求失败',
          });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [
      conversationId,
      documentId,
      documentVersion,
      domain,
      editor,
      isGenerating,
      title,
      updateTurn,
    ],
  );

  /**
   * 将指定问题交给统一的问答提交流程。
   *
   * @param question 需要回答或继续检索的问题。
   */
  const askQuestion = useCallback(
    (question: string) => {
      if (!isLoggedIn || !sessionStorage.getItem('token')) {
        onRequireLogin(() => void submitQuestion(question));
        return;
      }
      void submitQuestion(question);
    },
    [isLoggedIn, onRequireLogin, submitQuestion],
  );

  /**
   * 提交输入框中的当前问题。
   */
  const sendCurrentQuery = useCallback(() => {
    const normalized = query.trim();
    if (!normalized) return;
    askQuestion(normalized);
  }, [askQuestion, query]);

  /**
   * 取消当前生成请求，并结束界面的生成状态。
   */
  const stopGenerating = useCallback(() => abortRef.current?.abort(), []);

  /**
   * 停止当前生成并清空消息，开始新的问答会话。
   */
  const startNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setTurns([]);
    setConversationId(createId('conversation'));
  }, []);

  /**
   * 切换指定回答的引用来源展开状态。
   *
   * @param turnId turn 对应的唯一标识。
   * @param expanded 是否展开当前内容或来源列表。
   */
  const toggleSources = useCallback(
    (turnId: string, expanded: boolean) => {
      updateTurn(turnId, { sourcesExpanded: !expanded });
    },
    [updateTurn],
  );

  /**
   * 打开引用来源，并传递原文定位信息。
   *
   * @param citation 包含来源、原文位置与内容的检索引用。
   */
  const openOriginal = useCallback(
    (citation: Citation) => {
      if (citation.url) {
        window.open(citation.url, '_blank', 'noopener,noreferrer');
        return;
      }
      if (citation.source_type !== 'current_document') {
        const focusKey = `livedoc-citation-${Date.now()}-${citation.citation_id}`;
        sessionStorage.setItem(
          focusKey,
          JSON.stringify({
            citation_id: citation.citation_id,
            chunk_id: citation.chunk_id,
            source_anchor: citation.source_anchor,
            document_version: citation.document_version,
            snippet: citation.source_content || citation.snippet || citation.content,
            start_offset: citation.start_offset,
            end_offset: citation.end_offset,
          }),
        );
        navigate(
          `/editor/draft?mode=knowledge&docId=${encodeURIComponent(citation.doc_id)}&focusCitation=${encodeURIComponent(focusKey)}`,
        );
        onClose();
        return;
      }
      if (!editor) return;
      const currentContent = getEditorContext(editor).content;
      const range = locateCitationRange(editor, currentContent, {
        snippet: citation.source_content || citation.snippet || citation.content,
        startOffset: citation.start_offset,
        endOffset: citation.end_offset,
      });
      if (range) {
        editor.chain().focus().setTextSelection(range).scrollIntoView().run();
        message.success('已定位并高亮当前文档引用');
      } else {
        editor.chain().focus().run();
        message.info('已返回当前文档，片段位置可能已发生变化');
      }
    },
    [editor, navigate, onClose],
  );

  /**
   * 将当前回答插入编辑器，并记录用户采纳。
   *
   * @param turn 执行模型调用的回调或当前问答轮次。
   */
  const insertAnswer = useCallback(
    (turn: ConversationTurn) => {
      if (!editor || !turn.canInsert || !turn.answer.trim()) return;
      const references = turn.citations
        .map((citation) => {
          const permission = citationVisibilityLabel(citation);
          const link = citation.url ? ` - ${citation.url}` : '';
          return `${citation.index}. ${citation.title}（${permission}）${link}`;
        })
        .join('\n');
      const referenceNodes: Record<string, unknown>[] = [];
      if (references) {
        referenceNodes.push(
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: '参考资料' }],
          },
          ...references.split('\n').map((line) => ({
            type: 'paragraph',
            content: [{ type: 'text', text: line }],
          })),
        );
      }
      const chain = editor
        .chain()
        .focus()
        .insertContent(turn.answer, { contentType: 'markdown' });
      if (referenceNodes.length) chain.insertContent(referenceNodes);
      chain.run();
      updateTurn(turn.id, { feedback: 'inserted' });
      if (turn.trace?.trace_id) {
        void submitAiFeedback(turn.trace.trace_id, 'inserted').catch(() => {
          message.warning('内容已插入，但采纳指标上报失败');
        });
      }
      message.success('回答已插入当前光标位置');
    },
    [editor, updateTurn],
  );

  /**
   * 保存本次任务的用户反馈，并更新相关效果记录。
   *
   * @param turn 执行模型调用的回调或当前问答轮次。
   * @param feedback 用户对当前回答或候选的评价。
   */
  const recordFeedback = useCallback(
    (turn: ConversationTurn, feedback: 'helpful' | 'unhelpful') => {
      if (!turn.trace?.trace_id || turn.feedback === feedback) return;
      updateTurn(turn.id, { feedback });
      void submitAiFeedback(turn.trace.trace_id, feedback).catch(() => {
        updateTurn(turn.id, { feedback: undefined });
        message.warning('反馈上报失败，请稍后重试');
      });
    },
    [updateTurn],
  );

  /**
   * 把问答状态整理为渲染组件需要的消息列表。
   *
   * @returns 引用证据列表。
   */
  const renderedTurns = useMemo(
    () =>
      turns.map((turn) => ({
        ...turn,
        markdown: turn.answer.replace(
          /\[(\d+)\]/g,
          (_match, index) => `[${index}](#rag-source-${turn.id}-${index})`,
        ),
      })),
    [turns],
  );

  return {
    askQuestion,
    domain,
    insertAnswer,
    isGenerating,
    openOriginal,
    query,
    recordFeedback,
    renderedTurns,
    sendCurrentQuery,
    setDomain,
    setQuery,
    startNewConversation,
    stopGenerating,
    toggleSources,
  };
}
