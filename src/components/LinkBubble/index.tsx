/**
 * @file 链接编辑浮层。组织链接编辑浮层的界面与交互。
 */
import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { Button, Input } from 'antd';
import './index.scss';

interface LinkBubbleProps {
  editor: Editor | null;
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (text: string, url: string) => void;
}

/**
 * 呈现链接编辑浮层，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
const CustomLinkBubble: React.FC<LinkBubbleProps> = ({
  editor,
  isVisible,
  onClose,
  onSubmit,
}) => {
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const bubbleRef = useRef<HTMLDivElement>(null);

  // 初始化选中文本和位置
  useEffect(() => {
    if (isVisible && editor) {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        // 获取选中文本
        const text = editor.state.doc.textBetween(from, to);
        setLinkText(text);
        setLinkUrl('');

        // 定位气泡框
        positionBubble(editor, from, to);
      } else {
        // 无选区时关闭
        const text = '链接';
        editor
          .chain()
          .focus()
          .insertContent('链接')
          .setTextSelection({ from, to: from + linkText.length });
        setLinkText(text);
        setLinkUrl('');
        // 定位气泡框
        positionBubble(editor, from, from);
      }
    }
  }, [isVisible, editor]);

  // 定位气泡框到选中文本下方
  /**
   * 定位气泡框到选中文本下方
   *
   * @param editor 当前 TipTap 编辑器实例。
   * @param from 编辑区间的起始位置。
   * @param to 编辑区间的结束位置。
   */
  const positionBubble = (editor: Editor, from: number, to: number) => {
    if (!bubbleRef.current) return;

    // 获取选中文本坐标
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    const editorRect = editor.view.dom.getBoundingClientRect();

    // 设置气泡框位置（相对编辑器定位）
    const bubbleStyle = bubbleRef.current.style;
    bubbleStyle.top = `${start.bottom - editorRect.top + 10}px`; // 8px偏移
    bubbleStyle.left = `${(start.left + end.left) / 2 - editorRect.left}px`;
    // 移除transform属性以避免居中效果
    bubbleStyle.transform = 'none';
  };

  // 处理提交
  /**
   * 校验表单数据后提交当前操作。
   *
   * @param e 当前界面事件或捕获的异常。
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (linkUrl) {
      onSubmit(linkText, linkUrl);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      ref={bubbleRef}
      style={{
        position: 'absolute',
        background: 'white',
        border: '1px solid #e0e0e0',
        borderRadius: '6px',
        padding: '12px',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.1)',
        zIndex: 1000,
        minWidth: '280px',
        transform: 'translateX(-50%)', // 水平居中对齐选区
      }}
    >
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '8px' }}>
          <Input
            type="text"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="链接文本"
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <Input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
            required
          />
        </div>
        <div
          style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}
        >
          <Button size="small" onClick={onClose}>
            取消
          </Button>
          <Button type="primary" size="small" htmlType="submit">
            确认
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CustomLinkBubble;
