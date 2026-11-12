// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ getAgentResearch: vi.fn() }));
vi.mock('@/api/agent-research', () => api);
import AgentResearchProgress from './AgentResearchProgress';
let root: Root, element: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.getAgentResearch.mockReset();
  element = document.createElement('div');
  document.body.appendChild(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
});
describe('research panel interactions', () => {
  it('loads on expansion, pages notes and locates an exact candidate excerpt', async () => {
    const coverage = {
      candidate_version: 1,
      deliverable: true,
      completeness: 'complete',
      items: [
        {
          question_id: 'q1',
          status: 'covered',
          locations: [{ field: 'markdown', start: 0, end: 6 }],
          citation_ids: ['e1'],
          reason: '已回答',
          gap_declared: false,
        },
      ],
    };
    const note = {
      question_id: 'q1',
      task_id: 'research',
      findings: [{ statement: '第一份明细', evidence_ids: ['e1'] }],
      missing: [],
      conflicts: [],
    };
    api.getAgentResearch
      .mockResolvedValueOnce({
        brief: null,
        coverage,
        notes: [note],
        total: 11,
        next_offset: 10,
      })
      .mockResolvedValueOnce({
        brief: null,
        coverage,
        notes: [
          {
            ...note,
            findings: [{ statement: '第二份明细', evidence_ids: ['e1'] }],
          },
        ],
        total: 11,
        next_offset: null,
      });
    await act(async () =>
      root.render(
        <AgentResearchProgress
          runId="run"
          result={{
            kind: 'document',
            document_id: 'doc',
            title: '标题',
            markdown: '准确文章内容 [e1]',
            citation_ids: ['e1'],
          }}
        />,
      ),
    );
    expect(api.getAgentResearch).not.toHaveBeenCalled();
    await act(async () => {
      const details = element.querySelector('details')!;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(element.textContent).toContain('第一份明细');
    const click = async (text: string) =>
      act(async () => {
        const button = [...element.querySelectorAll('button')].find(
          (b) => b.textContent === text,
        )!;
        button.click();
      });
    await click('查看对应内容');
    expect(element.querySelector('blockquote')?.textContent).toBe(
      '准确文章内容',
    );
    await click('更多研究明细');
    expect(api.getAgentResearch).toHaveBeenLastCalledWith('run', undefined, 10);
    expect(element.textContent).toContain('第一份明细');
    expect(element.textContent).toContain('第二份明细');
  });
  it('shows permission failures and lets the user retry', async () => {
    api.getAgentResearch.mockRejectedValue({
      response: { data: { message: '资料权限已撤回' } },
    });
    await act(async () => root.render(<AgentResearchProgress runId="run" />));
    await act(async () => {
      const details = element.querySelector('details')!;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(element.querySelector('[role=alert]')?.textContent).toBe(
      '资料权限已撤回',
    );
    api.getAgentResearch.mockResolvedValue({
      brief: null,
      coverage: null,
      notes: [],
      next_offset: null,
    });
    await act(async () => {
      [...element.querySelectorAll('button')]
        .find((b) => b.textContent === '刷新研究记录')!
        .click();
    });
    expect(element.querySelector('[role=alert]')).toBeNull();
  });
});
