import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button, Drawer, Input, Select, Tooltip, Typography } from 'antd';
import type { Editor } from '@tiptap/react';
import ReactMarkdown from 'react-markdown';
import {
  BrainCircuit,
  ChevronDown,
  FilePlus2,
  LibraryBig,
  MessageSquareText,
  Plus,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import type { UserState } from '@/store/modules/userSlice';
import CitationList from './CitationList';
import DocumentMemoryPanel from './DocumentMemoryPanel';
import type { AgentToolCall, Citation, RetrievalDomain } from '@/api/rag';
import {
  useRagChatSession,
  type ConversationTurn,
  type RenderedConversationTurn,
} from './useRagChatSession';
import './RagChatPanel.scss';

const { Text } = Typography;
const { TextArea } = Input;

interface RagChatPanelProps {
  editor: Editor | null;
  title: string;
  documentId?: string;
  documentVersion?: number;
  open: boolean;
  onClose: () => void;
  onRequireLogin: (callback: () => void) => void;
}

const domainOptions = [
  { label: '全部公开知识库', value: 'public' },
  { label: '我的私有文档', value: 'private' },
  { label: '团队共享文档', value: 'team' },
  { label: '当前打开文档', value: 'current_document' },
];

const exampleQuestions: Record<RetrievalDomain, string[]> = {
  public: [
    'LiveDoc 的 AI 写作结果为什么不能直接写入正文？',
    'SSE 写作链路包含哪些事件？',
    '四个 Agent 工具分别是什么？',
  ],
  private: [
    'Alice 的 RAG 演示链路依次经过哪些阶段？',
    '私有演示文档中的检索验收口令是什么？',
    '为什么文档更新要使用新版本原子激活？',
  ],
  team: [
    'Alpha 团队如何校验并展示引用？',
    '证据不足时系统应该怎么回答？',
    '引用版本过期时为什么不能定位到新版内容？',
  ],
  current_document: [
    '总结当前文档的核心内容',
    '提取当前文档中的关键步骤',
    '这篇文档还有哪些信息没有解释清楚？',
  ],
};

const toolLabels: Record<AgentToolCall['name'], string> = {
  search_knowledge_base: '知识库检索',
  summarize_current_document: '当前文档摘要',
  continue_paragraph: '上下文续写',
  optimize_format: '选区优化',
};

const toolSourceLabels: Record<AgentToolCall['source'], string> = {
  llm_function_call: 'Function Call',
  rule_fallback: '规则降级',
  request_intent: '显式意图',
};

type ActiveView = 'chat' | 'memory';

function useNarrowDrawer() {
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isNarrow;
}

function RagPanelHeader({
  activeView,
  title,
  username,
  isLoggedIn,
  onNewConversation,
  onClose,
}: {
  activeView: ActiveView;
  title: string;
  username: string;
  isLoggedIn: boolean;
  onNewConversation: () => void;
  onClose: () => void;
}) {
  return (
    <header className="rag-chat-panel__header">
      <div className="rag-chat-panel__identity">
        <span className="rag-chat-panel__logo">
          <LibraryBig size={18} />
        </span>
        <div>
          <strong>{activeView === 'chat' ? '知识库问答' : '文档记忆'}</strong>
          <span>
            {activeView === 'chat'
              ? isLoggedIn
                ? username
                : '未登录'
              : title || '未命名文档'}
          </span>
        </div>
      </div>
      <div className="rag-chat-panel__header-actions">
        {activeView === 'chat' && (
          <Tooltip title="新对话">
            <Button
              type="text"
              icon={<Plus size={17} />}
              onClick={onNewConversation}
            />
          </Tooltip>
        )}
        <Tooltip title="关闭">
          <Button type="text" icon={<X size={17} />} onClick={onClose} />
        </Tooltip>
      </div>
    </header>
  );
}

function RagPanelTabs({
  activeView,
  onChange,
}: {
  activeView: ActiveView;
  onChange: (view: ActiveView) => void;
}) {
  return (
    <nav className="rag-chat-panel__tabs" aria-label="AI 侧栏视图">
      <button
        type="button"
        className={activeView === 'chat' ? 'is-active' : undefined}
        aria-selected={activeView === 'chat'}
        onClick={() => onChange('chat')}
      >
        <MessageSquareText size={15} />
        对话
      </button>
      <button
        type="button"
        className={activeView === 'memory' ? 'is-active' : undefined}
        aria-selected={activeView === 'memory'}
        onClick={() => onChange('memory')}
      >
        <BrainCircuit size={15} />
        文档记忆
      </button>
    </nav>
  );
}

function EmptyConversation({
  domain,
  isGenerating,
  onAskQuestion,
}: {
  domain: RetrievalDomain;
  isGenerating: boolean;
  onAskQuestion: (question: string) => void;
}) {
  return (
    <div className="rag-chat-panel__empty">
      <LibraryBig size={28} />
      <strong>开始一次知识库问答</strong>
      <span>可直接选择一个问题验证检索、引用与回链</span>
      <div className="rag-chat-panel__examples">
        {exampleQuestions[domain].map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onAskQuestion(question)}
            disabled={isGenerating}
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

function RagTurnCard({
  turn,
  onToggleSources,
  onOpenOriginal,
  onInsertAnswer,
  onRecordFeedback,
}: {
  turn: RenderedConversationTurn;
  onToggleSources: (turnId: string, expanded: boolean) => void;
  onOpenOriginal: (citation: Citation) => void;
  onInsertAnswer: (turn: ConversationTurn) => void;
  onRecordFeedback: (
    turn: ConversationTurn,
    feedback: 'helpful' | 'unhelpful',
  ) => void;
}) {
  return (
    <section className="rag-turn">
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
        onClick={() => onToggleSources(turn.id, turn.sourcesExpanded)}
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
          <CitationList
            citations={turn.citations}
            idPrefix={`rag-source-${turn.id}`}
            onOpenOriginal={onOpenOriginal}
          />
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
        {turn.status === 'streaming' && <span className="rag-turn__cursor" />}
        {turn.status === 'stopped' && <Text type="secondary">生成已停止</Text>}
        {turn.status === 'error' && (
          <Text type="danger">{turn.error || '生成失败，请稍后重试'}</Text>
        )}
      </div>

      {turn.status === 'done' && turn.canInsert && (
        <div className="rag-turn__answer-actions">
          <Button
            icon={<FilePlus2 size={15} />}
            onClick={() => onInsertAnswer(turn)}
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
                onClick={() => onRecordFeedback(turn, 'helpful')}
              />
            </Tooltip>
            <Tooltip title="无帮助">
              <Button
                type={turn.feedback === 'unhelpful' ? 'primary' : 'text'}
                danger={turn.feedback === 'unhelpful'}
                size="small"
                icon={<ThumbsDown size={14} />}
                onClick={() => onRecordFeedback(turn, 'unhelpful')}
              />
            </Tooltip>
          </span>
        </div>
      )}
    </section>
  );
}

function RagConversation({
  turns,
  domain,
  isGenerating,
  scrollRef,
  onAskQuestion,
  onToggleSources,
  onOpenOriginal,
  onInsertAnswer,
  onRecordFeedback,
}: {
  turns: RenderedConversationTurn[];
  domain: RetrievalDomain;
  isGenerating: boolean;
  scrollRef: RefObject<HTMLDivElement>;
  onAskQuestion: (question: string) => void;
  onToggleSources: (turnId: string, expanded: boolean) => void;
  onOpenOriginal: (citation: Citation) => void;
  onInsertAnswer: (turn: ConversationTurn) => void;
  onRecordFeedback: (
    turn: ConversationTurn,
    feedback: 'helpful' | 'unhelpful',
  ) => void;
}) {
  return (
    <div className="rag-chat-panel__conversation" ref={scrollRef}>
      {turns.length === 0 && (
        <EmptyConversation
          domain={domain}
          isGenerating={isGenerating}
          onAskQuestion={onAskQuestion}
        />
      )}
      {turns.map((turn) => (
        <RagTurnCard
          key={turn.id}
          turn={turn}
          onToggleSources={onToggleSources}
          onOpenOriginal={onOpenOriginal}
          onInsertAnswer={onInsertAnswer}
          onRecordFeedback={onRecordFeedback}
        />
      ))}
    </div>
  );
}

function RagComposer({
  query,
  domain,
  isLoggedIn,
  isGenerating,
  onQueryChange,
  onDomainChange,
  onSend,
  onStop,
}: {
  query: string;
  domain: RetrievalDomain;
  isLoggedIn: boolean;
  isGenerating: boolean;
  onQueryChange: (value: string) => void;
  onDomainChange: (domain: RetrievalDomain) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  return (
    <footer className="rag-composer">
      <TextArea
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={
          isLoggedIn ? '输入需要查证或整理的问题' : '登录后向知识库提问'
        }
        autoSize={{ minRows: 2, maxRows: 5 }}
        disabled={isGenerating}
        onPressEnter={(event) => {
          if (event.shiftKey) return;
          event.preventDefault();
          onSend();
        }}
      />
      <div className="rag-composer__actions">
        <Select<RetrievalDomain>
          value={domain}
          onChange={onDomainChange}
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
              onClick={onStop}
            />
          </Tooltip>
        ) : (
          <Tooltip title={isLoggedIn ? '发送' : '登录后发送'}>
            <Button
              type="primary"
              shape="circle"
              icon={<Send size={15} />}
              disabled={!query.trim()}
              onClick={onSend}
            />
          </Tooltip>
        )}
      </div>
    </footer>
  );
}

export default function RagChatPanel({
  editor,
  title,
  documentId,
  documentVersion,
  open,
  onClose,
  onRequireLogin,
}: RagChatPanelProps) {
  const user = useSelector((state: RootState) => state.user as UserState);
  const isNarrow = useNarrowDrawer();
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
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
  } = useRagChatSession({
    editor,
    title,
    documentId,
    documentVersion,
    isLoggedIn: user.isLogin,
    onClose,
    onRequireLogin,
  });

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [renderedTurns]);

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
      <section className="rag-chat-panel" aria-label="AI 写作助手">
        <RagPanelHeader
          activeView={activeView}
          title={title}
          username={user.username}
          isLoggedIn={user.isLogin}
          onNewConversation={startNewConversation}
          onClose={onClose}
        />
        <RagPanelTabs activeView={activeView} onChange={setActiveView} />

        {activeView === 'chat' ? (
          <>
            <RagConversation
              turns={renderedTurns}
              domain={domain}
              isGenerating={isGenerating}
              scrollRef={scrollRef}
              onAskQuestion={askQuestion}
              onToggleSources={toggleSources}
              onOpenOriginal={openOriginal}
              onInsertAnswer={insertAnswer}
              onRecordFeedback={recordFeedback}
            />
            <RagComposer
              query={query}
              domain={domain}
              isLoggedIn={user.isLogin}
              isGenerating={isGenerating}
              onQueryChange={setQuery}
              onDomainChange={setDomain}
              onSend={sendCurrentQuery}
              onStop={stopGenerating}
            />
          </>
        ) : (
          <div className="rag-chat-panel__memory">
            <DocumentMemoryPanel
              documentId={documentId}
              documentVersion={documentVersion}
            />
          </div>
        )}
      </section>
    </Drawer>
  );
}
