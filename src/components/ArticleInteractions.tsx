import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  List,
  Space,
  Typography,
  message,
} from 'antd';
import {
  CommentOutlined,
  LikeFilled,
  LikeOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import type { UserState } from '@/store/modules/userSlice';
import { useAuth } from '@/contexts/authContext';
import {
  addArticleComment,
  getArticleInteractions,
  listArticleComments,
  setArticleReaction,
  type ArticleComment,
  type ArticleStats,
  type MyArticleInteractions,
} from '@/api/articles';
import './ArticleInteractions.scss';
import ArticleCommentThread from './ArticleCommentThread';

function interactionError(error: unknown) {
  if ((error as any)?.response?.status === 404)
    return '文章已撤回或不存在，暂时无法互动。';
  return '操作失败，请稍后重试。';
}
export default function ArticleInteractions({
  articleId,
  initialStats,
}: {
  articleId: string;
  initialStats: ArticleStats;
}) {
  const { isLoggedIn, requireAuth } = useAuth();
  const username = useSelector(
    (state: RootState) => (state.user as UserState).username,
  );
  const [stats, setStats] = useState(initialStats);
  const [mine, setMine] = useState<MyArticleInteractions | null>(null);
  const [mineLoading, setMineLoading] = useState(false);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const commentId = useRef(crypto.randomUUID().replaceAll('-', ''));
  const writeInFlight = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void listArticleComments(articleId, page)
      .then((result) => {
        if (!cancelled) {
          setComments(result.items);
          setTotal(result.total);
          setStats((s) => ({ ...s, comment_count: result.comment_count }));
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(interactionError(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId, page, refresh]);
  useEffect(() => {
    let cancelled = false;
    setMine(null);
    if (!isLoggedIn) {
      setMineLoading(false);
      return;
    }
    setMineLoading(true);
    void getArticleInteractions(articleId)
      .then((result) => {
        if (!cancelled) {
          setMine(result);
          setStats(result);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(interactionError(cause));
      })
      .finally(() => {
        if (!cancelled) setMineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId, isLoggedIn, username]);
  const write = (name: string, work: () => Promise<void>) =>
    requireAuth(() => {
      if (writeInFlight.current) return;
      writeInFlight.current = true;
      setBusy(name);
      setError('');
      void work()
        .catch((cause) => setError(interactionError(cause)))
        .finally(() => {
          writeInFlight.current = false;
          setBusy('');
        });
    });
  const react = (kind: 'like' | 'favorite') => {
    const active = kind === 'like' ? !mine?.liked : !mine?.favorited;
    write(kind, async () => {
      // Preserve the clicked button's intent when the operation resumes after login.
      const current = await getArticleInteractions(articleId);
      const alreadyActive = kind === 'like' ? current.liked : current.favorited;
      const next =
        alreadyActive === active
          ? current
          : await setArticleReaction(articleId, kind, active);
      setMine(next);
      setStats(next);
    });
  };
  const submit = () => {
    if (!text.trim()) {
      message.warning('请先写下评论');
      return;
    }
    const content = text.trim();
    const submittedId = commentId.current;
    write('comment', async () => {
      await addArticleComment(articleId, content, submittedId);
      setText('');
      commentId.current = crypto.randomUUID().replaceAll('-', '');
      const next = await getArticleInteractions(articleId);
      setMine(next);
      setStats(next);
      setPage(1);
      setRefresh((v) => v + 1);
      message.success('评论已发布');
    });
  };
  const commentsChanged = async () => {
    const next = await getArticleInteractions(articleId);
    setMine(next);
    setStats(next);
    const current = await listArticleComments(articleId, page);
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(current.total / 10))));
    setRefresh((v) => v + 1);
  };
  return (
    <section className="article-interactions" aria-label="文章互动">
      <div className="article-reactions">
        <Space wrap size={12}>
          <Button
            type={mine?.liked ? 'primary' : 'default'}
            ghost={Boolean(mine?.liked)}
            aria-pressed={Boolean(mine?.liked)}
            icon={mine?.liked ? <LikeFilled /> : <LikeOutlined />}
            loading={busy === 'like'}
            disabled={Boolean(busy) || mineLoading}
            onClick={() => react('like')}
          >
            {mine?.liked ? '已点赞' : '点赞'} · {stats.like_count ?? 0}
          </Button>
          <Button
            type={mine?.favorited ? 'primary' : 'default'}
            ghost={Boolean(mine?.favorited)}
            aria-pressed={Boolean(mine?.favorited)}
            icon={mine?.favorited ? <StarFilled /> : <StarOutlined />}
            loading={busy === 'favorite'}
            disabled={Boolean(busy) || mineLoading}
            onClick={() => react('favorite')}
          >
            {mine?.favorited ? '已收藏' : '收藏'} · {stats.favorite_count ?? 0}
          </Button>
          <Link to="/creator/favorites">我的收藏</Link>
        </Space>
      </div>
      <Typography.Title level={5} className="comment-heading">
        <CommentOutlined /> 评论{' '}
        <span className="comment-total">{stats.comment_count}</span>
      </Typography.Title>
      <Input.TextArea
        aria-label="评论内容"
        placeholder={
          isLoggedIn ? '分享你的想法，与作者交流…' : '写下评论，登录后即可发布'
        }
        value={text}
        rows={3}
        maxLength={1000}
        showCount
        disabled={busy === 'comment'}
        onChange={(event) => {
          setText(event.target.value);
          commentId.current = crypto.randomUUID().replaceAll('-', '');
        }}
      />
      <div className="comment-submit">
        <Typography.Text type="secondary">
          友善交流，让知识继续生长。
        </Typography.Text>
        <Button
          type="primary"
          onClick={submit}
          loading={busy === 'comment'}
          disabled={Boolean(busy)}
        >
          {isLoggedIn ? '发布评论' : '登录并评论'}
        </Button>
      </div>
      {error && (
        <Alert
          showIcon
          type="error"
          message={error}
          action={
            <Button size="small" onClick={() => setRefresh((v) => v + 1)}>
              重试
            </Button>
          }
        />
      )}
      <List
        rowKey="comment_id"
        loading={loading}
        dataSource={comments}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有评论，来分享第一个想法"
            />
          ),
        }}
        pagination={{
          current: page,
          total,
          pageSize: 10,
          showSizeChanger: false,
          hideOnSinglePage: true,
          onChange: setPage,
        }}
        renderItem={(comment) => (
          <List.Item className="article-comment">
            <ArticleCommentThread
              articleId={articleId}
              comment={comment}
              userId={mine?.user_id}
              onChanged={commentsChanged}
            />
          </List.Item>
        )}
      />
    </section>
  );
}
