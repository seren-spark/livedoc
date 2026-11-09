// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api/rag';
import * as assets from '@/lib/knowledge-editor';
import { message } from 'antd';
import { useKnowledgeDocumentSession } from './useKnowledgeDocumentSession';

const routing = vi.hoisted(() => ({ query: '', navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(routing.query)],
  useNavigate: () => routing.navigate,
}));
vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('@/api/workspace', () => ({
  getTemplates: vi.fn(),
  getCategoryTree: vi.fn(),
  categoryMutation: vi.fn(),
}));
vi.mock('@/api/rag', () => ({
  confirmDocumentImport: vi.fn(),
  createKnowledgeDocument: vi.fn(),
  fetchDocumentAssetBlob: vi.fn(),
  getDocumentImport: vi.fn(),
  getKnowledgeDocument: vi.fn(),
  reindexKnowledgeDocument: vi.fn(),
  updateDocumentImport: vi.fn(),
  updateKnowledgeDocument: vi.fn(),
  uploadDocumentAsset: vi.fn(),
}));
vi.mock('@/lib/knowledge-editor', () => ({
  collectAssetIds: vi.fn(),
  editorHtmlToMarkdown: vi.fn(),
  hydrateEditorContent: vi.fn(),
  hydrateMarkdownAssets: vi.fn(),
  persistInlineImages: vi.fn(),
  revokeAssetBlobs: vi.fn(),
}));

const content = { type: 'doc' as const, content: [] };
const record = (version = 1, visibility = 'private') =>
  ({
    doc_id: 'doc',
    title: 'Original',
    content: 'old body',
    document_version: version,
    visibility,
    editor_content: content,
  }) as api.DocumentRecord;
const conflict = { response: { status: 409 } };
let root: Root;
let container: HTMLDivElement;
let session: ReturnType<typeof useKnowledgeDocumentSession>;

