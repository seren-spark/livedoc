import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  ReloadOutlined,
  RetweetOutlined,
} from '@ant-design/icons';
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  reindexKnowledgeDocument,
  updateKnowledgeDocument,
  type DocumentCreatePayload,
  type DocumentRecord,
} from '@/api/rag';

const { Text, Title } = Typography;

const statusColor: Record<DocumentRecord['index_status'], string> = {
  pending: 'default',
  indexing: 'processing',
  ready: 'success',
  failed: 'error',
};

const visibilityColor: Record<DocumentRecord['visibility'], string> = {
  private: 'blue',
  team: 'gold',
  public: 'green',
};

const visibilityLabel: Record<DocumentRecord['visibility'], string> = {
  private: '私有',
  team: '团队',
  public: '公开',
};

export default function KnowledgePage() {
  const [form] = Form.useForm<DocumentCreatePayload>();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const readyCount = useMemo(() => docs.filter((doc) => doc.index_status === 'ready').length, [docs]);

  const loadDocs = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    try {
      const data = await listKnowledgeDocuments({ page: nextPage, page_size: nextPageSize });
      setDocs(data.items);
      setTotal(data.total);
      setPage(data.page);
      setPageSize(data.page_size);
    } catch (error) {
      console.error(error);
      message.error('文档列表加载失败，请确认后端服务已启动');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs(1, pageSize);
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      title: '',
      content: '',
      visibility: 'private',
      source_type: 'article',
      team_id: '',
      tags: [],
      url: '',
      index_now: true,
    });
    setDrawerOpen(true);
  };

  const openEdit = (record: DocumentRecord) => {
    setEditing(record);
    form.setFieldsValue({
      title: record.title,
      content: record.content,
      visibility: record.visibility,
      source_type: record.source_type,
      team_id: record.team_id || '',
      tags: record.tags,
      url: record.url || '',
    });
    setDrawerOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await updateKnowledgeDocument(editing.doc_id, values);
        message.success('文档元数据已更新');
      } else {
        await createKnowledgeDocument(values);
        message.success('文档已创建并发起索引');
      }
      setDrawerOpen(false);
      await loadDocs(page, pageSize);
    } catch (error) {
      console.error(error);
      message.error('保存失败，请检查文档内容或后端连接');
    } finally {
      setSaving(false);
    }
  };

  const remove = (record: DocumentRecord) => {
    Modal.confirm({
      title: '删除文档',
      content: `确认删除「${record.title}」并同步清理向量分片吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteKnowledgeDocument(record.doc_id);
        message.success('文档与向量分片已删除');
        await loadDocs(page, pageSize);
      },
    });
  };

  const reindex = async (record: DocumentRecord) => {
    try {
      await reindexKnowledgeDocument(record.doc_id);
      message.success('已触发重建索引');
      await loadDocs(page, pageSize);
    } catch (error) {
      console.error(error);
      message.error('重建索引失败');
    }
  };

  const columns: ColumnsType<DocumentRecord> = [
    {
      title: '文档',
      dataIndex: 'title',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.title}</Text>
          <Text type="secondary">{record.doc_id}</Text>
        </Space>
      ),
    },
    {
      title: '权限',
      dataIndex: 'visibility',
      width: 110,
      render: (value: DocumentRecord['visibility']) => (
        <Tag color={visibilityColor[value]}>{visibilityLabel[value]}</Tag>
      ),
    },
    {
      title: '团队/空间',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.team_id || '-'}</Text>
          <Text type="secondary">{record.space_id}</Text>
        </Space>
      ),
    },
    {
      title: '索引状态',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Tag color={statusColor[record.index_status]}>{record.index_status}</Tag>
          <Text type="secondary">{record.chunk_count} chunks</Text>
        </Space>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 190,
      render: (value: string) => <Text type="secondary">{value?.replace('T', ' ').slice(0, 19)}</Text>,
    },
    {
      title: '操作',
      width: 220,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button size="small" icon={<RetweetOutlined />} onClick={() => reindex(record)}>
            重建
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(record)} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f8', padding: 24 }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>企业知识库控制台</Title>
            <Text type="secondary">
              管理空间级文档、权限标签、索引状态和向量重建，写作页会实时使用这里的 ready 文档。
            </Text>
          </div>
          <Space>
            <Tag color="processing">Ready {readyCount}</Tag>
            <Button icon={<ReloadOutlined />} onClick={() => loadDocs(page, pageSize)} loading={loading}>
              刷新
            </Button>
            <Button type="primary" icon={<FileAddOutlined />} onClick={openCreate}>
              新建文档
            </Button>
          </Space>
        </Space>

        <Table
          rowKey="doc_id"
          loading={loading}
          columns={columns}
          dataSource={docs}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: loadDocs,
          }}
          style={{ background: '#fff' }}
        />
      </div>

      <Drawer
        width={520}
        open={drawerOpen}
        title={editing ? '编辑文档' : '新建知识文档'}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Button type="primary" loading={saving} onClick={submit}>
            保存
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="例如：LiveDoc RAG 架构设计" />
          </Form.Item>
          <Form.Item name="content" label="正文" rules={[{ required: true, message: '请输入正文内容' }]}>
            <Input.TextArea rows={10} placeholder="粘贴文章、方案、团队资料或产品文档内容" />
          </Form.Item>
          <Form.Item name="visibility" label="权限">
            <Select
              options={[
                { label: '私有 private', value: 'private' },
                { label: '团队 team', value: 'team' },
                { label: '公开 public', value: 'public' },
              ]}
            />
          </Form.Item>
          <Form.Item name="team_id" label="团队 ID">
            <Input placeholder="团队文档填写，例如 team_frontend" />
          </Form.Item>
          <Form.Item name="source_type" label="来源类型">
            <Select
              options={[
                { label: '文章 article', value: 'article' },
                { label: '草稿 draft', value: 'draft' },
                { label: '笔记 note', value: 'note' },
                { label: '团队文档 team_doc', value: 'team_doc' },
                { label: '公开文章 public_article', value: 'public_article' },
              ]}
            />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" placeholder="输入标签后回车" />
          </Form.Item>
          <Form.Item name="url" label="来源 URL">
            <Input placeholder="可选，原文链接" />
          </Form.Item>
          {!editing && (
            <Form.Item name="index_now" label="创建后立即索引">
              <Select
                options={[
                  { label: '立即索引', value: true },
                  { label: '仅保存为 pending', value: false },
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
