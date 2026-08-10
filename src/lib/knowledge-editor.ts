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

export async function hydrateEditorContent(
  content: TipTapDocument,
  fetchBlob: (assetId: string) => Promise<Blob>,
  blobUrls: AssetBlobMap,
) {
  const cloned = structuredClone(content) as EditorNode;
  const ids = new Set<string>();
  walkNodes(cloned, (node) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      const assetId = assetIdFromUrl(node.attrs.src);
      if (assetId) ids.add(assetId);
    }
  });
  const resolved = await resolveAssets([...ids], fetchBlob, blobUrls);
  walkNodes(cloned, (node) => {
    if (node.type !== 'image' || typeof node.attrs?.src !== 'string') return;
    const assetId = assetIdFromUrl(node.attrs.src);
    if (assetId && resolved.has(assetId)) node.attrs.src = resolved.get(assetId);
  });
  return cloned as TipTapDocument;
}

export async function hydrateMarkdownAssets(
  markdown: string,
  fetchBlob: (assetId: string) => Promise<Blob>,
  blobUrls: AssetBlobMap,
) {
  const pattern = /(?:asset:\/\/|\/assets\/)([a-zA-Z0-9_-]+)(?:\/content)?/g;
  const ids = [...markdown.matchAll(pattern)].map(
    (match) => match[1],
  );
  const resolved = await resolveAssets([...new Set(ids)], fetchBlob, blobUrls);
  return markdown.replace(
    pattern,
    (_match, assetId: string) =>
      resolved.get(assetId) || `/assets/${assetId}/content`,
  );
}

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
    if (!src.startsWith('data:image/')) continue;
    const file = dataUrlToFile(src, node.attrs.alt || 'editor-image');
    const asset = await upload(file);
    const displayUrl = URL.createObjectURL(file);
    blobUrls.set(displayUrl, asset.asset_id);
    node.attrs.src = `/assets/${asset.asset_id}/content`;
  }
  return stabilizeEditorContent(cloned as TipTapDocument, blobUrls);
}

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

export function collectAssetIds(content: TipTapDocument, blobUrls: AssetBlobMap) {
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

async function resolveAssets(
  assetIds: string[],
  fetchBlob: (assetId: string) => Promise<Blob>,
  blobUrls: AssetBlobMap,
) {
  const byAsset = new Map<string, string>();
  for (const [url, assetId] of blobUrls) byAsset.set(assetId, url);
  await Promise.all(
    assetIds.map(async (assetId) => {
      if (byAsset.has(assetId)) return;
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
  const safeName = filename.includes('.') ? filename : `${filename}.${extension}`;
  return new File([buffer], safeName, { type: match[1] });
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\[\]"]/g, '\\$&');
}
