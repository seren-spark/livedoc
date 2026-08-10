import { describe, expect, it } from 'vitest';
import {
  findNormalizedRange,
  sliceSourceByOffsets,
  type CitationTextSegment,
} from './citation-location';

describe('citation source offsets', () => {
  it('extracts only a valid range from the cited document version', () => {
    expect(
      sliceSourceByOffsets('# 标题\n\n可信原文段落', {
        snippet: '可信原文',
        startOffset: 6,
        endOffset: 12,
      }),
    ).toBe('可信原文段落');
  });

  it('rejects missing, reversed, and out-of-bounds ranges', () => {
    const source = 'abcdef';
    expect(sliceSourceByOffsets(source, { snippet: '', startOffset: null, endOffset: 3 })).toBeNull();
    expect(sliceSourceByOffsets(source, { snippet: '', startOffset: 4, endOffset: 2 })).toBeNull();
    expect(sliceSourceByOffsets(source, { snippet: '', startOffset: 0, endOffset: 7 })).toBeNull();
  });
});

describe('citation ProseMirror position mapping', () => {
  it('locates a citation that crosses two editor blocks', () => {
    const segments: CitationTextSegment[] = [
      { text: '第一段引用', position: 1, block: 'a' },
      { text: '跨块内容', position: 10, block: 'b' },
    ];
    expect(findNormalizedRange(segments, '一段引用 跨块内容')).toEqual({
      from: 2,
      to: 14,
    });
  });

  it('maps collapsed whitespace back to the original document positions', () => {
    const segments: CitationTextSegment[] = [
      { text: 'Alpha   Beta', position: 5, block: 'a' },
    ];
    expect(findNormalizedRange(segments, 'Alpha Beta')).toEqual({
      from: 5,
      to: 17,
    });
  });

  it('does not select very short ambiguous snippets', () => {
    const segments: CitationTextSegment[] = [
      { text: '短词会在文档中重复', position: 1, block: 'a' },
    ];
    expect(findNormalizedRange(segments, '短词')).toBeNull();
  });
});
