import type { DocumentAsset, TipTapDocument } from '@/api/rag';
import TurndownService from 'turndown';

type EditorNode = Record<string, any>;

export type AssetBlobMap = Map<string, string>;

export function assetIdFromUrl(src: string, blobUrls?: AssetBlobMap) {
  if (blobUrls?.has(src)) return blobUrls.get(src) || null;
  const stable = src.match(/^asset:\/\/([a-zA-Z0-9_-]+)$/);
  if (stable) return stable[1];
  const apiUrl = src.match(/\/assets\/([a-zA-Z0-9_-]+)\/content(?:[?#].*)?$/);
  return apiUrl?.[1] || null;
}

/**
 * 水合 TipTap JSON,从服务器获取资产并替换编辑器内容中的资产 URL
 * 把编辑器 JSON 中类似 /assets/abc123/content 或 asset://abc123 的图片地址
 * 换成 blob:http://... 这种浏览器能直接显示的本地预览地址。
 * @param content 编辑器内容
 * @param fetchBlob 从服务器获取资产的函数
 * @param blobUrls 缓存的资产 URL 映射
 * @returns 替换后的编辑器内容
 */
export async function hydrateEditorContent(
  content: TipTapDocument,
  fetchBlob: (assetId: string) => Promise<Blob>,
  blobUrls: AssetBlobMap,
) {
  //深拷贝原始内容，避免修改原对象。
  const cloned = structuredClone(content) as EditorNode;

  const ids = new Set<string>();
  //第一遍遍历，收集所有图片的 asset_id
  walkNodes(cloned, (node) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      const assetId = assetIdFromUrl(node.attrs.src);
      if (assetId) ids.add(assetId);
    }
  });
  //调用 resolveAssets ，批量把 asset_id 转成 Blob URL。
  const resolved = await resolveAssets([...ids], fetchBlob, blobUrls);
  //第二遍遍历，替换所有图片的 src 为 Blob URL。
  walkNodes(cloned, (node) => {
    if (node.type !== 'image' || typeof node.attrs?.src !== 'string') return;
    const assetId = assetIdFromUrl(node.attrs.src);
    if (assetId && resolved.has(assetId))
      node.attrs.src = resolved.get(assetId);
  });
  return cloned as TipTapDocument;
}

/**
 * 水合 Markdown 内容,从替换资产 URL
 * 把 Markdown 内容中类似![图片](/assets/abc123/content)的图片地址
 * 换成 ![图片](blob:http://localhost:5173/xxxxxxxx)这种浏览器能直接显示的本地预览地址。
 * @param markdown Markdown 内容
 * @param fetchBlob 从服务器获取资产的函数
 * @param blobUrls 缓存的资产 URL 映射
 * @returns 替换后的 Markdown 内容
 */
export async function hydrateMarkdownAssets(
  markdown: string,
  fetchBlob: (assetId: string) => Promise<Blob>,
  blobUrls: AssetBlobMap,
) {
  //用正则从 Markdown 中提取所有 asset_id
  const pattern = /(?:asset:\/\/|\/assets\/)([a-zA-Z0-9_-]+)(?:\/content)?/g;
  const ids = [...markdown.matchAll(pattern)].map((match) => match[1]);
  //批量解析成 Blob URL
  const resolved = await resolveAssets([...new Set(ids)], fetchBlob, blobUrls);
  //替换 Markdown 中的地址；如果某个 asset 没解析出来，保留原服务端路径
  return markdown.replace(
    pattern,
    (_match, assetId: string) =>
      resolved.get(assetId) || `/assets/${assetId}/content`,
  );
}
/**
 * 把编辑器里 data:image/... 的 Base64 图片逐张上传成 DocumentAsset，
 * 并把节点 src 改写成 /assets/{asset_id}/content
 */
export async function persistInlineImages(
  content: TipTapDocument,
  upload: (file: File) => Promise<DocumentAsset>,
  blobUrls: AssetBlobMap,
) {
  const cloned = structuredClone(content) as EditorNode;
  const imageNodes: EditorNode[] = [];
  walkNodes(cloned, (node) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      imageNodes.push(node);
    }
  });
  for (const node of imageNodes) {
    const src = String(node.attrs.src);
    if (!src.startsWith('data:image/')) continue; // 只处理 Base64 内联图
    const file = dataUrlToFile(src, node.attrs.alt || 'editor-image');
    const asset = await upload(file); // ← 上传到后端
    const displayUrl = URL.createObjectURL(file);
    blobUrls.set(displayUrl, asset.asset_id); // 缓存 blob→assetId
    node.attrs.src = `/assets/${asset.asset_id}/content`; // 改写 src
  }
  return stabilizeEditorContent(cloned as TipTapDocument, blobUrls);
}

