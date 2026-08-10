import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  List,
  Segmented,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ClearOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  SelectOutlined,
} from '@ant-design/icons';
import type { Editor } from '@tiptap/react';
import {
  type Citation,
  type DocumentRecord,
  type KnowledgeScope,
  listKnowledgeDocuments,
  searchKnowledge,
} from '@/api/rag';

const { Paragraph, Text } = Typography;

type RagSidebarProps = {
  editor: Editor | null;
  title?: string;
};

type RangeKey = 'all' | 'public' | 'private' | 'team';

const visibilityText: Record<string, string> = {
  private: '我的往期',
  team: '团队文档',
  public: '公开文章',
};

const visibilityColor: Record<string, string> = {
  private: 'blue',
  team: 'gold',
  public: 'green',
};

function canReadEditor(editor: Editor | null) {
  return Boolean(editor && !editor.isDestroyed && editor.schema?.nodes && editor.state?.doc);
}

function getEditorPlainText(editor: Editor | null) {
  if (!canReadEditor(editor)) {
    return '';
  }

  try {
    return editor!.state.doc.textBetween(0, editor!.state.doc.content.size, '\n');
  } catch (error) {
    console.warn('Failed to read editor text for RAG context', error);
    return '';
  }
}

function pickCursorContext(editor: Editor | null) {
  if (!canReadEditor(editor)) {
    return { selectedText: '', before: '', after: '', text: '' };
  }

  const text = getEditorPlainText(editor);
  const { from, to } = editor!.state.selection;
  const selectedText = from !== to ? editor!.state.doc.textBetween(from, to, '\n') : '';
  const before = text.slice(Math.max(0, from - 280), from);
  const after = text.slice(to, to + 180);

  return { selectedText, before, after, text };
}

function buildScope(range: RangeKey, selectedIds: string[]): KnowledgeScope {
  const scope: KnowledgeScope = {
    public: range === 'all' || range === 'public',
    private: range === 'all' || range === 'private',
    team: range === 'all' || range === 'team',
  };

  if (selectedIds.length > 0) {
    scope.document_ids = selectedIds;
  }

  return scope;
}

export default function RagSidebar({ editor, title }: RagSidebarProps) {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [range, setRange] = useState<RangeKey>('all');
  const [query, setQuery] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searching, setSearching] = useState(false);

  const filteredDocs = useMemo(() => {
    if (range === 'all') return docs;
    return docs.filter((doc) => doc.visibility === range);
  }, [docs, range]);

  const loadDocs = async () => {
    setLoadingDocs(true);
    try {
      const data = await listKnowledgeDocuments({ page: 1, page_size: 100 });
      setDocs(data.items);
      setSelectedIds((ids) => ids.filter((id) => data.items.some((doc) => doc.doc_id === id)));
    } catch (error) {
      console.error(error);
      message.error('知识库文档加载失败，请确认后端服务已启动');
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  useEffect(() => {
    const context = pickCursorContext(editor);
    const nextQuery = [title, context.selectedText, context.before.slice(-120)]
      .filter(Boolean)
      .join('\n');
    setQuery(nextQuery || '检索当前文章需要引用的资料');
  }, [editor, title]);

  const runSearch = async () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      message.warning('请输入检索问题或选中一段正文');
      return;
    }

    const context = pickCursorContext(editor);
    setSearching(true);
    try {
      const data = await searchKnowledge({
        query: normalizedQuery,
        top_k: 8,
        mode: 'hybrid',
        scope: buildScope(range, selectedIds),
        context: [context.selectedText, context.before, context.after].filter(Boolean).join('\n'),
      });
      setCitations(data.citations);
      if (data.citations.length === 0) {
        message.info('未检索到相关依据，不建议编造内容');
      }
    } catch (error) {
      console.error(error);
      message.error('检索失败，请检查 RAG 后端、Qdrant 与 MySQL 连接');
    } finally {
      setSearching(false);
    }
  };

  const insertCitation = (citation: Citation) => {
    if (!editor) {
      message.warning('编辑器尚未就绪');
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: citation.content }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `来源：${citation.title} [${citation.index}]`,
              },
            ],
          },
        ],
      })
      .run();
  };

  const readyDocs = filteredDocs.filter((doc) => doc.index_status === 'ready');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f7f8fa' }}>
      <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Text strong>知识库检索</Text>
            <Button size="small" icon={<ReloadOutlined />} onClick={loadDocs} loading={loadingDocs} />
          </Space>

          <Segmented
            block
            value={range}
            onChange={(value) => {
              setRange(value as RangeKey);
              setSelectedIds([]);
            }}
            options={[
              { label: '全部', value: 'all' },
              { label: '公开', value: 'public' },
              { label: '我的', value: 'private' },
              { label: '团队', value: 'team' },
            ]}
          />

          <Input.TextArea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoSize={{ minRows: 3, maxRows: 5 }}
            placeholder="输入要查证的问题，或先在正文中选中一段内容"
          />

          <Button type="primary" icon={<FileSearchOutlined />} block loading={searching} onClick={runSearch}>
            检索可引用依据
          </Button>
        </Space>
      </div>

      <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Text strong>文档选择</Text>
            <Text type="secondary">{selectedIds.length || '全部'} / {readyDocs.length}</Text>
          </Space>
          <Space wrap>
            <Button size="small" icon={<SelectOutlined />} onClick={() => setSelectedIds(readyDocs.map((doc) => doc.doc_id))}>
              全选
            </Button>
            <Button size="small" icon={<ClearOutlined />} onClick={() => setSelectedIds([])}>
              清空
            </Button>
          </Space>
          <Spin spinning={loadingDocs}>
            {readyDocs.length > 0 ? (
              <Checkbox.Group value={selectedIds} onChange={(values) => setSelectedIds(values.map(String))} style={{ width: '100%' }}>
                <Space direction="vertical" size={8} style={{ width: '100%', maxHeight: 180, overflow: 'auto' }}>
                  {readyDocs.map((doc) => (
                    <Checkbox key={doc.doc_id} value={doc.doc_id}>
                      <Space size={6}>
                        <Text ellipsis style={{ maxWidth: 190 }}>{doc.title}</Text>
                        <Tag color={visibilityColor[doc.visibility]}>{visibilityText[doc.visibility]}</Tag>
                      </Space>
                    </Checkbox>
                  ))}
                </Space>
              </Checkbox.Group>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 ready 文档" />
            )}
          </Spin>
        </Space>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {citations.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="检索结果会显示在这里"
            description="点击引用卡片可展开原文片段，并可一键插入到当前光标位置。"
          />
        ) : (
          <List
            dataSource={citations}
            split={false}
            renderItem={(item) => (
              <List.Item style={{ padding: '0 0 12px' }}>
                <Card
                  size="small"
                  style={{ width: '100%', borderRadius: 8 }}
                  title={<Text ellipsis style={{ maxWidth: 230 }}>{item.title}</Text>}
                  extra={<Text type="secondary">{Math.round(item.score * 100)}%</Text>}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap size={6}>
                      <Tag color={visibilityColor[item.visibility]}>{visibilityText[item.visibility] || item.visibility}</Tag>
                      <Tag>chunk {item.chunk_index ?? '-'}</Tag>
                      <Tag>v{item.document_version}</Tag>
                    </Space>
                    <Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开' }} style={{ marginBottom: 0 }}>
                      {item.content}
                    </Paragraph>
                    <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => insertCitation(item)}>
                      插入引用摘要到光标处
                    </Button>
                  </Space>
                </Card>
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );
}
