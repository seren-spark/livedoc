import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Input,
  List,
  Modal,
  Space,
  Typography,
  message,
} from 'antd';
import { useAuth } from '@/contexts/authContext';
import {
  addArticleComment,
  deleteArticleComment,
  listArticleReplies,
  type ArticleComment,
} from '@/api/articles';
import defaultAvatar from '@/assets/default-avatar.svg';

export default function ArticleCommentThread({
  articleId,
  comment,
  userId,
  onChanged,
}: {
  articleId: string;
  comment: ArticleComment;
  userId?: string;
  onChanged: () => Promise<void>;
}) {
  const { requireAuth, isLoggedIn } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [replies, setReplies] = useState<ArticleComment[]>([]);
  const [total, setTotal] = useState(comment.reply_count);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const replyId = useRef(crypto.randomUUID().replaceAll('-', ''));
  const inFlight = useRef(false);
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoading(true);
    void listArticleReplies(articleId, comment.comment_id, page)
      .then((result) => {
        if (!cancelled) {
          setReplies(result.items);
          setTotal(result.total);
        }
      })
      .catch(() => {
        if (!cancelled) setError('回复加载失败，请重试。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    articleId,
    comment.comment_id,
    comment.reply_count,
    expanded,
    page,
    refresh,
  ]);
  const write = (work: () => Promise<void>) =>
    requireAuth(() => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError('');
      void work()
        .catch((cause) => {
          setError(
            (cause as any)?.response?.status === 404
              ? '文章或评论已删除，无法继续操作。'
              : '操作失败，输入已保留，请稍后重试。',
          );
        })
        .finally(() => {
          inFlight.current = false;
          setBusy(false);
        });
    });
  const submit = () => {
    if (!text.trim()) {
      message.warning('请先写下回复');
      return;
    }
    const content = text.trim();
    const submittedId = replyId.current;
    write(async () => {
      await addArticleComment(
        articleId,
        content,
        submittedId,
        comment.comment_id,
      );
      setText('');
      replyId.current = crypto.randomUUID().replaceAll('-', '');
      setComposing(false);
      setExpanded(true);
      // Replies are chronological; show the last page containing the new reply.
      setPage(Math.ceil((total + 1) / 10));
      setRefresh((v) => v + 1);
      await onChanged();
      message.success('回复已发布');
    });
  };
  const remove = (item: ArticleComment) =>
    Modal.confirm({
      title: item.parent_comment_id ? '删除这条回复？' : '删除这条评论？',
      content:
        !item.parent_comment_id && item.reply_count > 0
          ? '评论内容将被删除，其他人的回复会保留。'
          : undefined,
      okText: '删除',
      cancelText: '取消',
      onOk: () =>
        write(async () => {
          await deleteArticleComment(articleId, item.comment_id);
          if (item.parent_comment_id && replies.length === 1 && page > 1)
            setPage((p) => p - 1);
          setRefresh((v) => v + 1);
          await onChanged();
        }),
    });
  const row = (item: ArticleComment, root: boolean) => (
    <div className="comment-row">
      <Avatar
        className="comment-avatar"
        src={defaultAvatar}
        alt="默认头像"
        size={root ? 32 : 28}
      />
      <div className="comment-copy">
        <Space wrap size={8}>
          <Typography.Text strong>{item.author_name}</Typography.Text>
          <Typography.Text type="secondary" className="comment-time">
            {new Date(item.created_at).toLocaleString('zh-CN')}
          </Typography.Text>
        </Space>
        <p className={item.deleted ? 'comment-deleted' : undefined}>
          {item.deleted ? '该评论已删除' : item.content}
        </p>
        <Space size={8} className="comment-actions">
          {root && !item.deleted && (
            <Button
              type="text"
              size="small"
              disabled={busy}
              onClick={() => {
                setComposing(true);
                setExpanded(true);
              }}
            >
              回复
            </Button>
          )}
          {root && item.reply_count > 0 && (
            <Button
              type="text"
              size="small"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? '收起回复' : `展开 ${item.reply_count} 条回复`}
            </Button>
          )}
          {!item.deleted && userId === item.user_id && (
            <Button
              type="text"
              size="small"
              danger
              disabled={busy}
              onClick={() => remove(item)}
            >
              {root ? '删除评论' : '删除回复'}
            </Button>
          )}
        </Space>
      </div>
    </div>
  );
  return (
    <div className="comment-thread">
      {row(comment, true)}
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button
              size="small"
              onClick={() => {
                setError('');
                setRefresh((v) => v + 1);
              }}
            >
              重试
            </Button>
          }
        />
      )}
      {expanded && (
        <div className="comment-replies">
          <List
            loading={loading}
            dataSource={replies}
            locale={{ emptyText: null }}
            pagination={{
              current: page,
              total,
              pageSize: 10,
              showSizeChanger: false,
              hideOnSinglePage: true,
              onChange: setPage,
            }}
            renderItem={(reply) => (
              <List.Item key={reply.comment_id}>{row(reply, false)}</List.Item>
            )}
          />
        </div>
      )}
      {composing && (
        <div className="reply-composer">
          <Input.TextArea
            aria-label={`回复 ${comment.author_name}`}
            placeholder={`回复 ${comment.author_name}…`}
            value={text}
            rows={2}
            maxLength={1000}
            showCount
            disabled={busy}
            onChange={(event) => {
              setText(event.target.value);
              replyId.current = crypto.randomUUID().replaceAll('-', '');
            }}
          />
          <Space className="reply-submit">
            <Button
              size="small"
              disabled={busy}
              onClick={() => setComposing(false)}
            >
              取消
            </Button>
            <Button size="small" type="primary" loading={busy} onClick={submit}>
              {isLoggedIn ? '发布回复' : '登录并回复'}
            </Button>
          </Space>
        </div>
      )}
    </div>
  );
}
