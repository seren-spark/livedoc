import {
  Alert,
  Input,
  Modal,
  Select,
  Space,
  Typography,
  Upload,
  Button,
  Checkbox,
  message,
} from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import type { useArticleSession } from '@/hooks/useArticleSession';
import { fetchDocumentAssetBlob } from '@/api/rag';
import { articleError } from '@/lib/article-draft';

export default function ArticlePublishPanel({
  open,
  onClose,
  session,
}: {
  open: boolean;
  onClose: () => void;
  session: ReturnType<typeof useArticleSession>;
}) {
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [includeInKnowledge, setIncludeInKnowledge] = useState(false);
  const choiceChanged = useRef(false);
  useEffect(() => {
    if (!open) choiceChanged.current = false;
    else if (!choiceChanged.current)
      setIncludeInKnowledge(
        session.record?.include_in_knowledge ??
          Boolean(session.record?.published_draft_version),
      );
  }, [
    open,
    session.record?.article_id,
    session.record?.include_in_knowledge,
    session.record?.published_draft_version,
  ]);
  useEffect(() => {
    let alive = true;
    let url = '';
    if (!open || !session.draft.cover_asset_id) {
      setPreview('');
      return;
    }
    void fetchDocumentAssetBlob(session.draft.cover_asset_id)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (alive) setPreview(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => {
        if (alive) setPreview('');
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, session.draft.cover_asset_id]);
  const busy =
    uploading ||
    session.saveState === 'saving' ||
    session.saveState === 'loading';
  return (
    <Modal
      title={session.record?.state === 'published' ? '更新发布' : '发布文章'}
      open={open}
      onCancel={onClose}
      okText={
        includeInKnowledge
          ? session.record?.state === 'published'
            ? '更新并同步知识库'
            : '发布并加入知识库'
          : session.record?.state === 'published'
            ? '更新文章'
            : '发布文章'
      }
      cancelText="继续编辑"
      confirmLoading={session.saveState === 'saving'}
      okButtonProps={{ disabled: busy }}
      onOk={() => session.publish(includeInKnowledge)}
      width={560}
    >
      <Space
        direction="vertical"
        size={18}
        style={{ width: '100%', paddingTop: 12 }}
      >
        <Typography.Text type="secondary">
          发布后所有人可阅读。保存草稿不会修改已发布内容。
        </Typography.Text>
        <div
          style={{
            padding: '14px 16px',
            background: includeInKnowledge ? '#f0f5ff' : '#fafafa',
            border: `1px solid ${includeInKnowledge ? '#adc6ff' : '#e5e7eb'}`,
            borderRadius: 10,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Checkbox
            checked={includeInKnowledge}
            disabled={busy}
            onChange={(event) => {
              choiceChanged.current = true;
              setIncludeInKnowledge(event.target.checked);
            }}
          >
            同时加入知识库
          </Checkbox>
          <Typography.Paragraph
            type="secondary"
            style={{ margin: '8px 0 0 24px', fontSize: 13 }}
          >
            {includeInKnowledge
              ? '发布后自动同步，可在知识检索和 AI 问答中引用这篇文章。'
              : '仅作为博客文章发布，读者可正常访问，不参与知识检索。'}
          </Typography.Paragraph>
        </div>
        {session.error && (
          <Alert type="error" message={session.error} showIcon />
        )}
        <label style={{ width: '100%' }}>
          文章标题
          <Input
            aria-label="文章标题"
            value={session.draft.title}
            maxLength={120}
            showCount
            disabled={busy}
            onChange={(e) => session.change({ title: e.target.value })}
            style={{ marginTop: 8 }}
          />
        </label>
        <label style={{ width: '100%' }}>
          摘要
          <Input.TextArea
            aria-label="文章摘要"
            value={session.draft.summary}
            maxLength={300}
            showCount
            rows={3}
            disabled={busy}
            placeholder="留空时从正文自动生成"
            onChange={(e) => session.change({ summary: e.target.value })}
            style={{ marginTop: 8 }}
          />
        </label>
        <label style={{ width: '100%' }}>
          标签
          <Select
            aria-label="文章标签"
            mode="tags"
            value={session.draft.tags}
            maxCount={5}
            disabled={busy}
            placeholder="输入标签后按回车，最多 5 个"
            style={{ width: '100%', marginTop: 8 }}
            onChange={(tags) => {
              if (tags.some((tag: string) => tag.length > 20))
                message.warning('每个标签最多 20 字');
              else session.change({ tags });
            }}
          />
        </label>
        <div style={{ width: '100%' }}>
          <Typography.Text>封面（可选）</Typography.Text>
          {preview && (
            <img
              src={preview}
              alt="文章封面预览"
              style={{
                width: '100%',
                height: 180,
                objectFit: 'cover',
                borderRadius: 8,
                marginTop: 8,
              }}
            />
          )}
          <Space style={{ marginTop: 10 }}>
            <Upload
              accept="image/png,image/jpeg,image/gif,image/webp"
              showUploadList={false}
              disabled={busy}
              beforeUpload={(file) => {
                if (file.size > 10 * 1024 * 1024) {
                  message.warning('封面不能超过 10 MB');
                  return false;
                }
                setUploading(true);
                void session
                  .uploadCover(file)
                  .catch((cause) => message.error(articleError(cause)))
                  .finally(() => setUploading(false));
                return false;
              }}
            >
              <Button icon={<PictureOutlined />} loading={uploading}>
                选择封面
              </Button>
            </Upload>
            {session.draft.cover_asset_id && (
              <Button
                type="text"
                disabled={busy}
                onClick={() => session.change({ cover_asset_id: null })}
              >
                移除封面
              </Button>
            )}
          </Space>
        </div>
      </Space>
    </Modal>
  );
}
