/**
 * @file 文档 Agent API。查询能力、提交反馈、恢复候选并消费 SSE 写作事件。
 */
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
/**
 * 查询服务端当前启用的 Agent 功能与可用能力。
 *
 * @returns 当前部署与个人设置共同决定的可用能力。
 */
export async function agentCapabilities(): Promise<AgentCapabilities> {
  return (await ragClient.get('/ai/agent/capabilities')).data;
}
/**
 * 提交候选采纳、拒绝或回答评价等反馈。
 *
 * @param runId run 对应的唯一标识。
 * @param action 本次请求执行的操作类型。
 * @param editId edit 对应的唯一标识（可选）。
 * @param documentId document 对应的唯一标识（可选）。
 * @returns any 类型的处理结果。
 */
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
/**
 * 基于当前编辑器快照恢复历史任务候选。
 *
 * @param runId run 对应的唯一标识。
 * @param editorJson 当前编辑器文档的 JSON 内容。
 * @returns StoredAgentRun 类型的处理结果。
 */
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
/**
 * 发送编辑器快照与写作需求，解析返回的 SSE 事件。
 *
 * @param input 本次操作的输入数据。
 * @param onEvent 接收到完整事件时调用的处理函数。
 * @param signal 取消信号，用于中止请求和后台处理。
 */
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
