import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Empty,
  List,
  Modal,
  Space,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import FrontLayout from '@/layouts/frontLayout';
import { useAuth } from '@/contexts/authContext';
import {
  listMyArticles,
  publishArticle,
  retryArticleIndex,
  withdrawArticle,
  type ArticleDraft,
  type ArticleState,
} from '@/api/articles';
import { articleError } from '@/lib/article-draft';
import './articles.scss';

const indexLabels = {
  pending: '待索引',
  queued: '索引排队中',
  indexing: '正在索引',
  ready: '检索已就绪',
  failed: '索引失败',
};
export default function CreatorArticles() {
  const navigate = useNavigate();
  const { isLoggedIn, requireAuth } = useAuth();
  const [state, setState] = useState<ArticleState>('draft');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ArticleDraft[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!isLoggedIn) {
      setItems([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    void listMyArticles(state, page)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(articleError(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state, page, refresh, isLoggedIn]);
  useEffect(() => {
    if (
      !items.some(
        (item) =>
          item.state === 'published' &&
          ['queued', 'indexing'].includes(item.index_status ?? ''),
      )
    )
      return;
    const timer = setTimeout(() => setRefresh((v) => v + 1), 5000);
    return () => clearTimeout(timer);
  }, [items]);
  const act = useCallback(
    async (article: ArticleDraft, action: 'withdraw' | 'publish' | 'retry') => {
      setBusyId(article.article_id);
      try {
        const fn =
          action === 'withdraw'
            ? withdrawArticle
            : action === 'publish'
              ? publishArticle
              : retryArticleIndex;
        await fn(article.article_id, article.draft_version);
        message.success(
          action === 'withdraw'
            ? '文章已撤回，草稿已保留'
            : action === 'publish'
              ? '文章已重新发布'
              : '已重新提交索引任务',
        );
        setRefresh((v) => v + 1);
      } catch (cause) {
        message.error(articleError(cause));
      } finally {
        setBusyId('');
      }
    },
    [],
  );
  return (
    <FrontLayout>
      <main className="creator-articles">
        <header className="creator-articles-heading">
          <div>
            <span className="creator-eyebrow">LIVEDOC · 创作空间</span>
            <Typography.Title level={2}>我的文章</Typography.Title>
            <Typography.Paragraph type="secondary">
              从一个想法开始，写成值得分享的文章。
            </Typography.Paragraph>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => requireAuth(() => navigate('/editor/draft'))}
          >
            写文章
          </Button>
        </header>
        {!isLoggedIn ? (
          <Empty description="登录后查看草稿与已发布文章">
            <Button type="primary" onClick={() => requireAuth(() => undefined)}>
              登录
            </Button>
          </Empty>
        ) : (
          <>
            <Tabs
              activeKey={state}
              onChange={(key) => {
                setState(key as ArticleState);
                setPage(1);
              }}
              items={[
                { key: 'draft', label: '草稿箱' },
                { key: 'published', label: '已发布' },
                { key: 'withdrawn', label: '已撤回' },
              ]}
            />
            {error && (
              <Alert
                showIcon
                type="error"
                message={error}
                action={
                  <Button onClick={() => setRefresh((v) => v + 1)}>重试</Button>
                }
              />
            )}
            <List
              loading={loading}
              dataSource={items}
              locale={{
                emptyText: (
                  <Empty
                    description={
                      state === 'draft'
                        ? '还没有草稿，开始写下你的第一个想法'
                        : '这里还没有文章'
                    }
                  />
                ),
              }}
              pagination={{
                current: page,
                pageSize: 10,
                total,
                onChange: setPage,
                showSizeChanger: false,
                hideOnSinglePage: true,
              }}
              renderItem={(article) => (
                <List.Item className="creator-article-row">
                  <div className="creator-article-copy">
                    <Typography.Title level={4}>
                      {article.draft.title || '未命名草稿'}
                    </Typography.Title>
                    <Typography.Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2 }}
                    >
                      {article.draft.summary ||
                        article.draft.content
                          .replace(/[#*`]/g, '')
                          .slice(0, 150) ||
                        '正文等待你的灵感'}
                    </Typography.Paragraph>
                    <Space wrap>
                      <Typography.Text type="secondary">
                        修改于{' '}
                        {new Date(article.updated_at).toLocaleString('zh-CN')}
                      </Typography.Text>
                      {article.state === 'published' && (
                        <Tag
                          color={
                            article.index_status === 'failed'
                              ? 'error'
                              : article.index_status === 'ready'
                                ? 'success'
                                : 'processing'
                          }
                        >
                          {indexLabels[article.index_status ?? 'pending']}
                        </Tag>
                      )}
                      {article.state === 'published' &&
                        article.published_draft_version !==
                          article.draft_version && <Tag>有未发布修改</Tag>}
                    </Space>
                    {article.index_status === 'failed' && (
                      <Typography.Paragraph
                        type="danger"
                        style={{ marginTop: 8 }}
                      >
                        {article.index_error || '建立索引失败，可以重试'}
                      </Typography.Paragraph>
                    )}
                  </div>
                  <Space wrap className="creator-article-actions">
                    <Button
                      icon={<EditOutlined />}
                      onClick={() =>
                        navigate(
                          `/editor/draft?articleId=${article.article_id}`,
                        )
                      }
                    >
                      继续编辑
                    </Button>
                    {article.state === 'published' && (
                      <>
                        <Button
                          onClick={() =>
                            navigate(`/post/${article.article_id}`)
                          }
                        >
                          查看文章
                        </Button>
                        <Button
                          loading={busyId === article.article_id}
                          onClick={() =>
                            Modal.confirm({
                              title: '撤回这篇文章？',
                              content:
                                '公开链接和公共检索将停止提供内容，草稿仍可继续编辑和发布。',
                              okText: '撤回',
                              cancelText: '取消',
                              onOk: () => act(article, 'withdraw'),
                            })
                          }
                        >
                          撤回
                        </Button>
                        {article.index_status === 'failed' && (
                          <Button
                            loading={busyId === article.article_id}
                            onClick={() => void act(article, 'retry')}
                          >
                            重试索引
                          </Button>
                        )}
                      </>
                    )}
                    {article.state === 'withdrawn' && (
                      <Button
                        type="primary"
                        loading={busyId === article.article_id}
                        onClick={() => void act(article, 'publish')}
                      >
                        再次发布
                      </Button>
                    )}
                  </Space>
                </List.Item>
              )}
            />
          </>
        )}
      </main>
    </FrontLayout>
  );
}
