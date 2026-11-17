/**
 * @file 文章阅读扩展配置。配置文章展示所需的 TipTap 节点、属性和 HTML 渲染。
 */
import { Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Mathematics } from '@tiptap/extension-mathematics';
import { TableKit } from '@tiptap/extension-table';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { all, createLowlight } from 'lowlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Heading from '@tiptap/extension-heading';
import TextAlign from '@tiptap/extension-text-align';
import TableOfContents, {
  getHierarchicalIndexes,
} from '@tiptap/extension-table-of-contents';
import marked from '@/utils/marked';

const lowlight = createLowlight(all);

// The reader uses plain node views: image resize handles and code-language inputs belong to the editor.
/**
 * 创建文章阅读用的编辑器实例，使用适合只读展示的节点视图。
 *
 * @param set set 参数（(items: any) => void）（可选）。
 * @param markdown 待解析或写入的 Markdown 原文。
 * @param json 待解析或写入的 JSON 数据。
 * @returns Editor 类型的处理结果。
 */
export function createEditor(
  set?: (items: any) => void,
  markdown = '',
  json: JSONContent | null = null,
) {
  return new Editor({
    editable: false,
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, link: false }),
      Heading.extend({
        /**
         * 将当前节点及其属性转换为 HTML 结构。
         *
         * @param options 控制本次行为的可选配置。
         * @returns [string, { class: string; }, number] 类型的处理结果。
         */
        renderHTML({ node, HTMLAttributes }) {
          return [
            'h' + node.attrs.level,
            { ...HTMLAttributes, class: 'heading heading-' + node.attrs.level },
            0,
          ];
        },
      }),
      TableOfContents.configure({
        getIndex: getHierarchicalIndexes,
        /**
         * 在编辑器内容更新后同步当前扩展或页面状态。
         *
         * @param items 需要处理的条目集合。
         */
        onUpdate(items) {
          set?.(items);
        },
      }),
      Mathematics,
      TableKit.configure({ table: { resizable: false } }),
      Highlight,
      TaskList,
      TaskItem,
      Link,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.extend({
        /**
         * 声明节点属性及其 HTML 读写规则。
         *
         * @returns 整理后的状态与操作结果对象。
         */
        addAttributes() {
          return {
            ...this.parent?.(),
            width: { default: null },
            height: { default: null },
          };
        },
      }).configure({ allowBase64: false }),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: json ?? marked.parse(markdown),
  });
}
