/**
 * @file Agent 编辑器桥接。捕获快照、跟踪候选位置与冲突，并按用户选择应用修改。
 */
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
/**
 * 把知识文档、文章、导入稿或未保存文稿转换为稳定身份键。
 *
 * @param identity 当前文稿类型及其稳定身份。
 * @returns 按文稿类型区分的稳定身份键。
 */
export const documentKey = (identity: DocumentIdentity) =>
  identity.kind === 'knowledge'
    ? `knowledge:${identity.doc_id}`
    : identity.kind === 'article'
      ? `article:${identity.article_id}`
      : identity.kind === 'import'
        ? `import:${identity.import_id}`
        : `unsaved:${identity.local_id}`;
const pluginKey = new PluginKey<TrackedEdit[]>('documentAgentSuggestions');
/**
 * 序列化编辑器指定区间的内容，用于判断原文是否变化。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param from 编辑区间的起始位置。
 * @param to 编辑区间的结束位置。
 * @returns 整理后的文本或标识。
 */
const contentAt = (editor: Editor, from: number, to: number) =>
  JSON.stringify(editor.state.doc.slice(from, to).toJSON());
/**
 * 捕获块区域、选区、Markdown 和本地位置映射，作为 Agent 请求的编辑基线。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param identity 当前文稿类型及其稳定身份。
 * @param title 文档或界面标题。
 * @param revision 调用方读取到的状态修订号。
 * @returns 可发送给 Agent 的快照及本地编辑位置映射。
 */
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
/**
 * 根据编辑器事务映射快照位置，并记录已发生内容冲突的区域。
 *
 * @param snapshot 任务开始时保存的文档或配置快照。
 * @param tr 本次编辑器事务及其位置映射。
 */
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
/**
 * 根据本地快照恢复候选操作需要的编辑器选区。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param snapshot 任务开始时保存的文档或配置快照。
 * @param selection 当前选区的范围与文本信息。
 * @param range 需要读取、编辑或映射的区间。
 * @param edits 待跟踪、校验或采纳的编辑建议集合。
 */
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
/**
 * 注册候选跟踪插件，在文档变化时维护高亮与候选位置。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param onChange 状态变化后的通知回调。
 * @returns 供后续操作使用的回调或清理函数。
 */
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
        /**
         * 根据事务映射待采纳编辑的位置，并标记已发生原文变化的冲突。
         *
         * @param tr 本次编辑器事务及其位置映射。
         * @param previous 更新前的状态。
         * @returns 本次操作整理后的结果。
         */
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
        /**
         * 根据当前插件状态生成编辑器展示使用的装饰集合。
         *
         * @param state 当前业务或插件状态。
         * @returns DecorationSet 类型的处理结果。
         */
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
        /**
         * 把插件中最新的候选跟踪状态通知给面板。
         *
         * @param view ProseMirror 编辑器视图。
         */
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
/**
 * 将候选编辑登记为可跟踪区间，后续事务据此更新位置与冲突。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param snapshot 任务开始时保存的文档或配置快照。
 * @param edits 待跟踪、校验或采纳的编辑建议集合。
 * @returns 待采纳编辑的位置与冲突状态列表。
 */
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
/**
 * 通过事务替换当前插件保存的候选跟踪状态。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param items 需要处理的条目集合。
 */
export function setTracked(editor: Editor, items: TrackedEdit[]) {
  editor.view.dispatch(
    editor.state.tr.setMeta(pluginKey, items).setMeta('addToHistory', false),
  );
}
/**
 * 读取插件中当前仍有效的候选编辑状态。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @returns 待采纳编辑的位置与冲突状态列表。
 */
export function currentTracked(editor: Editor) {
  return pluginKey.getState(editor.state) ?? [];
}
/**
 * 将候选内容解析为当前编辑器 Schema 支持的节点片段。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param item 本次正在处理的条目。
 * @returns Fragment 类型的处理结果。
 */
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
/**
 * 再次检查原文与候选位置，将用户采纳的修改应用为编辑器事务。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param ids 本次操作涉及的记录标识集合。
 * @param identity 当前文稿类型及其稳定身份。
 * @param snapshot 任务开始时保存的文档或配置快照。
 * @returns 待采纳编辑的位置与冲突状态列表。
 */
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
