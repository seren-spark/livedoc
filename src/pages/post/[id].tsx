import { Typography, Card, Col, Row, Button, Tag, message } from 'antd';
import '@/pages/post/styles/index.scss';
import { EyeOutlined } from '@ant-design/icons';
import { Space } from 'antd';
import RightSide from '@/layouts/frontLayout/RightSide';
import MiddleContent from '@/layouts/frontLayout/MiddleContent';
import UserCard from '@/components/UserCard';
import { EditorContent, type Editor } from '@tiptap/react';
import '@/pages/post/styles/post_tiptap.scss';
import { createEditor } from '@/pages/post/config/editorConfig';
import React, { useEffect, useState } from 'react';
import { Toc } from '@/components/Toc';
import { useParams } from 'react-router-dom';
import { getPublicArticle, type DocumentRecord } from '@/api/rag';

const MemorizedToC = React.memo(Toc);
const { Title, Text } = Typography;

function formatArticleDate(value?: string | null) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 10);
}

function PostDetail() {
  const { id } = useParams();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [content, setContent] = useState([]);
  const [article, setArticle] = useState<DocumentRecord | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setArticle(null);
    setContent([]);
    void getPublicArticle(id)
      .then((record) => {
        if (cancelled) return;
        setArticle(record);
        const nextEditor = createEditor(setContent, record.content);
        setEditor((previous) => {
          previous?.destroy();
          return nextEditor;
        });
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) message.error('文章加载失败或文章未公开');
      });
    return () => {
      cancelled = true;
      setEditor((previous) => {
        previous?.destroy();
        return null;
      });
    };
  }, [id]);

  return (
    <>
      <MiddleContent menu={false}>
        <article className="postDetail">
          <Title level={1}>{article?.title || '文章加载中'}</Title>
          <div className="author-info">
            <Space size="middle">
              <Text className="text-[var(--text-secondary)]">
                {article?.owner_id || 'LiveDoc 官方'}
              </Text>
              <Text type="secondary">
                {formatArticleDate(article?.updated_at)}
              </Text>
              <div
                className="views-count"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <EyeOutlined
                  className="mr-3"
                  style={{ color: 'var(--text-tertiary)' }}
                />
                {article ? Math.max(128, article.content.length) : '-'}
              </div>
            </Space>
            <></>
          </div>
          <div className="post-editor-container">
            <EditorContent editor={editor}></EditorContent>
          </div>
          <div className="post-foot">
            <div className="post-tag-text">标签:</div>
            <div className="post-tags">
              {article?.tags.map((tag) => (
                <Tag key={tag} color="blue">
                  {tag}
                </Tag>
              ))}
            </div>
          </div>
        </article>
      </MiddleContent>
      <div className="post-rightSide">
        <RightSide>
          <Card style={{ padding: '20px', boxSizing: 'border-box' }}>
            <UserCard></UserCard>
            <Row style={{ marginTop: '16px' }} className="post-user-count">
              <Col span={8}>
                <Text strong className="post-user-count-value">
                  32
                </Text>
                <Text type="secondary" style={{ display: 'block' }}>
                  文章
                </Text>
              </Col>
              <Col span={8}>
                <Text strong className="post-user-count-value">
                  92k
                </Text>
                <Text type="secondary" style={{ display: 'block' }}>
                  阅读
                </Text>
              </Col>
              <Col span={8}>
                <Text strong className="post-user-count-value">
                  165
                </Text>
                <Text type="secondary" style={{ display: 'block' }}>
                  粉丝
                </Text>
              </Col>
            </Row>
            <Row gutter={24} style={{ marginTop: '16px' }}>
              <Col span={12}>
                <Button type="primary" block>
                  关注
                </Button>
              </Col>
              <Col span={12}>
                <Button type="default" block>
                  私信
                </Button>
              </Col>
            </Row>
          </Card>

          <Card className="post-toc-container">
            <h4 className="post-toc-title">文章目录</h4>
            <div className="post-toc">
              <MemorizedToC editor={editor} items={content}></MemorizedToC>
            </div>
          </Card>
        </RightSide>
      </div>
    </>
  );
}
export default PostDetail;
