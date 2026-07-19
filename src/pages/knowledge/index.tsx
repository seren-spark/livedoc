import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  HeartOutlined,
  HistoryOutlined,
  InboxOutlined,
  LockOutlined,
  ReloadOutlined,
  RetweetOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  getRagMetrics,
  listKnowledgeDocuments,
  reindexKnowledgeDocument,
  updateKnowledgeDocument,
  type DocumentCreatePayload,
  type DocumentRecord,
  type RagMetrics,
} from '@/api/rag';
import { useAuth } from '@/contexts/authContext';
import './index.scss';

const { Text, Title } = Typography;

type SpaceKey =
  | 'private'
  | 'public'
  | 'recent'
  | 'favorite'
  | 'trash'
  | `team:${string}`;

const statusColor: Record<DocumentRecord['index_status'], string> = {
  pending: 'default',
  indexing: 'processing',
  ready: 'success',
  failed: 'error',
};

const statusLabel: Record<DocumentRecord['index_status'], string> = {
  pending: '待索引',
  indexing: '索引中',
  ready: '已就绪',
  failed: '失败',
};

const visibilityColor: Record<DocumentRecord['visibility'], string> = {
  private: 'blue',
  team: 'gold',
  public: 'green',
};

const visibilityLabel: Record<DocumentRecord['visibility'], string> = {
  private: '个人私有',
  team: '团队共享',
  public: '公开',
};

const sourceTypeLabel: Record<DocumentRecord['source_type'], string> = {
  article: '文章资料',
  draft: '写作草稿',
  note: '工作笔记',
  team_doc: '团队规范',
  public_article: '公开资料',
};

const systemFolders = new Set(['全部文档', '未分类']);

function formatTime(value?: string | null) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
}

function getFolderName(record: DocumentRecord) {
  const firstTag = record.tags?.find(Boolean);
  return firstTag || sourceTypeLabel[record.source_type] || '未分类';
}

function matchesSpace(record: DocumentRecord, spaceKey: SpaceKey) {
  if (spaceKey === 'private') return record.visibility === 'private';
  if (spaceKey === 'public') return record.visibility === 'public';
  if (spaceKey === 'recent') return true;
  if (spaceKey === 'favorite') {
    return record.tags?.some((tag) =>
      ['收藏', 'favorite', 'starred'].includes(tag),
    );
  }
  if (spaceKey === 'trash') return false;
  if (spaceKey.startsWith('team:')) {
    return record.visibility === 'team' && record.team_id === spaceKey.slice(5);
  }
  return false;
}

function spaceTitle(spaceKey: SpaceKey) {
  if (spaceKey === 'private') return '我的知识库';
  if (spaceKey === 'public') return '公共知识库';
  if (spaceKey === 'recent') return '最近文档';
  if (spaceKey === 'favorite') return '收藏文档';
  if (spaceKey === 'trash') return '回收站';
  return spaceKey.slice(5);
}

