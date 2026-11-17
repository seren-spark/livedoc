/**
 * @file 编辑器 AI 工具栏。提供续写、纠错和扩写入口，基于选区或光标上下文请求写作。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dropdown, message } from 'antd';
import {
  CheckCircleOutlined,
  EditOutlined,
  ExpandOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import AISuggestionBus from '@/utils/AISuggestionBus';
import { SmartPositionDetection } from '@/utils/smartPositionDetection';
import { requestEditorAssist } from '@/api/rag';

interface AIEditorToolbarProps {
  editor: any;
  onOpenRag?: () => void;
}

/**
 * 判断请求是否因用户主动取消而结束。
 *
 * @param error 本次操作捕获的异常。
 * @returns 条件是否满足的判断结果。
 */
function isCanceledRequest(error: any) {
  return error?.name === 'AbortError' || error?.code === 'ERR_CANCELED';
}

/**
 * 呈现编辑器 AI 工具栏，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export default function AIEditorToolbar({
  editor,
  onOpenRag,
}: AIEditorToolbarProps) {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    /**
     * 在按下 Escape 时取消当前 AI 请求。
     *
     * @param event 需要处理的事件。
     */
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') abortRef.current?.abort();
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => {
      window.removeEventListener('keydown', cancelOnEscape);
      abortRef.current?.abort();
    };
  }, []);

  /**
   * 整理当前编辑上下文并执行指定的 AI 辅助动作。
   *
   * @param action 取消信号，用于中止请求和后台处理。
   * @param errorText 需要记录或展示的错误文本。
   */
  const runAction = useCallback(
    async (
      action: (signal: AbortSignal) => Promise<void>,
      errorText: string,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        await action(controller.signal);
      } catch (error) {
        if (!isCanceledRequest(error)) {
          console.error(error);
          message.error(errorText);
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [],
  );

  /**
   * 读取光标前后文，发起中间填充或续写请求。
   */
  const handleSmartFIM = useCallback(
    () =>
      runAction(async (signal) => {
        const position =
          SmartPositionDetection.detectBestInsertionPoint(editor);
        const context = SmartPositionDetection.getContextInfo(editor, position);
        const result = await requestEditorAssist(
          {
            query: '请在光标位置进行 FIM 中间补全，只返回需要插入的文本',
            cursorBefore: context.prefix,
            cursorAfter: context.suffix,
          },
          signal,
        );
        AISuggestionBus.getInstance().show({
          id: `${Date.now()}`,
          text: result,
          mode: 'insert',
          position,
        });
        message.success('已生成 AI 建议，按 Tab/Enter 确认，Esc 取消');
      }, '智能 FIM 补全失败，请重试'),
    [editor, runAction],
  );

  /**
   * 请求对给定文本纠错，并返回可用于预览的结果。
   *
   * @param text 待处理的文本。
   * @param mode mode 参数（'replace' | 'replace_all'）。
   * @param range 需要读取、编辑或映射的区间（可选）。
   */
  const correctText = useCallback(
    (
      text: string,
      mode: 'replace' | 'replace_all',
      range?: { from: number; to: number },
    ) =>
      runAction(async (signal) => {
        const result = await requestEditorAssist(
          {
            query: '请改错并校对目标文本，只返回修正后的完整文本',
            selectedText: text,
            documentContent: text,
          },
          signal,
        );
        AISuggestionBus.getInstance().show({
          id: `${Date.now()}`,
          text: result,
          mode,
          ...(range ? { range } : {}),
        });
        message.success('已生成改错建议，按 Tab/Enter 确认，Esc 取消');
      }, '智能改错失败，请重试'),
    [runAction],
  );

  /**
   * 根据当前光标或选区确定纠错范围并发起请求。
   */
  const handleSmartCorrect = useCallback(
    () => correctText(editor.getText(), 'replace_all'),
    [correctText, editor],
  );

  /**
   * 对用户当前选中的文本执行纠错。
   */
  const handleSelectedCorrect = useCallback(() => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    if (!selectedText.trim()) {
      message.warning('请先选择要检查的内容');
      return;
    }
    void correctText(selectedText, 'replace', { from, to });
  }, [correctText, editor]);

  /**
   * 基于当前段落或选区发起扩写。
   */
  const handleSmartExpand = useCallback(
    () =>
      runAction(async (signal) => {
        const fullText = editor.getText();
        const result = await requestEditorAssist(
          {
            query: '请扩写目标文本，保持原意和文风，只返回扩写后的完整文本',
            selectedText: fullText,
            documentContent: fullText,
          },
          signal,
        );
        AISuggestionBus.getInstance().show({
          id: `${Date.now()}`,
          text: result,
          mode: 'replace_all',
        });
        message.success('已生成扩写建议，按 Tab/Enter 确认，Esc 取消');
      }, '智能扩写失败，请重试'),
    [editor, runAction],
  );

  const menuItems = [
    ...(onOpenRag
      ? [
          {
            key: 'knowledge-chat',
            label: '知识库问答',
            icon: <FileSearchOutlined />,
            onClick: onOpenRag,
          },
          { type: 'divider' as const },
        ]
      : []),
    {
      key: 'smart-fim',
      label: '智能 FIM 补全',
      icon: <ThunderboltOutlined />,
      onClick: handleSmartFIM,
    },
    {
      key: 'smart-correct',
      label: '整篇改错',
      icon: <CheckCircleOutlined />,
      onClick: handleSmartCorrect,
    },
    {
      key: 'selected-correct',
      label: '选中改错',
      icon: <EditOutlined />,
      onClick: handleSelectedCorrect,
    },
    {
      key: 'smart-expand',
      label: '整篇扩写',
      icon: <ExpandOutlined />,
      onClick: handleSmartExpand,
    },
  ];

  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={['click']}
      placement="bottomLeft"
    >
      <Button
        icon={loading ? <LoadingOutlined /> : <RobotOutlined />}
        loading={loading}
        type="text"
      >
        AI 助手
      </Button>
    </Dropdown>
  );
}
