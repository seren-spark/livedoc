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
    const visit = (node: Parent) => {
      for (const child of node.children)
        if ('children' in child) visit(child as Parent);
      if (!inlineParents.has(node.type)) return;
      const output: PhrasingContent[] = [];
      let highlighted: PhrasingContent[] | null = null;
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