export default function KnowledgePage() {
  const [form] = Form.useForm<DocumentCreatePayload>();
  const { isLoggedIn, showLoginModal } = useAuth();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [metrics, setMetrics] = useState<RagMetrics | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<SpaceKey>('private');
  const [selectedFolder, setSelectedFolder] = useState('全部文档');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    DocumentRecord['index_status'] | 'all'
  >('all');
  const [visibilityFilter, setVisibilityFilter] = useState<
    DocumentRecord['visibility'] | 'all'
  >('all');

  const loadDocs = async () => {
    if (!isLoggedIn) {
      setDocs([]);
      return;
    }
    setLoading(true);
    try {
      const data = await listKnowledgeDocuments({ page: 1, page_size: 200 });
      setDocs(data.items);
    } catch (error) {
      console.error(error);
      message.error('文档列表加载失败，请确认后端服务和登录状态');
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    if (!isLoggedIn) {
      setMetrics(null);
      return;
    }
    try {
      setMetrics(await getRagMetrics());
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    void Promise.all([loadDocs(), loadMetrics()]);
  }, [isLoggedIn]);

  useEffect(() => {
    setSelectedFolder('全部文档');
    setVisibilityFilter('all');
    setStatusFilter('all');
    setKeyword('');
  }, [selectedSpace]);

  const teams = useMemo(() => {
    const ids = Array.from(
      new Set(
        docs
          .filter((doc) => doc.visibility === 'team' && doc.team_id)
          .map((doc) => doc.team_id as string),
      ),
    );
    return ids.sort();
  }, [docs]);

  const spaceDocs = useMemo(() => {
    const scoped = docs.filter((doc) => matchesSpace(doc, selectedSpace));
    if (selectedSpace === 'recent') {
      return [...scoped]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 30);
    }
    return scoped;
  }, [docs, selectedSpace]);

  const folders = useMemo(() => {
    const names = Array.from(new Set(spaceDocs.map(getFolderName))).sort();
    return ['全部文档', ...names];
  }, [spaceDocs]);

  const tableDocs = useMemo(() => {
    return spaceDocs.filter((doc) => {
      const folderOk =
        selectedFolder === '全部文档' || getFolderName(doc) === selectedFolder;
      const statusOk =
        statusFilter === 'all' || doc.index_status === statusFilter;
      const visibilityOk =
        visibilityFilter === 'all' || doc.visibility === visibilityFilter;
      const keywordOk =
        !keyword.trim() ||
        [
          doc.title,
          doc.content,
          doc.doc_id,
          doc.owner_id,
          doc.team_id,
          doc.tags.join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword.trim().toLowerCase());
      return folderOk && statusOk && visibilityOk && keywordOk;
    });
  }, [keyword, selectedFolder, spaceDocs, statusFilter, visibilityFilter]);

  const counts = useMemo(
    () => ({
      private: docs.filter((doc) => doc.visibility === 'private').length,
      public: docs.filter((doc) => doc.visibility === 'public').length,
      favorite: docs.filter((doc) => matchesSpace(doc, 'favorite')).length,
      ready: tableDocs.filter((doc) => doc.index_status === 'ready').length,
    }),
    [docs, tableDocs],
  );

  const openCreate = () => {
    const isTeamSpace = selectedSpace.startsWith('team:');
    const folderTag = !systemFolders.has(selectedFolder)
      ? [selectedFolder]
      : [];
    setEditing(null);
    form.setFieldsValue({
      title: '',
      content: '',
      visibility: isTeamSpace
        ? 'team'
        : selectedSpace === 'public'
          ? 'public'
          : 'private',
      source_type: isTeamSpace
        ? 'team_doc'
        : selectedSpace === 'public'
          ? 'public_article'
          : 'note',
      team_id: isTeamSpace ? selectedSpace.slice(5) : '',
      tags: folderTag,
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
        message.success('文档已更新');
      } else {
        await createKnowledgeDocument(values);
        message.success('文档已创建并发起索引');
      }
      setDrawerOpen(false);
      await loadDocs();
    } catch (error) {
      console.error(error);
      message.error('保存失败，请检查文档内容、权限或后端连接');
    } finally {
      setSaving(false);
    }
  };

  const remove = (record: DocumentRecord) => {
    Modal.confirm({
      title: '删除文档',
      content: `确认删除「${record.title}」并清理向量分片吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteKnowledgeDocument(record.doc_id);
        message.success('文档与向量分片已删除');
        await loadDocs();
      },
    });
  };

  const reindex = async (record: DocumentRecord) => {
    try {
      await reindexKnowledgeDocument(record.doc_id);
      message.success('已触发重建索引');
      await loadDocs();
    } catch (error) {
      console.error(error);
      message.error('重建索引失败');
    }
  };

  const columns: ColumnsType<DocumentRecord> = [
    {
      title: '文档名',
      dataIndex: 'title',
      render: (_, record) => (
        <Space direction="vertical" size={3} className="knowledge-doc-cell">
          <Text strong ellipsis={{ tooltip: record.title }}>
            {record.title}
          </Text>
          <Text type="secondary" ellipsis={{ tooltip: record.doc_id }}>
            {record.doc_id}
          </Text>
        </Space>
      ),
    },
    {
      title: '权限',
      dataIndex: 'visibility',
      width: 118,
      render: (value: DocumentRecord['visibility'], record) => (
        <Space direction="vertical" size={3}>
          <Tag color={visibilityColor[value]}>{visibilityLabel[value]}</Tag>
          {record.team_id && <Text type="secondary">{record.team_id}</Text>}
        </Space>
      ),
    },
    {
      title: '知识库目录',
      width: 150,
      render: (_, record) => <Text>{getFolderName(record)}</Text>,
    },
    {
      title: '作者',
      width: 150,
      render: (_, record) => (
        <Text type="secondary">{record.owner_id || '系统资料'}</Text>
      ),
    },
    {
      title: '索引状态',
      width: 140,
      render: (_, record) => (
        <Space direction="vertical" size={3}>
          <Tag color={statusColor[record.index_status]}>
            {statusLabel[record.index_status]}
          </Tag>
          <Text type="secondary">{record.chunk_count} chunks</Text>
        </Space>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 150,
      render: (value: string) => (
        <Text type="secondary">{formatTime(value)}</Text>
      ),
    },
    {
      title: '操作',
      width: 170,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            />
          </Tooltip>
          <Tooltip title="重建索引">
            <Button
              size="small"
              icon={<RetweetOutlined />}
              onClick={() => reindex(record)}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => remove(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const teamCounts = useMemo(() => {
    return Object.fromEntries(
      teams.map((teamId) => [
        teamId,
        docs.filter(
          (doc) => doc.visibility === 'team' && doc.team_id === teamId,
        ).length,
      ]),
    );
  }, [docs, teams]);

  const renderNavItem = (
    key: SpaceKey,
    icon: ReactNode,
    label: string,
    count: number,
  ) => (
    <button
      type="button"
      className={
        selectedSpace === key
          ? 'knowledge-nav-item is-active'
          : 'knowledge-nav-item'
      }
      onClick={() => setSelectedSpace(key)}
    >
      <span className="knowledge-nav-item__main">
        {icon}
        <span>{label}</span>
      </span>
      <Badge
        count={count}
        showZero
        color={selectedSpace === key ? '#0f766e' : '#9ca3af'}
      />
    </button>
  );

  return (
    <div className="knowledge-page">
      <aside className="knowledge-sidebar">
        <div className="knowledge-sidebar__brand">
          <InboxOutlined />
          <div>
            <strong>知识库</strong>
            <span>空间 / 目录 / 文档</span>
          </div>
        </div>

        <div className="knowledge-nav-group">
          <Text type="secondary">一级空间</Text>
          {renderNavItem(
            'private',
            <LockOutlined />,
            '我的知识库',
            counts.private,
          )}
          <div className="knowledge-nav-team-title">
            <TeamOutlined />
            团队知识库
          </div>
          {teams.length === 0 && (
            <Text className="knowledge-nav-empty">暂无团队资料</Text>
          )}
          {teams.map((teamId) =>
            renderNavItem(
              `team:${teamId}`,
              <FolderOpenOutlined />,
              teamId,
              teamCounts[teamId] || 0,
            ),
          )}
          {renderNavItem(
            'public',
            <GlobalOutlined />,
            '公共知识库',
            counts.public,
          )}
        </div>

        <div className="knowledge-nav-group">
          <Text type="secondary">快捷入口</Text>
          {renderNavItem(
            'recent',
            <HistoryOutlined />,
            '最近文档',
            Math.min(docs.length, 30),
          )}
          {renderNavItem(
            'favorite',
            <HeartOutlined />,
            '收藏文档',
            counts.favorite,
          )}
          {renderNavItem('trash', <DeleteOutlined />, '回收站', 0)}
        </div>
      </aside>

      <main className="knowledge-main">
        <header className="knowledge-header">
          <div>
            <Text type="secondary">当前空间</Text>
            <Title level={3}>{spaceTitle(selectedSpace)}</Title>
          </div>
          <Space>
            {!isLoggedIn && (
              <Button onClick={showLoginModal} type="primary">
                登录演示账号
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void Promise.all([loadDocs(), loadMetrics()])}
              loading={loading}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<FileAddOutlined />}
              onClick={openCreate}
              disabled={!isLoggedIn}
            >
              新建文档
            </Button>
          </Space>
        </header>

        {isLoggedIn && metrics && (
          <section className="knowledge-observability" aria-label="RAG 运行指标">
            <div>
              <Text type="secondary">本进程检索</Text>
              <strong>{metrics.search_count}</strong>
              <span>次可追踪请求</span>
            </div>
            <div>
              <Text type="secondary">检索 P95</Text>
              <strong>{metrics.p95_latency_ms.toFixed(0)} ms</strong>
              <span>不含模型生成</span>
            </div>
            <div>
              <Text type="secondary">无依据率</Text>
              <strong>{(metrics.no_evidence_rate * 100).toFixed(1)}%</strong>
              <span>{metrics.completion_count} 次生成</span>
            </div>
            <div>
              <Text type="secondary">内容采纳率</Text>
              <strong>{(metrics.adoption_rate * 100).toFixed(1)}%</strong>
              <span>
                {metrics.inserted_count}/{metrics.evidence_completion_count} 次插入
              </span>
            </div>
          </section>
        )}

        <nav className="knowledge-folder-tabs" aria-label="知识库目录">
          {folders.map((folder) => (
            <button
              type="button"
              key={folder}
              className={selectedFolder === folder ? 'is-active' : undefined}
              onClick={() => setSelectedFolder(folder)}
            >
              {folder}
              <span>
                {folder === '全部文档'
                  ? spaceDocs.length
                  : spaceDocs.filter((doc) => getFolderName(doc) === folder)
                      .length}
              </span>
            </button>
          ))}
        </nav>

        <section className="knowledge-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索标题、内容、标签、作者"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Select
            value={visibilityFilter}
            onChange={setVisibilityFilter}
            options={[
              { label: '全部权限', value: 'all' },
              { label: '个人私有', value: 'private' },
              { label: '团队共享', value: 'team' },
              { label: '公开', value: 'public' },
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { label: '全部状态', value: 'all' },
              { label: '已就绪', value: 'ready' },
              { label: '索引中', value: 'indexing' },
              { label: '待索引', value: 'pending' },
              { label: '失败', value: 'failed' },
            ]}
          />
          <Tag color="processing">Ready {counts.ready}</Tag>
        </section>

        <section className="knowledge-table-shell">
          {!isLoggedIn ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="登录后查看个人、团队和公开知识库"
            >
              <Button type="primary" onClick={showLoginModal}>
                登录演示账号
              </Button>
            </Empty>
          ) : (
            <Table
              rowKey="doc_id"
              loading={loading}
              columns={columns}
              dataSource={tableDocs}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 篇文档`,
              }}
              locale={{
                emptyText:
                  selectedSpace === 'trash'
                    ? '回收站暂未接入后端'
                    : '当前目录暂无文档',
              }}
            />
          )}
        </section>
      </main>

      <Drawer
        width={520}
        open={drawerOpen}
        title={editing ? '编辑知识文档' : '新建知识文档'}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Button type="primary" loading={saving} onClick={submit}>
            保存
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="例如：LiveDoc RAG 架构设计" />
          </Form.Item>
          <Form.Item
            name="content"
            label="正文"
            rules={[{ required: true, message: '请输入正文内容' }]}
          >
            <Input.TextArea
              rows={10}
              placeholder="粘贴文章、方案、团队资料或产品文档内容"
            />
          </Form.Item>
          <Form.Item name="visibility" label="权限">
            <Select
              options={[
                { label: '个人私有 private', value: 'private' },
                { label: '团队共享 team', value: 'team' },
                { label: '公开 public', value: 'public' },
              ]}
            />
          </Form.Item>
          <Form.Item name="team_id" label="团队 ID">
            <Input placeholder="团队文档填写，例如 team_alpha" />
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
          <Form.Item name="tags" label="知识库目录 / 标签">
            <Select
              mode="tags"
              placeholder="输入目录或标签后回车，例如 项目资料"
            />
          </Form.Item>
          <Form.Item name="url" label="来源 URL">
            <Input placeholder="可选，原文链接" />
          </Form.Item>
          {!editing && (
            <Form.Item name="index_now" label="创建后立即索引">
              <Select
                options={[
                  { label: '立即索引', value: true },
                  { label: '仅保存为待索引', value: false },
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
