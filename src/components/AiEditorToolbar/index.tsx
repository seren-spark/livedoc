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

function isCanceledRequest(error: any) {
  return error?.name === 'AbortError' || error?.code === 'ERR_CANCELED';
}

export default function AIEditorToolbar({
  editor,
  onOpenRag,
}: AIEditorToolbarProps) {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') abortRef.current?.abort();
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => {
      window.removeEventListener('keydown', cancelOnEscape);
      abortRef.current?.abort();
    };
  }, []);

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

  const handleSmartCorrect = useCallback(
    () => correctText(editor.getText(), 'replace_all'),
    [correctText, editor],
  );

  const handleSelectedCorrect = useCallback(() => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    if (!selectedText.trim()) {
      message.warning('请先选择要检查的内容');
      return;
    }
    void correctText(selectedText, 'replace', { from, to });
  }, [correctText, editor]);

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
