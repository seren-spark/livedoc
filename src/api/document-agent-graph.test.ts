// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  restore: vi.fn(),
}));
vi.mock('./rag', () => ({
  ragBaseURL: 'http://localhost:8001',
  ragClient: { get: mocks.get, post: mocks.post },
}));
vi.mock('./document-agent', () => ({ restoreAgentRun: mocks.restore }));
import {
  controlGraphRun,
  readGraphEvents,
  subscribeGraphRun,
} from './document-agent-graph';
const encoder = new TextEncoder();
const frame = (seq: number, event = 'step') =>
  `id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify({ run_id: 'run', seq, status: 'done' })}\n\n`;
const response = (chunks: string[]) =>
  ({
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    ok: true,
  }) as Response;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.restore.mockReset();
});

describe('resumable agent event transport', () => {
  it('handles split SSE frames and suppresses replayed event ids', async () => {
    const received: number[] = [],
      wire = frame(1) + frame(1) + frame(2);
    const last = await readGraphEvents(
      response([wire.slice(0, 19), wire.slice(19, 44), wire.slice(44)]),
      0,
      (event) => {
        received.push(event.data.seq);
      },
    );
    expect(received).toEqual([1, 2]);
    expect(last).toBe(2);
  });

  it('restores a committed candidate when terminal state is visible even without a done frame', async () => {
    const running = {
      run_id: 'run',
      status: 'running',
      last_seq: 0,
      payload: {},
    };
    const done = { ...running, status: 'completed', last_seq: 1 };
    mocks.get
      .mockResolvedValueOnce({ data: running })
      .mockResolvedValueOnce({ data: done });
    mocks.restore.mockResolvedValue({
      payload: {
        delivery: {
          result: { kind: 'answer', answer: 'saved', citation_ids: [] },
          citations: [],
        },
        feedback: {},
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([frame(1)])));
    const events: any[] = [];
    await subscribeGraphRun(
      'run',
      { type: 'doc' },
      (event) => events.push(event),
      new AbortController().signal,
    );
    expect(
      events.find((event) => event.event === 'result').data.result.answer,
    ).toBe('saved');
    expect(events.at(-1)).toMatchObject({
      event: 'done',
      data: { status: 'completed' },
    });
    expect(mocks.restore).toHaveBeenCalledWith('run', { type: 'doc' });
  });

  it('reconnects after a broken stream without creating or resuming a second task', async () => {
    const state = {
      run_id: 'run',
      status: 'running',
      last_seq: 1,
      payload: {},
    };
    mocks.get
      .mockResolvedValueOnce({ data: state })
      .mockResolvedValueOnce({ data: state })
      .mockResolvedValueOnce({ data: { ...state, status: 'paused' } });
    let pulls = 0;
    const broken = {
      ok: true,
      body: new ReadableStream({
        pull(controller) {
          if (!pulls++) controller.enqueue(encoder.encode(frame(1)));
          else controller.error(new TypeError('network disconnected'));
        },
      }),
    } as Response;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(broken)
      .mockResolvedValueOnce(response([frame(1), frame(2)]));
    vi.stubGlobal('fetch', fetch);
    const received: any[] = [];
    await subscribeGraphRun(
      'run',
      {},
      (event) => received.push(event),
      new AbortController().signal,
    );
    expect(fetch.mock.calls[1]?.[0]).toContain('after_seq=1');
    expect(
      received
        .filter((event) => event.event === 'step')
        .map((event) => event.data.seq),
    ).toEqual([1, 2]);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('uses current revision and the current interrupt id when confirming the same task', async () => {
    mocks.get.mockResolvedValue({
      data: { revision: 8, waiting: { id: 'current-interrupt' } },
    });
    mocks.post.mockResolvedValue({ data: { run_id: 'run', status: 'queued' } });
    await controlGraphRun('run', 'resume', {
      action: 'approve_plan',
      plan: { goal: 'write', outline: [], constraints: [], steps: [] },
    });
    expect(mocks.post).toHaveBeenCalledWith(
      '/ai/agent/runs/run/resume',
      expect.objectContaining({
        expected_revision: 8,
        interrupt_id: 'current-interrupt',
        action: 'approve_plan',
      }),
    );
  });

  it('replays verification and replanning events and preserves the retry reason', async () => {
    const running = {
      run_id: 'run',
      status: 'running',
      last_seq: 0,
      payload: {},
    };
    const interrupted = {
      ...running,
      status: 'interrupted',
      last_seq: 2,
      can_resume: true,
      waiting: {
        id: 'verify-retry',
        value: {
          type: 'retry',
          failures: [
            {
              step_id: 'verify',
              code: 'MODEL_TIMEOUT',
              message: '核验请求超时',
              retryable: true,
            },
          ],
        },
      },
    };
    const progress = (seq: number, event: string, data: object) =>
      `event: ${event}\ndata: ${JSON.stringify({ run_id: 'run', seq, ...data })}\n\n`;
    const verification = progress(1, 'verification', {
      status: 'rechecking',
      candidate_version: 1,
    });
    const replanning = progress(2, 'replanning', {
      invalidated_steps: ['compose'],
      reused_steps: ['read'],
      plan_version: 2,
    });
    mocks.get
      .mockResolvedValueOnce({ data: running })
      .mockResolvedValueOnce({ data: interrupted });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(response([verification, verification, replanning])),
    );
    const received: any[] = [];
    await subscribeGraphRun(
      'run',
      {},
      (event) => received.push(event),
      new AbortController().signal,
    );
    expect(
      received.filter((event) => event.event === 'verification'),
    ).toHaveLength(1);
    expect(
      received.find((event) => event.event === 'verification').data,
    ).toMatchObject({ status: 'rechecking', candidate_version: 1 });
    expect(
      received.find((event) => event.event === 'replanning').data,
    ).toMatchObject({ invalidated_steps: ['compose'], reused_steps: ['read'] });
    expect(
      received.filter((event) => event.event === 'graph_state').at(-1).data
        .waiting,
    ).toEqual(interrupted.waiting);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });
});
