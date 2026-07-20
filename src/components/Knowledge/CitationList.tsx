import { Button, Card, Space, Tag, Typography } from 'antd';
import {
  ExternalLink,
  FilePlus2,
  Globe2,
  LockKeyhole,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import type { Citation } from '@/api/rag';
import './CitationList.scss';

const { Text } = Typography;

const visibilityLabels: Record<string, string> = {
  public: '公开',
  private: '私有',
  team: '团队',
};

const visibilityColors: Record<string, string> = {
  public: 'green',
  private: 'blue',
  team: 'gold',
};

function permissionIcon(citation: Citation) {
  if (citation.source_type === 'current_document')
    return <FilePlus2 size={13} />;
  if (citation.visibility === 'team') return <Users size={13} />;
  if (citation.visibility === 'private') return <LockKeyhole size={13} />;
  return <Globe2 size={13} />;
}

export function citationVisibilityLabel(citation: Citation) {
  return citation.source_type === 'current_document'
    ? '当前文档'
    : visibilityLabels[citation.visibility] || citation.visibility;
}

interface CitationListProps {
  citations: Citation[];
  idPrefix?: string;
  onOpenOriginal?: (citation: Citation) => void;
}

export default function CitationList({
  citations,
  idPrefix = 'citation',
  onOpenOriginal,
}: CitationListProps) {
  return (
    <div className="citation-list">
      {citations.map((citation) => (
        <CitationItem
          key={`${citation.chunk_id}-${citation.index}`}
          citation={citation}
          idPrefix={idPrefix}
          onOpenOriginal={onOpenOriginal}
        />
      ))}
    </div>
  );
}

function CitationItem({
  citation,
  idPrefix,
  onOpenOriginal,
}: {
  citation: Citation;
  idPrefix: string;
  onOpenOriginal?: (citation: Citation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isCurrentDocument = citation.source_type === 'current_document';
  const canOpen = Boolean(
    onOpenOriginal && (citation.url || isCurrentDocument),
  );

  return (
    <Card
      size="small"
      className="citation-card"
      id={`${idPrefix}-${citation.index}`}
      title={
        <Space size={8}>
          <span className="citation-card__index">{citation.index}</span>
          <Text strong ellipsis={{ tooltip: citation.title }}>
            {citation.title}
          </Text>
        </Space>
      }
      extra={
        <Text type="secondary">
          {Math.min(100, Math.max(0, Math.round(citation.score * 100)))}%
        </Text>
      }
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space wrap size={6}>
          <Tag
            icon={permissionIcon(citation)}
            color={
              isCurrentDocument ? 'cyan' : visibilityColors[citation.visibility]
            }
          >
            {citationVisibilityLabel(citation)}
          </Tag>
          {citation.heading_path?.length > 0 && (
            <Text type="secondary">{citation.heading_path.join(' / ')}</Text>
          )}
        </Space>
        <p
          className={
            expanded
              ? 'citation-card__content is-expanded'
              : 'citation-card__content'
          }
        >
          {citation.content}
        </p>
        <Space size={4}>
          <Button
            type="link"
            size="small"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? '收起完整片段' : '查看完整片段'}
          </Button>
          {canOpen && (
            <Button
              type="text"
              size="small"
              icon={<ExternalLink size={14} />}
              onClick={() => onOpenOriginal?.(citation)}
            >
              原文
            </Button>
          )}
        </Space>
      </Space>
    </Card>
  );
}
