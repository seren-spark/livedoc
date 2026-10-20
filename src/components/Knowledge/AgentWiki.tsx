import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Tooltip,
  message,
} from 'antd';
import { BookOpen, Check, RefreshCw, Trash2 } from 'lucide-react';
import {
  createWikiCandidate,
  getWiki,
  listWiki,
  publishWiki,
  removeWiki,
  type WikiPage,
} from '@/api/wiki';
import type { AgentCitation } from '@/api/document-agent.types';
import AgentMarkdown from './AgentMarkdown';
import './AgentWiki.scss';

interface Props {
  authorized: boolean;
  runId?: string;
  answer?: string;
  available?: boolean;
  disabled?: boolean;
}
const statusLabel = (page: WikiPage) =>
  page.source_status !== 'valid'
    ? '来源待更新'
    : {
        draft: '待确认',
        indexing: '保存中',
        published: '已保存',
        failed: '保存未完成',
      }[page.status];

export default function AgentWiki({
  authorized,
  runId,
  answer,
  available = true,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [page, setPage] = useState<WikiPage>();
  const [source, setSource] = useState<AgentCitation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const close = () => {
    request.current?.abort();
    request.current = null;
    setOpen(false);
    setPage(undefined);
    setSource(undefined);
    setBusy(false);
    setError(undefined);
    setPages([]);
  };
  useEffect(() => {
    if (!authorized) close();
  }, [authorized]);
  useEffect(() => () => request.current?.abort(), []);
  const perform = async (work: (signal: AbortSignal) => Promise<void>) => {
    request.current?.abort();
    const current = new AbortController();
    request.current = current;
    setBusy(true);
    setError(undefined);
    try {
      await work(current.signal);
    } catch (failure: any) {
      if (!current.signal.aborted)
        setError(
          failure.response?.data?.message ??
            failure.message ??
            '操作未完成，请重试',
        );
    } finally {
      if (request.current === current) setBusy(false);
    }
  };
  const show = () => {
    setOpen(true);
    setPage(undefined);
    setSource(undefined);
    void perform(async (signal) => {
      if (runId && answer) {
        const result = await createWikiCandidate(runId, answer, signal);
        if (!signal.aborted) setPage(result);
      } else {
        const result = await listWiki(signal);
        if (!signal.aborted) setPages(result.items);
      }
    });
  };
  const select = (id: string) => {
    setPage(undefined);
    setSource(undefined);
    void perform(async (signal) => {
      const result = await getWiki(id, signal);
      if (!signal.aborted) setPage(result);
    });
  };
  const save = () => {
    if (!page) return;
    void perform(async (signal) => {
      const result = await publishWiki(page, signal);
      if (!signal.aborted) {
        setPage(result);
        setPages((items) =>
          items.map((item) =>
            item.wiki_id === result.wiki_id ? result : item,
          ),
        );
        message.success('已加入个人 Wiki，后续选择对应知识范围时可复用');
      }
    });
  };
  const discard = (id: string) => {
    void perform(async (signal) => {
      await removeWiki(id, signal);
      if (!signal.aborted) {
        setPages((items) => items.filter((item) => item.wiki_id !== id));
        if (page?.wiki_id === id) setPage(undefined);
      }
    });
  };
  return (
    <>
      <Tooltip
        title={
          !authorized
            ? '登录后使用个人 Wiki'
            : runId && !available
              ? '需要已完成且具有知识文档来源的稳定知识回答'
              : undefined
        }
      >
        <Button
          type="text"
          icon={<BookOpen size={15} />}
          disabled={!authorized || disabled || !available}
          onClick={show}
        >
          {runId ? '沉淀为 Wiki' : '我的 Wiki'}
        </Button>
      </Tooltip>
      <Modal
        open={open}
        onCancel={close}
        footer={null}
        width={runId ? 760 : 960}
        className="agent-wiki-modal"
        title={
          <span className="wiki-modal-title">
            <BookOpen size={18} />
            {runId ? '沉淀为 Wiki' : '我的 Wiki'}
          </span>
        }
      >
        <p className="wiki-intro">
          把有来源的知识留下来。确认保存后可供后续问答复用，来源变化时会停止使用旧内容。
        </p>
        {error && <Alert type="error" showIcon message={error} />}
        <div className={`wiki-layout ${runId ? 'capture' : ''}`}>
          {!runId && (
            <aside className="wiki-list" aria-label="Wiki 条目">
              <div className="wiki-list-heading">
                <strong>个人知识</strong>
                <Button
                  type="text"
                  aria-label="刷新 Wiki"
                  icon={<RefreshCw size={14} />}
                  disabled={busy}
                  onClick={show}
                />
              </div>
              {!pages.length && !busy && (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="将有来源的回答沉淀为第一条 Wiki"
                />
              )}
              {pages.map((item) => (
                <div
                  className={`wiki-list-item ${item.wiki_id === page?.wiki_id ? 'selected' : ''}`}
                  key={item.wiki_id}
                >
                  <button
                    className="wiki-select"
                    disabled={busy}
                    onClick={() => select(item.wiki_id)}
                  >
                    <strong>{item.title}</strong>
                    <span>
                      {statusLabel(item)} · {item.source_count} 条证据
                    </span>
                  </button>
                  <Popconfirm
                    title="移除这条 Wiki？"
                    description="原始资料会保留。"
                    onConfirm={() => discard(item.wiki_id)}
                    okText="移除"
                    cancelText="取消"
                  >
                    <Button
                      type="text"
                      size="small"
                      aria-label={`移除 ${item.title}`}
                      disabled={busy}
                      icon={<Trash2 size={14} />}
                    />
                  </Popconfirm>
                </div>
              ))}
            </aside>
          )}
          <section className="wiki-preview" aria-label="Wiki 预览">
            {busy && (
              <div className="wiki-loading" role="status">
                <Spin size="small" />
                <span>
                  {runId && !page ? '正在整理知识并核对来源…' : '正在处理…'}
                </span>
              </div>
            )}
            {page ? (
              <>
                <div className="wiki-page-heading">
                  <h3>{page.title}</h3>
                  <Tag
                    color={
                      page.source_status !== 'valid'
                        ? 'orange'
                        : page.status === 'published'
                          ? 'blue'
                          : 'default'
                    }
                  >
                    {statusLabel(page)}
                  </Tag>
                </div>
                {page.source_status !== 'valid' ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="来源已变化，内容已停止使用"
                    description="请重新检索原始资料，生成有最新来源的回答后再沉淀。"
                  />
                ) : (
                  <>
                    {page.error && (
                      <Alert type="warning" message={page.error} />
                    )}
                    <div className="agent-markdown">
                      <AgentMarkdown
                        citations={page.citations}
                        onCitationClick={setSource}
                      >
                        {page.markdown}
                      </AgentMarkdown>
                    </div>
                    <details className="wiki-sources">
                      <summary>{page.source_count} 条原始证据</summary>
                      {page.citations.map((citation) => (
                        <button
                          key={citation.id}
                          onClick={() => setSource(citation)}
                        >
                          {citation.title} · v{citation.version}
                        </button>
                      ))}
                    </details>
                    {source && (
                      <div className="wiki-source-preview">
                        <strong>{source.title}</strong>
                        <blockquote>{source.source_content}</blockquote>
                      </div>
                    )}
                    <div className="wiki-actions">
                      <Space>
                        {page.status !== 'published' && (
                          <Button
                            type="primary"
                            icon={<Check size={15} />}
                            loading={busy}
                            disabled={
                              busy ||
                              page.status === 'indexing' ||
                              !page.review?.passed
                            }
                            onClick={save}
                          >
                            确认保存
                          </Button>
                        )}
                        {page.status === 'published' && (
                          <span className="wiki-saved">
                            <Check size={15} />
                            已保存，可在对应知识范围内复用
                          </span>
                        )}
                      </Space>
                    </div>
                  </>
                )}
              </>
            ) : (
              !busy &&
              !runId && (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="选择一条知识查看内容与来源"
                />
              )
            )}
          </section>
        </div>
      </Modal>
    </>
  );
}
