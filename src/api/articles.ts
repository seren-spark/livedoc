/**
 * @file 文章 API。封装草稿、发布、图片资源、点赞收藏和评论请求。
 */
import {
  ragClient,
  ragBaseURL,
  type DocumentAsset,
  type DocumentRecord,
  type TipTapDocument,
} from './rag';

export type ArticleState = 'draft' | 'published' | 'withdrawn';
export interface ArticleContent {
  title: string;
  content: string;
  editor_content: TipTapDocument | null;
  summary: string;
  tags: string[];
  cover_asset_id: string | null;
  asset_ids: string[];
}
export interface ArticleDraft {
  article_id: string;
  owner_id: string;
  space_id: string;
  state: ArticleState;
  draft_version: number;
  draft: ArticleContent;
  published_draft_version: number | null;
  published_at: string | null;
  last_published_at: string | null;
  updated_at: string;
  index_status: DocumentRecord['index_status'] | null;
  index_error: string | null;
  document_version: number | null;
  include_in_knowledge?: boolean;
}
export type PublicArticle = DocumentRecord & {
  like_count: number;
  favorite_count: number;
  comment_count: number;
  summary: string;
  author_name: string;
  cover_url: string | null;
  published_at: string;
  last_published_at: string;
};
/**
 * 创建一篇属于当前用户的文章草稿。
 *
 * @param articleId 文章标识。
 * @returns 文章草稿记录。
 */
export async function createArticle(articleId: string) {
  return (
    await ragClient.post<ArticleDraft>('/articles', { article_id: articleId })
  ).data;
}
/**
 * 读取当前用户有权编辑的文章草稿。
 *
 * @param id 目标记录的唯一标识。
 * @returns 文章草稿记录。
 */
export async function getArticle(id: string) {
  return (await ragClient.get<ArticleDraft>(`/articles/${id}`)).data;
}
/**
 * 保存文章草稿，并携带期望版本防止覆盖其他更新。
 *
 * @param id 目标记录的唯一标识。
 * @param content 待处理的正文内容。
 * @param version 本次操作对应的内容版本。
 * @returns 文章草稿记录。
 */
export async function saveArticle(
  id: string,
  content: ArticleContent,
  version: number,
) {
  return (
    await ragClient.patch<ArticleDraft>(`/articles/${id}`, {
      ...content,
      expected_version: version,
    })
  ).data;
}
/**
 * 提交文章发布请求，生成公开发布快照。
 *
 * @param id 目标记录的唯一标识。
 * @param version 本次操作对应的内容版本。
 * @param includeInKnowledge 发布后是否将文章纳入知识库检索（可选）。
 * @returns 文章草稿记录。
 */
export async function publishArticle(
  id: string,
  version: number,
  includeInKnowledge?: boolean,
) {
  return (
    await ragClient.post<ArticleDraft>(`/articles/${id}/publish`, {
      expected_version: version,
      include_in_knowledge: includeInKnowledge,
    })
  ).data;
}
/**
 * 撤回指定文章的公开发布状态。
 *
 * @param id 目标记录的唯一标识。
 * @param version 本次操作对应的内容版本。
 * @returns 文章草稿记录。
 */
export async function withdrawArticle(id: string, version: number) {
  return (
    await ragClient.post<ArticleDraft>(`/articles/${id}/withdraw`, {
      expected_version: version,
    })
  ).data;
}
/**
 * 为已发布文章重新提交索引任务。
 *
 * @param id 目标记录的唯一标识。
 * @param version 本次操作对应的内容版本。
 * @returns 文章草稿记录。
 */
export async function retryArticleIndex(id: string, version: number) {
  return (
    await ragClient.post<ArticleDraft>(`/articles/${id}/reindex`, {
      expected_version: version,
    })
  ).data;
}
/**
 * 按条件分页读取个人草稿和已发布文章。
 *
 * @param state 当前业务或插件状态。
 * @param page 当前页码或页面记录。
 * @returns 当前页条目与符合条件的总数。
 */
export async function listMyArticles(state: ArticleState, page: number) {
  return (
    await ragClient.get<{ items: ArticleDraft[]; total: number }>(
      '/articles/mine',
      { params: { state, page, page_size: 10 } },
    )
  ).data;
}
/**
 * 根据当前会话生成草稿恢复使用的账号隔离键。
 *
 * @returns 整理后的文本或标识。
 */
export async function articleAccountKey() {
  const { data } = await ragClient.get<{ user_id: string; space_id: string }>(
    '/dev/auth/me',
  );
  return `${data.space_id}:${data.user_id}`;
}
/**
 * 上传文章正文或封面使用的图片。
 *
 * @param id 目标记录的唯一标识。
 * @param file 待上传或解析的文件。
 * @returns 图片资源记录。
 */
