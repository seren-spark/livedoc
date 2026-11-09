// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamDocumentAgent, type AgentRequest } from './document-agent';
import { readGraphEvents } from './document-agent-graph';
import { streamAiWrite, type AiWritePayload } from './rag';
import { readSseStream } from './sse';

const encoder = new TextEncoder();
const stream = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
const response = (text: string) => new Response(stream([encoder.encode(text)]));

afterEach(() => vi.unstubAllGlobals());

describe('shared SSE transport', () => {
  it('handles split UTF-8, CRLF, multiline data, comments and a final unterminated frame', async () => {
    const bytes = encoder.encode(
      ': heartbeat\r\n\r\nevent: delta\r\ndata: "中文"\r\ndata: \r\n\r\ndata: 42',
    );
    const body = stream(Array.from(bytes, (byte) => Uint8Array.of(byte)));
    const received: unknown[] = [];
    await readSseStream(body, (event, data) => {
      received.push([event, JSON.parse(data)]);
    });
    expect(received).toEqual([
      ['delta', '中文'],
      [undefined, 42],
    ]);
    expect(body.locked).toBe(false);
  });

  it('awaits callbacks in order and releases the reader after a callback failure', async () => {
    const body = stream([encoder.encode('data: 1\n\ndata: 2\n\n')]);
    const received: string[] = [];
    await expect(
      readSseStream(body, async (_, data) => {
        await Promise.resolve();
        received.push(data);
        if (data === '2') throw new Error('callback failed');
      }),
    ).rejects.toThrow('callback failed');
    expect(received).toEqual(['1', '2']);
    expect(body.locked).toBe(false);
  });

  it('propagates cancellation and releases the reader', async () => {
    const error = new DOMException('stopped', 'AbortError');
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(error);
      },
    });
    await expect(readSseStream(body, () => {})).rejects.toBe(error);
    expect(body.locked).toBe(false);
  });

  it('keeps strict ordering and terminal checks for the ordinary agent', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const input = {} as AgentRequest;
    const signal = new AbortController().signal;
    const frame = (seq: number, event: string) =>
      `event: ${event}\ndata: {"seq":${seq}}\n\n`;
    fetch.mockResolvedValueOnce(response(frame(1, 'step') + frame(1, 'done')));
    await expect(streamDocumentAgent(input, () => {}, signal)).rejects.toThrow(
      '生成事件顺序无效',
    );
    fetch.mockResolvedValueOnce(response(frame(1, 'step')));
    await expect(streamDocumentAgent(input, () => {}, signal)).rejects.toThrow(
      '候选结果未完成',
    );
    fetch.mockResolvedValueOnce(response(frame(1, 'step') + frame(2, 'done')));
    const onEvent = vi.fn();
    await streamDocumentAgent(input, onEvent, signal);
    expect(onEvent.mock.calls.map(([value]) => value.event)).toEqual([
      'step',
      'done',
    ]);
  });

  it('keeps graph sequence validation and replay suppression', async () => {
    const onEvent = vi.fn();
    const last = await readGraphEvents(
      response(
        'event: step\ndata: {"seq":1}\n\nevent: step\ndata: {"seq":2}\n\n',
      ),
      1,
      onEvent,
    );
    expect(last).toBe(2);
    expect(onEvent).toHaveBeenCalledTimes(1);
    await expect(
      readGraphEvents(
        response('event: step\ndata: {"seq":"3"}\n\n'),
        2,
        onEvent,
      ),
    ).rejects.toThrow('任务进度格式无效');
  });

  it("preserves each client's handling of repeated event fields", async () => {
    const wire = 'event: step\nevent: delta\ndata: "正文"\n\n';
    const fetch = vi.fn().mockResolvedValueOnce(response(wire));
    vi.stubGlobal('fetch', fetch);
    const handlers = {
      onMeta: vi.fn(),
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };
    await streamAiWrite({} as AiWritePayload, handlers);
    expect(handlers.onDelta).toHaveBeenCalledWith('正文');
    const onEvent = vi.fn();
    await readGraphEvents(
      response('event: step\nevent: done\ndata: {"seq":1}\n\n'),
      0,
      onEvent,
    );
    expect(onEvent).toHaveBeenCalledWith({ event: 'step', data: { seq: 1 } });
  });

  it('dispatches every existing write event and releases the reader on invalid JSON', async () => {
    const names = [
      'tool_start',
      'tool_call',
      'tool_result',
      'meta',
      'citations',
      'delta',
      'done',
      'error',
    ];
    const handlers = {
      onToolCall: vi.fn(),
      onToolResult: vi.fn(),
      onMeta: vi.fn(),
      onCitations: vi.fn(),
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          names
            .map(
              (name) =>
                `event: ${name}\ndata: ${name === 'delta' ? '"正文"' : '{}'}\n\n`,
            )
            .join(''),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    await streamAiWrite({} as AiWritePayload, handlers);
    expect(handlers.onToolCall).toHaveBeenCalledTimes(2);
    for (const name of [
      'onToolResult',
      'onMeta',
      'onCitations',
      'onDelta',
      'onDone',
      'onError',
    ] as const) {
      expect(handlers[name]).toHaveBeenCalledTimes(1);
    }
    expect(handlers.onDelta).toHaveBeenCalledWith('正文');
    const invalid = response('event: delta\ndata: invalid\n\n');
    fetch.mockResolvedValueOnce(invalid);
    await expect(
      streamAiWrite({} as AiWritePayload, handlers),
    ).rejects.toBeInstanceOf(SyntaxError);
    expect(invalid.body!.locked).toBe(false);
  });
});
