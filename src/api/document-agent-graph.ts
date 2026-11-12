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
export async function getGraphRun(id: string): Promise<GraphRun> {
  return (await ragClient.get(`/ai/agent/runs/${id}`)).data;
}
export async function listGraphRuns(documentKey: string): Promise<GraphRun[]> {
  return (
    await ragClient.get('/ai/agent/runs', {
      params: { document_key: documentKey },
    })
  ).data;
}
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

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已断开进度订阅', 'AbortError'));
      return;
    }
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

/** Disconnecting this subscription never sends a stop command to the background task. */
export async function subscribeGraphRun(
  id: string,
  editorJson: Record<string, unknown>,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
  initialSeq = 0,
) {
  let last = initialSeq,
    retries = 0;
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