export async function uploadArticleAsset(id: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return (
    await ragClient.post<DocumentAsset>(`/articles/${id}/assets`, body, {
      headers: { 'Content-Type': undefined },
    })
  ).data;
}
/**
 * 生成公开文章图片的访问地址。
 *
 * @param articleId 文章标识。
 * @param assetId 图片资源标识。
 * @returns 整理后的文本或标识。
 */
export function publicImageUrl(articleId: string, assetId: string) {
  return `${ragBaseURL}/public/articles/${encodeURIComponent(articleId)}/assets/${encodeURIComponent(assetId)}/content`;
}
/**
 * 下载公开文章图片并返回可在页面展示的内容。
 *
 * @param articleId 文章标识。
 * @param assetId 图片资源标识。
 * @returns 下载的文件内容。
 */
export async function fetchPublicImage(articleId: string, assetId: string) {
  return (
    await ragClient.get<Blob>(
      `/public/articles/${articleId}/assets/${assetId}/content`,
      { responseType: 'blob' },
    )
  ).data;
}

export interface ArticleStats {
  like_count: number;
  favorite_count: number;
  comment_count: number;
}
export interface MyArticleInteractions extends ArticleStats {
  user_id: string;
  liked: boolean;
  favorited: boolean;
}
export interface ArticleComment {
  comment_id: string;
  article_id: string;
  user_id: string;
  author_name: string;
  content: string;
  created_at: string;
  parent_comment_id: string | null;
  deleted: boolean;
  reply_count: number;
}
/**
 * 读取文章统计数及当前用户的点赞、收藏状态。
 *
 * @param id 目标记录的唯一标识。
 * @returns 文章统计数及当前用户的点赞、收藏状态。
 */
export async function getArticleInteractions(id: string) {
  return (
    await ragClient.get<MyArticleInteractions>(`/articles/${id}/interactions`)
  ).data;
}
/**
 * 添加或取消当前用户对文章的点赞、收藏。
 *
 * @param id 目标记录的唯一标识。
 * @param kind 当前结果或来源的分类。
 * @param active 是否启用或激活当前记录。
 * @returns MyArticleInteractions 类型的处理结果。
 */
export async function setArticleReaction(
  id: string,
  kind: 'like' | 'favorite',
  active: boolean,
) {
  const url = `/articles/${id}/${kind}`;
  return (
    active
      ? await ragClient.put<MyArticleInteractions>(url)
      : await ragClient.delete<MyArticleInteractions>(url)
  ).data;
}
/**
 * 分页读取文章顶层评论。
 *
 * @param id 目标记录的唯一标识。
 * @param page 当前页码或页面记录。
 * @returns 当前页条目与符合条件的总数。
 */
export async function listArticleComments(id: string, page: number) {
  return (
    await ragClient.get<{
      items: ArticleComment[];
      total: number;
      comment_count: number;
    }>(`/public/articles/${id}/comments`, { params: { page, page_size: 10 } })
  ).data;
}
/**
 * 提交文章评论或对已有评论的回复。
 *
 * @param id 目标记录的唯一标识。
 * @param content 待处理的正文内容。
 * @param commentId 评论或回复标识。
 * @param parentCommentId parentComment 对应的唯一标识（可选）。
 * @returns ArticleComment 类型的处理结果。
 */
export async function addArticleComment(
  id: string,
  content: string,
  commentId: string,
  parentCommentId?: string,
) {
  return (
    await ragClient.post<ArticleComment>(`/articles/${id}/comments`, {
      content,
      comment_id: commentId,
      parent_comment_id: parentCommentId,
    })
  ).data;
}
/**
 * 分页读取某条评论下的回复。
 *
 * @param id 目标记录的唯一标识。
 * @param commentId 评论或回复标识。
 * @param page 当前页码或页面记录。
 * @returns 当前页条目与符合条件的总数。
 */
export async function listArticleReplies(
  id: string,
  commentId: string,
  page: number,
) {
  return (
    await ragClient.get<{ items: ArticleComment[]; total: number }>(
      `/public/articles/${id}/comments/${commentId}/replies`,
      { params: { page, page_size: 10 } },
    )
  ).data;
}
/**
 * 删除当前用户有权移除的评论。
 *
 * @param id 目标记录的唯一标识。
 * @param commentId 评论或回复标识。
 */
export async function deleteArticleComment(id: string, commentId: string) {
  await ragClient.delete(`/articles/${id}/comments/${commentId}`);
}
/**
 * 分页读取当前用户收藏的文章。
 *
 * @param page 当前页码或页面记录。
 * @returns 当前页条目与符合条件的总数。
 */
export async function listFavoriteArticles(page: number) {
  return (
    await ragClient.get<{ items: PublicArticle[]; total: number }>(
      '/articles/favorites',
      { params: { page, page_size: 10 } },
    )
  ).data;
}