/**把编辑器 HTML 转成 Markdown，图片 src 统一成 /assets/{id}/content */
export function stabilizeEditorContent(
  content: TipTapDocument,
  blobUrls: AssetBlobMap,
) {
  const cloned = structuredClone(content) as EditorNode;
  walkNodes(cloned, (node) => {
    if (node.type !== 'image' || typeof node.attrs?.src !== 'string') return;
    const assetId = assetIdFromUrl(node.attrs.src, blobUrls);
    if (assetId) node.attrs.src = `/assets/${assetId}/content`;
  });
  return cloned as TipTapDocument;
}

export function editorHtmlToMarkdown(html: string, blobUrls: AssetBlobMap) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('img').forEach((image) => {
    const assetId = assetIdFromUrl(image.getAttribute('src') || '', blobUrls);
    if (assetId) image.setAttribute('src', `/assets/${assetId}/content`);
  });
  const turndown = new TurndownService({
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    bulletListMarker: '-',
  });
  turndown.addRule('knowledge-image', {
    filter: 'img',
    replacement: (_content, node) => {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '图片';
      const title = node.getAttribute('title');
      return `\n\n![${escapeMarkdown(alt)}](${src}${title ? ` \"${escapeMarkdown(title)}\"` : ''})\n\n`;
    },
  });
  turndown.addRule('knowledge-table', {
    filter: 'table',
    replacement: (_content, node) => `\n\n${node.outerHTML}\n\n`,
  });
  return turndown.turndown(document.body).trim();
}
/** 遍历编辑器内容，收集所有图片的 asset_id（去重） */
export function collectAssetIds(
  content: TipTapDocument,
  blobUrls: AssetBlobMap,
) {
  const ids = new Set<string>();
  walkNodes(content as EditorNode, (node) => {
    if (node.type !== 'image' || typeof node.attrs?.src !== 'string') return;
    const assetId = assetIdFromUrl(node.attrs.src, blobUrls);
    if (assetId) ids.add(assetId);
  });
  return [...ids];
}

export function revokeAssetBlobs(blobUrls: AssetBlobMap) {
  for (const url of blobUrls.keys()) URL.revokeObjectURL(url);
  blobUrls.clear();
}
/**
 * 文档中引用的所有图片资源解析成浏览器可用的 Blob URL
 * @param assetIds 需要转换的 asset_id
 * @param fetchBlob 从服务器获取资产的函数
 * @param blobUrls 缓存的资产 URL 映射
 * @returns 转换结果映射
 */
async function resolveAssets(
  assetIds: string[],
  fetchBlob: (assetId: string) => Promise<Blob>,
  blobUrls: AssetBlobMap,
) {
  // blobUrls 的存储结构是 url → assetId，但这里需要按 assetId → url 查找，所以先构建一个反向映射。
  const byAsset = new Map<string, string>();
  for (const [url, assetId] of blobUrls) byAsset.set(assetId, url);
  //第一次水合时， fetchBlob(assetId) 仍然要向服务器发请求下载图片。
  await Promise.all(
    assetIds.map(async (assetId) => {
      if (byAsset.has(assetId)) return;
      //URL.createObjectURL 把 Blob 转成 blob:http://... 格式的本地 URL，可以直接赋给 <img src>，无需再次经过网络。
      //调用 fetchBlob 从服务器下载图片二进制数据。
      const url = URL.createObjectURL(await fetchBlob(assetId));
      blobUrls.set(url, assetId);
      byAsset.set(assetId, url);
    }),
  );
  return byAsset;
}

function walkNodes(node: EditorNode, visit: (node: EditorNode) => void) {
  visit(node);
  if (!Array.isArray(node.content)) return;
  node.content.forEach((child: EditorNode) => walkNodes(child, visit));
}

function dataUrlToFile(dataUrl: string, filename: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error('无法识别编辑器中的图片数据');
  const bytes = atob(match[2]);
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    buffer[index] = bytes.charCodeAt(index);
  }
  const extension = match[1].split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const safeName = filename.includes('.')
    ? filename
    : `${filename}.${extension}`;
  return new File([buffer], safeName, { type: match[1] });
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\[\]"]/g, '\\$&');
}
