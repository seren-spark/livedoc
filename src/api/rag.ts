import axios from 'axios';

export const ragBaseURL =
  import.meta.env.VITE_RAG_API_BASE_URL || 'http://127.0.0.1:8000';

const ragClient = axios.create({
  baseURL: ragBaseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

ragClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

export type RetrievalDomain =
  | 'public'
  | 'private'
  | 'team'
  | 'current_document';

export interface KnowledgeScope {
  private?: boolean;
  team?: boolean;
  public?: boolean;
  document_ids?: string[];
}

export interface DocumentIndexPayload {
  doc_id: string;
  space_id: string;
  title: string;
  content: string;
  visibility?: 'private' | 'team' | 'public';
  source_type?: 'article' | 'draft' | 'note' | 'team_doc' | 'public_article';
  tags?: string[];
  team_id?: string | null;
  url?: string | null;
  document_version?: number;
}

export type DocumentCreatePayload = Omit<
  DocumentIndexPayload,
  'doc_id' | 'space_id'
> & {
  doc_id?: string;
  index_now?: boolean;
};

export type DocumentRecord = Required<
  Pick<DocumentIndexPayload, 'doc_id' | 'space_id' | 'title' | 'content'>
> & {
  visibility: 'private' | 'team' | 'public';
  source_type: 'article' | 'draft' | 'note' | 'team_doc' | 'public_article';
  tags: string[];
  team_id?: string | null;
  owner_id?: string | null;
  url?: string | null;
  document_version: number;
  index_status: 'pending' | 'indexing' | 'ready' | 'failed';
  chunk_count: number;
  indexed_at?: string | null;
  index_error?: string | null;
  created_at: string;
  updated_at: string;
};

export interface Citation {
  index: number;
  doc_id: string;
  chunk_id: string;
  title: string;
  content: string;
  source_type: string;
  visibility: string;
  score: number;
  dense_score?: number | null;
  keyword_score?: number | null;
  rerank_score?: number | null;
  url?: string | null;
  heading_path: string[];
  chunk_index?: number | null;
  space_id: string;
  team_id?: string | null;
  document_version: number;
  start_offset?: number | null;
  end_offset?: number | null;
}

export interface KnowledgeSearchPayload {
  query: string;
  scope?: KnowledgeScope;
  top_k?: number;
  mode?: 'dense' | 'keyword' | 'hybrid';
  context?: string;
}

export interface KnowledgeSearchResponse {
  query: string;
  citations: Citation[];
  trace?: RetrievalTrace;
}

export interface EditorContext {
  title: string;
  cursor_before?: string;
  cursor_after?: string;
  selected_text?: string;
  tags?: string[];
}

export interface AiWritePayload {
  intent?:
    | 'knowledge_qa'
    | 'knowledge_search'
    | 'continue_paragraph'
    | 'summarize_document'
    | 'format_selection'
    | 'fill_in_middle'
    | 'correct_text'
    | 'expand_text';
  query: string;
  current_context: EditorContext;
  retrieval_domain: RetrievalDomain;
  current_document?: {
    title: string;
    content: string;
  };
  conversation_id?: string;
  scope?: KnowledgeScope;
  stream?: boolean;
}

export interface DemoUser {
  user_id: string;
  username: string;
  email: string;
  space_id: string;
  team_ids: string[];
}

export interface AiWriteMeta {
  intent: string;
  tool_call: AgentToolCall;
  retrieval_trace: RetrievalTrace;
  citations: Citation[];
  retrieved_document_count: number;
}

export interface AgentToolCall {
  name:
    | 'knowledge_search'
    | 'summarize_document'
    | 'continue_paragraph'
    | 'format_selection'
    | 'fill_in_middle'
    | 'correct_text'
    | 'expand_text';
  arguments: Record<string, unknown>;
  reason: string;
  source: 'llm_function_call' | 'rule_fallback' | 'request_intent';
  selection_ms: number;
}

export interface RetrievalTrace {
  trace_id: string;
  mode: 'dense' | 'keyword' | 'hybrid';
  rewritten_query: string;
  query_variants: string[];
  expansion_source: 'llm' | 'tool_call' | 'original' | 'fallback';
  expansion_enabled: boolean;
  dense_candidates: number;
  keyword_candidates: number;
  fused_candidates: number;
  reranked_candidates: number;
  deduped_candidates: number;
  returned_citations: number;
  retrieval_ms: number;
  rerank_ms: number;
  compression_ms: number;
  preprocessing_ms: number;
  total_ms: number;
}

export interface AiWriteResponse {
  intent: AiWritePayload['intent'];
  tool_call: AgentToolCall;
  trace: RetrievalTrace;
  answer: string;
  citations: Citation[];
}

export interface EditorAssistPayload {
  query: string;
  title?: string;
  cursorBefore?: string;
  cursorAfter?: string;
  selectedText?: string;
  documentContent?: string;
}

export interface RagMetrics {
  search_count: number;
  completion_count: number;
  evidence_completion_count: number;
  no_evidence_rate: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  inserted_count: number;
  adoption_rate: number;
  helpful_count: number;
  unhelpful_count: number;
}

export interface AiWriteStreamHandlers {
  onToolCall?: (toolCall: AgentToolCall) => void;
  onToolResult?: (result: {
    name: AgentToolCall['name'];
    trace_id: string;
    has_evidence: boolean;
    citation_count: number;
    duration_ms: number;
  }) => void;
  onMeta: (meta: AiWriteMeta) => void;
  onDelta: (delta: string) => void;
  onDone: (result: {
    status: string;
    has_evidence: boolean;
    trace_id: string;
  }) => void;
  onError: (message: string) => void;
}

export async function indexKnowledgeDocument(payload: DocumentIndexPayload) {
  const { data } = await ragClient.post('/documents/index', payload);
  return data as {
    doc_id: string;
    chunk_count: number;
    status: 'ready' | 'failed';
    document_version: number;
  };
}

export async function createKnowledgeDocument(payload: DocumentCreatePayload) {
  const { data } = await ragClient.post('/documents', payload);
  return data as DocumentRecord;
}

export async function listKnowledgeDocuments(params?: {
  page?: number;
  page_size?: number;
}) {
  const { data } = await ragClient.get('/documents', { params });
  return data as {
    items: DocumentRecord[];
    total: number;
    page: number;
    page_size: number;
  };
}

export async function getKnowledgeDocument(docId: string) {
  const { data } = await ragClient.get(`/documents/${docId}`);
  return data as DocumentRecord;
}

export async function updateKnowledgeDocument(
  docId: string,
  payload: Partial<DocumentCreatePayload>,
) {
  const { data } = await ragClient.patch(`/documents/${docId}`, payload);
  return data as DocumentRecord;
}

export async function deleteKnowledgeDocument(docId: string) {
  const { data } = await ragClient.delete(`/documents/${docId}`);
  return data as { status: 'deleted'; doc_id: string };
}

export async function reindexKnowledgeDocument(docId: string) {
  const { data } = await ragClient.post(`/documents/${docId}/reindex`);
  return data as {
    doc_id: string;
    chunk_count: number;
    status: 'ready' | 'failed';
    document_version: number;
  };
}

export async function searchKnowledge(payload: KnowledgeSearchPayload) {
  const { data } = await ragClient.post('/knowledge/search', payload);
  return data as KnowledgeSearchResponse;
}

export async function buildAiWritePrompt(
  payload: AiWritePayload,
  signal?: AbortSignal,
) {
  const { data } = await ragClient.post(
    '/ai/write',
    { ...payload, stream: false },
    { signal },
  );
  return data as AiWriteResponse;
}

export async function requestEditorAssist(
  payload: EditorAssistPayload,
  signal?: AbortSignal,
) {
  const title = payload.title || '当前打开文档';
  const result = await buildAiWritePrompt(
    {
      query: payload.query,
      retrieval_domain: 'current_document',
      current_context: {
        title,
        cursor_before: payload.cursorBefore || '',
        cursor_after: payload.cursorAfter || '',
        selected_text: payload.selectedText || '',
      },
      current_document: {
        title,
        content:
          payload.documentContent ||
          [payload.cursorBefore, payload.selectedText, payload.cursorAfter]
            .filter(Boolean)
            .join('\n'),
      },
    },
    signal,
  );
  return result.answer;
}

export async function streamAiWrite(
  payload: AiWritePayload,
  handlers: AiWriteStreamHandlers,
  signal?: AbortSignal,
) {
  const token = sessionStorage.getItem('token');
  const response = await fetch(`${ragBaseURL}/ai/write`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...payload, stream: true }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail || `请求失败（${response.status}）`);
  }
  if (!response.body) {
    throw new Error('浏览器未提供流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processFrame = (frame: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    frame.split('\n').forEach((line) => {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    });
    if (!dataLines.length) return;

    const raw = dataLines.join('\n');
    const data = JSON.parse(raw);
    if (eventName === 'tool_call') {
      handlers.onToolCall?.(data as AgentToolCall);
    }
    if (eventName === 'tool_result') {
      handlers.onToolResult?.(
        data as {
          name: AgentToolCall['name'];
          trace_id: string;
          has_evidence: boolean;
          citation_count: number;
          duration_ms: number;
        },
      );
    }
    if (eventName === 'meta') handlers.onMeta(data as AiWriteMeta);
    if (eventName === 'delta') handlers.onDelta(String(data));
    if (eventName === 'done') {
      handlers.onDone(
        data as { status: string; has_evidence: boolean; trace_id: string },
      );
    }
    if (eventName === 'error') {
      handlers.onError(data?.message || '生成失败，请稍后重试');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      processFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
    if (done) break;
  }
  if (buffer.trim()) processFrame(buffer);
}

export async function loginDemoUser(email: string, password: string) {
  const { data } = await ragClient.post('/dev/auth/login', { email, password });
  return data as { token: string; user: DemoUser };
}

export async function logoutDemoUser() {
  await ragClient.post('/dev/auth/logout');
}

export async function seedRagDemoData() {
  const { data } = await ragClient.post('/dev/seed');
  return data;
}

export async function submitAiFeedback(
  traceId: string,
  action: 'inserted' | 'helpful' | 'unhelpful' | 'dismissed',
  comment = '',
) {
  const { data } = await ragClient.post('/ai/feedback', {
    trace_id: traceId,
    action,
    comment,
  });
  return data as { status: 'recorded'; trace_id: string; action: string };
}

export async function getRagMetrics() {
  const { data } = await ragClient.get('/metrics/rag');
  return data as RagMetrics;
}
