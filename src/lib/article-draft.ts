/**
 * @file 文章草稿工具。生成账号隔离的恢复键，校验发布字段并整理错误提示。
 */
import type { ArticleContent } from '@/api/articles';

export interface ArticleRecovery {
  article_id: string;
  expected_version: number;
  draft: ArticleContent;
  saved_at: number;
}
/**
 * 生成按账号与文章隔离的本地草稿备份键。
 *
 * @param account 用于隔离本地草稿的用户空间身份。
 * @param id 目标记录的唯一标识。
 * @returns 整理后的文本或标识。
 */
export const articleRecoveryKey = (account: string, id: string) =>
  `livedoc:article:${account}:${id}`;
/**
 * 读取并解析本地文章备份，忽略不可用的缓存。
 *
 * @param raw 尚未规范化或压缩的原始数据。
 * @param articleId 文章标识。
 * @returns ArticleRecovery 类型的处理结果。
 */
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
/**
 * 检查文章发布需要的标题、正文和元数据。
 *
 * @param content 待处理的正文内容。
 * @param hasBody 当前内容集合是否包含实际正文。
 * @returns 整理后的文本或标识。
 */
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
/**
 * 将文章接口错误整理为可读提示，保留版本冲突信息。
 *
 * @param error 本次操作捕获的异常。
 * @returns 整理后的文本或标识。
 */
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
