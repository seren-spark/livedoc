import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Input,
  Modal,
  Popover,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Upload,
  message,
} from 'antd';
import {
  ArrowDownToLine,
  Check,
  FilePlus2,
  ListChecks,
  Paperclip,
  Send,
  Square,
  X,
  Plus,
  LocateFixed,
  BookOpen,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import type { Editor } from '@tiptap/core';
import AgentMarkdown from './AgentMarkdown';
import AgentPlanEditor from './AgentPlanEditor';
import AgentWiki from './AgentWiki';
import { useAgentPanelSize } from './useAgentPanelSize';
import { useNavigate } from 'react-router-dom';
import {
  agentCapabilities,
  agentFeedback,
  streamDocumentAgent,
  type AgentCapabilities,
} from '@/api/document-agent';
import type {
  AgentCitation,
  AgentMode,
  AgentResult,
  DocumentIdentity,
  ExecutionPlan,
  OutputTarget,
  ReferenceInput,
} from '@/api/document-agent.types';
import {
  createKnowledgeDocument,
  getKnowledgeDocument,
  getDocumentImport,
  listKnowledgeDocuments,
  retryDocumentImport,
  uploadDocumentImport,
  type DocumentRecord,
  type KnowledgeScope,
} from '@/api/rag';
import {
  getTemplates,
  getCategoryTree,
  categoryMutation,
  type NoteTemplate,
} from '@/api/workspace';
import {
  applySuggestions,
  captureSnapshot,
  currentTracked,
  documentKey,
  mapSnapshot,
  registerAgentSuggestions,
  setTracked,
  trackEdits,
  type LocalSnapshot,
  type TrackedEdit,
} from '@/lib/document-agent-editor';
import { locateCitationRange } from '@/lib/citation-location';
import './DocumentAgentPanel.scss';
import './RagChatPanel.scss';
import { useAuth } from '@/contexts/authContext';

interface Props {
  editor: Editor | null;
  title: string;
  identity: DocumentIdentity;
  open: boolean;
  onClose: () => void;
  onRequireLogin: (callback: () => void) => void;
}
interface Attachment {
  reference: ReferenceInput;
  status: 'ready' | 'parsing' | 'failed';
  progress?: number;
  error?: string;
}
interface Turn {
  id: string;
  query: string;
  mode: AgentMode;
  target: OutputTarget;
  status: string;
  runId?: string;
  route?: string;
  steps: Record<string, { description: string; status: string }>;
  preview: string;
  result?: AgentResult;
  citations: AgentCitation[];
  readCitations: AgentCitation[];
  error?: string;
  reflection?: string;
  createdId?: string;
  documentRejected?: boolean;
  wikiAvailable?: boolean;
}
const uid = () => crypto.randomUUID();
const labels: Record<string, string> = {
  routing: '理解需求',
  planning: '整理计划',
  executing: '执行中',
  reflecting: '检查内容',
  awaiting_review: '等待采纳',
  completed: '已完成',
  needs_input: '需要补充',
  stopped: '已停止',
  failed: '失败',
};
export default function DocumentAgentPanel({
  editor,
  title,
  identity,
  open,
  onClose,
  onRequireLogin,
}: Props) {
  const { isLoggedIn } = useAuth();
  const panelSize = useAgentPanelSize();
  const navigate = useNavigate();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<AgentMode>('agent');
  const [target, setTarget] = useState<OutputTarget>('current_document');
  const [thinking, setThinking] = useState(false);
  const [web, setWeb] = useState(false);
  const [scope, setScope] = useState<'none' | 'private' | 'public' | 'team'>(
    'none',
  );
  const [template, setTemplate] = useState<string>();
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [docSearch, setDocSearch] = useState('');
  const reportedConflicts = useRef(new Set<string>());
  const [capabilities, setCapabilities] = useState<AgentCapabilities>();
  const [capabilityError, setCapabilityError] = useState('');
  const [tracked, setTrackedState] = useState<TrackedEdit[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string>();
  const controller = useRef<AbortController | null>(null);
  const conversation = useRef(uid());
  const snapshot = useRef<LocalSnapshot | null>(null);
  const revision = useRef(0);
  const activeTurn = useRef<string | null>(null);
  const generation = useRef(0);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const scroll = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const key = documentKey(identity);
  const update = (id: string, patch: Partial<Turn>) =>
    setTurns((items) =>
      items.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!editor) return;
    const unregister = registerAgentSuggestions(editor, setTrackedState);
    const transaction = ({ transaction: tr }: any) => {
      if (tr.docChanged) {
        revision.current++;
        if (snapshot.current) mapSnapshot(snapshot.current, tr);
      }
    };
    editor.on('transaction', transaction);
    return () => {
      editor.off('transaction', transaction);
      unregister();
    };
  }, [editor]);
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    activeTurn.current = null;
    setBusy(false);
    setTurns([]);
    setAttachments([]);
    conversation.current = uid();
    snapshot.current = null;
    if (editor && !editor.isDestroyed) setTracked(editor, []);
  }, [key, editor]);
  useEffect(() => {
    if (!open || !sessionStorage.getItem('token')) return;
    let live = true;
    Promise.allSettled([agentCapabilities(), getTemplates()]).then(
      (results) => {
        if (!live) return;
        if (results[0].status === 'fulfilled') {
          setCapabilities(results[0].value);
          setCapabilityError('');
        } else setCapabilityError('无法加载助手能力，请确认后端服务与登录状态');
        if (results[1].status === 'fulfilled') setTemplates(results[1].value);
      },
    );
    return () => {
      live = false;
    };
  }, [open, isLoggedIn]);
  useEffect(() => {
    if (!open || !isLoggedIn) return;
    let live = true;
    const timer = setTimeout(
      () =>
        void listKnowledgeDocuments({
          page: 1,
          page_size: 100,
          q: docSearch || undefined,
        })
          .then((data) => {
            if (live) setDocs(data.items);
          })
          .catch(() => message.warning('知识文档搜索失败')),
      250,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [docSearch, open, isLoggedIn]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [turns]);
  const parsingIds = attachments
    .filter((a) => a.status === 'parsing')
    .map((a) => a.reference.import_id)
    .filter(Boolean)
    .join(',');
  useEffect(() => {
    if (!parsingIds) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const results = await Promise.allSettled(
        parsingIds.split(',').map((id) => getDocumentImport(id)),
      );
      if (!live) return;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const id = parsingIds.split(',')[i];
        if (result.status === 'fulfilled') {
          const record = result.value;
          setAttachments((items) =>
            items.map((a) =>
              a.reference.import_id === id
                ? {
                    ...a,
                    status: ['review_ready', 'confirmed'].includes(
                      record.status,
                    )
                      ? 'ready'
                      : ['failed', 'canceled'].includes(record.status)
                        ? 'failed'
                        : 'parsing',
                    progress: record.progress,
                    error: record.error ?? undefined,
                  }
                : a,
            ),
          );
        } else
          setAttachments((items) =>
            items.map((a) =>
              a.reference.import_id === id
                ? { ...a, status: 'failed', error: '解析状态读取失败，可重试' }
                : a,
            ),
          );
      }
      if (live) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [parsingIds]);
  const pending =
    tracked.some((t) => t.status === 'pending' || t.status === 'conflict') ||
    turns.some(
      (t) =>
        t.result?.kind === 'document' &&
        !t.createdId &&
        !t.documentRejected &&
        t.status === 'awaiting_review',
    );
  const feedback = (
    turn: Turn,
    action: string,
    editId?: string,
    docId?: string,
  ) => {
    if (turn.runId)
      void agentFeedback(turn.runId, action, editId, docId)
        .then((result) => {
          if (mounted.current)
            setTurns((items) =>
              items.map((item) =>
                item.id === turn.id && item.status !== 'completed'
                  ? { ...item, status: result.status }
                  : item,
              ),
            );
        })
        .catch(() => message.warning('操作已完成，但采纳记录上报失败'));
  };
  useEffect(() => {
    const turn = turns.find((t) => t.id === activeTurn.current);
    if (!turn?.runId) return;
    for (const item of tracked)
      if (item.status === 'conflict') {
        const key = `${turn.runId}:${item.edit.id}`;
        if (reportedConflicts.current.has(key)) continue;
        reportedConflicts.current.add(key);
        feedback(turn, 'conflict', item.edit.id);
      }
  }, [tracked, turns]);
  const discard = () => {
    const last = turns.find((t) => t.id === activeTurn.current);
    if (last) {
      if (last.result?.kind === 'document') {
        update(last.id, { documentRejected: true, status: 'completed' });
        feedback(last, 'discarded');
      }
      for (const item of currentTracked(editor!))
        if (['pending', 'conflict'].includes(item.status))
          feedback(last, 'rejected', item.edit.id);
    }
    if (editor) setTracked(editor, []);
  };
  const start = async (
    text: string,
    nextMode = mode,
    confirmedPlan?: ExecutionPlan,
  ) => {
    if (!editor || busy || !text.trim()) return;
    if (!sessionStorage.getItem('token')) {
      onRequireLogin(() => void start(text, nextMode, confirmedPlan));
      return;
    }
    if (attachments.some((a) => a.status !== 'ready')) {
      message.warning('请等待资料解析完成，或移除失败附件');
      return;
    }
    if (pending) {
      Modal.confirm({
        title: '先处理当前候选',
        content: '继续会放弃当前未采纳的建议和文稿，已经采纳的正文保留。',
        okText: '放弃候选并继续',
        cancelText: '保留并先处理',
        onOk: () => {
          discard();
          void execute(text, nextMode, confirmedPlan);
        },
      });
      return;
    }
    await execute(text, nextMode, confirmedPlan);
  };
  const execute = async (
    text: string,
    nextMode: AgentMode,
    confirmedPlan?: ExecutionPlan,
  ) => {
    if (!editor) return;
    const token = ++generation.current;
    const local = captureSnapshot(
      editor,
      identityRef.current,
      title,
      revision.current,
    );
    snapshot.current = local;
    setTracked(editor, []);
    const id = uid();
    activeTurn.current = id;
    const frozenTarget = target;
    setTurns((items) => [
      ...items,
      {
        id,
        query: text,
        mode: nextMode,
        target: frozenTarget,
        status: 'routing',
        steps: {},
        preview: '',
        citations: [],
        readCitations: [],
      },
    ]);
    setQuery('');
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    const knowledgeScope: KnowledgeScope | undefined =
      scope === 'none'
        ? undefined
        : {
            private: scope === 'private',
            public: scope === 'public',
            team: scope === 'team',
            document_ids: attachments
              .filter((a) => a.reference.kind === 'document')
              .map((a) => a.reference.doc_id!),
          };
    try {
      await streamDocumentAgent(
        {
          request_id: uid(),
          conversation_id: conversation.current,
          mode: nextMode,
          output_target: frozenTarget,
          query: text,
          deep_thinking: thinking,
          allow_web: web,
          editor_snapshot: local.wire,
          references: attachments.map((a) => a.reference),
          knowledge_scope: knowledgeScope,
          template_id: template,
          confirmed_plan: confirmedPlan,
        },
        (event) => {
          if (
            !mounted.current ||
            token !== generation.current ||
            documentKey(identityRef.current) !== local.docKey
          )
            return;
          const d = event.data;
          setTurns((items) =>
            items.map((turn) => {
              if (turn.id !== id) return turn;
              let patch: Partial<Turn> = { runId: d.run_id };
              if (event.event === 'route')
                patch = {
                  ...patch,
                  route: d.strategy === 'react' ? '直接执行' : '分步执行',
                  status: 'executing',
                };
              if (event.event === 'step')
                patch = {
                  ...patch,
                  steps: {
                    ...turn.steps,
                    [d.id ?? 'plan']: {
                      description: d.description,
                      status: d.status,
                    },
                  },
                  status: 'executing',
                };
              if (event.event === 'tool_start')
                patch = {
                  ...patch,
                  steps: {
                    ...turn.steps,
                    [d.call_id]: {
                      description: toolLabel(d.name),
                      status: 'running',
                    },
                  },
                };
              if (event.event === 'tool_result')
                patch = {
                  ...patch,
                  steps: {
                    ...turn.steps,
                    [d.call_id]: {
                      description: toolLabel(d.name),
                      status: d.status === 'success' ? 'done' : 'failed',
                    },
                  },
                  readCitations: d.citations ?? turn.readCitations,
                };
              if (event.event === 'delta')
                patch = { ...patch, preview: turn.preview + d.text };
              if (event.event === 'reflection')
                patch = {
                  ...patch,
                  status: 'reflecting',
                  reflection: (
                    {
                      checking: '正在检查',
                      repairing: '正在修正',
                      passed: '自检通过',
                      revised: '已修正',
                      incomplete: '自检未完成',
                    } as any
                  )[d.status],
                };
              if (event.event === 'result')
                patch = {
                  ...patch,
                  result: d.result,
                  citations: d.citations ?? [],
                  wikiAvailable: Boolean(d.wiki_available),
                };
              if (event.event === 'error')
                patch = {
                  ...patch,
                  error: d.message,
                  status: 'failed',
                  result: undefined,
                };
              if (event.event === 'done')
                patch = { ...patch, status: d.status };
              return { ...turn, ...patch };
            }),
          );
          if (event.event === 'result' && d.result.kind === 'edits') {
            try {
              trackEdits(editor, local, d.result.edits);
            } catch (error: any) {
              update(id, {
                status: 'failed',
                error: error.message,
                result: undefined,
              });
            }
          }
        },
        abort.signal,
      );
    } catch (error: any) {
      if (token === generation.current && mounted.current)
        update(id, {
          status: error.name === 'AbortError' ? 'stopped' : 'failed',
          error: error.name === 'AbortError' ? undefined : error.message,
          result: undefined,
        });
    } finally {
      if (token === generation.current && mounted.current) {
        controller.current = null;
        setBusy(false);
      }
    }
  };
  const apply = (turn: Turn, ids: string[]) => {
    if (!editor || !snapshot.current) return;
    try {
      applySuggestions(editor, ids, identityRef.current, snapshot.current);
      ids.forEach((id) => feedback(turn, 'accepted', id));
      message.success('修改已应用，保存状态见编辑器顶部');
    } catch (error: any) {
      message.error(error.message);
    }
  };
  const reject = (turn: Turn, ids: string[]) => {
    if (!editor) return;
    setTracked(
      editor,
      currentTracked(editor).map((e) =>
        ids.includes(e.edit.id) ? { ...e, status: 'rejected' } : e,
      ),
    );
    ids.forEach((id) => feedback(turn, 'rejected', id));
  };
  const saveDocument = async (turn: Turn) => {
    if (turn.result?.kind !== 'document' || saving) return;
    setSaving(turn.id);
    const result = turn.result;
    try {
      let doc: DocumentRecord | undefined;
      try {
        doc = await getKnowledgeDocument(result.document_id);
      } catch (error: any) {
        if (error.response?.status !== 404) throw error;
      }
      if (!doc)
        doc = await createKnowledgeDocument({
          doc_id: result.document_id,
          title: result.title,
          content: documentMarkdown(result, turn.citations),
          editor_content: editor?.schema
            .nodeFromJSON(
              editor.markdown.parse(documentMarkdown(result, turn.citations)),
            )
            .toJSON(),
          visibility: 'private',
          source_type: 'draft',
          index_now: false,
        });
      if (result.category_id) {
        try {
          const tree = await getCategoryTree();
          await categoryMutation('/assign', {
            ids: [doc.doc_id],
            category_id: result.category_id,
            expected_tree_revision: tree.revision,
          });
        } catch {
          message.warning('文稿已保存，分类分配失败，可在知识库重新移动');
        }
      }
      setDocs((items) => [
        doc!,
        ...items.filter((item) => item.doc_id !== doc!.doc_id),
      ]);
      update(turn.id, { createdId: doc.doc_id, status: 'completed' });
      feedback(turn, 'created', undefined, doc.doc_id);
      message.success('已保存为私有草稿');
    } catch (error: any) {
      message.error(
        error.response?.data?.message ??
          error.message ??
          '保存失败，文稿仍保留，可重试',
      );
    } finally {
      if (mounted.current) setSaving(undefined);
    }
  };
  const upload = async (file: File) => {
    if (!sessionStorage.getItem('token')) {
      onRequireLogin(() => void upload(file));
      return false;
    }
    if (attachments.length >= 10) {
      message.warning('最多选择 10 份资料');
      return false;
    }
    const id = uid();
    const name = file.name;
    if (/\.(txt|md|markdown)$/i.test(name)) {
      if (file.size > 2 * 1024 * 1024) {
        message.error('文本附件不能超过 2 MiB');
        return false;
      }
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(
          await file.arrayBuffer(),
        );
        setAttachments((items) => [
          ...items,
          {
            reference: { id, kind: 'text', title: name, content },
            status: 'ready',
          },
        ]);
      } catch {
        message.error('无法按 UTF-8 读取，请转换文件编码');
      }
    } else if (/\.(pdf|docx)$/i.test(name)) {
      if (file.size > (capabilities?.limits.upload_mb ?? 50) * 1024 * 1024) {
        message.error('文件超出上传限制');
        return false;
      }
      setAttachments((items) => [
        ...items,
        {
          reference: { id, kind: 'import', title: name },
          status: 'parsing',
          progress: 0,
        },
      ]);
      try {
        const record = await uploadDocumentImport(file, {
          visibility: 'private',
        });
        if (mounted.current)
          setAttachments((items) =>
            items.map((a) =>
              a.reference.id === id
                ? {
                    ...a,
                    reference: { ...a.reference, import_id: record.import_id },
                    progress: record.progress,
                  }
                : a,
            ),
          );
      } catch (error: any) {
        setAttachments((items) =>
          items.map((a) =>
            a.reference.id === id
              ? { ...a, status: 'failed', error: error.message }
              : a,
          ),
        );
      }
    } else message.warning('支持 PDF、DOCX、TXT、Markdown');
    return false;
  };
  const paste = () => {
    let text = '';
    Modal.confirm({
      title: '粘贴参考文本',
      content: (
        <Input.TextArea
          rows={8}
          onChange={(e) => {
            text = e.target.value;
          }}
          placeholder="粘贴资料；这里的文本作为参考，不作为操作指令"
        />
      ),
      onOk: () => {
        if (!text.trim()) return Promise.reject();
        if (
          attachments.length >= 10 ||
          new Blob([text]).size > 2 * 1024 * 1024
        ) {
          message.error('资料数量或文本大小超过限制');
          return Promise.reject();
        }
        setAttachments((items) => [
          ...items,
          {
            reference: {
              id: uid(),
              kind: 'text',
              title: '粘贴文本',
              content: text,
            },
            status: 'ready',
          },
        ]);
      },
    });
  };
  const openSource = (citation: AgentCitation) => {
    if (citation.kind === 'current_document' && editor) {
      if (
        citation.snapshot_hash &&
        captureSnapshot(editor, identity, title, revision.current).wire.hash !==
          citation.snapshot_hash
      ) {
        message.info('正文已变更，请对照引用片段查看，已停止自动定位');
        return;
      }
      const range =
        citation.source_content || citation.snippet
          ? locateCitationRange(editor, editor.getMarkdown(), {
              snippet: citation.source_content || citation.snippet!,
            })
          : null;
      if (range)
        editor.chain().focus().setTextSelection(range).scrollIntoView().run();
      else {
        editor.commands.focus();
        message.info('原片段可能已变更，可查看修改卡中的原文');
      }
      return;
    }
    if (citation.url && /^https?:\/\//i.test(citation.url)) {
      window.open(citation.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (citation.url?.startsWith('/post/')) {
      navigate(citation.url);
      onClose();
      return;
    }
    const preview = (text: string, changed = false) =>
      Modal.info({
        title: citation.title,
        width: 800,
        content: (
          <div className="agent-reference-preview">
            {changed && (
              <Alert type="warning" message="资料已更新，当前展示最新正文" />
            )}
            {citation.snippet && <blockquote>{citation.snippet}</blockquote>}
            {text.length > 40000 && (
              <p>展示前 4 万字符，完整正文可从知识库打开。</p>
            )}
            <AgentMarkdown>{text.slice(0, 40000)}</AgentMarkdown>
          </div>
        ),
      });
    if (citation.doc_id)
      void getKnowledgeDocument(citation.doc_id)
        .then((doc) => {
          if (
            citation.version === undefined ||
            doc.document_version !== citation.version
          ) {
            preview(doc.content, citation.version !== undefined);
            return;
          }
          const focusKey = `livedoc-citation-${uid()}`;
          sessionStorage.setItem(
            focusKey,
            JSON.stringify({
              citation_id: citation.id,
              document_version: citation.version,
              snippet: citation.source_content || citation.snippet || '',
              source_anchor: citation.source_anchor,
              start_offset: citation.start_offset,
              end_offset: citation.end_offset,
            }),
          );
          navigate(
            `/editor/draft?mode=knowledge&docId=${encodeURIComponent(citation.doc_id!)}&focusCitation=${encodeURIComponent(focusKey)}`,
          );
          onClose();
        })
        .catch(() => message.error('资料不存在或已被回收'));
    else if (citation.import_id)
      void getDocumentImport(citation.import_id)
        .then((record) => preview(record.parsed_content))
        .catch(() => message.error('导入资料不可访问'));
    else {
      const text = attachments.find(
        (a) =>
          a.reference.id === citation.reference_id ||
          `ref-${a.reference.id}` === citation.id,
      )?.reference.content;
      Modal.info({
        title: citation.title,
        content: (
          <pre className="agent-reference-preview">
            {text || citation.source_content || citation.snippet}
          </pre>
        ),
        width: 700,
      });
    }
  };
  const showCitation = (citation: AgentCitation) => {
    const modal = Modal.info({
      title: citation.title,
      width: 720,
      content: (
        <div className="agent-reference-preview">
          {citation.version !== undefined && (
            <Tag>文档 v{citation.version}</Tag>
          )}
          {citation.evidence_kind === 'search_summary' && (
            <Alert
              type="info"
              message={
                citation.source_content
                  ? '此片段来自搜索结果，尚未读取网页全文。'
                  : '此来源来自搜索结果，尚未读取网页原文。'
              }
            />
          )}
          {citation.evidence_kind === 'tool_output' && (
            <Alert
              type="info"
              message="工具返回了此链接，尚未提供该网页的独立原文片段。"
            />
          )}
          <blockquote>
            {citation.source_content ||
              citation.snippet ||
              '此来源暂无独立原文片段。'}
          </blockquote>
          <Button
            onClick={() => {
              modal.destroy();
              openSource(citation);
            }}
          >
            查看原文
          </Button>
        </div>
      ),
    });
  };
  const newConversation = () => {
    const reset = () => {
      generation.current++;
      controller.current?.abort();
      setBusy(false);
      discard();
      setTurns([]);
      setAttachments([]);
      snapshot.current = null;
      activeTurn.current = null;
      conversation.current = uid();
    };
    if (pending)
      Modal.confirm({
        title: '新建对话',
        content: '放弃未采纳候选，已应用正文保留。',
        onOk: reset,
      });
    else reset();
  };
  const { isNarrow } = panelSize;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement={isNarrow ? 'bottom' : 'right'}
      width={isNarrow ? '100%' : panelSize.width}
      height={isNarrow ? '100%' : undefined}
      mask={false}
      rootClassName={`rag-chat-drawer agent-drawer ${panelSize.resizing ? 'is-resizing' : ''}`}
      styles={{ body: { padding: 0 }, header: { display: 'none' } }}
      destroyOnHidden={false}
    >
      {!isNarrow && (
        <div className="agent-resize-handle" {...panelSize.handleProps} />
      )}
      <section className="document-agent" aria-label="文档助手">
        <header>
          <div className="agent-brand">
            <span>
              <Sparkles size={18} />
            </span>
            <div>
              <strong>文档助手</strong>
              <small>理解资料 · 规划 · 编写</small>
            </div>
          </div>
          <Space>
            <AgentWiki authorized={isLoggedIn} disabled={busy} />
            <Tooltip title="新对话">
              <Button
                type="text"
                aria-label="新对话"
                icon={<Plus size={17} />}
                onClick={newConversation}
              />
            </Tooltip>
            <Button
              type="text"
              aria-label="关闭"
              icon={<X size={17} />}
              onClick={onClose}
            />
          </Space>
        </header>
        <div className="agent-conversation" ref={scroll}>
          {capabilities?.preview && (
            <Alert
              type="warning"
              showIcon
              message="界面测试预览"
              description="此服务使用固定示例响应，不会按你的问题调用真实模型。请勿将测试结果作为正式文稿保存。"
            />
          )}
          {capabilityError && (
            <Alert type="warning" message={capabilityError} />
          )}
          {!turns.length && (
            <div className="agent-empty">
              <BookOpen size={32} />
              <h3>从一个想法，写成一份文档</h3>
              <p>
                描述需求，添加资料，或选中正文。
                <br />
                每项修改由你决定是否采纳。
              </p>
              {[
                '为当前文档制定修改计划',
                '根据资料编写一篇结构完整的文稿',
                '检查当前文档并提出改进建议',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setQuery(q);
                    if (q.includes('计划')) setMode('plan');
                  }}
                >
                  {q}
                  <span>↗</span>
                </button>
              ))}
            </div>
          )}
          {turns.map((turn) => (
            <article className="agent-turn" key={turn.id}>
              <div className="agent-question">
                {turn.query}
                <small>
                  {turn.mode.toUpperCase()} ·{' '}
                  {turn.target === 'new_document' ? '独立文稿' : '当前文档'}
                </small>
              </div>
              <div className="agent-status">
                <Tag
                  color={
                    turn.status === 'failed'
                      ? 'red'
                      : turn.status === 'awaiting_review'
                        ? 'gold'
                        : 'green'
                  }
                >
                  {labels[turn.status] ?? turn.status}
                </Tag>
                <span>{turn.route}</span>
                {turn.reflection && <span>{turn.reflection}</span>}
              </div>
              {!!Object.keys(turn.steps).length && (
                <details className="agent-steps">
                  <summary>
                    执行步骤 ·{' '}
                    {
                      Object.values(turn.steps).filter(
                        (s) => s.status === 'done',
                      ).length
                    }
                    /{Object.keys(turn.steps).length}
                  </summary>
                  {Object.entries(turn.steps).map(([id, step]) => (
                    <div key={id}>
                      <span className={step.status}>
                        {step.status === 'done'
                          ? '✓'
                          : step.status === 'failed'
                            ? '×'
                            : '◌'}
                      </span>
                      {step.description}
                    </div>
                  ))}
                </details>
              )}
              {turn.error && <Alert type="error" message={turn.error} />}
              {turn.result?.kind === 'plan' && (
                <div className="agent-plan">
                  <h4>{turn.result.plan.goal}</h4>
                  <ol>
                    {turn.result.plan.steps.map((step) => (
                      <li key={step.id}>{step.description}</li>
                    ))}
                  </ol>
                  {!!turn.result.plan.outline.length && (
                    <p>章节：{turn.result.plan.outline.join(' / ')}</p>
                  )}
                  {!!turn.result.plan.constraints.length && (
                    <p>{turn.result.plan.constraints.join('；')}</p>
                  )}
                  <Space>
                    <AgentPlanEditor
                      plan={turn.result.plan}
                      disabled={busy}
                      onSave={(plan) =>
                        update(turn.id, { result: { kind: 'plan', plan } })
                      }
                    />
                    <Button
                      type="primary"
                      icon={<ListChecks size={15} />}
                      disabled={busy}
                      onClick={() => {
                        setMode('agent');
                        void start(
                          turn.query,
                          'agent',
                          (turn.result as any).plan,
                        );
                      }}
                    >
                      按此计划执行
                    </Button>
                    <Button
                      onClick={() => {
                        setMode('plan');
                        setQuery('调整上面的计划：');
                      }}
                    >
                      调整计划
                    </Button>
                  </Space>
                </div>
              )}
              {turn.result?.kind === 'clarification' && (
                <div className="agent-plan">
                  <p>{turn.result.question}</p>
                  <Space wrap>
                    {turn.result.choices.map((choice) => (
                      <Button
                        key={choice}
                        disabled={busy}
                        onClick={() => void start(choice)}
                      >
                        {choice}
                      </Button>
                    ))}
                  </Space>
                </div>
              )}
              {(turn.result?.kind === 'answer' ||
                turn.result?.kind === 'document') && (
                <div className="agent-markdown">
                  <AgentMarkdown
                    citations={turn.citations}
                    onCitationClick={showCitation}
                  >
                    {turn.result.kind === 'answer'
                      ? turn.result.answer
                      : turn.result.markdown}
                  </AgentMarkdown>
                </div>
              )}
              {!turn.result && turn.preview && (
                <div className="agent-markdown">
                  <AgentMarkdown
                    citations={turn.readCitations}
                    onCitationClick={showCitation}
                  >
                    {turn.preview}
                  </AgentMarkdown>
                  {turn.status === 'failed' || turn.status === 'stopped' ? (
                    <small>未完成候选，仅供查看</small>
                  ) : null}
                </div>
              )}
              {turn.result?.kind === 'answer' && (
                <Space wrap>
                  <AgentWiki
                    authorized={isLoggedIn}
                    runId={turn.runId}
                    answer={turn.result.answer}
                    available={
                      turn.wikiAvailable && turn.status === 'completed'
                    }
                    disabled={busy}
                  />
                  <Button
                    type="text"
                    onClick={() => {
                      setMode('agent');
                      setQuery(`基于上面的回答编写文档：${turn.query}`);
                    }}
                  >
                    基于此回答编写
                  </Button>
                </Space>
              )}
              {turn.result?.kind === 'edits' &&
                turn.id === activeTurn.current && (
                  <div className="agent-edits">
                    <Space>
                      <Button
                        type="primary"
                        disabled={
                          !tracked.some((e) => e.status === 'pending') ||
                          tracked.some((e) => e.status === 'conflict')
                        }
                        onClick={() =>
                          apply(
                            turn,
                            tracked
                              .filter((e) => e.status === 'pending')
                              .map((e) => e.edit.id),
                          )
                        }
                      >
                        全部接受
                      </Button>
                      <Button
                        onClick={() =>
                          reject(
                            turn,
                            tracked
                              .filter((e) =>
                                ['pending', 'conflict'].includes(e.status),
                              )
                              .map((e) => e.edit.id),
                          )
                        }
                      >
                        全部拒绝
                      </Button>
                    </Space>
                    {tracked.map((item) => (
                      <div
                        className={`agent-edit ${item.status}`}
                        key={item.edit.id}
                      >
                        <div className="agent-edit-heading">
                          <strong>{item.edit.explanation}</strong>
                          <Tag>
                            {
                              {
                                pending: '待采纳',
                                accepted: '已接受',
                                rejected: '已拒绝',
                                conflict: '目标已变更',
                              }[item.status]
                            }
                          </Tag>
                        </div>
                        <div className="agent-before">
                          原文：{item.before.slice(0, 1200)}
                        </div>
                        {item.edit.operation !== 'delete' && (
                          <div className="agent-after">
                            <AgentMarkdown
                              citations={turn.citations}
                              onCitationClick={showCitation}
                            >
                              {item.edit.content_markdown}
                            </AgentMarkdown>
                          </div>
                        )}
                        <Space>
                          <Button
                            size="small"
                            icon={<LocateFixed size={13} />}
                            onClick={() =>
                              editor
                                ?.chain()
                                .focus()
                                .setTextSelection({
                                  from: item.from,
                                  to: item.to,
                                })
                                .scrollIntoView()
                                .run()
                            }
                          >
                            定位
                          </Button>
                          <Button
                            size="small"
                            icon={<Check size={13} />}
                            disabled={item.status !== 'pending'}
                            onClick={() => apply(turn, [item.edit.id])}
                          >
                            接受
                          </Button>
                          <Button
                            size="small"
                            disabled={
                              !['pending', 'conflict'].includes(item.status)
                            }
                            onClick={() => reject(turn, [item.edit.id])}
                          >
                            拒绝
                          </Button>
                        </Space>
                      </div>
                    ))}
                  </div>
                )}
              {turn.result?.kind === 'document' && (
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<FilePlus2 size={15} />}
                    loading={saving === turn.id}
                    disabled={!!turn.createdId || turn.documentRejected}
                    onClick={() => void saveDocument(turn)}
                  >
                    保存私有草稿
                  </Button>
                  {turn.createdId && (
                    <Button
                      onClick={() =>
                        navigate(
                          `/editor/draft?mode=knowledge&docId=${turn.createdId}`,
                        )
                      }
                    >
                      打开编辑
                    </Button>
                  )}
                  <Button
                    icon={<ArrowDownToLine size={15} />}
                    onClick={() =>
                      downloadMarkdown(
                        (turn.result as any).title,
                        documentMarkdown(turn.result as any, turn.citations),
                      )
                    }
                  >
                    下载 Markdown
                  </Button>
                  {!turn.createdId && !turn.documentRejected && (
                    <Button
                      onClick={() => {
                        update(turn.id, {
                          documentRejected: true,
                          status: 'completed',
                        });
                        feedback(turn, 'discarded');
                      }}
                    >
                      放弃文稿
                    </Button>
                  )}
                </Space>
              )}
              {!!turn.citations.length && (
                <details className="agent-sources">
                  <summary>引用来源 · {turn.citations.length}</summary>
                  {turn.citations.map((c, index) => (
                    <button key={c.id} onClick={() => showCitation(c)}>
                      [{index + 1}] {c.title}
                      {c.version !== undefined ? ` · v${c.version}` : ''}
                    </button>
                  ))}
                </details>
              )}
              {!!turn.readCitations.filter(
                (c) => !turn.citations.some((used) => used.id === c.id),
              ).length && (
                <details className="agent-sources">
                  <summary>
                    {turn.result ? '其他已读取资料' : '已读取资料'} ·{' '}
                    {
                      turn.readCitations.filter(
                        (c) => !turn.citations.some((used) => used.id === c.id),
                      ).length
                    }
                  </summary>
                  {turn.readCitations
                    .filter(
                      (c) => !turn.citations.some((used) => used.id === c.id),
                    )
                    .map((c) => (
                      <button key={c.id} onClick={() => showCitation(c)}>
                        {c.title}
                      </button>
                    ))}
                </details>
              )}
            </article>
          ))}
        </div>
        <footer className="agent-composer">
          {!!attachments.length && (
            <div className="agent-attachments">
              {attachments.map((a) => (
                <div key={a.reference.id}>
                  <Paperclip size={12} />
                  <span>{a.reference.title}</span>
                  <small>
                    {a.status === 'parsing'
                      ? `解析 ${a.progress ?? 0}%`
                      : a.status === 'failed'
                        ? '失败'
                        : '已就绪'}
                  </small>
                  {a.status === 'failed' && a.reference.import_id && (
                    <button
                      onClick={() =>
                        void retryDocumentImport(a.reference.import_id!).then(
                          () =>
                            setAttachments((items) =>
                              items.map((i) =>
                                i.reference.id === a.reference.id
                                  ? { ...i, status: 'parsing' }
                                  : i,
                              ),
                            ),
                        )
                      }
                    >
                      重试
                    </button>
                  )}
                  <button
                    aria-label={`移除 ${a.reference.title}`}
                    onClick={() =>
                      setAttachments((items) =>
                        items.filter((i) => i.reference.id !== a.reference.id),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="agent-input-box">
            <Input.TextArea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoSize={{ minRows: 3, maxRows: 7 }}
              variant="borderless"
              placeholder={
                mode === 'ask'
                  ? '提问，分析当前文档或参考资料…'
                  : mode === 'plan'
                    ? '描述写作目标，先一起整理计划…'
                    : '描述要编写或修改的内容…'
              }
              onPressEnter={(e) => {
                if (!e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void start(query);
                }
              }}
            />
            {template && (
              <div className="agent-selected-template">
                <BookOpen size={12} />
                {templates.find((t) => t.template_id === template)?.name ??
                  '已选模板'}
                <button
                  aria-label="清除写作模板"
                  onClick={() => setTemplate(undefined)}
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="agent-toolbar">
              <div className="agent-mode-controls">
                <Select
                  size="small"
                  variant="borderless"
                  aria-label="工作模式"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'ask', label: 'Ask · 问答' },
                    { value: 'plan', label: 'Plan · 规划' },
                    { value: 'agent', label: 'Agent · 编写' },
                  ]}
                />
                {mode !== 'ask' && (
                  <Select
                    size="small"
                    variant="borderless"
                    aria-label="输出方式"
                    value={target}
                    onChange={setTarget}
                    options={[
                      { value: 'current_document', label: '当前文档' },
                      { value: 'new_document', label: '独立文档' },
                    ]}
                  />
                )}
              </div>
              <div className="agent-tool-actions">
                <Popover
                  trigger="click"
                  placement="topRight"
                  open={templatePickerOpen}
                  onOpenChange={setTemplatePickerOpen}
                  title="写作模板"
                  content={
                    <div className="agent-template-picker">
                      <p>
                        {target === 'current_document' && mode !== 'ask'
                          ? '选择后按模板重组当前文档，修改仍需你采纳。'
                          : '选择一份模板，作为文稿结构与写作要求。'}
                      </p>
                      <div className="agent-template-list">
                        <button
                          className={!template ? 'selected' : ''}
                          onClick={() => {
                            setTemplate(undefined);
                            setTemplatePickerOpen(false);
                          }}
                        >
                          <span>自由编写</span>
                          <small>不使用模板</small>
                          {!template && <Check size={14} />}
                        </button>
                        {templates.map((t) => (
                          <button
                            key={t.template_id}
                            className={
                              template === t.template_id ? 'selected' : ''
                            }
                            onClick={() => {
                              setTemplate(t.template_id);
                              setTemplatePickerOpen(false);
                            }}
                          >
                            <span>{t.name}</span>
                            <small>
                              {t.description || '使用此模板的文档结构'}
                            </small>
                            {template === t.template_id && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                      {!templates.length && (
                        <small>登录后可选择内置及个人模板。</small>
                      )}
                    </div>
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    aria-label="写作模板"
                    title="写作模板"
                    className={template ? 'is-active' : ''}
                    icon={<BookOpen size={16} />}
                  />
                </Popover>
                <Popover
                  trigger="click"
                  placement="topRight"
                  title="添加资料"
                  content={
                    <div className="agent-add-material">
                      <Upload
                        accept=".pdf,.docx,.txt,.md,.markdown"
                        showUploadList={false}
                        beforeUpload={(file) => upload(file)}
                      >
                        <Button
                          type="text"
                          icon={<Paperclip size={15} />}
                          disabled={busy || attachments.length >= 10}
                        >
                          上传资料
                        </Button>
                      </Upload>
                      <Button
                        type="text"
                        onClick={paste}
                        disabled={busy || attachments.length >= 10}
                      >
                        粘贴文本
                      </Button>
                      <Select
                        aria-label="添加知识文档"
                        value={undefined}
                        placeholder="搜索知识库文档"
                        showSearch
                        filterOption={false}
                        onSearch={setDocSearch}
                        disabled={attachments.length >= 10}
                        options={docs
                          .filter(
                            (d) =>
                              !attachments.some(
                                (a) => a.reference.doc_id === d.doc_id,
                              ),
                          )
                          .map((d) => ({ value: d.doc_id, label: d.title }))}
                        onChange={(id) => {
                          const d = docs.find((d) => d.doc_id === id)!;
                          setAttachments((items) => [
                            ...items,
                            {
                              reference: {
                                id: uid(),
                                kind: 'document',
                                title: d.title,
                                doc_id: d.doc_id,
                              },
                              status: 'ready',
                            },
                          ]);
                        }}
                      />
                    </div>
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    aria-label="添加资料"
                    title="添加资料"
                    icon={<Plus size={17} />}
                  />
                </Popover>
                <Popover
                  trigger="click"
                  placement="topRight"
                  title="更多设置"
                  content={
                    <div className="agent-settings">
                      <label>知识库范围</label>
                      <Select
                        aria-label="知识库范围"
                        value={scope}
                        onChange={setScope}
                        options={[
                          { value: 'none', label: '仅当前资料' },
                          { value: 'private', label: '我的知识库' },
                          { value: 'public', label: '公开资料' },
                          { value: 'team', label: '团队资料' },
                        ]}
                      />
                      <div>
                        <Tooltip
                          title={
                            capabilities?.thinking_supported
                              ? '主模型使用深度思考'
                              : '当前模型未配置深度思考'
                          }
                        >
                          <label htmlFor="agent-thinking">深度思考</label>
                        </Tooltip>
                        <Switch
                          id="agent-thinking"
                          size="small"
                          checked={thinking}
                          disabled={!capabilities?.thinking_supported}
                          onChange={setThinking}
                        />
                      </div>
                      <div>
                        <label htmlFor="agent-web">联网检索</label>
                        <Switch
                          id="agent-web"
                          size="small"
                          checked={web}
                          disabled={!capabilities?.web_available}
                          onChange={setWeb}
                        />
                      </div>
                    </div>
                  }
                >
                  <Button
                    type="text"
                    size="small"
                    aria-label="更多设置"
                    title="更多设置"
                    className={
                      thinking || web || scope !== 'none' ? 'is-active' : ''
                    }
                    icon={<SlidersHorizontal size={16} />}
                  />
                </Popover>
                {busy ? (
                  <Button
                    size="small"
                    danger
                    aria-label="停止"
                    title="停止"
                    icon={<Square size={13} />}
                    onClick={() => controller.current?.abort()}
                  />
                ) : (
                  <Button
                    size="small"
                    type="primary"
                    aria-label="发送"
                    title="发送"
                    icon={<Send size={15} />}
                    disabled={
                      !query.trim() ||
                      attachments.some((a) => a.status !== 'ready') ||
                      capabilities?.enabled === false
                    }
                    onClick={() => void start(query)}
                  />
                )}
              </div>
            </div>
          </div>
        </footer>
      </section>
    </Drawer>
  );
}
function toolLabel(name: string) {
  return (
    (
      {
        read_current_document: '读取当前正文',
        read_reference: '读取参考资料',
        search_knowledge_base: '检索知识库',
        list_templates: '查找模板',
        read_template: '读取模板',
        list_categories: '读取分类',
        propose_document_edits: '生成修改建议',
        propose_new_document: '编写独立文稿',
        submit_plan: '生成计划',
        finish_answer: '整理结果',
        request_clarification: '确认需求',
      } as any
    )[name] ?? (name?.startsWith('mcp__') ? '读取联网资料' : name)
  );
}
function downloadMarkdown(title: string, markdown: string) {
  const url = URL.createObjectURL(
    new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[<>:"/\\|?*]/g, '_') || '文稿'}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function documentMarkdown(
  result: Extract<AgentResult, { kind: 'document' }>,
  citations: AgentCitation[],
) {
  const sources = citations.filter((c) => result.citation_ids.includes(c.id));
  if (!sources.length) return result.markdown;
  let content = result.markdown;
  const lines = sources.map((c, i) => {
    content = content.replaceAll(`[${c.id}]`, `[${i + 1}]`);
    const url =
      c.url && /^https?:\/\//i.test(c.url)
        ? c.url
        : c.doc_id
          ? `${window.location.origin}/editor/draft?mode=knowledge&docId=${encodeURIComponent(c.doc_id)}`
          : c.import_id
            ? `${window.location.origin}/editor/draft?mode=knowledge&importId=${encodeURIComponent(c.import_id)}`
            : undefined;
    const title = c.title.replaceAll('[', '').replaceAll(']', '');
    return `${i + 1}. ${url ? `[${title}](${url.replace(/[()]/g, (c) => encodeURIComponent(c))})` : title}`;
  });
  return `${content}\n\n## 参考资料\n\n${lines.join('\n')}`;
}
