/**
 * @file 知识编辑器资源转换。在 Markdown、TipTap 内容和已上传图片资源之间转换。
 */
import type { DocumentAsset, TipTapDocument } from '@/api/rag';
import TurndownService from 'turndown';

type EditorNode = Record<string, any>;

export type AssetBlobMap = Map<string, string>;

/**
 * 从内部资源 URL 中提取图片资源标识。
 *
 * @param src 图片或资源地址。
 * @param blobUrls 图片资源标识与 Blob URL 的映射（可选）。
 * @returns 整理后的文本或标识。
 */
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
 *
 * @param content 待处理的正文内容。
 * @param upload 执行图片或文件上传的回调。
 * @param blobUrls 图片资源标识与 Blob URL 的映射。
 * @returns TipTap 文档 JSON。
 */
export async function persistInlineImages(
  content: TipTapDocument,
  upload: (file: File) => Promise<DocumentAsset>,
  blobUrls: AssetBlobMap,
) {
  //避免直接污染编辑器内存里的原始文档。
  const cloned = structuredClone(content) as EditorNode;
  const imageNodes: EditorNode[] = [];
  //递归遍历 TipTap 文档树所有节点（自定义工具函数）
  //把所有类型为image、并且有 src 属性的图片节点全部收集到数组。
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

/**
 * 把编辑器 HTML 转成 Markdown，图片 src 统一成 /assets/{id}/content
 *
 * @param content 待处理的正文内容。
 * @param blobUrls 图片资源标识与 Blob URL 的映射。
 * @returns TipTap 文档 JSON。
 */
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

/**
 * 将编辑器 HTML 转为可保存的 Markdown，保留内部资源引用。
 *
 * @param html 待转换的 HTML 内容。
 * @param blobUrls 图片资源标识与 Blob URL 的映射。
 * @returns 整理后的文本或标识。
 */
export function editorHtmlToMarkdown(html: string, blobUrls: AssetBlobMap) {
  // 把 HTML 字符串，解析成浏览器内存里的 DOM 文档对象。
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('img').forEach((image) => {
    const assetId = assetIdFromUrl(image.getAttribute('src') || '', blobUrls);
    if (assetId) image.setAttribute('src', `/assets/${assetId}/content`);
  });
  const turndown = new TurndownService({
    codeBlockStyle: 'fenced', // 代码块用 ``` 风格，而不是缩进风格
    emDelimiter: '*', // 斜体用 *italic* 而不是 _italic_
    bulletListMarker: '-',  // 无序列表用 - 而不是 *
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
  turndown.addRule('knowledge-highlight', {
    filter: 'mark',
    replacement: content => `==${content}==`,
  });
  turndown.addRule('knowledge-table', {
    filter: 'table',
    replacement: (_content, node) => `\n\n${node.outerHTML}\n\n`,
  });
  return turndown.turndown(document.body).trim();
}
/**
 *  遍历编辑器内容，收集所有图片的 asset_id（去重）
 *
 * @param content 待处理的正文内容。
 * @param blobUrls 图片资源标识与 Blob URL 的映射。
 * @returns 整理后的字符串列表。
 */
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

/**
 * 释放已创建的 Blob URL，避免文档切换后占用浏览器资源。
 *
 * @param blobUrls 图片资源标识与 Blob URL 的映射。
 */
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

/**
 * 递归访问 TipTap JSON 节点，供图片收集和转换复用。
 *
 * @param node 当前语法树或编辑器节点。
 * @param visit 访问当前语法树节点的回调。
 */
function walkNodes(node: EditorNode, visit: (node: EditorNode) => void) {
  visit(node);
  if (!Array.isArray(node.content)) return;
  node.content.forEach((child: EditorNode) => walkNodes(child, visit));
}

/**
 *  把 Base64 编码的图片数据转换成 File 对象
 *
 * @param dataUrl 包含媒体类型与编码内容的 Data URL。
 * @param filename 上传文件的原始名称。
 * @returns File 类型的处理结果。
 */
function dataUrlToFile(dataUrl: string, filename: string) {
  // 1.正则解析 dataURL 字符串，提取出 MIME 类型和 Base64 编码的图片数据。
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error('无法识别编辑器中的图片数据');
  //把 base64 字符串解码成 ASCII 字符串。
  const bytes = atob(match[2]);
  // 2.把 ASCII 字符串转换成 Uint8Array，这是 File 构造函数需要的参数。
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    //循环拿每个字符的编码，变成字节数组
    buffer[index] = bytes.charCodeAt(index);
  }
  const extension = match[1].split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const safeName = filename.includes('.')
    ? filename
    : `${filename}.${extension}`;
  return new File([buffer], safeName, { type: match[1] });
}

/**
 * 转义文本中的 Markdown 特殊字符。
 *
 * @param value 待校验或转换的值。
 * @returns 整理后的文本或标识。
 */
function escapeMarkdown(value: string) {
  return value.replace(/[\\[\]"]/g, '\\$&');
}
