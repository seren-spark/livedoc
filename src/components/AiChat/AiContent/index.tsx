/**
 * @file AI 对话内容。组织AI 对话内容的界面与交互。
 */
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
 * 呈现AI 对话内容，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
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

  /**
   * 响应菜单项点击，执行对应的界面操作。
   *
   * @param event 需要处理的事件。
   */
  const handleMenuClick = (event: any) => {
    const key = event.key ?? event.currentTarget?.value;
    setAiType(quickActions.find((item) => item.key === key)?.label);
  };

  /**
   * 更新指定助手消息的内容和生成状态。
   *
   * @param id 目标记录的唯一标识。
   * @param update 状态更新时执行的回调。
   */
  const updateAssistant = (id: string, update: Partial<Message>) => {
    setChatHistory((items) =>
      items.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  };

  /**
   * 把新收到的流式文本追加到当前助手消息。
   *
   * @param id 目标记录的唯一标识。
   * @param delta 需要应用到当前状态的增删变化。
   */
  const appendAssistantDelta = (id: string, delta: string) => {
    setChatHistory((items) =>
      items.map((item) =>
        item.id === id ? { ...item, content: item.content + delta } : item,
      ),
    );
  };

  /**
   * 创建本轮问答并提交用户输入，接收生成结果。
   *
   * @param rawMessage 模型返回的原始消息。
   */
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
          onMeta: () => undefined,
          onCitations: (citations) =>
            updateAssistant(assistantMessage.id, { citations }),
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

  /**
   * 取消当前生成请求，并结束界面的生成状态。
   */
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
