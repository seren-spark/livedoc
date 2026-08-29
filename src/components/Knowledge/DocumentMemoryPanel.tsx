import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, Spin, Tag, Tooltip, message } from 'antd';
import {
  AlertTriangle,
  BookKey,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  getDocumentMemory,
  refreshDocumentMemory,
  updateDocumentMemory,
  type DocumentMemoryProfile,
  type DocumentMemoryUpdatePayload,
} from '@/api/rag';
import './DocumentMemoryPanel.scss';

interface DocumentMemoryPanelProps {
  documentId?: string;
  documentVersion?: number;
}

const emptyDraft = (): DocumentMemoryUpdatePayload => ({
  expected_memory_version: 0,
  glossary: [],
  style_tags: [],
  global_settings: [],
});

export default function DocumentMemoryPanel({
  documentId,
  documentVersion,
}: DocumentMemoryPanelProps) {
  const [profile, setProfile] = useState<DocumentMemoryProfile | null>(null);
  const [draft, setDraft] = useState<DocumentMemoryUpdatePayload>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const adoptProfile = useCallback((next: DocumentMemoryProfile) => {
    setProfile(next);
    setDraft({
      expected_memory_version: next.memory_version,
      glossary: next.glossary.map(({ id, term, definition, aliases }) => ({ id, term, definition, aliases })),
      style_tags: next.style_tags.map(({ id, label, instruction }) => ({ id, label, instruction })),
      global_settings: next.global_settings.map(({ id, key, value }) => ({ id, key, value })),
    });
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!documentId) return;
    if (!quiet) setLoading(true);
    try {
      adoptProfile(await getDocumentMemory(documentId));
    } catch (error) {
      if (!quiet) message.error(error instanceof Error ? error.message : '读取文档记忆失败');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [adoptProfile, documentId]);

  useEffect(() => {
    setProfile(null);
    setDraft(emptyDraft());
    void load();
  }, [load]);

  useEffect(() => {
    if (!documentId || !profile || !['pending', 'extracting'].includes(profile.status)) return;
    const timer = window.setTimeout(() => void load(true), 2000);
    return () => window.clearTimeout(timer);
  }, [documentId, load, profile]);

  const metaById = useMemo(() => new Map(
    profile
      ? [...profile.glossary, ...profile.style_tags, ...profile.global_settings]
        .map((item) => [item.id, item] as const)
      : [],
  ), [profile]);

  if (!documentId) {
    return (
      <div className="document-memory document-memory--empty">
        <Empty
          image={<BookKey size={40} strokeWidth={1.5} />}
          description="保存为知识文档后，才会建立长期记忆"
        />
      </div>
    );
  }

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      adoptProfile(await updateDocumentMemory(documentId, draft));
      message.success('文档记忆已保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败，请重新加载后再试');
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    setSaving(true);
    try {
      const result = await refreshDocumentMemory(documentId);
      adoptProfile(result.memory);
      message.success('已加入长期记忆提取队列');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '刷新失败');
    } finally {
      setSaving(false);
    }
  };

  const stale = Boolean(
    profile && documentVersion && profile.source_document_version !== documentVersion,
  );

  return (
    <Spin spinning={loading}>
      <div className="document-memory">
        <div className="document-memory__hero">
          <div>
            <span className="document-memory__eyebrow"><Sparkles size={13} /> DOCUMENT MEMORY</span>
            <h3>这篇文档如何思考与表达</h3>
            <p>AI 会沿用这里的术语、文风和设定；你做的修改会被锁定，不会被自动提取覆盖。</p>
          </div>
          <div className="document-memory__status">
            <Tag color={statusColor(profile?.status)}>{statusText(profile?.status)}</Tag>
            {profile && <span>记忆 v{profile.memory_version} · 来源 v{profile.source_document_version || '—'}</span>}
          </div>
        </div>

        {(stale || profile?.status === 'failed') && (
          <div className="document-memory__notice">
            <AlertTriangle size={16} />
            <span>{profile?.status === 'failed' ? profile.last_error || '自动提取失败，可重新刷新' : '正文版本已变化，旧记忆暂不会注入 AI 上下文'}</span>
          </div>
        )}

        <MemorySection
          title="核心术语"
          description="项目专有名词、缩写与固定解释"
          count={`${draft.glossary.length}/30`}
          onAdd={() => setDraft((value) => ({ ...value, glossary: [...value.glossary, { term: '', definition: '', aliases: [] }] }))}
        >
          {draft.glossary.map((item, index) => (
            <MemoryCard
              key={item.id || `glossary-${index}`}
              meta={item.id ? metaById.get(item.id) : undefined}
              onDelete={() => setDraft((value) => ({ ...value, glossary: value.glossary.filter((_, current) => current !== index) }))}
            >
              <Input value={item.term} placeholder="术语" onChange={(event) => setDraftItem(setDraft, 'glossary', index, { term: event.target.value })} />
              <Input.TextArea value={item.definition} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="简洁、稳定的定义" onChange={(event) => setDraftItem(setDraft, 'glossary', index, { definition: event.target.value })} />
              <Input value={item.aliases.join('、')} placeholder="别名，用顿号分隔" onChange={(event) => setDraftItem(setDraft, 'glossary', index, { aliases: event.target.value.split(/[、,，]/u).map((value) => value.trim()).filter(Boolean) })} />
            </MemoryCard>
          ))}
        </MemorySection>

        <MemorySection
          title="写作风格"
          description="语气、结构和表达习惯"
          count={`${draft.style_tags.length}/8`}
          onAdd={() => setDraft((value) => ({ ...value, style_tags: [...value.style_tags, { label: '', instruction: '' }] }))}
        >
          {draft.style_tags.map((item, index) => (
            <MemoryCard
              key={item.id || `style-${index}`}
              meta={item.id ? metaById.get(item.id) : undefined}
              onDelete={() => setDraft((value) => ({ ...value, style_tags: value.style_tags.filter((_, current) => current !== index) }))}
            >
              <Input value={item.label} placeholder="例如：技术叙事" onChange={(event) => setDraftItem(setDraft, 'style_tags', index, { label: event.target.value })} />
              <Input.TextArea value={item.instruction} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="告诉 AI 应当如何表达" onChange={(event) => setDraftItem(setDraft, 'style_tags', index, { instruction: event.target.value })} />
            </MemoryCard>
          ))}
        </MemorySection>

        <MemorySection
          title="全局设定"
          description="人物、口径、命名和长期约束"
          count={`${draft.global_settings.length}/20`}
          onAdd={() => setDraft((value) => ({ ...value, global_settings: [...value.global_settings, { key: '', value: '' }] }))}
        >
          {draft.global_settings.map((item, index) => (
            <MemoryCard
              key={item.id || `setting-${index}`}
              meta={item.id ? metaById.get(item.id) : undefined}
              onDelete={() => setDraft((value) => ({ ...value, global_settings: value.global_settings.filter((_, current) => current !== index) }))}
            >
              <Input value={item.key} placeholder="设定名称" onChange={(event) => setDraftItem(setDraft, 'global_settings', index, { key: event.target.value })} />
              <Input.TextArea value={item.value} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="在整篇文档中保持一致的内容" onChange={(event) => setDraftItem(setDraft, 'global_settings', index, { value: event.target.value })} />
            </MemoryCard>
          ))}
        </MemorySection>

        <div className="document-memory__actions">
          <Button icon={<RefreshCw size={15} />} onClick={refresh} loading={saving}>重新提取</Button>
          <Button type="primary" icon={<Save size={15} />} onClick={save} loading={saving} disabled={!profile || ['pending', 'extracting'].includes(profile.status)}>保存修改</Button>
        </div>
      </div>
    </Spin>
  );
}

