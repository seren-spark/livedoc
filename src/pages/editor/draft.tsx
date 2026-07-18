import { useMemo, useState } from 'react';
import { Button, Input, Layout, Space, Tooltip, Typography, message } from 'antd';
import {
  BoldOutlined,
  EyeOutlined,
  ItalicOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  OrderedListOutlined,
  SaveOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import RagSidebar from '@/components/Knowledge/RagSidebar';
import '@/assets/styles/tiptap.scss';

const { Content, Header, Sider } = Layout;
const { Text } = Typography;

const initialContent = `
  <h2>LiveDoc RAG 写作草稿</h2>
  <p>在这里写文章时，可以从右侧检索公开文章、我的往期文章和团队文档。选中文本后点击检索，侧栏会把可引用来源、分块位置、权限标签和相关度展示出来。</p>
  <p>这个页面用于演示企业级知识库写作闭环：先检索有依据的内容，再把引用摘要插入正文，避免凭空生成。</p>
`;

export default function DraftEditorPage() {
  const [title, setTitle] = useState('LiveDoc RAG 写作草稿');
  const [ragOpen, setRagOpen] = useState(true);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'livedoc-draft-editor',
      },
    },
  });

  const stats = useMemo(() => {
    const text = editor?.getText() || '';
    return {
      words: text.replace(/\s/g, '').length,
      paragraphs: text.split(/\n+/).filter(Boolean).length,
    };
  }, [editor?.state.doc]);

  const saveDraft = () => {
    localStorage.setItem(
      'livedoc_draft_snapshot',
      JSON.stringify({
        title,
        content: editor?.getHTML() || '',
        saved_at: new Date().toISOString(),
      }),
    );
    message.success('草稿已保存到本地');
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#f4f6f8' }}>
      <Header
        style={{
          height: 64,
          padding: '0 20px',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Space size={12}>
          <Button
            type="text"
            icon={ragOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
            onClick={() => setRagOpen((open) => !open)}
          />
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            variant="borderless"
            style={{ width: 360, fontSize: 18, fontWeight: 600 }}
          />
        </Space>
        <Space>
          <Text type="secondary">{stats.words} 字 · {stats.paragraphs} 段</Text>
          <Button icon={<SaveOutlined />} onClick={saveDraft}>保存</Button>
          <Button type="primary" icon={<EyeOutlined />}>发布预览</Button>
        </Space>
      </Header>

      <Layout>
        <Sider width={220} theme="light" style={{ borderRight: '1px solid #e5e7eb', padding: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong>文章结构</Text>
            <Text type="secondary">标题</Text>
            <Text>{title}</Text>
            <Text type="secondary">写作策略</Text>
            <Text>优先引用知识库中可追溯的内容，再组织成正式文章。</Text>
          </Space>
        </Sider>

        <Content style={{ padding: 24, overflow: 'auto' }}>
          <div
            style={{
              maxWidth: 860,
              margin: '0 auto',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              minHeight: 'calc(100vh - 112px)',
            }}
          >
            <Space style={{ padding: '12px 18px', borderBottom: '1px solid #e5e7eb' }}>
              <Tooltip title="加粗">
                <Button icon={<BoldOutlined />} onClick={() => editor?.chain().focus().toggleBold().run()} />
              </Tooltip>
              <Tooltip title="斜体">
                <Button icon={<ItalicOutlined />} onClick={() => editor?.chain().focus().toggleItalic().run()} />
              </Tooltip>
              <Tooltip title="无序列表">
                <Button icon={<UnorderedListOutlined />} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
              </Tooltip>
              <Tooltip title="有序列表">
                <Button icon={<OrderedListOutlined />} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
              </Tooltip>
            </Space>
            <EditorContent editor={editor} />
          </div>
        </Content>

        {ragOpen && (
          <Sider width={380} theme="light" style={{ borderLeft: '1px solid #e5e7eb' }}>
            <RagSidebar editor={editor} title={title} />
          </Sider>
        )}
      </Layout>

      <style>{`
        .livedoc-draft-editor {
          min-height: calc(100vh - 190px);
          padding: 36px 48px;
          outline: none;
          color: #1f2937;
          font-size: 16px;
          line-height: 1.8;
        }

        .livedoc-draft-editor h2 {
          margin-top: 0;
          margin-bottom: 18px;
          color: #111827;
          font-size: 28px;
          line-height: 1.35;
          letter-spacing: 0;
        }

        .livedoc-draft-editor blockquote {
          margin: 16px 0;
          padding: 12px 16px;
          border-left: 3px solid #1677ff;
          background: #f5f8ff;
          color: #1f2937;
        }
      `}</style>
    </Layout>
  );
}
