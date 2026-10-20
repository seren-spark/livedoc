import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, List, Space, Typography, message } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import type { UserState } from '@/store/modules/userSlice';
import FrontLayout from '@/layouts/frontLayout';
import { useAuth } from '@/contexts/authContext';
import {
  listFavoriteArticles,
  setArticleReaction,
  type PublicArticle,
} from '@/api/articles';
import './articles.scss';

export default function FavoriteArticles() {
  const { isLoggedIn, requireAuth } = useAuth();
  const username = useSelector(
    (state: RootState) => (state.user as UserState).username,
  );
  const [items, setItems] = useState<PublicArticle[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isLoggedIn) {
      setItems([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setItems([]);
    setTotal(0);
    setLoading(true);
    setError('');
    void listFavoriteArticles(page)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
        }
      })
      .catch(() => {
        if (!cancelled) setError('收藏列表加载失败，请重试');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, username, page, refresh]);
  const remove = async (id: string) => {
    setBusy(id);
    try {
      await setArticleReaction(id, 'favorite', false);
      setPage((p) => (items.length === 1 && p > 1 ? p - 1 : p));
      setRefresh((v) => v + 1);
    } catch {
      message.error('取消收藏失败，请稍后重试');
    } finally {
      setBusy('');
    }
  };
  return (
    <FrontLayout>
      <main className="creator-articles">
        <header className="creator-articles-heading">
          <div>
            <span className="creator-eyebrow">LIVEDOC · 阅读收藏</span>
            <Typography.Title level={2}>
              <StarFilled style={{ color: '#e3a127', fontSize: 26 }} /> 我的收藏
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              把值得重读的文章留在这里。
            </Typography.Paragraph>
          </div>
          <Link to="/synthesis">
            <Button>发现文章</Button>
          </Link>
        </header>
        {!isLoggedIn ? (
          <Empty description="登录后查看你的收藏">
            <Button type="primary" onClick={() => requireAuth(() => undefined)}>
              登录
            </Button>
          </Empty>
        ) : (
          <>
            {error && (
              <Alert
                type="error"
                showIcon
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
                  <Empty description="还没有收藏，阅读文章时点击收藏即可保存" />
                ),
              }}
              pagination={{
                current: page,
                pageSize: 10,
                total,
                showSizeChanger: false,
                hideOnSinglePage: true,
                onChange: setPage,
              }}
              renderItem={(article) => (
                <List.Item className="creator-article-row">
                  <div className="creator-article-copy">
                    <Typography.Title level={4}>
                      <Link to={'/post/' + article.doc_id}>
                        {article.title}
                      </Link>
                    </Typography.Title>
                    <Typography.Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2 }}
                    >
                      {article.summary}
                    </Typography.Paragraph>
                    <Space>
                      <Typography.Text>{article.author_name}</Typography.Text>
                      <Typography.Text type="secondary">
                        {new Date(article.published_at).toLocaleDateString(
                          'zh-CN',
                        )}
                      </Typography.Text>
                    </Space>
                  </div>
                  <Button
                    disabled={Boolean(busy)}
                    loading={busy === article.doc_id}
                    onClick={() => void remove(article.doc_id)}
                  >
                    取消收藏
                  </Button>
                </List.Item>
              )}
            />
          </>
        )}
      </main>
    </FrontLayout>
  );
}
