import React, { useEffect, useRef, useState } from 'react';
import { Button, Space, message } from 'antd';
import {
  ExpandOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { BubbleMenu } from '@tiptap/react/menus';
import { requestEditorAssist } from '@/api/rag';
import { SmartPositionDetection } from '@/utils/smartPositionDetection';
import AISuggestionBus from '@/utils/AISuggestionBus';
import '@/assets/styles/ai-editor.scss';
interface AIEditorBubbleProps {
  editor: any;
}

function isCanceledRequest(error: any) {
  return error?.name === 'AbortError' || error?.code === 'ERR_CANCELED';
}

export default function AIEditorBubble({ editor }: AIEditorBubbleProps) {
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

  const requestAssist = async (
    payload: Parameters<typeof requestEditorAssist>[0],
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      return await requestEditorAssist(payload, controller.signal);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  if (!editor) return null;

  // FIM补全
  const handleFIM = async () => {
    setLoading(true);
    try {
      const position = SmartPositionDetection.detectBestInsertionPoint(editor);
      const contextInfo = SmartPositionDetection.getContextInfo(
        editor,
        position,
      );

      const result = await requestAssist({
        query: '请在光标位置进行 FIM 中间补全，只返回需要插入的文本',
        cursorBefore: contextInfo.prefix,
        cursorAfter: contextInfo.suffix,
      });
      AISuggestionBus.getInstance().show({
        id: `${Date.now()}`,
        text: result,
        mode: 'insert',
        position,
      });
      message.success('已生成FIM建议，按 Tab/Enter 确认，Esc 取消');
    } catch (error) {
      if (!isCanceledRequest(error)) message.error('FIM补全失败');
    } finally {
      setLoading(false);
    }
  };

  // 选中文本改错
  const handleCorrect = async () => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    if (!selectedText.trim()) {
      message.warning('请先选择要检查的内容');
      return;
    }

    setLoading(true);
    try {
      const result = await requestAssist({
        query: '请改错并校对选中文本，只返回修正后的文本',
        selectedText,
        documentContent: selectedText,
      });
      AISuggestionBus.getInstance().show({
        id: `${Date.now()}`,
        text: result,
        mode: 'replace',
        range: { from, to },
      });
      message.success('已生成改错建议，按 Tab/Enter 确认，Esc 取消');
    } catch (error) {
      if (!isCanceledRequest(error)) message.error('改错失败');
    } finally {
      setLoading(false);
    }
  };

  // 选中文本扩写
  const handleExpand = async () => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    if (!selectedText.trim()) {
      message.warning('请先选择要扩写的内容');
      return;
    }

    setLoading(true);
    try {
      const result = await requestAssist({
        query: '请扩写选中文本，保持原意和文风，只返回扩写后的文本',
        selectedText,
        documentContent: selectedText,
      });
      AISuggestionBus.getInstance().show({
        id: `${Date.now()}`,
        text: result,
        mode: 'replace',
        range: { from, to },
      });
      message.success('已生成扩写建议，按 Tab/Enter 确认，Esc 取消');
    } catch (error) {
      if (!isCanceledRequest(error)) message.error('扩写失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BubbleMenu
      editor={editor}
      //   tippyOptions={{ duration: 100 }}
      className="ai-bubble-menu"
    >
      <Space>
        <Button
          size="small"
          icon={<ThunderboltOutlined />}
          onClick={handleFIM}
          loading={loading}
        >
          FIM补全
        </Button>
        <Button
          size="small"
          icon={<CheckCircleOutlined />}
          onClick={handleCorrect}
          loading={loading}
        >
          改错
        </Button>
        <Button
          size="small"
          icon={<ExpandOutlined />}
          onClick={handleExpand}
          loading={loading}
        >
          扩写
        </Button>
      </Space>
    </BubbleMenu>
  );
}
