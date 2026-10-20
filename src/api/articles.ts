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
export async function createArticle(articleId: string) {
  return (
    await ragClient.post<ArticleDraft>('/articles', { article_id: articleId })
  ).data;
}
export async function getArticle(id: string) {
  return (await ragClient.get<ArticleDraft>(`/articles/${id}`)).data;
}
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
export async function publishArticle(id: string, version: number) {
  return (
    await ragClient.post<ArticleDraft>(`/articles/${id}/publish`, {
      expected_version: version,
    })
  ).data;
}
export async function withdrawArticle(id: string, version: number) {
  return (
    await ragClient.post<ArticleDraft>(`/articles/${id}/withdraw`, {
      expected_version: version,
    })
  ).data;
}
export async function retryArticleIndex(id: string, version: number) {
  return (
    await ragClient.post<ArticleDraft>(`/articles/${id}/reindex`, {
      expected_version: version,
    })
  ).data;
}
export async function listMyArticles(state: ArticleState, page: number) {
  return (
    await ragClient.get<{ items: ArticleDraft[]; total: number }>(
      '/articles/mine',
      { params: { state, page, page_size: 10 } },
    )
  ).data;
}
export async function articleAccountKey() {
  const { data } = await ragClient.get<{ user_id: string; space_id: string }>(
    '/dev/auth/me',
  );
  return `${data.space_id}:${data.user_id}`;
}
export async function uploadArticleAsset(id: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return (
    await ragClient.post<DocumentAsset>(`/articles/${id}/assets`, body, {
      headers: { 'Content-Type': undefined },
    })
  ).data;
}
export function publicImageUrl(articleId: string, assetId: string) {
  return `${ragBaseURL}/public/articles/${encodeURIComponent(articleId)}/assets/${encodeURIComponent(assetId)}/content`;
}
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
export async function getArticleInteractions(id: string) {
  return (
    await ragClient.get<MyArticleInteractions>(`/articles/${id}/interactions`)
  ).data;
}
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
export async function listArticleComments(id: string, page: number) {
  return (
    await ragClient.get<{
      items: ArticleComment[];
      total: number;
      comment_count: number;
    }>(`/public/articles/${id}/comments`, { params: { page, page_size: 10 } })
  ).data;
}
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
export async function deleteArticleComment(id: string, commentId: string) {
  await ragClient.delete(`/articles/${id}/comments/${commentId}`);
}
export async function listFavoriteArticles(page: number) {
  return (
    await ragClient.get<{ items: PublicArticle[]; total: number }>(
      '/articles/favorites',
      { params: { page, page_size: 10 } },
    )
  ).data;
}
