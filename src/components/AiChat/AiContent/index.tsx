import { useEffect, useRef, useState } from 'react';
import FuncButton from '../FuncButton';
import InputArea from '../InputArea';
import Prompt from '../Prompt';
import Dialogue from '../Dialogue';
import './index.scss';
import {
  BookOutlined,
  EditOutlined,
  ExperimentOutlined,
  PictureOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { message as antMessage } from 'antd';
import { streamAiWrite, type Citation, type RetrievalDomain } from '@/api/rag';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: Citation[];
}

interface AiContentProps {
  timePeriod: string;
  userName: string;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AiContent({ timePeriod, userName }: AiContentProps) {
  const [aiType, setAiType] = useState<React.ReactNode>(null);
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [domain, setDomain] = useState<RetrievalDomain>('public');
  const [conversationId] = useState(() => createId('ai-conversation'));
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const quickActions = [
    {
      key: '1',
      icon: <PictureOutlined style={{ color: '#ff7a45' }} />,
      label: '图像生成',
    },
    {
      key: '2',
      icon: <EditOutlined style={{ color: '#1890ff' }} />,
      label: '帮我写作',
    },
    {
      key: '3',
      icon: <SearchOutlined style={{ color: '#722ed1' }} />,
      label: 'AI 搜索',
    },
    {
      key: '4',
      icon: <BookOutlined style={{ color: '#eb2f96' }} />,
      label: 'AI 阅读',
    },
    {
      key: '5',
      icon: <ExperimentOutlined style={{ color: '#13c2c2' }} />,
      label: '学术搜索',
    },
  ];

  const handleMenuClick = (event: any) => {
    const key = event.key ?? event.currentTarget?.value;
    setAiType(quickActions.find((item) => item.key === key)?.label);
  };

  const updateAssistant = (id: string, update: Partial<Message>) => {
    setChatHistory((items) =>
      items.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  };

  const appendAssistantDelta = (id: string, delta: string) => {
    setChatHistory((items) =>
      items.map((item) =>
        item.id === id ? { ...item, content: item.content + delta } : item,
      ),
    );
  };

  const handleSendMessage = async (rawMessage: string) => {
    const query = rawMessage.trim();
    if (!query || msgLoading) return;

    const userMessage: Message = {
      id: createId('user'),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };
    const assistantMessage: Message = {
      id: createId('assistant'),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      citations: [],
    };

    setChatHistory((items) => [...items, userMessage, assistantMessage]);
    setHasSentFirstMessage(true);
    setMsgLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamAiWrite(
        {
          query,
          retrieval_domain: domain,
          conversation_id: conversationId,
          current_context: {
            title: '独立 AI 对话',
          },
        },
        {
          onMeta: (meta) =>
            updateAssistant(assistantMessage.id, { citations: meta.citations }),
          onDelta: (delta) => appendAssistantDelta(assistantMessage.id, delta),
          onDone: () => setMsgLoading(false),
          onError: (errorMessage) => {
            updateAssistant(assistantMessage.id, { content: errorMessage });
            setMsgLoading(false);
          },
        },
        controller.signal,
      );
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        appendAssistantDelta(assistantMessage.id, '\n\n_生成已停止_');
      } else {
        const errorMessage = error?.message || '生成失败，请稍后重试';
        updateAssistant(assistantMessage.id, { content: errorMessage });
        antMessage.error(errorMessage);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setMsgLoading(false);
    }
  };

  const stopGenerating = () => abortRef.current?.abort();

  return (
    <div
      className="main-content"
      style={{ justifyContent: hasSentFirstMessage ? 'flex-end' : 'center' }}
    >
      {!hasSentFirstMessage && (
        <Prompt timePeriod={timePeriod} userName={userName} />
      )}
      {hasSentFirstMessage && (
        <Dialogue
          msgLoading={msgLoading}
          chatHistory={chatHistory}
          currentMessage=""
        />
      )}
      <InputArea
        quickActions={quickActions}
        handleMenuClick={handleMenuClick}
        aiType={aiType}
        setAiType={setAiType}
        handleSendMessage={handleSendMessage}
        msgLoading={msgLoading}
        retrievalDomain={domain}
        onRetrievalDomainChange={setDomain}
        onStop={stopGenerating}
      />
      {!hasSentFirstMessage && (
        <FuncButton
          quickActions={quickActions}
          handleMenuClick={handleMenuClick}
        />
      )}
    </div>
  );
}
