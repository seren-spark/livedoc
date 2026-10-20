import { describe, expect, it } from 'vitest';
import {
  articleError,
  articleRecoveryKey,
  readArticleRecovery,
  validateArticle,
} from './article-draft';
import { stabilizeEditorContent } from './knowledge-editor';

describe('article drafts', () => {
  const draft = {
    title: '标题',
    content: '正文',
    editor_content: null,
    summary: '',
    tags: [],
    cover_asset_id: null,
    asset_ids: [],
  };
  it('restores local changes with their original server version and isolates accounts/articles', () => {
    const raw = JSON.stringify({
      article_id: 'article1',
      expected_version: 3,
      draft,
      saved_at: 100,
    });
    expect(readArticleRecovery(raw, 'article1')?.expected_version).toBe(3);
    expect(readArticleRecovery(raw, 'article2')).toBeNull();
    expect(articleRecoveryKey('alice', 'article1')).not.toBe(
      articleRecoveryKey('bob', 'article1'),
    );
    expect(readArticleRecovery('{broken', 'article1')).toBeNull();
    expect(
      readArticleRecovery('{"article_id":"article1"}', 'article1'),
    ).toBeNull();
  });
  it('persists stable image IDs so recovery survives revoked browser blob URLs', () => {
    const json = {
      type: 'doc' as const,
      content: [{ type: 'image', attrs: { src: 'blob:preview', alt: '图' } }],
    };
    const stable = stabilizeEditorContent(
      json,
      new Map([['blob:preview', 'image123']]),
    );
    expect((stable.content?.[0] as any)?.attrs.src).toBe(
      '/assets/image123/content',
    );
    expect(json.content[0].attrs.src).toBe('blob:preview');
  });
  it('validates publication without rejecting incomplete saved drafts', () => {
    expect(validateArticle(draft, true)).toBeNull();
    expect(validateArticle({ ...draft, title: '' }, true)).toContain('标题');
    expect(validateArticle(draft, false)).toContain('正文');
    expect(
      validateArticle({ ...draft, tags: ['x'.repeat(21)] }, true),
    ).toContain('标签');
    expect(
      validateArticle({ ...draft, summary: 'x'.repeat(301) }, true),
    ).toContain('摘要');
  });
  it('explains save failure, version conflict and missing public detail', () => {
    expect(articleError(new Error('network'))).toContain('本地修改已保留');
    expect(articleError({ response: { status: 409 } })).toContain('其他窗口');
    expect(articleError({ response: { status: 404 } })).toContain(
      '不存在或已撤回',
    );
    expect(articleError({ response: { status: 401 } })).toContain('重新登录');
  });
});
