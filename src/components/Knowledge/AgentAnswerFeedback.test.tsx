// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentAnswerFeedback from './AgentAnswerFeedback';
const api = vi.hoisted(() => ({ agentFeedback: vi.fn() }));
vi.mock('@/api/document-agent', () => api);
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  api.agentFeedback.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
describe('answer quality feedback', () => {
  it('restores saved incorrect feedback and prevents reversing it after refresh', async () => {
    await act(async () => root.render(<AgentAnswerFeedback runId="restored" initialValue="incorrect" />));
    expect(button('回答有误').getAttribute('aria-pressed')).toBe('true');
    expect(button('回答有帮助').disabled).toBe(true);
    expect(button('回答有误').disabled).toBe(true);
    expect(api.agentFeedback).not.toHaveBeenCalled();
  });
  it('allows a helpful answer to be rejected later and sends only its own run id', async () => {
    api.agentFeedback.mockResolvedValue({ status: 'completed' });
    await act(async () =>
      root.render(<AgentAnswerFeedback runId="answer-1" />),
    );
    await act(async () => button('回答有帮助').click());
    expect(button('回答有帮助').getAttribute('aria-pressed')).toBe('true');
    expect(button('回答有误').disabled).toBe(false);
    await act(async () => button('回答有误').click());
    expect(api.agentFeedback.mock.calls).toEqual([
      ['answer-1', 'helpful'],
      ['answer-1', 'incorrect'],
    ]);
    expect(button('回答有误').getAttribute('aria-pressed')).toBe('true');
    expect(button('回答有误').disabled).toBe(true);
  });
  it('blocks duplicate submissions and does not apply a late result to a different answer', async () => {
    let resolve!: (value: unknown) => void;
    api.agentFeedback.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await act(async () => root.render(<AgentAnswerFeedback runId="old" />));
    await act(async () => {
      button('回答有误').click();
      button('回答有误').click();
    });
    expect(api.agentFeedback).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<AgentAnswerFeedback runId="new" />));
    await act(async () => resolve({ status: 'completed' }));
    expect(button('回答有误').getAttribute('aria-pressed')).toBe('false');
    expect(button('回答有误').disabled).toBe(false);
  });
  it('keeps failed submissions retryable and respects disabled state', async () => {
    await act(async () =>
      root.render(<AgentAnswerFeedback runId="answer" disabled />),
    );
    expect(button('回答有误').disabled).toBe(true);
    api.agentFeedback.mockRejectedValue(new Error('offline'));
    await act(async () => root.render(<AgentAnswerFeedback runId="answer" />));
    await act(async () => button('回答有误').click());
    expect(button('回答有误').getAttribute('aria-pressed')).toBe('false');
    expect(button('回答有误').disabled).toBe(false);
  });
});