function MemorySection({ title, description, count, onAdd, children }: {
  title: string; description: string; count: string; onAdd: () => void; children: React.ReactNode;
}) {
  return (
    <section className="memory-section">
      <header>
        <div><strong>{title}</strong><span>{description}</span></div>
        <div><small>{count}</small><Button type="text" size="small" icon={<Plus size={15} />} onClick={onAdd}>添加</Button></div>
      </header>
      <div className="memory-section__items">{children}</div>
    </section>
  );
}

function MemoryCard({ meta, onDelete, children }: {
  meta?: { confidence: number; origin: 'auto' | 'user'; pinned: boolean; evidence: Array<{ snippet: string }> };
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className="memory-card">
      <div className="memory-card__meta">
        <span>{meta?.origin === 'user' ? '人工确认' : meta ? `AI ${(meta.confidence * 100).toFixed(0)}%` : '新记忆'}</span>
        {meta?.evidence[0]?.snippet && <Tooltip title={meta.evidence[0].snippet}><button type="button">查看依据</button></Tooltip>}
        <Button type="text" danger size="small" icon={<Trash2 size={14} />} onClick={onDelete} aria-label="删除记忆" />
      </div>
      {children}
    </article>
  );
}

function setDraftItem<K extends 'glossary' | 'style_tags' | 'global_settings'>(
  setDraft: React.Dispatch<React.SetStateAction<DocumentMemoryUpdatePayload>>,
  key: K,
  index: number,
  patch: Partial<DocumentMemoryUpdatePayload[K][number]>,
) {
  setDraft((value) => ({
    ...value,
    [key]: value[key].map((item, current) => current === index ? { ...item, ...patch } : item),
  }));
}

function statusText(status?: DocumentMemoryProfile['status']) {
  return { pending: '等待提取', extracting: '正在学习', ready: '记忆就绪', failed: '提取失败' }[status || 'pending'];
}

function statusColor(status?: DocumentMemoryProfile['status']) {
  return { pending: 'default', extracting: 'processing', ready: 'success', failed: 'error' }[status || 'pending'];
}
