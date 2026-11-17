/**
 * @file 图任务 API。创建和控制持久化任务，通过事件游标订阅执行进度。
 */
import { ragBaseURL, ragClient } from './rag';
import { readSseStream } from './sse';
import { restoreAgentRun, type AgentRequest } from './document-agent';
import type {
  AgentEvent,
  AgentMode,
  DocumentIdentity,
  ExecutionPlan,
  OutputTarget,
} from './document-agent.types';

export interface GraphRun {
  run_id: string;
  conversation_id: string;
  mode: AgentMode;
  status: string;
  stage: string;
  revision: number;
  last_seq: number;
  pause_requested: boolean;
  can_resume: boolean;
  waiting?: {
    id: string;
    value: {
      type: 'plan' | 'clarification' | 'retry';
      plan?: ExecutionPlan;
      plan_version?: number;
      question?: string;
      choices?: string[];
      failures?: {
        step_id: string;
        code: string;
        message: string;
        retryable: boolean;
      }[];
    };
  } | null;
  payload: {
    research_workflow?: boolean;
    research_completeness?: 'complete' | 'partial';
    identity: DocumentIdentity;
    query: string;
    output_target: OutputTarget;
    error?: string;
    feedback?: Record<string, string>;
  };
}
export interface GraphResume {
  action: 'continue' | 'approve_plan' | 'revise_plan' | 'answer';
  plan?: ExecutionPlan;
  text?: string;
}
/**
 * 读取持久化 Agent 任务的当前状态与交付结果。
 *
 * @param id 目标记录的唯一标识。
 * @returns 持久化图任务记录。
 */
export async function getGraphRun(id: string): Promise<GraphRun> {
  return (await ragClient.get(`/ai/agent/runs/${id}`)).data;
}
/**
 * 读取当前文档或用户关联的图任务列表。
 *
 * @param documentKey documentKey 参数（string）。
 * @returns 持久化图任务记录列表。
 */
export async function listGraphRuns(documentKey: string): Promise<GraphRun[]> {
  return (
    await ragClient.get('/ai/agent/runs', {
      params: { document_key: documentKey },
    })
  ).data;
}
/**
 * 发送暂停、继续或停止指令，并携带任务版本信息。
 *
 * @param id 目标记录的唯一标识。
 * @param kind 当前结果或来源的分类。
 * @param input 本次操作的输入数据（可选）。
 * @returns 持久化图任务记录。
 */
export async function controlGraphRun(
  id: string,
  kind: 'pause' | 'resume' | 'stop',
  input?: GraphResume,
): Promise<GraphRun> {
  const current = await getGraphRun(id);
  return (
    await ragClient.post(`/ai/agent/runs/${id}/${kind}`, {
      request_id: crypto.randomUUID(),
      expected_revision: current.revision,
      ...(kind === 'resume'
        ? {
            ...input,
            ...(current.waiting ? { interrupt_id: current.waiting.id } : {}),
          }
        : {}),
    })
  ).data;
}

/**
 * 按事件游标读取新增任务事件。
 *
 * @param response 上游服务或 HTTP 接口返回的响应。
 * @param after 本次变更后的内容或状态。
 * @param onEvent 接收到完整事件时调用的处理函数。
 * @returns 计算得到的数值。
 */
export async function readGraphEvents(
  response: Response,
  after: number,
  onEvent: (event: AgentEvent) => Promise<void> | void,
): Promise<number> {
  if (!response.body) throw new Error('未收到任务进度');
  let last = after;
  await readSseStream(response.body, async (event, payload) => {
    if (!event || !payload) return;
    const data = JSON.parse(payload);
    if (!Number.isSafeInteger(data.seq)) throw new Error('任务进度格式无效');
    if (data.seq <= last) return;
    await onEvent({ event, data });
    last = data.seq;
  });
  return last;
}

/**
 * 等待下一次轮询时机，并响应取消信号。
 *
 * @param ms 等待或超时时间，单位为毫秒。
 * @param signal 取消信号，用于中止请求和后台处理。
 */
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已断开进度订阅', 'AbortError'));
      return;
    }
    /**
     * 响应取消信号，中止当前等待或操作。
     */
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('已断开进度订阅', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });

/**
 * 按事件游标持续读取任务进度；断开订阅仅停止监听，不停止后台任务。
 *
 *  Disconnecting this subscription never sends a stop command to the background task.
 *
 * @param id 目标记录的唯一标识。
 * @param editorJson 当前编辑器文档的 JSON 内容。
 * @param onEvent 接收到完整事件时调用的处理函数。
 * @param signal 取消信号，用于中止请求和后台处理。
 * @param initialSeq 开始订阅时已经消费的事件序号。
 */
export async function subscribeGraphRun(
  id: string,
  editorJson: Record<string, unknown>,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
  initialSeq = 0,
) {
  let last = initialSeq,
    retries = 0;
  /**
   * 补充当前运行标识和事件游标后通知界面订阅者。
   *
   * @param event 需要处理的事件。
   * @param data 当前事件或操作携带的数据。
   */
  const send = (event: string, data: Record<string, any>) =>
    onEvent({ event, data: { ...data, run_id: id, seq: last } });
  while (!signal.aborted) {
    try {
      const current = await getGraphRun(id);
      if (signal.aborted) return;
      send('graph_state', current);
      const response = await fetch(
        `${ragBaseURL}/ai/agent/runs/${id}/events?after_seq=${last}`,
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('token') ?? ''}`,
          },
          signal,
        },
      );
      if (!response.ok) {
        if (response.status < 500)
          throw Object.assign(new Error('无法读取任务进度，请重新打开助手'), {
            fatal: true,
          });
        throw new Error('任务进度暂时不可用');
      }
      last = await readGraphEvents(response, last, (event) => {
        // Candidates are restored only after the committed terminal status is visible.
        if (!['result', 'done'].includes(event.event)) onEvent(event);
        last = Math.max(last, event.data.seq);
      });
      const state = await getGraphRun(id);
      if (signal.aborted) return;
      send('graph_state', state);
      if (!['queued', 'running'].includes(state.status)) {
        if (['awaiting_review', 'completed'].includes(state.status)) {
          const restored = await restoreAgentRun(id, editorJson);
          if (signal.aborted) return;
          if (restored.payload.delivery)
            send('result', {
              ...restored.payload.delivery,
              feedback: restored.payload.feedback,
              graph_restored: true,
            });
        }
        send('done', { status: state.status });
        return;
      }
      retries = 0;
    } catch (error: any) {
      if (signal.aborted || error.name === 'AbortError') return;
      if (
        error.fatal ||
        (error.response?.status && error.response.status < 500)
      )
        throw error;
      send('graph_connection', { message: '正在重新连接，任务仍在后台运行' });
      await wait(Math.min(5000, 500 * 2 ** Math.min(retries++, 4)), signal);
    }
  }
}

/**
 * 创建图任务并订阅执行事件，向调用方持续报告状态。
 *
 * @param input 本次操作的输入数据。
 * @param onEvent 接收到完整事件时调用的处理函数。
 * @param signal 取消信号，用于中止请求和后台处理。
 */
export async function streamGraphDocumentAgent(
  input: AgentRequest,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
) {
  // Creation is independent of the SSE subscription and remains durable after navigation.
  const run: GraphRun = (await ragClient.post('/ai/agent/runs', input)).data;
  onEvent({
    event: 'run_started',
    data: { run_id: run.run_id, seq: 0, graph: true },
  });
  await subscribeGraphRun(
    run.run_id,
    input.editor_snapshot.json,
    onEvent,
    signal,
  );
}
