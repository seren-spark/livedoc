/**
 * @file Agent 回答反馈。提交用户对回答质量的评价并展示知识沉淀状态。
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Space, Tooltip, message } from 'antd';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { agentFeedback } from '@/api/document-agent';

/**
 * 呈现Agent 回答反馈，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export default function AgentAnswerFeedback({
  runId,
  disabled,
  initialValue,
}: {
  runId: string;
  disabled?: boolean;
  initialValue?: 'helpful' | 'incorrect';
}) {
  const [value, setValue] = useState<'helpful' | 'incorrect'>();
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const submitting = useRef(false);
  useEffect(() => {
    generation.current++;
    setValue(initialValue);
    setPending(false);
    submitting.current = false;
    return () => {
      generation.current++;
    };
  }, [runId, initialValue]);
  /**
   * 提交回答评价，并同步页面中的反馈与知识沉淀状态。
   *
   * @param action 本次请求执行的操作类型。
   */
  const submit = async (action: 'helpful' | 'incorrect') => {
    if (submitting.current || disabled || value === 'incorrect') return;
    submitting.current = true;
    const current = generation.current;
    setPending(true);
    try {
      await agentFeedback(runId, action);
      if (current === generation.current) {
        setValue(action);
        if (action === 'incorrect')
          message.success('已记录，相关整理知识已停止复用');
      }
    } catch {
      if (current === generation.current) message.warning('反馈未保存，请重试');
    } finally {
      if (current === generation.current) {
        setPending(false);
        submitting.current = false;
      }
    }
  };
  return (
    <Space size={0}>
      <Tooltip title="回答有帮助">
        <Button
          type="text"
          size="small"
          aria-label="回答有帮助"
          aria-pressed={value === 'helpful'}
          disabled={disabled || pending || !!value}
          icon={<ThumbsUp size={14} />}
          onClick={() => void submit('helpful')}
        />
      </Tooltip>
      <Tooltip
        title={value === 'incorrect' ? '已标记有误，请重新提问' : '回答有误'}
      >
        <Button
          type="text"
          size="small"
          aria-label="回答有误"
          aria-pressed={value === 'incorrect'}
          disabled={disabled || pending || value === 'incorrect'}
          icon={<ThumbsDown size={14} />}
          onClick={() => void submit('incorrect')}
        />
      </Tooltip>
    </Space>
  );
}
