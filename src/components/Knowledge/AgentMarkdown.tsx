import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkHighlights from '@/lib/remark-highlights';
import remarkAgentCitations from '@/lib/remark-agent-citations';
import type { AgentCitation } from '@/api/document-agent.types';

export default function AgentMarkdown({
  children,
  citations = [],
  onCitationClick,
}: {
  children?: string | null;
  citations?: AgentCitation[];
  onCitationClick?: (citation: AgentCitation) => void;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkAgentCitations, { citations }], remarkHighlights]}
      components={{
        a: ({ node: _node, href, children, ...props }) => {
          const citation = citations.find((item) => href === `#agent-citation-${encodeURIComponent(item.id)}`);
          return citation && onCitationClick ? (
            <button type="button" className="agent-citation" title={citation.title}
              aria-label={`查看来源：${citation.title}`} onClick={() => onCitationClick(citation)}>
              {children}
            </button>
          ) : <a {...props} href={href}>{children}</a>;
        },
        table: ({ node: _node, ...props }) => (
          <div className="agent-table-scroll">
            <table {...props} />
          </div>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
