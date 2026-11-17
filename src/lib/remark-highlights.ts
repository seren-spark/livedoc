/**
 * @file Markdown 高亮插件。解析自定义高亮标记并转换为渲染节点。
 */
import type { Parent, PhrasingContent, Root } from 'mdast';

interface Highlight extends Parent {
  type: 'highlight';
  children: PhrasingContent[];
  data: { hName: 'mark' };
}
declare module 'mdast' {
  interface PhrasingContentMap {
    highlight: Highlight;
  }
  interface RootContentMap {
    highlight: Highlight;
  }
}

// Match the editor's ==highlight== notation without enabling raw HTML.
/**
 * 解析与编辑器一致的高亮标记，转换为高亮节点而不启用原始 HTML。
 *
 * @returns 供后续操作使用的回调或清理函数。
 */
export default function remarkHighlights() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    const inlineParents = new Set([
      'paragraph',
      'heading',
      'strong',
      'emphasis',
      'delete',
      'link',
      'tableCell',
    ]);
    /**
     * 遍历允许高亮的内联节点，将高亮标记包裹的内容转换为高亮节点。
     *
     * @param node 当前语法树或编辑器节点。
     */
    const visit = (node: Parent) => {
      for (const child of node.children)
        if ('children' in child) visit(child as Parent);
      if (!inlineParents.has(node.type)) return;
      const output: PhrasingContent[] = [];
      let highlighted: PhrasingContent[] | null = null;
      /**
       * 向当前节点列表追加已经拆分或转换的文本节点。
       *
       * @param child 当前节点的子节点。
       * @returns 计算得到的数值。
       */
      const push = (child: PhrasingContent) =>
        (highlighted ?? output).push(child);
      for (const child of node.children as PhrasingContent[]) {
        const raw = source.slice(
          child.position?.start.offset,
          child.position?.end.offset,
        );
        if (child.type !== 'text' || raw.includes('\\=')) {
          push(child);
          continue;
        }
        const parts = child.value.split(/(?<![=\\])==(?!=)/g);
        parts.forEach((part, index) => {
          if (index) {
            if (highlighted) {
              output.push({
                type: 'highlight',
                data: { hName: 'mark' },
                children: highlighted,
              });
              highlighted = null;
            } else highlighted = [];
          }
          if (part) push({ type: 'text', value: part });
        });
      }
      if (highlighted)
        output.push({ type: 'text', value: '==' }, ...highlighted);
      node.children = output;
    };
    visit(tree);
  };
}
