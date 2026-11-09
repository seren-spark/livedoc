import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Fragment, Slice } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import type {
  DocumentEdit,
  DocumentIdentity,
  EditorSnapshot,
} from '@/api/document-agent.types';

export type EditStatus = 'pending' | 'accepted' | 'rejected' | 'conflict';
export interface TrackedEdit {
  edit: DocumentEdit;
  from: number;
  to: number;
  status: EditStatus;
  original: string;
  anchorFrom: number;
  anchorTo: number;
  anchorOriginal: string;
  before: string;
}
export interface LocalSnapshot {
  wire: EditorSnapshot;
  ranges: Map<string, { from: number; to: number }>;
  selection: { from: number; to: number };
  docKey: string;
  originalRanges: Map<string, string>;
  conflicts: Set<string>;
}
export const documentKey = (identity: DocumentIdentity) =>
  identity.kind === 'knowledge'
    ? `knowledge:${identity.doc_id}`
    : identity.kind === 'article'
      ? `article:${identity.article_id}`
      : identity.kind === 'import'
        ? `import:${identity.import_id}`
        : `unsaved:${identity.local_id}`;
const pluginKey = new PluginKey<TrackedEdit[]>('documentAgentSuggestions');
const contentAt = (editor: Editor, from: number, to: number) =>
  JSON.stringify(editor.state.doc.slice(from, to).toJSON());
