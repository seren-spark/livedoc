import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Empty,
  Input,
  Modal,
  Progress,
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
  DatabaseOutlined,
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
  UploadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  deleteKnowledgeDocument,
  getDocumentImport,
  getRagMetrics,
  listKnowledgeDocuments,
  reindexKnowledgeDocument,
  retryDocumentImport,
  seedRagDemoData,
  uploadDocumentImport,
  type DocumentImportRecord,
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
  | `team:${string}`;

const statusColor: Record<DocumentRecord['index_status'], string> = {
  pending: 'default',
  queued: 'warning',
  indexing: 'processing',
  ready: 'success',
  failed: 'error',
};

const statusLabel: Record<DocumentRecord['index_status'], string> = {
  pending: '待索引',
  queued: '排队中',
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
const importStorageKey = 'livedoc:lastDocumentImportId';

const importStatusLabel: Record<DocumentImportRecord['status'], string> = {
  uploaded: '已上传',
  queued: '等待解析',
  parsing: '正在解析',
  review_ready: '可预览编辑',
  confirmed: '已存入知识库',
  retry_wait: '等待重试',
  failed: '解析失败',
  canceled: '已取消',
};

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
  return spaceKey.slice(5);
}

export default function KnowledgePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isLoggedIn, showLoginModal } = useAuth();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [activeImport, setActiveImport] =
    useState<DocumentImportRecord | null>(null);
  const [importing, setImporting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [metrics, setMetrics] = useState<RagMetrics | null>(null);
  const [metricsWindow, setMetricsWindow] = useState<'24h' | '7d' | '30d'>(
    '24h',
  );
  const [selectedSpace, setSelectedSpace] = useState<SpaceKey>('private');
  const [selectedFolder, setSelectedFolder] = useState('全部文档');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    DocumentRecord['index_status'] | 'all'
  >('all');
  const [visibilityFilter, setVisibilityFilter] = useState<
    DocumentRecord['visibility'] | 'all'
  >('all');

  const loadDocs = async (options: { background?: boolean } = {}) => {
    const background = options.background === true;
    if (!isLoggedIn) {
      setDocs([]);
      return;
    }
    if (!background) setLoading(true);
    try {
      const isTeamSpace = selectedSpace.startsWith('team:');
      const data = await listKnowledgeDocuments({
        page,
        page_size: pageSize,
        q: keyword.trim() || undefined,
        visibility:
          visibilityFilter !== 'all'
            ? visibilityFilter
            : selectedSpace === 'private'
              ? 'private'
              : selectedSpace === 'public'
                ? 'public'
                : isTeamSpace
                  ? 'team'
                  : undefined,
        team_id: isTeamSpace ? selectedSpace.slice(5) : undefined,
        tag: selectedFolder !== '全部文档' ? selectedFolder : undefined,
        index_status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setDocs(data.items);
      setTotal(data.total);
    } catch (error) {
      console.error(error);
      if (!background) {
        message.error('文档列表加载失败，请确认后端服务和登录状态');
      }
    } finally {
      if (!background) setLoading(false);
    }
  };

  const loadMetrics = async () => {
    if (!isLoggedIn) {
      setMetrics(null);
      return;
    }
    try {
      setMetrics(await getRagMetrics(metricsWindow));
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    void loadMetrics();
  }, [isLoggedIn, metricsWindow]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDocs(), 250);
    return () => window.clearTimeout(timer);
  }, [isLoggedIn, page, pageSize, keyword, selectedFolder, selectedSpace, statusFilter, visibilityFilter]);

  useEffect(() => {
    if (!isLoggedIn) {
      setActiveImport(null);
      return;
    }
    const importId = sessionStorage.getItem(importStorageKey);
    if (!importId) return;
    void getDocumentImport(importId)
      .then(setActiveImport)
      .catch(() => sessionStorage.removeItem(importStorageKey));
  }, [isLoggedIn]);

  useEffect(() => {
    if (
      !activeImport ||
      !['uploaded', 'queued', 'parsing', 'retry_wait'].includes(
        activeImport.status,
      )
    ) {
      return;
    }
    let cancelled = false;
    let timer = 0;
    let attempt = 0;
    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(poll, 5000);
        return;
      }
      try {
        const next = await getDocumentImport(activeImport.import_id);
        if (cancelled) return;
        setActiveImport(next);
        attempt += 1;
        if (next.status === 'review_ready') {
          message.success('文档解析完成，可以进入原编辑器预览和修改');
          return;
        }
      } catch (error) {
        console.error(error);
        attempt += 1;
      }
      timer = window.setTimeout(poll, Math.min(8000, 1500 * 1.5 ** attempt));
    };
    timer = window.setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeImport?.import_id, activeImport?.status]);

  const hasActiveIndexJobs = docs.some((doc) =>
    ['queued', 'indexing'].includes(doc.index_status),
  );

  useEffect(() => {
    if (
      !isLoggedIn ||
      !hasActiveIndexJobs
    ) {
      return;
    }
    let cancelled = false;
    let timer = 0;
    let attempt = 0;
    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(poll, 5000);
        return;
      }
      await Promise.all([
        loadDocs({ background: true }),
        loadMetrics(),
      ]).catch(console.error);
      attempt += 1;
      timer = window.setTimeout(poll, Math.min(10_000, 2000 * 1.4 ** attempt));
    };
    timer = window.setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    hasActiveIndexJobs,
    isLoggedIn,
    metricsWindow,
    page,
    pageSize,
    keyword,
    selectedFolder,
    selectedSpace,
    statusFilter,
    visibilityFilter,
  ]);

  useEffect(() => {
    setSelectedFolder('全部文档');
    setVisibilityFilter('all');
    setStatusFilter('all');
    setKeyword('');
    setPage(1);
  }, [selectedSpace]);

  useEffect(() => {
    setPage(1);
  }, [keyword, selectedFolder, statusFilter, visibilityFilter]);

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

  const currentTarget = () => {
    const isTeamSpace = selectedSpace.startsWith('team:');
    const folderTag = !systemFolders.has(selectedFolder)
      ? [selectedFolder]
      : [];
    const visibility = isTeamSpace
        ? 'team'
        : selectedSpace === 'public'
          ? 'public'
          : 'private';
    return {
      visibility: visibility as 'private' | 'team' | 'public',
      team_id: isTeamSpace ? selectedSpace.slice(5) : '',
      tags: folderTag,
      folder: folderTag[0] || '',
    };
  };

  const openCreate = () => {
    const target = currentTarget();
    const params = new URLSearchParams({
      mode: 'knowledge',
      space: selectedSpace,
      visibility: target.visibility,
    });
    if (target.team_id) params.set('team', target.team_id);
    if (target.folder) params.set('folder', target.folder);
    navigate(`/editor/draft?${params.toString()}`);
  };

  const openEdit = (record: DocumentRecord) => {
    navigate(`/editor/draft?mode=knowledge&docId=${record.doc_id}`);
  };

  const importFile = async (file: File) => {
    const target = currentTarget();
    setImporting(true);
    try {
      const record = await uploadDocumentImport(file, target);
      sessionStorage.setItem(importStorageKey, record.import_id);
      setActiveImport(record);
      message.success('上传成功，正在后台解析');
    } catch (error) {
      console.error(error);
      message.error('导入失败，请确认文件为 50MB 内的 PDF 或 DOCX');
    } finally {
      setImporting(false);
    }
  };

  const retryImport = async () => {
    if (!activeImport) return;
    setImporting(true);
    try {
      const next = await retryDocumentImport(activeImport.import_id);
      setActiveImport(next);
      message.success('已重新加入解析队列');
    } catch (error) {
      console.error(error);
      message.error('重试失败');
    } finally {
      setImporting(false);
    }
  };

  const seedDemoData = () => {
    Modal.confirm({
      title: '生成真实 RAG 演示数据',
      content:
        '将为当前账号创建或还原公开、个人和所属团队的演示文档，并进入真实 BGE + Qdrant 索引队列。不会创建其他用户或其他团队的资料。',
      okText: '生成并建立索引',
      cancelText: '取消',
      onOk: async () => {
        setSeeding(true);
        try {
          const result = await seedRagDemoData();
          const queued = result.documents.filter((item) => item.job_id).length;
          message.success(
            queued > 0
              ? `已准备 ${result.documents.length} 篇演示文档，${queued} 篇进入索引队列`
              : `${result.documents.length} 篇演示文档均已就绪，无需重复索引`,
          );
          setPage(1);
          setSelectedSpace('private');
          await loadDocs();
        } catch (error) {
          console.error(error);
          message.error('生成演示数据失败，请检查 API 与索引 worker 是否已启动');
          throw error;
        } finally {
          setSeeding(false);
        }
      },
    });
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
          {record.active_index_version && (
            <Text type="secondary">
              serving v{record.active_index_version} / content v
              {record.document_version}
            </Text>
          )}
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
              disabled={['queued', 'indexing'].includes(record.index_status)}
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
      key={key}
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
              icon={<DatabaseOutlined />}
              onClick={seedDemoData}
              disabled={!isLoggedIn}
              loading={seeding}
            >
              演示数据
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFile(file);
              }}
            />
            <Button
              icon={<UploadOutlined />}
              onClick={() => fileInputRef.current?.click()}
              disabled={!isLoggedIn}
              loading={importing}
            >
              导入 PDF / Word
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

        {isLoggedIn && activeImport && (
          <section className="knowledge-import-status" aria-live="polite">
            <div className="knowledge-import-status__heading">
              <div>
                <Text type="secondary">最近一次导入</Text>
                <strong>{activeImport.filename}</strong>
              </div>
              <Tag
                color={
                  activeImport.status === 'review_ready'
                    ? 'success'
                    : activeImport.status === 'failed'
                      ? 'error'
                      : activeImport.status === 'confirmed'
                        ? 'blue'
                        : 'processing'
                }
              >
                {importStatusLabel[activeImport.status]}
              </Tag>
            </div>
            <Progress
              percent={Math.round(activeImport.progress)}
              status={activeImport.status === 'failed' ? 'exception' : 'active'}
              size="small"
              showInfo={false}
            />
            <div className="knowledge-import-status__footer">
              <Text type={activeImport.error ? 'danger' : 'secondary'}>
                {activeImport.error || activeImport.stage || '等待后台处理'}
              </Text>
              <Space>
                {['failed', 'retry_wait'].includes(activeImport.status) && (
                  <Button size="small" onClick={retryImport} loading={importing}>
                    重试解析
                  </Button>
                )}
                {activeImport.status === 'review_ready' && (
                  <Button
                    size="small"
                    type="primary"
                    onClick={() =>
                      navigate(
                        `/editor/draft?mode=knowledge&importId=${activeImport.import_id}`,
                      )
                    }
                  >
                    进入原编辑器预览
                  </Button>
                )}
                {activeImport.status === 'confirmed' &&
                  activeImport.document_id && (
                    <Button
                      size="small"
                      onClick={() =>
                        navigate(
                          `/editor/draft?mode=knowledge&docId=${activeImport.document_id}`,
                        )
                      }
                    >
                      打开知识文档
                    </Button>
                  )}
              </Space>
            </div>
          </section>
        )}

        {isLoggedIn && metrics && (
          <section
            className="knowledge-observability"
            aria-label="RAG 运行指标"
          >
            <div>
              <Text type="secondary">
                <Select
                  size="small"
                  value={metricsWindow}
                  onChange={setMetricsWindow}
                  options={[
                    { label: '近 24 小时', value: '24h' },
                    { label: '近 7 天', value: '7d' },
                    { label: '近 30 天', value: '30d' },
                  ]}
                />
              </Text>
              <strong>{metrics.search_count}</strong>
              <span>次持久化请求 · 队列 {metrics.queue_depth}</span>
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
                {metrics.inserted_count}/{metrics.evidence_completion_count}{' '}
                次插入
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
              { label: '排队中', value: 'queued' },
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
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 篇文档`,
                onChange: (nextPage, nextPageSize) => {
                  setPage(nextPageSize !== pageSize ? 1 : nextPage);
                  setPageSize(nextPageSize);
                },
              }}
              locale={{ emptyText: '当前目录暂无文档' }}
            />
          )}
        </section>
      </main>

    </div>
  );
}
