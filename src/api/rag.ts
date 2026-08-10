import axios from 'axios';

export const ragBaseURL =
  import.meta.env.VITE_RAG_API_BASE_URL || 'http://127.0.0.1:8001';

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

ragClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      sessionStorage.removeItem('token');
      window.dispatchEvent(new Event('livedoc:unauthorized'));
    }
    return Promise.reject(error);
  },
);

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
  editor_content?: TipTapDocument | null;
  source_import_id?: string | null;
  asset_ids?: string[];
};

export type TipTapDocument = {
  type: 'doc';
  content?: Array<Record<string, unknown>>;
};

export interface DocumentAsset {
  asset_id: string;
  space_id: string;
  owner_id: string;
  import_id?: string | null;
  doc_id?: string | null;
  kind: 'source' | 'image' | 'editor_image';
  filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  content_url: string;
  page_number?: number | null;
  ordinal?: number | null;
  width?: number | null;
  height?: number | null;
  ocr_text: string;
  description: string;
  analysis_status: 'pending' | 'ready' | 'skipped' | 'failed';
  analysis_error?: string | null;
  created_at: string;
}

export interface DocumentImportRecord {
  import_id: string;
  space_id: string;
  owner_id: string;
  visibility: 'private' | 'team' | 'public';
  team_id?: string | null;
  tags: string[];
  folder?: string | null;
  title: string;
  filename: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  source_asset_id: string;
  status:
    | 'uploaded'
    | 'queued'
    | 'parsing'
    | 'review_ready'
    | 'confirmed'
    | 'retry_wait'
    | 'failed'
    | 'canceled';
  progress: number;
  stage: string;
  parsed_content: string;
  editor_content?: TipTapDocument | null;
  parser_version?: string | null;
  error?: string | null;
  document_id?: string | null;
  latest_job_id?: string | null;
  assets: DocumentAsset[];
  created_at: string;
  updated_at: string;
}

export type DocumentRecord = Required<
  Pick<DocumentIndexPayload, 'doc_id' | 'space_id' | 'title' | 'content'>
> & {
  visibility: 'private' | 'team' | 'public';
  source_type: 'article' | 'draft' | 'note' | 'team_doc' | 'public_article';
  tags: string[];
  team_id?: string | null;
  owner_id?: string | null;
  url?: string | null;
  editor_content?: TipTapDocument | null;
  source_import_id?: string | null;
  assets: DocumentAsset[];
  document_version: number;
  index_status: 'pending' | 'queued' | 'indexing' | 'ready' | 'failed';
  active_index_version?: number | null;
  latest_index_job_id?: string | null;
  chunk_count: number;
  indexed_at?: string | null;
  index_error?: string | null;
  created_at: string;
  updated_at: string;
};

export interface Citation {
  citation_id: string;
  index: number;
  doc_id: string;
  chunk_id: string;
  title: string;
  content: string;
  snippet: string;
  source_anchor: string;
  source_type: string;
  visibility: string;
  score: number;
  retrieval_score: number;
  dense_score?: number | null;
  keyword_score?: number | null;
  rerank_score?: number | null;
  url?: string | null;
  heading_path: string[];
  chunk_index?: number | null;
  space_id: string;
  team_id?: string | null;
  document_version: number;
  document_updated_at?: string | null;
  start_offset?: number | null;
  end_offset?: number | null;
  asset_id?: string | null;
  page_number?: number | null;
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
  request_id: string;
  trace_id: string;
  intent: string;
  has_evidence: boolean;
  can_insert: boolean;
  tool_call: AgentToolCall;
  retrieval_trace: RetrievalTrace;
  citations?: Citation[];
  retrieved_document_count: number;
}

export interface AgentToolCall {
  name:
    | 'search_knowledge_base'
    | 'summarize_current_document'
    | 'continue_paragraph'
    | 'optimize_format';
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
  has_evidence: boolean;
  can_insert: boolean;
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
  window: '24h' | '7d' | '30d';
  from_time?: string | null;
  to_time?: string | null;
  p50_generation_ms: number;
  p95_generation_ms: number;
  error_rate: number;
  queue_depth: number;
}

