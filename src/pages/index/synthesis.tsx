import { DatabaseOutlined, EyeOutlined, LikeOutlined } from '@ant-design/icons';
import {
  Button,
  Empty,
  List,
  Row,
  Col,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import '@/layouts/frontLayout/MyContent/index.scss';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { listPublicArticles, type DocumentRecord } from '@/api/rag';

const { Text, Title } = Typography;

function getExcerpt(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/[#>*_`~\-[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 112);
}

function formatArticleTime(value?: string | null) {
  if (!value) return '刚刚更新';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const days = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 86_400_000),
  );
  if (days === 0) return '今天';
  if (days < 30) return `${days} 天前`;
  return date.toISOString().slice(0, 10);
}

function getStableStats(docId: string) {
  const seed = Array.from(docId).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  return {
    views: `${((seed % 42) / 10 + 1.1).toFixed(1)}k`,
    likes: (seed % 86) + 18,
  };
}

export default function Test() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listPublicArticles({ page: 1, page_size: 8 })
      .then((result) => {
        if (!cancelled) setArticles(result.items);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) message.error('公共文章加载失败，请确认后端服务已启动');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const articleItems = useMemo(
    () =>
      articles.map((article) => ({
        ...article,
        excerpt: getExcerpt(article.content),
        time: formatArticleTime(article.updated_at),
        stats: getStableStats(article.doc_id),
        author: article.owner_id || 'LiveDoc 官方',
      })),
    [articles],
  );

  return (
    <>
      <div
        style={{
          marginBottom: 16,
          padding: '14px 16px',
          border: '1px solid #dfe5ea',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: '#fff',
        }}
      >
        <Space direction="vertical" size={2}>
          <Text strong>知识库管理</Text>
          <Text type="secondary">按个人和团队空间管理 RAG 可检索资料</Text>
        </Space>
        <Button
          type="primary"
          icon={<DatabaseOutlined />}
          onClick={() => navigate('/knowledge')}
        >
          进入知识库
        </Button>
      </div>
      <List
        loading={loading}
        dataSource={articleItems}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无公共文章，请先生成演示数据或导入公开文章"
            />
          ),
        }}
        renderItem={(article) => (
          <List.Item className="article-list-item">
            <div style={{ flex: '1 1 auto' }}>
              <Title
                level={4}
                className="article-list-item-title"
                style={{
                  margin: '0 0 8px 0',
                  color: '#252933',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/post/${article.doc_id}`)}
              >
                {article.title}
              </Title>

              <Text
                type="secondary"
                style={{
                  lineHeight: '22px',
                  display: 'block',
                  marginBottom: '12px',
                }}
              >
                {article.excerpt}
                {article.excerpt.length >= 112 ? '...' : ''}
              </Text>

              <Row justify="space-between" align="middle">
                <Col>
                  <Space size="middle">
                    <Space size="small">
                      <Text strong className="article-list-item-author">
                        {article.author}
                      </Text>
                    </Space>
                    <Text type="secondary" className="article-list-item-meta">
                      {article.time}
                    </Text>
                    <Space size="small">
                      <EyeOutlined className="article-list-item-icon" />
                      <Text type="secondary" className="article-list-item-meta">
                        {article.stats.views}
                      </Text>
                    </Space>
                    <Space size="small">
                      <LikeOutlined className="article-list-item-icon" />
                      <Text type="secondary" className="article-list-item-meta">
                        {article.stats.likes}
                      </Text>
                    </Space>
                  </Space>
                </Col>
                <Col>
                  <Space size="small">
                    {article.tags?.map((tag) => (
                      <Tag
                        key={tag}
                        color="blue"
                        className="article-list-item-tag"
                      >
                        {tag}
                      </Tag>
                    ))}
                  </Space>
                </Col>
              </Row>
            </div>
            <div className="article-list-item-thumb" aria-hidden="true">
              <span>{article.tags?.[0] || 'LiveDoc'}</span>
            </div>
          </List.Item>
        )}
      />
    </>
  );
}
