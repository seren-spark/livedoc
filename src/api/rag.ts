import axios from 'axios';

const ragBaseURL = import.meta.env.VITE_RAG_API_BASE_URL || 'http://127.0.0.1:8000';

const ragClient = axios.create({
  baseURL: ragBaseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

ragClient.interceptors.request.use((config) => {
  const spaceId = import.meta.env.VITE_RAG_SPACE_ID || 'space_a';
  const teamIds = import.meta.env.VITE_RAG_TEAM_IDS || '';
  config.headers.set('X-Space-Id', spaceId);
  if (teamIds) {
    config.headers.set('X-Team-Ids', teamIds);
  }
  return config;
});

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

export type DocumentCreatePayload = Omit<DocumentIndexPayload, 'doc_id' | 'space_id'> & {
  doc_id?: string;
  index_now?: boolean;
};

export type DocumentRecord = Required<Pick<DocumentIndexPayload, 'doc_id' | 'space_id' | 'title' | 'content'>> & {
  visibility: 'private' | 'team' | 'public';
  source_type: 'article' | 'draft' | 'note' | 'team_doc' | 'public_article';
  tags: string[];
  team_id?: string | null;
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
  scope?: KnowledgeScope;
  stream?: boolean;
};

export async function indexKnowledgeDocument(payload: DocumentIndexPayload) {
  const { data } = await ragClient.post('/documents/index', payload);
  return data as { doc_id: string; chunk_count: number; status: 'ready' | 'failed'; document_version: number };
}

export async function createKnowledgeDocument(payload: DocumentCreatePayload) {
  const { data } = await ragClient.post('/documents', payload);
  return data as DocumentRecord;
}

export async function listKnowledgeDocuments(params?: { page?: number; page_size?: number }) {
  const { data } = await ragClient.get('/documents', { params });
  return data as { items: DocumentRecord[]; total: number; page: number; page_size: number };
}

export async function getKnowledgeDocument(docId: string) {
  const { data } = await ragClient.get(`/documents/${docId}`);
  return data as DocumentRecord;
}

export async function updateKnowledgeDocument(docId: string, payload: Partial<DocumentCreatePayload>) {
  const { data } = await ragClient.patch(`/documents/${docId}`, payload);
  return data as DocumentRecord;
}

export async function deleteKnowledgeDocument(docId: string) {
  const { data } = await ragClient.delete(`/documents/${docId}`);
  return data as { status: 'deleted'; doc_id: string };
}

export async function reindexKnowledgeDocument(docId: string) {
  const { data } = await ragClient.post(`/documents/${docId}/reindex`);
  return data as { doc_id: string; chunk_count: number; status: 'ready' | 'failed'; document_version: number };
}

export async function searchKnowledge(payload: KnowledgeSearchPayload) {
  const { data } = await ragClient.post('/knowledge/search', payload);
  return data as KnowledgeSearchResponse;
}

export async function buildAiWritePrompt(payload: AiWritePayload) {
  const { data } = await ragClient.post('/ai/write', { ...payload, stream: false });
  return data as { intent: string; answer: string; citations: Citation[] };
}

export async function seedRagDemoData() {
  const { data } = await ragClient.post('/dev/seed');
  return data;
}
