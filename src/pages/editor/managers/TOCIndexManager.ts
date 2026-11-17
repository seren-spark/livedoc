/**
 * @file 分页目录索引。维护跨页标题索引，支持目录查询和跳转。
 */
/**
 * TOCIndexManager - 目录索引管理器
 *
 * 管理分页文档的目录索引：
 * - 提取页面中的标题
 * - 维护完整的目录索引
 * - 处理目录跳转
 */

import {
  pagedDocDB,
  type TOCIndex,
  type TOCItem,
  type HeadingInfo,
} from '../storage/PagedDocStorage';
import type { Editor } from '@tiptap/core';

export class TOCIndexManager {
  private docId: string;
  private tocIndex: TOCIndex | null = null;

  /**
   * 初始化实例依赖与本地状态。
   *
   * @param docId 知识文档标识。
   */
  constructor(docId: string) {
    this.docId = docId;
  }

  /**
   * 加载目录索引
   *
   * @returns 整理后的结果列表。
   */
  async load(): Promise<TOCItem[]> {
    this.tocIndex = await pagedDocDB.getTOCIndex(this.docId);

    if (!this.tocIndex) {
      // 初始化空目录
      this.tocIndex = {
        docId: this.docId,
        items: [],
        lastModified: Date.now(),
      };
    }

    return this.tocIndex.items;
  }

  /**
   * 获取所有目录项
   *
   * @returns 整理后的结果列表。
   */
  getItems(): TOCItem[] {
    return this.tocIndex?.items || [];
  }

  /**
   * 更新指定页的目录项
   *
   * @param pageNum 请求的页码。
   * @param headings 文档中收集到的标题节点。
   */
  async updatePageHeadings(
    pageNum: number,
    headings: HeadingInfo[],
  ): Promise<void> {
    if (!this.tocIndex) {
      await this.load();
    }

    // 移除该页的旧目录项
    this.tocIndex!.items = this.tocIndex!.items.filter(
      (item) => item.pageNum !== pageNum,
    );

    // 添加新目录项
    const newItems: TOCItem[] = headings.map((heading) => ({
      id: heading.id,
      text: heading.text,
      level: heading.level,
      pageNum,
      posInPage: heading.posInPage,
    }));

    this.tocIndex!.items.push(...newItems);

    // 按页码和位置排序
    this.tocIndex!.items.sort((a, b) => {
      if (a.pageNum !== b.pageNum) {
        return a.pageNum - b.pageNum;
      }
      return a.posInPage - b.posInPage;
    });

    this.tocIndex!.lastModified = Date.now();

    // 保存到存储
    await pagedDocDB.saveTOCIndex(this.tocIndex!);
  }

  /**
   * 从 ProseMirror 文档中提取标题
   *
   * @param doc 当前文档或编辑器文档节点。
   * @param startPos 本次处理区间的起始位置。
   * @returns 整理后的结果列表。
   */
  extractHeadings(doc: any, startPos = 0): HeadingInfo[] {
    const headings: HeadingInfo[] = [];

    doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'heading') {
        headings.push({
          id: node.attrs.blockId || `heading-${pos}`,
          text: node.textContent || '',
          level: node.attrs.level || 1,
          posInPage: pos - startPos,
        });
      }
      return true;
    });

    return headings;
  }

  /**
   * 查找目录项
   *
   * @param itemId item 对应的唯一标识。
   * @returns TOCItem 类型的处理结果。
   */
  findItem(itemId: string): TOCItem | undefined {
    return this.tocIndex?.items.find((item) => item.id === itemId);
  }

  /**
   * 获取指定页的所有标题
   *
   * @param pageNum 请求的页码。
   * @returns 整理后的结果列表。
   */
  getPageHeadings(pageNum: number): TOCItem[] {
    return (
      this.tocIndex?.items.filter((item) => item.pageNum === pageNum) || []
    );
  }

  /**
   * 重建整个目录索引
   * 用于文档结构大变化时
   *
   * @param editor 当前 TipTap 编辑器实例。
   * @param pageRanges 页面与原文区间的对应关系。
   */
  async rebuild(
    editor: Editor,
    pageRanges: Map<number, { from: number; to: number }>,
  ): Promise<void> {
    const allItems: TOCItem[] = [];

    for (const [pageNum, range] of pageRanges) {
      const pageDoc = editor.state.doc.slice(range.from, range.to);
      const headings = this.extractHeadings(pageDoc, range.from);

      headings.forEach((heading) => {
        allItems.push({
          id: heading.id,
          text: heading.text,
          level: heading.level,
          pageNum,
          posInPage: heading.posInPage,
        });
      });
    }

    this.tocIndex = {
      docId: this.docId,
      items: allItems,
      lastModified: Date.now(),
    };

    await pagedDocDB.saveTOCIndex(this.tocIndex);
  }

  /**
   * 清空目录
   */
  async clear(): Promise<void> {
    this.tocIndex = {
      docId: this.docId,
      items: [],
      lastModified: Date.now(),
    };

    await pagedDocDB.saveTOCIndex(this.tocIndex);
  }
}
