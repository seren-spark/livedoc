/**
 * @file TipTap 编辑器容器。组织TipTap 编辑器容器的界面与交互。
 */
// src/Tiptap.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import { FloatingMenu, BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';

/**
 * 呈现TipTap 编辑器容器，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
const Tiptap = () => {
  const editor = useEditor({
    extensions: [StarterKit], // define your extension array
    content: '<p>Hello World!</p>', // initial content
  });

  return (
    <>
      <EditorContent editor={editor} />
      <FloatingMenu editor={editor}>This is the floating menu</FloatingMenu>
      <BubbleMenu editor={editor}>This is the bubble menu</BubbleMenu>
    </>
  );
};

export default Tiptap;