async function mount(query = 'mode=knowledge&docId=doc') {
  routing.query = query;
  const editor = {
    commands: { setContent: vi.fn(), clearContent: vi.fn() },
    getJSON: () => content,
    getHTML: () => '<p>body edited</p>',
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as Editor;
  function Harness() {
    session = useKnowledgeDocumentSession(editor);
    return null;
  }
  await act(async () => root.render(<Harness />));
  await act(async () => session.setTitle('Edited'));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.clear();
  vi.mocked(api.getKnowledgeDocument).mockResolvedValue(record());
  vi.mocked(api.updateKnowledgeDocument).mockResolvedValue(record(2));
  vi.mocked(api.createKnowledgeDocument).mockResolvedValue(record());
  vi.mocked(api.getDocumentImport).mockResolvedValue({
    import_id: 'import',
    title: 'Original',
    status: 'review_ready',
    editor_content: content,
  } as api.DocumentImportRecord);
  vi.mocked(api.confirmDocumentImport).mockResolvedValue({
    document: record(),
    index_job: {} as api.IndexJob,
  });
  vi.mocked(assets.persistInlineImages).mockResolvedValue(content);
  vi.mocked(assets.hydrateEditorContent).mockResolvedValue(content);
  vi.mocked(assets.collectAssetIds).mockReturnValue(['image']);
  vi.mocked(assets.editorHtmlToMarkdown).mockReturnValue('body edited');
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('knowledge document save branches', () => {
  it('saves an existing document with its version and clears recovery before indexing', async () => {
    await mount();
    localStorage.setItem('livedoc:knowledge-recovery:doc', 'recovery');
    await act(async () => session.saveToKnowledge());
    expect(api.updateKnowledgeDocument).toHaveBeenCalledWith('doc', {
      title: 'Edited',
      content: 'body edited',
      editor_content: content,
      asset_ids: ['image'],
      expected_version: 1,
    });
    expect(session.documentRecord?.document_version).toBe(2);
    expect(session.saveState).toBe('saved');
    expect(localStorage.getItem('livedoc:knowledge-recovery:doc')).toBeNull();
    expect(api.reindexKnowledgeDocument).toHaveBeenCalledWith('doc');
  });

  it('keeps a successful body save when indexing fails', async () => {
    await mount();
    vi.mocked(api.reindexKnowledgeDocument).mockRejectedValue(
      new Error('index unavailable'),
    );
    await act(async () => session.saveToKnowledge());
    expect(session.saveState).toBe('saved');
    expect(message.warning).toHaveBeenCalledWith(
      '正文已经保存，但索引任务启动失败，请在知识库中重新索引',
    );
    expect(message.error).not.toHaveBeenCalled();
  });

  it('creates a document using server-side immediate indexing', async () => {
    await mount('mode=knowledge');
    await act(async () => session.saveToKnowledge());
    expect(api.createKnowledgeDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Edited',
        content: 'body edited',
        visibility: 'private',
        source_type: 'note',
        index_now: true,
      }),
    );
    expect(api.reindexKnowledgeDocument).not.toHaveBeenCalled();
    expect(routing.navigate).toHaveBeenCalledWith(
      '/editor/draft?mode=knowledge&docId=doc',
      { replace: true },
    );
  });

  it.each([false, true])(
    'saves import preview with confirmation=%s',
    async (confirm) => {
      await mount('mode=knowledge&importId=import');
      await act(async () =>
        confirm ? session.saveToKnowledge() : session.saveDraft(),
      );
      expect(api.updateDocumentImport).toHaveBeenCalledWith(
        'import',
        expect.objectContaining({ title: 'Edited' }),
      );
      expect(api.confirmDocumentImport).toHaveBeenCalledTimes(confirm ? 1 : 0);
      expect(routing.navigate).toHaveBeenCalledTimes(confirm ? 1 : 0);
      expect(session.saveState).toBe('saved');
    },
  );

  it('saves to the formal document if another request has already confirmed the import', async () => {
    await mount('mode=knowledge&importId=import');
    vi.mocked(api.updateDocumentImport).mockRejectedValue(conflict);
    vi.mocked(api.getDocumentImport).mockResolvedValue({
      status: 'confirmed',
      document_id: 'doc',
    } as api.DocumentImportRecord);
    await act(async () => session.saveToKnowledge());
    expect(api.updateKnowledgeDocument).toHaveBeenCalledWith(
      'doc',
      expect.objectContaining({ expected_version: 1 }),
    );
    expect(api.reindexKnowledgeDocument).toHaveBeenCalledWith('doc');
    expect(api.confirmDocumentImport).not.toHaveBeenCalled();
    expect(session.importRecord?.status).toBe('confirmed');
    expect(session.saveState).toBe('saved');
  });

  it('recognizes an already-saved version after a conflict', async () => {
    await mount();
    vi.mocked(api.updateKnowledgeDocument).mockRejectedValue(conflict);
    vi.mocked(api.getKnowledgeDocument).mockResolvedValue({
      ...record(2),
      title: 'Edited',
      content: 'body edited',
    });
    await act(async () => session.saveToKnowledge());
    expect(api.updateKnowledgeDocument).toHaveBeenCalledTimes(1);
    expect(session.documentRecord?.document_version).toBe(2);
    expect(session.saveState).toBe('saved');
    expect(api.reindexKnowledgeDocument).toHaveBeenCalledTimes(1);
  });

  it('retains the existing single retry for a private-document conflict', async () => {
    await mount();
    vi.mocked(api.updateKnowledgeDocument)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(record(3));
    vi.mocked(api.getKnowledgeDocument).mockResolvedValue(record(2));
    await act(async () => session.saveToKnowledge());
    expect(api.updateKnowledgeDocument).toHaveBeenNthCalledWith(
      2,
      'doc',
      expect.objectContaining({ expected_version: 2 }),
    );
    expect(session.documentRecord?.document_version).toBe(3);
    expect(session.saveState).toBe('saved');
  });

  it('retains local recovery when a team-document conflict requires manual merging', async () => {
    await mount();
    vi.mocked(api.updateKnowledgeDocument).mockRejectedValue(conflict);
    vi.mocked(api.getKnowledgeDocument).mockResolvedValue(record(2, 'team'));
    await act(async () => session.saveToKnowledge());
    expect(api.updateKnowledgeDocument).toHaveBeenCalledTimes(1);
    expect(api.reindexKnowledgeDocument).not.toHaveBeenCalled();
    expect(session.saveState).toBe('dirty');
    expect(
      JSON.parse(localStorage.getItem('livedoc:knowledge-recovery:doc')!)
        .markdown,
    ).toBe('body edited');
  });

  it('prevents duplicate saves while image preparation is pending', async () => {
    await mount();
    let release!: (value: api.TipTapDocument) => void;
    vi.mocked(assets.persistInlineImages).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await act(async () => {
      const saving = session.saveToKnowledge();
      await session.saveToKnowledge();
      release(content);
      await saving;
    });
    expect(api.updateKnowledgeDocument).toHaveBeenCalledTimes(1);
  });

  it('keeps the editor in error state when image preparation fails before saving', async () => {
    await mount();
    vi.mocked(assets.persistInlineImages).mockRejectedValue(
      new Error('image upload failed'),
    );
    await act(async () => session.saveToKnowledge());
    expect(api.updateKnowledgeDocument).not.toHaveBeenCalled();
    expect(api.reindexKnowledgeDocument).not.toHaveBeenCalled();
    expect(session.saveState).toBe('error');
    expect(message.error).toHaveBeenCalledWith('image upload failed');
  });
});
