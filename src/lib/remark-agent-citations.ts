import type { Parent, PhrasingContent, Root } from 'mdast';
import type { AgentCitation } from '@/api/document-agent.types';

// Transform only prose nodes: code, existing links and escaped brackets stay literal.
export default function remarkAgentCitations({ citations }: { citations: AgentCitation[] }) {
  const byId = new Map(citations.map((citation, index) => [citation.id, index + 1]));
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    const visit = (node: Parent) => {
      if (['link', 'linkReference', 'image', 'imageReference'].includes(node.type)) return;
      const children: typeof node.children = [];
      for (const child of node.children) {
        if ('children' in child) visit(child as Parent);
        if (child.type !== 'text') {
          children.push(child);
          continue;
        }
        const raw = source.slice(child.position?.start.offset, child.position?.end.offset);
        let offset = 0;
        let rawOffset = 0;
        for (const match of child.value.matchAll(/\[([^\]\n]+)\]/g)) {
          const rawIndex = raw.indexOf(match[0], rawOffset);
          if (rawIndex >= 0) rawOffset = rawIndex + match[0].length;
          const escaped = rawIndex >= 0 && (raw.slice(0, rawIndex).match(/\\+$/)?.[0].length ?? 0) % 2 === 1;
          const index = byId.get(match[1]);
          if (index === undefined || escaped) continue;
          if (match.index! > offset) children.push({ type: 'text', value: child.value.slice(offset, match.index) });
          children.push({
            type: 'link', url: `#agent-citation-${encodeURIComponent(match[1])}`,
            children: [{ type: 'text', value: `[${index}]` }],
          } as PhrasingContent);
          offset = match.index! + match[0].length;
        }
        if (offset < child.value.length) children.push({ type: 'text', value: child.value.slice(offset) });
      }
      node.children = children;
    };
    visit(tree);
  };
}
