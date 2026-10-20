// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { assert, expect, it, vi } from 'vitest';
import type { DocumentRecord } from '../../api/rag';
import KnowledgePage from '../../pages/knowledge';

const { navigate, listDocuments } = vi.hoisted(() => ({
  navigate: vi.fn(),
  listDocuments: vi.fn(),
}));

function required<T>(value: T | null | undefined): T {
  assert(value);
  return value;
}

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/contexts/authContext', () => ({
  useAuth: () => ({ isLoggedIn: true, showLoginModal: vi.fn() }),
}));
vi.mock('@/api/document-agent', () => ({
  agentCapabilities: async () => ({ workspace_enabled: true }),
}));
vi.mock('@/api/rag', () => ({
  listKnowledgeDocuments: listDocuments,
  getRagMetrics: async () => null,
}));
vi.mock('@/api/workspace', () => ({
  getCategoryTree: async () => ({ revision: 1, items: [], counts: {} }),
}));

it('keeps technical data in a dismissible per-document detail dialog and retains document actions', async () => {
  const record: DocumentRecord = {
    doc_id: 'private-document-id',
    space_id: 'private-space-id',
    owner_id: 'private-owner-id',
    title: '项目知识笔记',
    content: '笔记正文',
    visibility: 'private',
    source_type: 'note',
    tags: [],
    document_version: 3,
    active_index_version: 2,
    latest_index_job_id: 'private-job-id',
    index_status: 'failed',
    index_error: '索引服务暂时不可用',
    chunk_count: 16,
    created_at: '2026-10-19T14:29:00',
    updated_at: '2026-10-20T09:30:00',
    assets: [
      {
        asset_id: 'private-asset-id',
        space_id: 'private-space-id',
        owner_id: 'private-owner-id',
        kind: 'source',
        filename: '资料.pdf',
        mime_type: 'application/pdf',
        byte_size: 100,
        sha256: 'a'.repeat(64),
        content_url: '/assets/private-asset-id/content',
        ocr_text: '',
        description: '',
        analysis_status: 'ready',
        created_at: '2026-10-19T14:29:00',
      },
    ],
  };
  listDocuments.mockResolvedValue({
    items: [
      record,
      {
        ...record,
        doc_id: 'second-document-id',
        title: '另一篇文档',
        index_status: 'queued',
        assets: [],
      },
    ],
    total: 2,
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
  const computedStyle = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) =>
    computedStyle(element),
  );
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const click = async (element: Element) => {
    await act(async () => (element as HTMLElement).click());
  };
  try {
    await act(async () => root.render(<KnowledgePage />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    const rows = container.querySelectorAll('.ant-table-tbody .ant-table-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain(record.title);
    expect(rows[0].textContent).not.toContain(record.doc_id);
    expect(rows[0].textContent).not.toContain(record.owner_id);
    expect(rows[0].textContent).not.toContain('chunks');
    expect(rows[0].textContent).not.toContain('serving');
    await click(required(rows[0].querySelector('.knowledge-doc-title')));
    expect(navigate).toHaveBeenCalledWith(
      '/editor/draft?mode=knowledge&docId=private-document-id',
    );

    const detailButton = required(
      [...rows[0].querySelectorAll('button')].find(
        (button) => button.textContent === '详情',
      ),
    );
    await click(detailButton);
    const dialog = required(document.querySelector('[role="dialog"]'));
    expect(dialog.textContent).toContain(record.doc_id);
    expect(dialog.textContent).toContain(record.space_id);
    expect(dialog.textContent).toContain(record.owner_id);
    expect(dialog.textContent).toContain(record.index_error);
    expect(dialog.textContent).toContain(record.assets[0].sha256);
    expect(dialog.querySelector('.ant-typography-copy')).not.toBeNull();
    await click(required(dialog.querySelector('.ant-modal-footer button')));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await click(
      required(
        [...rows[1].querySelectorAll('button')].find(
          (button) => button.textContent === '详情',
        ),
      ),
    );
    expect(
      required(document.querySelector('[role="dialog"]')).textContent,
    ).toContain('second-document-id');
    expect(
      required(document.querySelector('[role="dialog"]')).textContent,
    ).not.toContain(record.doc_id);
    await click(required(document.querySelector('.ant-modal-close')));
    await click(required(rows[1].querySelector('[aria-label^="更多操作"]')));
    const reindexItem = required(
      [...document.querySelectorAll('[role="menuitem"]')].find((item) =>
        item.textContent?.includes('重建索引'),
      ),
    );
    expect(reindexItem.getAttribute('aria-disabled')).toBe('true');
    expect(document.body.textContent).toContain('移动到分类');
    expect(document.body.textContent).toContain('删除文档');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
}, 15_000);
