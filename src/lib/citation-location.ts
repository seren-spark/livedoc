/**
 * @file 引用原文定位。把 Markdown 偏移和引用片段映射到编辑器文本区间。
 */
import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface CitationLocation {
  snippet: string;
  startOffset?: number | null;
  endOffset?: number | null;
}

export interface CitationTextSegment {
  text: string;
  position: number;
  block: string;
}

export interface CitationTextRange {
  from: number;
  to: number;
  strategy: 'source_offset' | 'snippet';
}

/**
 * 结合偏移与引用片段，在编辑器中寻找最可信的原文区间。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param sourceMarkdown 引用来源的 Markdown 原文。
 * @param citation 需要展示或校验的引用证据。
 * @returns 匹配到的编辑器文本区间；无法可靠定位时返回空结果。
 */
export function locateCitationRange(
  editor: Editor,
  sourceMarkdown: string,
  citation: CitationLocation,
): CitationTextRange | null {
  const candidates: Array<{ text: string; strategy: CitationTextRange['strategy'] }> = [];
  const sourceSlice = sliceSourceByOffsets(sourceMarkdown, citation);
  if (sourceSlice) {
    const visible = markdownToVisibleText(editor, sourceSlice);
    candidates.push(
      ...candidateFragments(visible).map((text) => ({
        text,
        strategy: 'source_offset' as const,
      })),
    );
  }
  const snippet = markdownToVisibleText(editor, citation.snippet);
  candidates.push(
    ...candidateFragments(snippet).map((text) => ({
      text,
      strategy: 'snippet' as const,
    })),
  );

  const flattened = flattenSegments(editorTextSegments(editor.state.doc));
  for (const candidate of dedupeCandidates(candidates)) {
    const range = findFlattenedRange(flattened, candidate.text);
    if (range) return { ...range, strategy: candidate.strategy };
  }
  return null;
}

/**
 * 按引用保存的字符偏移截取原文片段。
 *
 * @param source 当前来源内容或来源记录。
 * @param citation 需要展示或校验的引用证据。
 * @returns 整理后的文本或标识。
 */
export function sliceSourceByOffsets(
  source: string,
  citation: CitationLocation,
): string | null {
  const start = citation.startOffset;
  const end = citation.endOffset;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    (start as number) < 0 ||
    (end as number) <= (start as number) ||
    (end as number) > source.length
  ) {
    return null;
  }
  return source.slice(start as number, end as number);
}

/**
 * 规范化空白等差异后查找文本区间，并映射回编辑器位置。
 *
 * @param segments segments 参数（CitationTextSegment[]）。
 * @param candidate 需要校验或修订的写作候选。
 * @returns 整理后的状态与操作结果对象。
 */
export function findNormalizedRange(
  segments: CitationTextSegment[],
  candidate: string,
): { from: number; to: number } | null {
  return findFlattenedRange(flattenSegments(segments), candidate);
}

/**
 * 在扁平化编辑器文本中查找目标片段。
 *
 * @param flattened 用于文本匹配的扁平内容及位置映射。
 * @param candidate 需要校验或修订的写作候选。
 * @returns 整理后的状态与操作结果对象。
 */
function findFlattenedRange(
  flattened: { text: string; positions: number[] },
  candidate: string,
): { from: number; to: number } | null {
  const needle = normalizeText(candidate).toLocaleLowerCase();
  if (needle.length < 8) return null;
  const index = flattened.text.toLocaleLowerCase().indexOf(needle);
  if (index < 0) return null;
  const from = flattened.positions[index];
  const last = flattened.positions[index + needle.length - 1];
  if (from === undefined || last === undefined) return null;
  return { from, to: last + 1 };
}

/**
 * 遍历编辑器文档，收集文本片段及其文档位置。
 *
 * @param doc 当前文档或编辑器文档节点。
 * @returns 整理后的结果列表。
 */
function editorTextSegments(doc: ProseMirrorNode): CitationTextSegment[] {
  const segments: CitationTextSegment[] = [];
  const blockIds = new WeakMap<ProseMirrorNode, string>();
  let blockSequence = 0;
  doc.descendants((node, position, parent) => {
    if (!node.isText || !node.text) return;
    const block = parent ?? doc;
    let blockId = blockIds.get(block);
    if (!blockId) {
      blockId = `block-${blockSequence}`;
      blockSequence += 1;
      blockIds.set(block, blockId);
    }
    segments.push({
      text: node.text,
      position,
      block: blockId,
    });
  });
  return segments;
}

/**
 * 拼接文本片段并维护字符到编辑器位置的映射。
 *
 * @param segments segments 参数（CitationTextSegment[]）。
 * @returns 整理后的状态与操作结果对象。
 */
function flattenSegments(segments: CitationTextSegment[]) {
  let text = '';
  const positions: number[] = [];
  let lastBlock: string | undefined;
  let lastWasWhitespace = false;
  for (const segment of segments) {
    if (lastBlock !== undefined && segment.block !== lastBlock && !lastWasWhitespace) {
      text += ' ';
      positions.push(segment.position);
      lastWasWhitespace = true;
    }
    for (let index = 0; index < segment.text.length; index += 1) {
      const char = segment.text[index]!;
      if (/\s/u.test(char)) {
        if (!lastWasWhitespace) {
          text += ' ';
          positions.push(segment.position + index);
          lastWasWhitespace = true;
        }
        continue;
      }
      text += char;
      positions.push(segment.position + index);
      lastWasWhitespace = false;
    }
    lastBlock = segment.block;
  }
  return { text, positions };
}

/**
 * 去除 Markdown 格式标记，提取供编辑器文本匹配的可见内容。
 *
 * @param editor 当前 TipTap 编辑器实例。
 * @param markdown 待解析或写入的 Markdown 原文。
 * @returns 整理后的文本或标识。
 */
function markdownToVisibleText(editor: Editor, markdown: string): string {
  if (!markdown.trim()) return '';
  try {
    const parsed = editor.markdown?.parse(markdown);
    if (parsed) {
      const node = editor.schema.nodeFromJSON(parsed as JSONContent);
      return node.textBetween(0, node.content.size, '\n', ' ');
    }
  } catch {
    // A malformed source fragment may begin in the middle of Markdown syntax.
    // The fallback below still strips common formatting without using HTML.
  }
  return markdown
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/^#{1,6}\s+/gmu, '')
    .replace(/!??\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[*_`>~-]/gu, ' ');
}

/**
 * 从引用信息生成多个可供定位的候选文本片段。
 *
 * @param value 待校验或转换的值。
 * @returns 整理后的字符串列表。
 */
function candidateFragments(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  const fragments = value
    .split(/\r?\n|(?<=[。！？!?；;])/u)
    .map(normalizeText)
    .filter((item) => item.length >= 8)
    .sort((left, right) => right.length - left.length);
  return [normalized, ...fragments.map((item) => item.slice(0, 160)), normalized.slice(0, 96), normalized.slice(0, 48)];
}

/**
 * 清理空片段并去除重复的定位候选。
 *
 * @param candidates 待筛选的候选集合。
 * @returns 整理后的结果列表。
 */
function dedupeCandidates(
  candidates: Array<{ text: string; strategy: CitationTextRange['strategy'] }>,
) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const normalized = normalizeText(candidate.text);
    const key = normalized.toLocaleLowerCase();
    if (normalized.length < 8 || seen.has(key)) return false;
    seen.add(key);
    candidate.text = normalized;
    return true;
  });
}

/**
 * 统一空白与文本形式，减少原文定位时的格式差异。
 *
 * @param value 待校验或转换的值。
 * @returns 整理后的文本或标识。
 */
function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}
