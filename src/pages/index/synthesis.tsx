import {
  DatabaseOutlined,
  LikeOutlined,
  CommentOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { Alert, Button, Empty, List, Space, Tag, Typography } from 'antd';
import '@/layouts/frontLayout/MyContent/index.scss';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ragBaseURL, listPublicArticles } from '@/api/rag';
import type { PublicArticle } from '@/api/articles';

export default function ArticleFeed() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [articles, setArticles] = useState<PublicArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void listPublicArticles({ page, page_size: 8 })
      .then((result) => {
        if (!cancelled) {
          setArticles(result.items as PublicArticle[]);
          setTotal(result.total);
        }
      })
      .catch(() => {
        if (!cancelled) setError('文章加载失败，请稍后重试');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, refresh]);
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
          <Typography.Text strong>知识库管理</Typography.Text>
          <Typography.Text type="secondary">
            按个人和团队空间管理 RAG 可检索资料
          </Typography.Text>
        </Space>
        <Button
          type="primary"
          icon={<DatabaseOutlined />}
          onClick={() => navigate('/knowledge')}
        >
          进入知识库
        </Button>
      </div>
      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          action={
            <Button onClick={() => setRefresh((v) => v + 1)}>重试</Button>
          }
        />
      )}
      <List
        loading={loading}
        dataSource={articles}
        pagination={{
          current: page,
          total,
          pageSize: 8,
          showSizeChanger: false,
          hideOnSinglePage: true,
          onChange: (next) => {
            setParams({ page: String(next) });
            window.scrollTo({ top: 0 });
          },
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无公开文章，开始分享你的知识与想法"
            />
          ),
        }}
        renderItem={(article) => (
          <List.Item className="article-list-item" style={{ gap: 24 }}>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <Typography.Title
                level={4}
                className="article-list-item-title"
                style={{ margin: '0 0 8px' }}
              >
                <Link to={'/post/' + article.doc_id}>{article.title}</Link>
              </Typography.Title>
              <Typography.Paragraph
                type="secondary"
                ellipsis={{ rows: 2 }}
                style={{ lineHeight: '22px', marginBottom: 12 }}
              >
                {article.summary}
              </Typography.Paragraph>
              <Space size="middle" wrap>
                <Typography.Text strong>{article.author_name}</Typography.Text>
                <Typography.Text type="secondary">
                  {new Date(
                    article.published_at || article.created_at,
                  ).toLocaleDateString('zh-CN')}
                </Typography.Text>
                {article.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
                <Typography.Text type="secondary">
                  <LikeOutlined /> {article.like_count ?? 0}
                </Typography.Text>
                <Typography.Text type="secondary">
                  <CommentOutlined /> {article.comment_count ?? 0}
                </Typography.Text>
                <Typography.Text type="secondary">
                  <StarOutlined /> {article.favorite_count ?? 0}
                </Typography.Text>
              </Space>
            </div>
            {article.cover_url && (
              <Link
                to={'/post/' + article.doc_id}
                aria-label={'阅读 ' + article.title}
                style={{ flexShrink: 0 }}
              >
                <img
                  src={ragBaseURL + article.cover_url}
                  alt=""
                  loading="lazy"
                  style={{
                    width: 132,
                    height: 88,
                    borderRadius: 6,
                    objectFit: 'cover',
                    maxWidth: '25vw',
                  }}
                />
              </Link>
            )}
          </List.Item>
        )}
      />
    </>
  );
}
