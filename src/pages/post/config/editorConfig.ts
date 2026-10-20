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
