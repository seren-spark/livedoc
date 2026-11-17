/**
 * @file Agent 引用 Markdown 插件。将回答中的引用标记转换为可交互的语法节点。
 */
import type { Parent, PhrasingContent, Root } from 'mdast';
import type { AgentCitation } from '@/api/document-agent.types';

// Transform only prose nodes: code, existing links and escaped brackets stay literal.
/**
 * 把普通正文中的引用标记转换为引用节点，保持代码和已有链接的字面内容。
 *
 * @param options 控制本次行为的可选配置。
 * @returns 供后续操作使用的回调或清理函数。
 */
export default function remarkAgentCitations({ citations }: { citations: AgentCitation[] }) {
  const byId = new Map(citations.map((citation, index) => [citation.id, index + 1]));
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    /**
     * 遍历 Markdown 文本，把有效引用标记转换为引用节点，跳过已有链接和图片。
     *
     * @param node 当前语法树或编辑器节点。
     */
    const visit = (node: Parent) => {
      if (['link', 'linkReference', 'image', 'imageReference'].includes(node.type)) return;
      const children: typeof node.children = [];
      for (const child of node.children) {
        if ('children' in child) {
          visit(child as Parent);
          if (child.type === 'paragraph' && !child.children.length) continue;
        }
        if (child.type !== 'text') {
          children.push(child);
          continue;
        }
        const raw = source.slice(child.position?.start.offset, child.position?.end.offset);
        const footer = node.type === 'paragraph' && node.children.length === 1 && raw === child.value
          ? /^\[citation_ids\s*=\s*(\[.*\])\]$/.exec(child.value.trim()) : null;
        if (footer) {
          try {
            const ids: unknown = JSON.parse(footer[1]);
            if (Array.isArray(ids) && ids.length > 0 && ids.every(id => typeof id === 'string' && byId.has(id))) continue;
          } catch { /* Unrecognized prose stays visible. */ }
        }
        let offset = 0;
        let rawOffset = 0;
        for (const match of child.value.matchAll(/\[([^\]\n]+)\]/g)) {
          const rawIndex = raw.indexOf(match[0], rawOffset);
          if (rawIndex >= 0) rawOffset = rawIndex + match[0].length;
          const escaped = rawIndex >= 0 && (raw.slice(0, rawIndex).match(/\\+$/)?.[0].length ?? 0) % 2 === 1;
          const id = byId.has(match[1]) ? match[1] : match[1].replace(/^citation_id:\s*/, '');
          const index = byId.get(id);
          if (index === undefined || escaped) continue;
          if (match.index! > offset) children.push({ type: 'text', value: child.value.slice(offset, match.index) });
          children.push({
            type: 'link', url: `#agent-citation-${encodeURIComponent(id)}`,
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
