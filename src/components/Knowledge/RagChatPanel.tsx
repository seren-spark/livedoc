import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Drawer,
  Input,
  Select,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { Editor } from '@tiptap/react';
import ReactMarkdown from 'react-markdown';
import {
  ChevronDown,
  ExternalLink,
  FilePlus2,
  Globe2,
  LibraryBig,
  LockKeyhole,
  Plus,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  Users,
  X,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import type { UserState } from '@/store/modules/userSlice';
import marked from '@/utils/marked';
import {
  streamAiWrite,
  submitAiFeedback,
  type AgentToolCall,
  type Citation,
  type RetrievalDomain,
  type RetrievalTrace,
} from '@/api/rag';
import './RagChatPanel.scss';

const { Text } = Typography;
const { TextArea } = Input;

type TurnStatus = 'retrieving' | 'streaming' | 'done' | 'error' | 'stopped';

type ConversationTurn = {
  id: string;
  question: string;
  citations: Citation[];
  retrievedDocumentCount: number;
  answer: string;
  status: TurnStatus;
  sourcesExpanded: boolean;
  hasEvidence: boolean;
  toolCall?: AgentToolCall;
  trace?: RetrievalTrace;
  feedback?: 'inserted' | 'helpful' | 'unhelpful';
  error?: string;
};

type RagChatPanelProps = {
  editor: Editor | null;
  title: string;
  open: boolean;
  onClose: () => void;
  onRequireLogin: (callback: () => void) => void;
};

const domainOptions = [
  { label: '全部公开知识库', value: 'public' },
  { label: '我的私有文档', value: 'private' },
  { label: '团队共享文档', value: 'team' },
  { label: '当前打开文档', value: 'current_document' },
];

const visibilityLabels: Record<string, string> = {
  public: '公开',
  private: '私有',
  team: '团队',
};

const visibilityColors: Record<string, string> = {
  public: 'green',
  private: 'blue',
  team: 'gold',
};

const toolLabels: Record<AgentToolCall['name'], string> = {
  knowledge_search: '知识库检索',
  summarize_document: '当前文档摘要',
  continue_paragraph: '上下文续写',
  format_selection: '选区优化',
};

const toolSourceLabels: Record<AgentToolCall['source'], string> = {
  llm_function_call: 'Function Call',
  rule_fallback: '规则降级',
  request_intent: '显式意图',
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

function sanitizeHtml(html: string) {
  const documentNode = new DOMParser().parseFromString(html, 'text/html');
  documentNode
    .querySelectorAll('script,style,iframe,object,embed')
    .forEach((node) => node.remove());
  documentNode.body.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith('on'))
        node.removeAttribute(attribute.name);
      if (
        ['href', 'src'].includes(attribute.name.toLowerCase()) &&
        /^javascript:/i.test(attribute.value.trim())
      ) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return documentNode.body.innerHTML;
}

function permissionIcon(citation: Citation) {
  if (citation.source_type === 'current_document')
    return <FilePlus2 size={13} />;
  if (citation.visibility === 'team') return <Users size={13} />;
  if (citation.visibility === 'private') return <LockKeyhole size={13} />;
  return <Globe2 size={13} />;
}

function CitationCard({
  citation,
  turnId,
  onOpenOriginal,
}: {
  citation: Citation;
  turnId: string;
  onOpenOriginal: (citation: Citation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isCurrentDocument = citation.source_type === 'current_document';
  const canOpen = Boolean(citation.url || isCurrentDocument);

  return (
    <article
      className="rag-source-card"
      id={`rag-source-${turnId}-${citation.index}`}
    >
      <div className="rag-source-card__header">
        <div className="rag-source-card__title-wrap">
          <span className="rag-source-card__index">{citation.index}</span>
          <Text
            strong
            ellipsis={{ tooltip: citation.title }}
            className="rag-source-card__title"
          >
            {citation.title}
          </Text>
        </div>
        <Text className="rag-source-card__score">
          {Math.min(100, Math.max(0, Math.round(citation.score * 100)))}%
        </Text>
      </div>
      <div className="rag-source-card__meta">
        <Tag
          icon={permissionIcon(citation)}
          color={
            isCurrentDocument ? 'cyan' : visibilityColors[citation.visibility]
          }
        >
          {isCurrentDocument
            ? '当前文档'
            : visibilityLabels[citation.visibility] || citation.visibility}
        </Tag>
        {citation.heading_path?.length > 0 && (
          <Text type="secondary" ellipsis className="rag-source-card__path">
            {citation.heading_path.join(' / ')}
          </Text>
        )}
      </div>
      <p
        className={
          expanded
            ? 'rag-source-card__content is-expanded'
            : 'rag-source-card__content'
        }
      >
        {citation.content}
      </p>
      {expanded && (
        <div className="rag-source-card__details">
          <span>文档版本 v{citation.document_version}</span>
          <span>chunk {citation.chunk_index ?? '-'}</span>
        </div>
      )}
      <div className="rag-source-card__actions">
        <Button
          type="link"
          size="small"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收起完整片段' : '查看完整片段'}
        </Button>
        <Tooltip title={canOpen ? undefined : '该资料暂无原文地址'}>
          <Button
            type="text"
            size="small"
            icon={<ExternalLink size={14} />}
            disabled={!canOpen}
            onClick={() => onOpenOriginal(citation)}
          >
            原文
          </Button>
        </Tooltip>
      </div>
    </article>
  );
}

export default function RagChatPanel({
  editor,
  title,
  open,
  onClose,
  onRequireLogin,
}: RagChatPanelProps) {
  const user = useSelector((state: RootState) => state.user as UserState);
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 768);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<RetrievalDomain>('public');
  const [conversationId, setConversationId] = useState(() =>
    createId('conversation'),
  );
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isGenerating = turns.some(
    (turn) => turn.status === 'retrieving' || turn.status === 'streaming',
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [turns]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const updateTurn = (turnId: string, update: Partial<ConversationTurn>) => {
    setTurns((items) =>
      items.map((turn) => (turn.id === turnId ? { ...turn, ...update } : turn)),
    );
  };

  const submitQuestion = async (question: string) => {
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
          ...(domain === 'current_document'
            ? {
                current_document: {
                  title: title || '当前打开文档',
                  content: editorContext.content,
                },
              }
            : {}),
        },
        {
          onToolCall: (toolCall) => updateTurn(turnId, { toolCall }),
          onMeta: (meta) =>
            updateTurn(turnId, {
              toolCall: meta.tool_call,
              trace: meta.retrieval_trace,
              citations: meta.citations,
              retrievedDocumentCount: meta.retrieved_document_count,
              status: 'streaming',
            }),
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
            }),
          onError: (errorMessage) =>
            updateTurn(turnId, { status: 'error', error: errorMessage }),
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
  };

  const handleSend = () => {
    const normalized = query.trim();
    if (!normalized) return;
    if (!user.isLogin || !sessionStorage.getItem('token')) {
      onRequireLogin(() => void submitQuestion(normalized));
      return;
    }
    void submitQuestion(normalized);
  };

  const stopGenerating = () => abortRef.current?.abort();

  const startNewConversation = () => {
    abortRef.current?.abort();
    setTurns([]);
    setConversationId(createId('conversation'));
  };

  const toggleSources = (turnId: string, expanded: boolean) => {
    updateTurn(turnId, { sourcesExpanded: !expanded });
  };

  const openOriginal = (citation: Citation) => {
    if (citation.url) {
      window.open(citation.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!editor || citation.source_type !== 'current_document') return;
    const probe = citation.content.replace(/\s+/g, ' ').trim().slice(0, 36);
    let matched = false;
    editor.state.doc.descendants((node, position) => {
      if (matched || !node.isText || !node.text) return;
      const normalized = node.text.replace(/\s+/g, ' ');
      const fragment = probe.slice(
        0,
        Math.min(probe.length, normalized.length),
      );
      const localOffset = normalized.indexOf(fragment);
      if (localOffset >= 0) {
        const from = position + localOffset;
        editor
          .chain()
          .focus()
          .setTextSelection({ from, to: from + fragment.length })
          .run();
        matched = true;
      }
    });
    if (!matched) {
      editor.chain().focus().run();
      message.info('已返回当前文档，片段位置可能已发生变化');
    }
  };

  const insertAnswer = (turn: ConversationTurn) => {
    if (!editor || !turn.hasEvidence || !turn.answer.trim()) return;
    const references = turn.citations
      .map((citation) => {
        const permission =
          citation.source_type === 'current_document'
            ? '当前文档'
            : visibilityLabels[citation.visibility] || citation.visibility;
        const link = citation.url ? ` - ${citation.url}` : '';
        return `${citation.index}. ${citation.title}（${permission}）${link}`;
      })
      .join('\n');
    const markdown = `${turn.answer}\n\n## 参考资料\n${references}`;
    const html = sanitizeHtml(marked.parse(markdown) as string);
    editor.chain().focus().insertContent(html).run();
    updateTurn(turn.id, { feedback: 'inserted' });
    if (turn.trace?.trace_id) {
      void submitAiFeedback(turn.trace.trace_id, 'inserted').catch(() => {
        message.warning('内容已插入，但采纳指标上报失败');
      });
    }
    message.success('回答已插入当前光标位置');
  };

  const recordFeedback = (
    turn: ConversationTurn,
    feedback: 'helpful' | 'unhelpful',
  ) => {
    if (!turn.trace?.trace_id || turn.feedback === feedback) return;
    updateTurn(turn.id, { feedback });
    void submitAiFeedback(turn.trace.trace_id, feedback).catch(() => {
      updateTurn(turn.id, { feedback: undefined });
      message.warning('反馈上报失败，请稍后重试');
    });
  };

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

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement={isNarrow ? 'bottom' : 'right'}
      width={isNarrow ? '100%' : 480}
      height={isNarrow ? '100%' : undefined}
      mask={false}
      rootClassName="rag-chat-drawer"
      styles={{ body: { padding: 0 }, header: { display: 'none' } }}
      destroyOnHidden={false}
    >
      <section className="rag-chat-panel" aria-label="知识库问答">
        <header className="rag-chat-panel__header">
          <div className="rag-chat-panel__identity">
            <span className="rag-chat-panel__logo">
              <LibraryBig size={18} />
            </span>
            <div>
              <strong>知识库问答</strong>
              <span>{user.isLogin ? user.username : '未登录'}</span>
            </div>
          </div>
          <div className="rag-chat-panel__header-actions">
            <Tooltip title="新对话">
              <Button
                type="text"
                icon={<Plus size={17} />}
                onClick={startNewConversation}
              />
            </Tooltip>
            <Tooltip title="关闭">
              <Button type="text" icon={<X size={17} />} onClick={onClose} />
            </Tooltip>
          </div>
        </header>

        <div className="rag-chat-panel__conversation" ref={scrollRef}>
          {renderedTurns.length === 0 && (
            <div className="rag-chat-panel__empty">
              <LibraryBig size={28} />
              <strong>开始一次知识库问答</strong>
            </div>
          )}
          {renderedTurns.map((turn) => (
            <section className="rag-turn" key={turn.id}>
              <div className="rag-turn__question">{turn.question}</div>

              {turn.toolCall && (
                <Tooltip title={turn.toolCall.reason} placement="left">
                  <div className="rag-turn__trace">
                    <span>{toolLabels[turn.toolCall.name]}</span>
                    <span>{toolSourceLabels[turn.toolCall.source]}</span>
                    {turn.trace && (
                      <>
                        <span>
                          召回 {turn.trace.dense_candidates} +{' '}
                          {turn.trace.keyword_candidates}
                        </span>
                        <span>RRF {turn.trace.fused_candidates}</span>
                        <span>重排 {turn.trace.reranked_candidates}</span>
                        <strong>{turn.trace.total_ms.toFixed(0)} ms</strong>
                      </>
                    )}
                  </div>
                </Tooltip>
              )}

              <button
                type="button"
                className="rag-turn__source-toggle"
                onClick={() => toggleSources(turn.id, turn.sourcesExpanded)}
                aria-expanded={turn.sourcesExpanded}
              >
                <span>
                  {turn.status === 'retrieving'
                    ? '正在检索参考资料'
                    : `已检索 ${turn.retrievedDocumentCount} 篇参考资料`}
                </span>
                <ChevronDown
                  size={16}
                  className={turn.sourcesExpanded ? 'is-expanded' : undefined}
                />
              </button>

              {turn.sourcesExpanded && turn.citations.length > 0 && (
                <div className="rag-turn__sources">
                  {turn.citations.map((citation) => (
                    <CitationCard
                      key={citation.chunk_id}
                      citation={citation}
                      turnId={turn.id}
                      onOpenOriginal={openOriginal}
                    />
                  ))}
                </div>
              )}

              <div className="rag-turn__answer">
                {turn.status === 'retrieving' && (
                  <div className="rag-turn__thinking">
                    <span />
                    检索中
                  </div>
                )}
                {turn.answer && (
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          onClick={(event) => {
                            if (!href?.startsWith('#rag-source-')) return;
                            event.preventDefault();
                            document
                              .querySelector(href)
                              ?.scrollIntoView({ behavior: 'smooth' });
                          }}
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {turn.markdown}
                  </ReactMarkdown>
                )}
                {turn.status === 'streaming' && (
                  <span className="rag-turn__cursor" />
                )}
                {turn.status === 'stopped' && (
                  <Text type="secondary">生成已停止</Text>
                )}
                {turn.status === 'error' && (
                  <Text type="danger">
                    {turn.error || '生成失败，请稍后重试'}
                  </Text>
                )}
              </div>

              {turn.status === 'done' && turn.hasEvidence && (
                <div className="rag-turn__answer-actions">
                  <Button
                    icon={<FilePlus2 size={15} />}
                    onClick={() => insertAnswer(turn)}
                    disabled={turn.feedback === 'inserted'}
                  >
                    {turn.feedback === 'inserted'
                      ? '已插入当前文档'
                      : '确认后插入当前文档'}
                  </Button>
                  <span className="rag-turn__feedback">
                    <Tooltip title="有帮助">
                      <Button
                        type={turn.feedback === 'helpful' ? 'primary' : 'text'}
                        size="small"
                        icon={<ThumbsUp size={14} />}
                        onClick={() => recordFeedback(turn, 'helpful')}
                      />
                    </Tooltip>
                    <Tooltip title="无帮助">
                      <Button
                        type={turn.feedback === 'unhelpful' ? 'primary' : 'text'}
                        danger={turn.feedback === 'unhelpful'}
                        size="small"
                        icon={<ThumbsDown size={14} />}
                        onClick={() => recordFeedback(turn, 'unhelpful')}
                      />
                    </Tooltip>
                  </span>
                </div>
              )}
            </section>
          ))}
        </div>

        <footer className="rag-composer">
          <TextArea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              user.isLogin ? '输入需要查证或整理的问题' : '登录后向知识库提问'
            }
            autoSize={{ minRows: 2, maxRows: 5 }}
            disabled={isGenerating}
            onPressEnter={(event) => {
              if (event.shiftKey) return;
              event.preventDefault();
              handleSend();
            }}
          />
          <div className="rag-composer__actions">
            <Select<RetrievalDomain>
              value={domain}
              onChange={setDomain}
              options={domainOptions}
              variant="borderless"
              popupMatchSelectWidth={220}
              aria-label="检索范围"
            />
            {isGenerating ? (
              <Tooltip title="停止生成">
                <Button
                  type="primary"
                  shape="circle"
                  icon={<Square size={13} fill="currentColor" />}
                  onClick={stopGenerating}
                />
              </Tooltip>
            ) : (
              <Tooltip title={user.isLogin ? '发送' : '登录后发送'}>
                <Button
                  type="primary"
                  shape="circle"
                  icon={<Send size={15} />}
                  disabled={!query.trim()}
                  onClick={handleSend}
                />
              </Tooltip>
            )}
          </div>
        </footer>
      </section>
    </Drawer>
  );
}
