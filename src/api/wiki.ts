import { ragClient } from './rag';
import type { AgentCitation } from './document-agent.types';

export interface WikiPage {
  wiki_id: string;
  revision: number;
  title: string;
  question?: string;
  markdown?: string;
  status: 'draft' | 'indexing' | 'published' | 'failed';
  source_status: 'valid' | 'stale' | 'unavailable';
  source_count: number;
  citations: AgentCitation[];
  review?: { passed: boolean; issues: string[] };
  error?: string;
  updated_at: string;
}
export async function listWiki(
  signal?: AbortSignal,
): Promise<{ items: WikiPage[] }> {
  return (await ragClient.get('/ai/wiki', { signal })).data;
}
export async function getWiki(
  id: string,
  signal?: AbortSignal,
): Promise<WikiPage> {
  return (await ragClient.get(`/ai/wiki/${encodeURIComponent(id)}`, { signal }))
    .data;
}
export async function createWikiCandidate(
  runId: string,
  answer: string,
  signal?: AbortSignal,
): Promise<WikiPage> {
  return (
    await ragClient.post(
      '/ai/wiki/candidates',
      { run_id: runId, answer },
      { signal, timeout: 70000 },
    )
  ).data;
}
export async function publishWiki(
  page: WikiPage,
  signal?: AbortSignal,
): Promise<WikiPage> {
  return (
    await ragClient.post(
      `/ai/wiki/${encodeURIComponent(page.wiki_id)}/publish`,
      { revision: page.revision },
      { signal, timeout: 120000 },
    )
  ).data;
}
export async function removeWiki(id: string, signal?: AbortSignal) {
  return (
    await ragClient.delete(`/ai/wiki/${encodeURIComponent(id)}`, {
      signal,
      headers: { 'Content-Type': undefined },
    })
  ).data;
}
