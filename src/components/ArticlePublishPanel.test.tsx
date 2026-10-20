// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { assert, expect, it, vi } from 'vitest';
import ArticlePublishPanel from './ArticlePublishPanel';
import type { useArticleSession } from '@/hooks/useArticleSession';

vi.mock('@/api/rag', () => ({ fetchDocumentAssetBlob: vi.fn() }));

it('defaults to blog publication, sends the knowledge choice and restores it when reopening', async () => {
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
  const publish = vi.fn();
  const session = {
    draft: { title: '测试文章', summary: '', tags: [], cover_asset_id: null },
    record: null,
    saveState: 'saved',
    error: '',
    publish,
    change: vi.fn(),
    uploadCover: vi.fn(),
  } as unknown as ReturnType<typeof useArticleSession>;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async (open = true) =>
    act(async () =>
      root.render(
        <ArticlePublishPanel open={open} onClose={vi.fn()} session={session} />,
      ),
    );
  const checkbox = () => {
    const input = document.body.querySelector<HTMLInputElement>(
      '.ant-modal input[type="checkbox"]',
    );
    assert(input);
    return input;
  };
  const confirm = async () => {
    const button = document.body.querySelector<HTMLButtonElement>(
      '.ant-modal-footer .ant-btn-primary',
    );
    assert(button);
    await act(async () => button.click());
  };
  try {
    await render();
    expect(checkbox().checked).toBe(false);
    await confirm();
    expect(publish).toHaveBeenLastCalledWith(false);
    await act(async () => checkbox().click());
    expect(checkbox().checked).toBe(true);
    session.record = {
      article_id: 'autosaved',
      state: 'draft',
      published_draft_version: null,
      include_in_knowledge: false,
    } as typeof session.record;
    await render();
    expect(checkbox().checked).toBe(true);
    await confirm();
    expect(publish).toHaveBeenLastCalledWith(true);
    await render(false);
    session.record = {
      article_id: 'published',
      state: 'published',
      published_draft_version: 2,
      include_in_knowledge: true,
    } as typeof session.record;
    await render();
    expect(checkbox().checked).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