export function captureSnapshot(
  editor: Editor,
  identity: DocumentIdentity,
  title: string,
  revision: number,
): LocalSnapshot {
  const json = editor.getJSON();
  const ranges = new Map<string, { from: number; to: number }>();
  let headingPath: string[] = [];
  const headingStack:Array<{level:number;text:string}>=[];
  const regions: Array<any> = [];
  editor.state.doc.forEach((node, offset, index) => {
    const id = `b${index}`;
    ranges.set(id, { from: offset, to: offset + node.nodeSize });
    if (node.type.name === 'heading') {
      const level=Number(node.attrs.level);
      while(headingStack.length&&headingStack.at(-1)!.level>=level) headingStack.pop();
      headingStack.push({level,text:node.textContent});headingPath=headingStack.map(item=>item.text);
    }
    regions.push({
      id,
      type: node.type.name,
      heading_path: [...headingPath],
      text: node.textContent,
      markdown: editor.markdown.serialize({
        type: 'doc',
        content: [node.toJSON()],
      }),
      original_json: node.toJSON(),
    });
  });
  const { from, to, $from, $to } = editor.state.selection;
  const identityKey = documentKey(identity);
  const selection = {
    cursor_before:editor.state.doc.textBetween(Math.max(0,from-800),from,'\n'),
    cursor_after:editor.state.doc.textBetween(to,Math.min(editor.state.doc.content.size,to+400),'\n'),
    text: from === to ? '' : editor.state.doc.textBetween(from, to, '\n'),
    inline: $from.sameParent($to) && $from.parent.isTextblock,
    region_ids: [...ranges]
      .filter(
        ([, r]) =>
          (from < r.to && to > r.from) ||
          (from === to && from >= r.from && from < r.to),
      )
      .map(([id]) => id),
  };
  const wire: EditorSnapshot = {
    identity,
    title,
    json,
    revision,
    hash: `${identityKey}:${revision}`,
    regions,
    selection,
  };
  return {
    wire,
    ranges,
    selection: { from, to },
    docKey: identityKey,
    originalRanges: new Map(
      [...ranges].map(([id, r]) => [id, contentAt(editor, r.from, r.to)]),
    ),
    conflicts: new Set(),
  };
}
export function mapSnapshot(snapshot: LocalSnapshot, tr: Transaction) {
  if (!tr.docChanged) return;
  for (const [id, r] of snapshot.ranges) {
    const from = tr.mapping.map(r.from, 1),
      to = tr.mapping.map(r.to, -1);
    if (
      to < from ||
      JSON.stringify(tr.doc.slice(from, Math.max(from, to)).toJSON()) !==
        snapshot.originalRanges.get(id)
    )
      snapshot.conflicts.add(id);
    snapshot.ranges.set(id, { from, to: Math.max(from, to) });
  }
  snapshot.selection = {
    from: tr.mapping.map(snapshot.selection.from, 1),
    to: tr.mapping.map(snapshot.selection.to, -1),
  };
}
export function restoreAgentSelection(editor: Editor, snapshot: LocalSnapshot,
  selection: EditorSnapshot['selection'], range: { from: number; to: number }, edits: DocumentEdit[]) {
  if (!edits.some(edit => edit.target.kind !== 'block_range')) return;
  const anchors = selection.region_ids.map(id => snapshot.ranges.get(id));
  if (!range || !Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from < 0 ||
    range.to < range.from || range.to > editor.state.doc.content.size ||
    !anchors.length || anchors.some(anchor => !anchor) ||
    range.from < anchors[0]!.from || range.to > anchors.at(-1)!.to ||
    editor.state.doc.textBetween(range.from, range.to, '\n') !== selection.text)
    throw new Error('原选区无法恢复，请重新生成修改建议');
  snapshot.selection = { ...range };
  snapshot.wire.selection = selection;
}
export function registerAgentSuggestions(
  editor: Editor,
  onChange: (edits: TrackedEdit[]) => void,
) {
  if (pluginKey.getState(editor.state)) editor.unregisterPlugin(pluginKey);
  editor.registerPlugin(
    new Plugin<TrackedEdit[]>({
      key: pluginKey,
      state: {
        init: () => [],
        apply(tr, previous) {
          const assigned = tr.getMeta(pluginKey);
          if (assigned) return assigned;
          if (!tr.docChanged) return previous;
          const own = tr.getMeta('documentAgentApplied');
          return previous.map((item) => {
            if (item.status !== 'pending') return item;
            const from = tr.mapping.map(item.from, 1),
              to = tr.mapping.map(item.to, -1);
            const anchorFrom = tr.mapping.map(item.anchorFrom, 1),
              anchorTo = tr.mapping.map(item.anchorTo, -1);
            let changed = anchorTo < anchorFrom || to < from;
            if (!changed)
              changed =
                JSON.stringify(tr.doc.slice(anchorFrom, anchorTo).toJSON()) !==
                item.anchorOriginal;
            return {
              ...item,
              from,
              to,
              anchorFrom,
              anchorTo,
              status: changed && !own ? 'conflict' : item.status,
            };
          });
        },
      },
      props: {
        decorations(state) {
          const edits = pluginKey.getState(state) ?? [];
          const decorations = edits
            .filter((e) => ['pending', 'conflict'].includes(e.status))
            .flatMap((e) => {
              if (e.from < 0 || e.to > state.doc.content.size || e.to < e.from)
                return [];
              if (e.from === e.to)
                return [
                  Decoration.widget(
                    e.from,
                    () => {
                      const marker = document.createElement('span');
                      marker.className = `agent-insert-marker ${e.status}`;
                      marker.textContent = '＋';
                      marker.title = e.edit.explanation;
                      return marker;
                    },
                    { side: 1 },
                  ),
                ];
              return [
                Decoration.inline(e.from, e.to, {
                  class: `agent-change-mark ${e.status}`,
                  'data-agent-edit': e.edit.id,
                }),
              ];
            });
          return DecorationSet.create(state.doc, decorations);
        },
      },
      view: () => ({
        update(view) {
          onChange(pluginKey.getState(view.state) ?? []);
        },
      }),
    }),
  );
  return () => {
    if (!editor.isDestroyed) editor.unregisterPlugin(pluginKey);
  };
}
export function trackEdits(
  editor: Editor,
  snapshot: LocalSnapshot,
  edits: DocumentEdit[],
): TrackedEdit[] {
  const tracked = edits.map((edit) => {
    let from: number, to: number, anchorFrom: number, anchorTo: number;
    if (edit.target.kind === 'block_range') {
      const first = snapshot.ranges.get(edit.target.first_region_id!);
      const last = snapshot.ranges.get(
        edit.target.last_region_id ?? edit.target.first_region_id!,
      );
      if (!first || !last || last.to < first.from)
        throw new Error('修改目标不存在');
      anchorFrom = first.from;
      anchorTo = last.to;
      from = first.from;
      to = last.to;
      if (edit.operation === 'insert_before') to = from;
      if (edit.operation === 'insert_after') from = to;
    } else {
      from = snapshot.selection.from;
      to = edit.target.kind === 'cursor' ? from : snapshot.selection.to;
      if (edit.target.kind === 'selection' && !snapshot.wire.selection.inline)
        throw new Error('复杂选区应提交完整块级建议');
      const anchors = snapshot.wire.selection.region_ids
        .map((id) => snapshot.ranges.get(id)!)
        .filter(Boolean);
      anchorFrom = anchors[0]?.from ?? from;
      anchorTo = anchors.at(-1)?.to ?? to;
    }
    const ids =
      edit.target.kind === 'block_range'
        ? snapshot.wire.regions
            .slice(
              snapshot.wire.regions.findIndex(
                (r) => r.id === edit.target.first_region_id,
              ),
              snapshot.wire.regions.findIndex(
                (r) =>
                  r.id ===
                  (edit.target.last_region_id ?? edit.target.first_region_id),
              ) + 1,
            )
            .map((r) => r.id)
        : snapshot.wire.selection.region_ids;
    const before =
      edit.target.kind === 'selection'
        ? snapshot.wire.selection.text
        : snapshot.wire.regions
            .filter((r) => ids.includes(r.id))
            .map((r) => r.text)
            .join('\n');
    return {
      edit,
      from,
      to,
      anchorFrom,
      anchorTo,
      status: ids.some((id) => snapshot.conflicts.has(id))
        ? ('conflict' as const)
        : ('pending' as const),
      original: contentAt(editor, from, to),
      anchorOriginal: contentAt(editor, anchorFrom, anchorTo),
      before,
    };
  });
  const ordered = [...tracked].sort((a, b) => a.from - b.from || a.to - b.to);
  if (
    ordered.some(
      (e, i) =>
        i > 0 &&
        (ordered[i - 1]!.to > e.from || ordered[i - 1]!.from === e.from),
    )
  )
    throw new Error('修改建议位置重叠');
  setTracked(editor, tracked);
  return tracked;
}
export function setTracked(editor: Editor, items: TrackedEdit[]) {
  editor.view.dispatch(
    editor.state.tr.setMeta(pluginKey, items).setMeta('addToHistory', false),
  );
}
export function currentTracked(editor: Editor) {
  return pluginKey.getState(editor.state) ?? [];
}
function parsedFragment(editor: Editor, item: TrackedEdit): Fragment {
  const raw = item.edit.content_markdown ?? '';
  const parsed = editor.schema.nodeFromJSON(editor.markdown.parse(raw));
  parsed.check();
  parsed.descendants(node=> {
    if(node.type.name==='image'||node.attrs.src) throw new Error('建议包含不允许的新图片');
    for(const mark of node.marks) if(mark.type.name==='link') {
      const uri=new URL(String(mark.attrs.href),'https://livedoc.invalid');
      if(!['http:','https:','mailto:'].includes(uri.protocol)) throw new Error('不允许此链接协议');
    }
  });
  if (
    item.edit.target.kind === 'selection' ||
    (item.edit.target.kind === 'cursor' &&
      parsed.childCount === 1 &&
      parsed.firstChild?.type.name === 'paragraph')
  ) {
    if (parsed.childCount !== 1 || parsed.firstChild?.type.name !== 'paragraph')
      throw new Error('文本选区只能插入内联内容');
    return parsed.firstChild.content;
  }
  return parsed.content;
}
export function applySuggestions(
  editor: Editor,
  ids: string[],
  identity: DocumentIdentity,
  snapshot: LocalSnapshot,
): TrackedEdit[] {
  if (documentKey(identity) !== snapshot.docKey)
    throw new Error('文档已切换，旧建议不能应用');
  const all = currentTracked(editor);
  const selected = all.filter((e) => ids.includes(e.edit.id));
  if (
    selected.length !== ids.length ||
    selected.some(
      (e) =>
        e.status !== 'pending' ||
        contentAt(editor, e.anchorFrom, e.anchorTo) !== e.anchorOriginal,
    )
  )
    throw new Error('目标内容已经改变，请重新生成冲突建议');
  const fragments = new Map(
    selected
      .filter((e) => e.edit.operation !== 'delete')
      .map((e) => [e.edit.id, parsedFragment(editor, e)]),
  );
  const tr = closeHistory(editor.state.tr);
  for (const item of [...selected].sort((a, b) => b.from - a.from)) {
    if (item.edit.operation === 'delete') tr.deleteRange(item.from, item.to);
    else
      tr.replaceRange(
        item.from,
        item.to,
        new Slice(fragments.get(item.edit.id)!, 0, 0),
      );
  }
  tr.doc.check();
  const next = all.map((item) => {
    if (ids.includes(item.edit.id))
      return { ...item, status: 'accepted' as const };
    if (item.status !== 'pending') return item;
    const from = tr.mapping.map(item.from, 1),
      to = tr.mapping.map(item.to, -1),
      anchorFrom = tr.mapping.map(item.anchorFrom, 1),
      anchorTo = tr.mapping.map(item.anchorTo, -1);
    const status =
      anchorTo < anchorFrom ||
      JSON.stringify(tr.doc.slice(anchorFrom, anchorTo).toJSON()) !==
        item.anchorOriginal
        ? ('conflict' as const)
        : item.status;
    return { ...item, from, to, anchorFrom, anchorTo, status };
  });
  tr.setMeta(pluginKey, next).setMeta('documentAgentApplied', true);
  editor.view.dispatch(tr);
  editor.view.dispatch(
    closeHistory(editor.state.tr).setMeta('addToHistory', false),
  );
  return next;
}
