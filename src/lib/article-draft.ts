import type { ArticleContent } from '@/api/articles';

export interface ArticleRecovery {
  article_id: string;
  expected_version: number;
  draft: ArticleContent;
  saved_at: number;
}
export const articleRecoveryKey = (account: string, id: string) =>
  `livedoc:article:${account}:${id}`;
export function readArticleRecovery(
  raw: string | null,
  articleId: string,
): ArticleRecovery | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (
      !value ||
      value.article_id !== articleId ||
      !Number.isInteger(value.expected_version) ||
      !value.draft ||
      typeof value.draft.title !== 'string' ||
      typeof value.draft.content !== 'string' ||
      !Array.isArray(value.draft.tags) ||
      !Array.isArray(value.draft.asset_ids) ||
      !Number.isFinite(value.saved_at)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function validateArticle(
  content: Pick<ArticleContent, 'title' | 'summary' | 'tags'>,
  hasBody: boolean,
): string | null {
  if (!content.title.trim()) return '请填写文章标题';
  if (content.title.length > 120) return '标题最多 120 字';
  if (!hasBody) return '请填写文章正文';
  if (content.summary.length > 300) return '摘要最多 300 字';
  if (content.tags.length > 5 || content.tags.some((tag) => tag.length > 20))
    return '最多 5 个标签，每个标签最多 20 字';
  return null;
}
export function articleError(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status === 409)
    return '文章已在其他窗口更新。本地修改已保留，请复制修改后重新加载服务器版本。';
  if (status === 401) return '登录已过期，本地修改已保留，请重新登录后保存。';
  if (status === 403) return '你没有这篇文章的编辑权限。';
  if (status === 404) return '文章不存在或已撤回';
  if (status === 413) return '图片不能超过 10 MB';
  if (status === 415) return '请选择 PNG、JPEG、GIF 或 WebP 图片';
  if (status === 422) return '提交信息不符合要求，请检查标题、标签和图片';
  return '操作失败，本地修改已保留，请稍后重试。';
}
