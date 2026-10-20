import { Typography, Card, Button, Tag, Space, Spin, Result, Avatar } from 'antd';
import defaultAvatar from '@/assets/default-avatar.svg';
import '@/pages/post/styles/index.scss';
import RightSide from '@/layouts/frontLayout/RightSide';
import MiddleContent from '@/layouts/frontLayout/MiddleContent';
import { EditorContent, type Editor } from '@tiptap/react';
import '@/pages/post/styles/post_tiptap.scss';
import { createEditor } from '@/pages/post/config/editorConfig';
import React, { useEffect, useState } from 'react';
import { Toc } from '@/components/Toc';
import { Link, useParams } from 'react-router-dom';
import { getPublicArticle, ragBaseURL } from '@/api/rag';
import { fetchPublicImage, type PublicArticle } from '@/api/articles';
import ArticleInteractions from '@/components/ArticleInteractions';
import {
  hydrateEditorContent,
  hydrateMarkdownAssets,
  revokeAssetBlobs,
  type AssetBlobMap,
} from '@/lib/knowledge-editor';

const MemorizedToC = React.memo(Toc);
export default function PostDetail() {
  const { id } = useParams();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [toc, setToc] = useState([]);
  const [article, setArticle] = useState<PublicArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let reader: Editor | null = null;
    const blobs: AssetBlobMap = new Map();
    window.scrollTo({ top: 0, left: 0 });
    setArticle(null);
    setToc([]);
    setEditor(null);
    setError(null);
    setLoading(true);
    void (async () => {
      try {
        const record = (await getPublicArticle(id)) as PublicArticle;
        const fetchImage = (assetId: string) => fetchPublicImage(id, assetId);
        const json = record.editor_content
          ? await hydrateEditorContent(record.editor_content, fetchImage, blobs)
          : null;
        const markdown = json
          ? ''
          : await hydrateMarkdownAssets(record.content, fetchImage, blobs);
        if (cancelled) return;
        reader = createEditor(setToc, markdown, json);
        setArticle(record);
        setEditor(reader);
      } catch (cause) {
        if (!cancelled)
          setError(
            (cause as any)?.response?.status === 404 ? 'missing' : 'failed',
          );
      } finally {
        if (cancelled) revokeAssetBlobs(blobs);
        else setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      reader?.destroy();
      revokeAssetBlobs(blobs);
    };
  }, [id, refresh]);
  if (loading)
    return (
      <MiddleContent menu={false}>
        <div style={{ padding: 100, textAlign: 'center' }}>
          <Spin tip="正在加载文章" size="large">
            <div style={{ height: 80 }} />
          </Spin>
        </div>
      </MiddleContent>
    );
  if (error)
    return (
      <MiddleContent menu={false}>
        <Result
          status={error === 'missing' ? '404' : 'error'}
          title={error === 'missing' ? '文章不存在或已撤回' : '文章加载失败'}
          subTitle={
            error === 'missing'
              ? '这篇文章当前没有公开内容。'
              : '请检查网络连接后重试。'
          }
          extra={
            <Space>
              <Link to="/synthesis">
                <Button>返回首页</Button>
              </Link>
              {error === 'failed' && (
                <Button type="primary" onClick={() => setRefresh((v) => v + 1)}>
                  重试
                </Button>
              )}
            </Space>
          }
        />
      </MiddleContent>
    );
  return (
    <>
      <MiddleContent menu={false}>
        <article className="postDetail">
          <Typography.Title level={1}>{article?.title}</Typography.Title>
          <div className="author-info">
            <Space wrap size="middle">
              <Avatar src={defaultAvatar} alt="默认头像" size={32} />
              <Typography.Text>{article?.author_name}</Typography.Text>
              <Typography.Text type="secondary">
                发布于{' '}
                {new Date(article!.published_at).toLocaleDateString('zh-CN')}
              </Typography.Text>
              {article?.last_published_at !== article?.published_at && (
                <Typography.Text type="secondary">
                  更新于{' '}
                  {new Date(article!.last_published_at).toLocaleDateString(
                    'zh-CN',
                  )}
                </Typography.Text>
              )}
            </Space>
          </div>
          {article?.cover_url && (
            <img
              src={ragBaseURL + article.cover_url}
              alt="文章封面"
              style={{
                width: '100%',
                maxHeight: 360,
                objectFit: 'cover',
                borderRadius: 8,
                marginBottom: 24,
              }}
            />
          )}
          <div className="post-editor-container">
            <EditorContent editor={editor} />
          </div>
          <div className="post-foot">
            <div className="post-tag-text">标签:</div>
            <div className="post-tags">
              {article?.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          </div>
          {article && (
            <ArticleInteractions
              key={article.doc_id}
              articleId={article.doc_id}
              initialStats={{
                like_count: article.like_count,
                favorite_count: article.favorite_count,
                comment_count: article.comment_count,
              }}
            />
          )}
        </article>
      </MiddleContent>
      <div className="post-rightSide">
        <RightSide>
          <Card className="post-toc-container">
            <h4 className="post-toc-title">文章目录</h4>
            <div className="post-toc">
              <MemorizedToC editor={editor} items={toc} />
            </div>
          </Card>
        </RightSide>
      </div>
    </>
  );
}
