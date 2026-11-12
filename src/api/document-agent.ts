import { ragBaseURL, ragClient } from './rag';
import { readSseStream } from './sse';
import type {
  AgentEvent,
  AgentResult,
  AgentCitation,
  DocumentIdentity,
  AgentMode,
  EditorSnapshot,
  ExecutionPlan,
  OutputTarget,
  ReferenceInput,
} from './document-agent.types';
import type { KnowledgeScope } from './rag';
export interface AgentRequest {
  request_id: string;
  conversation_id: string;
  mode: AgentMode;
  output_target: OutputTarget;
  query: string;
  deep_thinking: boolean;
  allow_web: boolean;
  editor_snapshot: EditorSnapshot;
  references: ReferenceInput[];
  knowledge_scope?: KnowledgeScope;
  template_id?: string;
  skill_id?: string;
  skill_revision?: number;
  skill_inputs?: Record<string, string>;
  confirmed_plan?: ExecutionPlan;
}
export interface AgentCapabilities {
  research_writing_available?: boolean;
  graph_enabled?: boolean;
  skills_enabled?: boolean;
  preferences_enabled?: boolean;
  preview?: boolean;
  enabled: boolean;
  workspace_enabled: boolean;
  thinking_supported: boolean;
  web_available: boolean;
  web_tools: string[];
  unavailable_servers: string[];
  limits: {
    references: number;
    text_file_bytes: number;
    upload_mb: number;
    max_tool_calls: number;
    max_plan_steps?: number;
    total_seconds: number;
  };
}
export async function agentCapabilities(): Promise<AgentCapabilities> {
  return (await ragClient.get('/ai/agent/capabilities')).data;
}
export async function agentFeedback(
  runId: string,
  action: string,
  editId?: string,
  documentId?: string,
) {
  return (
    await ragClient.post(`/ai/agent/${runId}/feedback`, {
      action,
      edit_id: editId,
      document_id: documentId,
    })
  ).data;
}
export interface StoredAgentRun {
  run_id: string;
  conversation_id: string;
  mode: AgentMode;
  status: string;
  payload: {
    identity: DocumentIdentity;
    query: string;
    output_target: OutputTarget;
    feedback: Record<string, string>;
    document_id?: string;
    error?: string;
    delivery?: {
      result: AgentResult;
      citations: AgentCitation[];
      selection: EditorSnapshot['selection'];
      candidate_version: number;
    };
  };
}
export async function restoreAgentRun(
  runId: string,
  editorJson: Record<string, unknown>,
): Promise<StoredAgentRun> {
  return (
    await ragClient.post(`/ai/agent/${runId}/restore`, {
      editor_json: editorJson,
    })
  ).data;
}
export async function streamDocumentAgent(
  input: AgentRequest,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
) {
  const response = await fetch(`${ragBaseURL}/ai/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionStorage.getItem('token') ?? ''}`,
    },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401) {
      sessionStorage.removeItem('token');
      window.dispatchEvent(new Event('livedoc:unauthorized'));
    }
    throw new Error(
      Array.isArray(body?.message)
        ? body.message.join('；')
        : (body?.message ?? `请求失败 (${response.status})`),
    );
  }
  if (!response.body) throw new Error('未收到生成流');
  let terminal = false;
  let lastSeq = 0;
  await readSseStream(response.body, (event, data) => {
    if (!event || !data) return;
    const parsed = JSON.parse(data);
    if (!Number.isInteger(parsed.seq) || parsed.seq <= lastSeq)
      throw new Error('生成事件顺序无效');
    lastSeq = parsed.seq;
    if (event === 'done') terminal = true;
    onEvent({ event, data: parsed });
  });
  if (!terminal) throw new Error('连接中断，候选结果未完成，请重新生成');
}
