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

export type KnowledgeScope = {
  private?: boolean;
  team?: boolean;
  public?: boolean;
  document_ids?: string[];
};

export type DocumentIndexPayload = {
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
};

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

export type Citation = {
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
};

export type KnowledgeSearchPayload = {
  query: string;
  scope?: KnowledgeScope;
  top_k?: number;
  mode?: 'dense' | 'keyword' | 'hybrid';
  context?: string;
};

export type KnowledgeSearchResponse = {
  query: string;
  citations: Citation[];
};

export type EditorContext = {
  title: string;
  cursor_before?: string;
  cursor_after?: string;
  selected_text?: string;
  tags?: string[];
};

export type AiWritePayload = {
  intent:
    | 'knowledge_qa'
    | 'knowledge_search'
    | 'continue_paragraph'
    | 'summarize_document'
    | 'format_selection';
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
};

export type DemoUser = {
  user_id: string;
  username: string;
  email: string;
  space_id: string;
  team_ids: string[];
};

export type AiWriteMeta = {
  intent: string;
  citations: Citation[];
  retrieved_document_count: number;
};

export type AiWriteStreamHandlers = {
  onMeta: (meta: AiWriteMeta) => void;
  onDelta: (delta: string) => void;
  onDone: (result: { status: string; has_evidence: boolean }) => void;
  onError: (message: string) => void;
};

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

export async function buildAiWritePrompt(payload: AiWritePayload) {
  const { data } = await ragClient.post('/ai/write', {
    ...payload,
    stream: false,
  });
  return data as { intent: string; answer: string; citations: Citation[] };
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
    if (eventName === 'meta') handlers.onMeta(data as AiWriteMeta);
    if (eventName === 'delta') handlers.onDelta(String(data));
    if (eventName === 'done') {
      handlers.onDone(data as { status: string; has_evidence: boolean });
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
