/**
 * @file 引用来源列表。展示检索证据、权限标签与原文查看入口。
 */
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

/**
 * 根据引用的可见范围选择权限图标。
 *
 * @param citation 包含来源、原文位置与内容的检索引用。
 * @returns 供页面渲染的组件内容。
 */
function permissionIcon(citation: Citation) {
  if (citation.source_type === 'current_document')
    return <FilePlus2 size={13} />;
  if (citation.visibility === 'team') return <Users size={13} />;
  if (citation.visibility === 'private') return <LockKeyhole size={13} />;
  return <Globe2 size={13} />;
}

/**
 * 把引用可见性转换为公开、私有或团队标签。
 *
 * @param citation 包含来源、原文位置与内容的检索引用。
 * @returns 整理后的文本或标识。
 */
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

/**
 * 呈现引用来源列表，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
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

/**
 * 展示单条引用的标题、来源信息、片段及查看原文入口。
 *
 * @param props 包含来源、原文位置与内容的检索引用。
 * @returns 供页面渲染的组件内容。
 */
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
    onOpenOriginal && (citation.url || isCurrentDocument || citation.doc_id),
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
          相关度 {(citation.rerank_score ?? citation.score).toFixed(3)}
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
          <Tag>v{citation.document_version}</Tag>
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