export interface IndexJob {
  job_id: string;
  doc_id: string;
  document_version: number;
  status:
    | 'queued'
    | 'running'
    | 'retry_wait'
    | 'succeeded'
    | 'failed'
    | 'superseded'
    | 'canceled';
  attempts: number;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  next_run_at?: string | null;
  error?: string | null;
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
  onCitations?: (citations: Citation[]) => void;
  onDelta: (delta: string) => void;
  onDone: (result: {
    status: string;
    has_evidence: boolean;
    can_insert: boolean;
    request_id: string;
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
  q?: string;
  visibility?: 'private' | 'team' | 'public';
  source_type?: DocumentRecord['source_type'];
  tag?: string;
  team_id?: string;
  index_status?: DocumentRecord['index_status'];
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
  payload: Partial<DocumentCreatePayload> & { expected_version?: number },
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
  return data as IndexJob;
}

async function parseFetchError(response: Response) {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.detail || `请求失败（${response.status}）`);
}

function authHeaders() {
  const token = sessionStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function uploadDocumentImport(
  file: File,
  metadata: {
    visibility: 'private' | 'team' | 'public';
    team_id?: string;
    tags?: string[];
    folder?: string;
  },
) {
  const body = new FormData();
  body.append('file', file);
  body.append('visibility', metadata.visibility);
  if (metadata.team_id) body.append('team_id', metadata.team_id);
  body.append('tags', JSON.stringify(metadata.tags || []));
  if (metadata.folder) body.append('folder', metadata.folder);
  const response = await fetch(`${ragBaseURL}/document-imports`, {
    method: 'POST',
    headers: authHeaders(),
    body,
  });
  if (!response.ok) throw await parseFetchError(response);
  return (await response.json()) as DocumentImportRecord;
}

export async function getDocumentImport(importId: string) {
  const { data } = await ragClient.get(`/document-imports/${importId}`);
  return data as DocumentImportRecord;
}

export async function updateDocumentImport(
  importId: string,
  payload: {
    title?: string;
    content?: string;
    editor_content?: TipTapDocument;
    asset_ids?: string[];
  },
) {
  const { data } = await ragClient.patch(
    `/document-imports/${importId}`,
    payload,
  );
  return data as DocumentImportRecord;
}

export async function retryDocumentImport(importId: string) {
  const { data } = await ragClient.post(`/document-imports/${importId}/retry`);
  return data as DocumentImportRecord;
}

export async function confirmDocumentImport(importId: string) {
  const { data } = await ragClient.post(
    `/document-imports/${importId}/confirm`,
  );
  return data as { document: DocumentRecord; index_job: IndexJob };
}

export async function uploadDocumentAsset(
  file: File,
  parent: { import_id?: string; doc_id?: string },
) {
  const body = new FormData();
  body.append('file', file);
  if (parent.import_id) body.append('import_id', parent.import_id);
  if (parent.doc_id) body.append('doc_id', parent.doc_id);
  const response = await fetch(`${ragBaseURL}/assets`, {
    method: 'POST',
    headers: authHeaders(),
    body,
  });
  if (!response.ok) throw await parseFetchError(response);
  return (await response.json()) as DocumentAsset;
}

export async function fetchDocumentAssetBlob(assetId: string) {
  const response = await fetch(`${ragBaseURL}/assets/${assetId}/content`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw await parseFetchError(response);
  return response.blob();
}

export async function retryDocumentAsset(assetId: string) {
  const { data } = await ragClient.post(`/assets/${assetId}/retry`);
  return data as DocumentAsset;
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
  let response: Response;
  try {
    response = await fetch(`${ragBaseURL}/ai/write`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...payload, stream: true }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || (error as DOMException)?.name === 'AbortError') {
      throw error;
    }
    throw new Error(
      `无法连接知识库服务（${ragBaseURL}）。请确认后端已启动，并检查 http://127.0.0.1:8001/health/live。`,
      { cause: error },
    );
  }

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
    if (eventName === 'tool_start' || eventName === 'tool_call') {
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
    if (eventName === 'citations') {
      handlers.onCitations?.((data?.citations ?? []) as Citation[]);
    }
    if (eventName === 'delta') handlers.onDelta(String(data));
    if (eventName === 'done') {
      handlers.onDone(
        data as { status: string; has_evidence: boolean; can_insert: boolean; request_id: string; trace_id: string },
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
  return data as {
    status: 'seeded';
    documents: Array<{
      doc_id: string;
      title: string;
      action: 'created' | 'updated' | 'unchanged';
      index_status: DocumentRecord['index_status'];
      job_id: string | null;
    }>;
  };
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

export async function getRagMetrics(window: '24h' | '7d' | '30d' = '24h') {
  const { data } = await ragClient.get('/metrics/rag', {
    params: { window },
  });
  return data as RagMetrics;
}
