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

  const segments = editorTextSegments(editor.state.doc);
  for (const candidate of dedupeCandidates(candidates)) {
    const range = findNormalizedRange(segments, candidate.text);
    if (range) return { ...range, strategy: candidate.strategy };
  }
  return null;
}

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

export function findNormalizedRange(
  segments: CitationTextSegment[],
  candidate: string,
): { from: number; to: number } | null {
  const flattened = flattenSegments(segments);
  const needle = normalizeText(candidate).toLocaleLowerCase();
  if (needle.length < 8) return null;
  const index = flattened.text.toLocaleLowerCase().indexOf(needle);
  if (index < 0) return null;
  const from = flattened.positions[index];
  const last = flattened.positions[index + needle.length - 1];
  if (from === undefined || last === undefined) return null;
  return { from, to: last + 1 };
}

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

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}
