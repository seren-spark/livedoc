// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import { editorHtmlToMarkdown } from './knowledge-editor';
import {
  applySuggestions,
  captureSnapshot,
  currentTracked,
  mapSnapshot,
  registerAgentSuggestions,
  restoreAgentSelection,
  trackEdits,
} from './document-agent-editor';
import type {
  DocumentEdit,
  DocumentIdentity,
} from '../api/document-agent.types';
const identity: DocumentIdentity = { kind: 'unsaved', local_id: 'test' };
const editors: Editor[] = [];
function setup(content: string) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Markdown, TableKit, Image, Highlight],
    content,
    contentType: 'markdown',
  });
  editors.push(editor);
  registerAgentSuggestions(editor, () => {});
  return editor;
}
function edit(id: string, region: string, text: string): DocumentEdit {
  return {
    id,
    operation: 'replace',
    target: {
      kind: 'block_range',
      first_region_id: region,
      last_region_id: region,
    },
    content_markdown: text,
    explanation: id,
    citation_ids: [],
  };
}
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));
describe('document agent transactions', () => {
  it('restores selection edits to the original range after the current cursor has moved', () => {
    const editor = setup('first paragraph');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const original = captureSnapshot(editor, identity, '', 0);
    const suggestion: DocumentEdit = { ...edit('selection', 'b0', 'updated'), target: { kind: 'selection' } };
    editor.commands.setTextSelection(10);
    const restored = captureSnapshot(editor, identity, '', 0);
    restoreAgentSelection(editor, restored, original.wire.selection, original.selection, [suggestion]);
    trackEdits(editor, restored, [suggestion]);
    applySuggestions(editor, ['selection'], identity, restored);
    expect(editor.getText()).toBe('updated paragraph');
  });
  it('rejects a restored selection whose original text no longer matches', () => {
    const editor = setup('first paragraph');
    const local = captureSnapshot(editor, identity, '', 0);
    const suggestion: DocumentEdit = { ...edit('selection', 'b0', 'updated'), target: { kind: 'selection' } };
    expect(() => restoreAgentSelection(editor, local, { ...local.wire.selection, text: 'old text' },
      { from: 1, to: 6 }, [suggestion])).toThrow('原选区无法恢复');
  });
  it('recovers an inline suggestion after accepting an earlier block edit shifted its position', () => {
    const editor = setup('first\n\nhello world');
    editor.commands.setTextSelection({ from: 8, to: 13 });
    const original = captureSnapshot(editor, identity, '', 0);
    editor.on('transaction', ({ transaction }) => mapSnapshot(original, transaction));
    const inline: DocumentEdit = { ...edit('inline', 'b1', 'Hi'), target: { kind: 'selection' } };
    trackEdits(editor, original, [edit('first', 'b0', 'changed\n\nadded'), inline]);
    applySuggestions(editor, ['first'], identity, original);
    const restored = captureSnapshot(editor, identity, '', 1);
    restoreAgentSelection(editor, restored, { ...original.wire.selection, region_ids: ['b2'] }, original.selection, [inline]);
    trackEdits(editor, restored, [inline]);
    applySuggestions(editor, ['inline'], identity, restored);
    expect(editor.getText()).toContain('Hi world');
    expect(editor.getText()).toContain('added');
    const wrong = captureSnapshot(editor, identity, '', 2);
    expect(() => restoreAgentSelection(editor, wrong, { ...wrong.wire.selection, text: '', region_ids: ['b0'] },
      { from: editor.state.doc.content.size - 1, to: editor.state.doc.content.size - 1 },
      [{ ...inline, target: { kind: 'cursor' } }])).toThrow('原选区无法恢复');
  });
  it('preserves generated tables and highlights through adoption, save and markdown reload', () => {
    const editor = setup('old');
    const snapshot = captureSnapshot(editor, identity, '', 0);
    const markdown =
      '# 评测\n\n==先检索后生成==，关注 **证据**。\n\n| 指标 | 含义 |\n| --- | --- |\n| Recall | 检索覆盖 |\n\n> 结合业务评估。';
    trackEdits(editor, snapshot, [edit('formatted', 'b0', markdown)]);
    applySuggestions(editor, ['formatted'], identity, snapshot);
    expect(editor.getHTML()).toContain('<mark>先检索后生成</mark>');
    expect(
      editor.getJSON().content?.some((node) => node.type === 'table'),
    ).toBe(true);
    const body = editorHtmlToMarkdown(editor.getHTML(), new Map());
    expect(body).toContain('==先检索后生成==');
    const restored = setup(body);
    expect(restored.getHTML()).toContain('<mark>先检索后生成</mark>');
    expect(
      restored.getJSON().content?.some((node) => node.type === 'table'),
    ).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe('old');
  });
  it('keeps skipped heading levels in the right hierarchy and accepts code literals', () => {
    const editor = setup('### Third\n\ntext\n\n## Second\n\nnext');
    const snapshot = captureSnapshot(editor, identity, '', 0);
    expect(snapshot.wire.regions[2].heading_path).toEqual(['Second']);
    trackEdits(editor, snapshot, [
      edit('code', 'b1', '```ts\nconst payload = { data: 1 };\n```'),
    ]);
    applySuggestions(editor, ['code'], identity, snapshot);
    expect(editor.getText()).toContain('data: 1');
  });
  it('targets repeated paragraphs by region, preserves unrelated nodes and undoes a batch once', () => {
    const editor = setup('# 标题\n\n重复段落\n\n重复段落\n\n尾部 **加粗**');
    const original = editor.getJSON();
    const snapshot = captureSnapshot(editor, identity, '', 0);
    trackEdits(editor, snapshot, [
      edit('one', 'b1', '第一处修改'),
      edit('two', 'b2', '第二处修改'),
    ]);
    applySuggestions(editor, ['one', 'two'], identity, snapshot);
    expect(editor.getText()).toContain('第一处修改');
    expect(editor.getText()).toContain('第二处修改');
    expect(editor.getJSON().content?.at(-1)).toEqual(original.content?.at(-1));
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(original);
  });
  it('maps a surviving suggestion after accepting an earlier edit', () => {
    const editor = setup('first\n\nsecond\n\nthird');
    const snapshot = captureSnapshot(editor, identity, '', 0);
    trackEdits(editor, snapshot, [
      edit('first', 'b0', 'a much longer first paragraph'),
      edit('third', 'b2', 'changed third'),
    ]);
    applySuggestions(editor, ['first'], identity, snapshot);
    expect(
      currentTracked(editor).find((e) => e.edit.id === 'third')?.status,
    ).toBe('pending');
    applySuggestions(editor, ['third'], identity, snapshot);
    expect(editor.getText()).toContain('changed third');
  });
  it('allows unrelated changes during generation and conflicts only on changed targets', () => {
    const editor = setup('first\n\nsecond');
    const snapshot = captureSnapshot(editor, identity, '', 0);
    editor.on('transaction', ({ transaction }) =>
      mapSnapshot(snapshot, transaction),
    );
    editor.commands.insertContentAt(2, 'manual ');
    trackEdits(editor, snapshot, [
      edit('first', 'b0', 'candidate'),
      edit('second', 'b1', 'valid candidate'),
    ]);
    expect(currentTracked(editor).map((e) => e.status)).toEqual([
      'conflict',
      'pending',
    ]);
    expect(() =>
      applySuggestions(editor, ['first', 'second'], identity, snapshot),
    ).toThrow();
    applySuggestions(editor, ['second'], identity, snapshot);
    expect(editor.getText()).toContain('manual');
    expect(editor.getText()).toContain('valid candidate');
  });
  it('detects formatting changes after preview without changing untouched suggestions', () => {
    const editor = setup('first\n\nsecond');
    const snapshot = captureSnapshot(editor, identity, '', 0);
    trackEdits(editor, snapshot, [
      edit('first', 'b0', 'new first'),
      edit('second', 'b1', 'new second'),
    ]);
    editor.chain().setTextSelection({ from: 1, to: 4 }).toggleBold().run();
    expect(currentTracked(editor).map((e) => e.status)).toEqual([
      'conflict',
      'pending',
    ]);
  });
  it('rejects another document and keeps the editor unchanged on invalid markdown', () => {
    const editor = setup('first');
    const snapshot = captureSnapshot(editor, identity, '', 0);
    trackEdits(editor, snapshot, [
      edit('one', 'b0', '![new](https://example.com/image.png)'),
    ]);
    expect(() =>
      applySuggestions(
        editor,
        ['one'],
        { kind: 'unsaved', local_id: 'other' },
        snapshot,
      ),
    ).toThrow('文档已切换');
    expect(() =>
      applySuggestions(editor, ['one'], identity, snapshot),
    ).toThrow();
    expect(editor.getText()).toBe('first');
  });
  it('changes a table as a whole and preserves an existing image', () => {
    const editor = setup(
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![existing](https://example.com/existing.png)',
    );
    const original = editor.getJSON();
    const snapshot = captureSnapshot(editor, identity, '', 0);
    trackEdits(editor, snapshot, [
      edit('table', 'b0', '| A | B |\n| --- | --- |\n| 3 | 4 |'),
    ]);
    applySuggestions(editor, ['table'], identity, snapshot);
    expect(editor.getText()).toContain('3');
    expect(editor.getJSON().content?.find((n) => n.type === 'image')).toEqual(
      original.content?.find((n) => n.type === 'image'),
    );
  });
  it('replaces inline selection and deletes the only block without invalidating the document', () => {
    const editor = setup('hello world');
    editor.commands.setTextSelection({ from: 1, to: 6 });
    let snapshot = captureSnapshot(editor, identity, '', 0);
    trackEdits(editor, snapshot, [
      {
        id: 'inline',
        operation: 'replace',
        target: { kind: 'selection' },
        content_markdown: '**Hi**',
        explanation: '',
        citation_ids: [],
      },
    ]);
    applySuggestions(editor, ['inline'], identity, snapshot);
    expect(editor.getText()).toBe('Hi world');
    snapshot = captureSnapshot(editor, identity, '', 1);
    trackEdits(editor, snapshot, [
      {
        id: 'delete',
        operation: 'delete',
        target: { kind: 'block_range', first_region_id: 'b0' },
        explanation: '',
        citation_ids: [],
      },
    ]);
    applySuggestions(editor, ['delete'], identity, snapshot);
    editor.state.doc.check();
    expect(editor.getText()).toBe('');
  });
});
