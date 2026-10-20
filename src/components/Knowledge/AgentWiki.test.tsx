// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentWiki from './AgentWiki';
import type { WikiPage } from '@/api/wiki';

const api = vi.hoisted(() => ({
  createWikiCandidate: vi.fn(),
  getWiki: vi.fn(),
  listWiki: vi.fn(),
  publishWiki: vi.fn(),
  removeWiki: vi.fn(),
}));
vi.mock('@/api/wiki', () => api);
const draft: WikiPage = {
  wiki_id: 'wiki1',
  revision: 1,
  title: '混合检索',
  markdown: '向量与关键词互补 [source]',
  status: 'draft',
  source_status: 'valid',
  source_count: 1,
  review: { passed: true, issues: [] },
  updated_at: new Date().toISOString(),
  citations: [
    {
      id: 'source',
      title: '设计原文',
      kind: 'document',
      version: 1,
      source_content: '可追溯的原始证据',
    },
  ],
};
let container: HTMLDivElement;
let root: Root;
const button = (text: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === text,
  )!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
  const computed = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) =>
    computed(element),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('private wiki preview and confirmation', () => {
  it('previews a sourced candidate and saves only after explicit confirmation', async () => {
    api.createWikiCandidate.mockResolvedValue(draft);
    api.publishWiki.mockResolvedValue({ ...draft, status: 'published' });
    await act(async () =>
      root.render(
        <AgentWiki authorized runId="run1" answer="original answer" />,
      ),
    );
    await act(async () => button('沉淀为 Wiki').click());
    expect(api.createWikiCandidate).toHaveBeenCalledWith(
      'run1',
      'original answer',
      expect.any(AbortSignal),
    );
    expect(api.publishWiki).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('向量与关键词互补');
    await act(async () =>
      document.body
        .querySelector<HTMLButtonElement>('[aria-label="查看来源：设计原文"]')!
        .click(),
    );
    expect(document.body.textContent).toContain('可追溯的原始证据');
    await act(async () => button('确认保存').click());
    expect(api.publishWiki).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(
      '已保存，可在对应知识范围内复用',
    );
  });

  it('keeps stale content and evidence hidden and disallows publishing', async () => {
    const stale = {
      ...draft,
      source_status: 'stale',
      markdown: 'stale secret body',
      citations: [
        { ...draft.citations[0]!, source_content: 'stale secret evidence' },
      ],
    };
    api.listWiki.mockResolvedValue({
      items: [
        { ...draft, source_status: 'stale', title: '来源已变化的知识条目' },
      ],
    });
    api.getWiki.mockResolvedValue(stale);
    await act(async () => root.render(<AgentWiki authorized />));
    await act(async () => button('我的 Wiki').click());
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('.wiki-select')!.click(),
    );
    expect(document.body.textContent).toContain('来源已变化，内容已停止使用');
    expect(document.body.textContent).not.toContain('stale secret body');
    expect(document.body.textContent).not.toContain('stale secret evidence');
    expect(button('确认保存')).toBeUndefined();
    expect(api.publishWiki).not.toHaveBeenCalled();
  });

  it('cancels preparation on close and ignores a late response', async () => {
    let resolve!: (value: WikiPage) => void;
    api.createWikiCandidate.mockReturnValue(
      new Promise<WikiPage>((done) => {
        resolve = done;
      }),
    );
    await act(async () =>
      root.render(<AgentWiki authorized runId="run1" answer="original" />),
    );
    await act(async () => button('沉淀为 Wiki').click());
    const signal = api.createWikiCandidate.mock.calls[0]![2] as AbortSignal;
    await act(async () =>
      document.body
        .querySelector<HTMLButtonElement>('.ant-modal-close')!
        .click(),
    );
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ ...draft, markdown: 'late private body' }));
    expect(document.body.textContent).not.toContain('late private body');
    expect(api.publishWiki).not.toHaveBeenCalled();
  });

  it('requires a completed eligible answer and login before offering capture', async () => {
    await act(async () =>
      root.render(
        <AgentWiki
          authorized
          runId="run1"
          answer="unsourced"
          available={false}
        />,
      ),
    );
    expect(button('沉淀为 Wiki').disabled).toBe(true);
    await act(async () =>
      root.render(
        <AgentWiki authorized={false} runId="run1" answer="sourced" />,
      ),
    );
    expect(button('沉淀为 Wiki').disabled).toBe(true);
    expect(api.createWikiCandidate).not.toHaveBeenCalled();
  });
});
