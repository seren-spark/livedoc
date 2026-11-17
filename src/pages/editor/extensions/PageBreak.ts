/**
 * @file 分页符节点扩展。定义分页标记、节点属性及插入分页符命令。
 */
/**
 * PageBreak - 页面分隔标记节点（虚拟列表优化版）
 *
 * 用于标记分页加载中的页面边界
 * - 支持占位符模式：轻量的 CSS 占位而非内容节点
 * - 携带页码和高度信息
 * - 用于定位页面在文档中的位置
 */

import { Node, mergeAttributes } from '@tiptap/core';

export interface PageBreakOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: (
        pageNum: number,
        isPlaceholder?: boolean,
        placeholderHeight?: number,
      ) => ReturnType;
      removePageBreak: (pageNum: number) => ReturnType;
    };
  }
}

export const PageBreak = Node.create<PageBreakOptions>({
  name: 'pageBreak',

  group: 'block',

  atom: true,

  selectable: false,

  /**
   * 声明当前 TipTap 扩展的默认选项。
   *
   * @returns 整理后的状态与操作结果对象。
   */
  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  /**
   * 声明节点属性及其 HTML 读写规则。
   *
   * @returns 供后续操作使用的回调或清理函数；未找到或不可用时可能为空。
   */
  addAttributes() {
    return {
      pageNum: {
        default: 0,
        parseHTML: (element) => {
          const pageNum = element.getAttribute('data-page-num');
          return pageNum ? parseInt(pageNum, 10) : 0;
        },
        renderHTML: (attributes) => {
          return {
            'data-page-num': attributes.pageNum,
          };
        },
      },
      isPlaceholder: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute('data-placeholder') === 'true',
        renderHTML: (attributes) => {
          if (!attributes.isPlaceholder) return {};
          return {
            'data-placeholder': 'true',
          };
        },
      },
      placeholderHeight: {
        default: 0,
        parseHTML: (element) => {
          const height = element.getAttribute('data-placeholder-height');
          return height ? parseInt(height, 10) : 0;
        },
        renderHTML: (attributes) => {
          if (!attributes.isPlaceholder || !attributes.placeholderHeight)
            return {};
          return {
            'data-placeholder-height': attributes.placeholderHeight,
          };
        },
      },
    };
  },

  /**
   * 声明从 HTML 识别当前 TipTap 节点的规则。
   *
   * @returns 整理后的结果列表。
   */
  parseHTML() {
    return [
      {
        tag: 'div[data-page-break]',
      },
    ];
  },

  /**
   * 将当前节点及其属性转换为 HTML 结构。
   *
   * @param options 控制本次行为的可选配置。
   * @returns [string, Record<string, any>] 类型的处理结果。
   */
  renderHTML({ node, HTMLAttributes }) {
    const { pageNum, isPlaceholder, placeholderHeight } = node.attrs;
    const height = placeholderHeight || 8000;

    const classList = ['page-break-marker'];
    const styles: string[] = [];

    if (isPlaceholder) {
      classList.push('page-placeholder');
      styles.push(`height: ${height}px`);
      styles.push(`min-height: ${height}px`);
      styles.push(`contain-intrinsic-size: ${height}px`);
    }

    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-page-break': 'true',
        'data-page-num': pageNum,
        'data-placeholder': isPlaceholder ? 'true' : 'false',
        'data-placeholder-height': isPlaceholder ? height : undefined,
        class: classList.join(' '),
        style: styles.length > 0 ? styles.join('; ') : undefined,
      }),
    ];
  },

  /**
   * 注册当前扩展向编辑器暴露的命令。
   *
   * @returns 供后续操作使用的回调或清理函数。
   */
  addCommands() {
    return {
      setPageBreak:
        (pageNum: number, isPlaceholder = false, placeholderHeight = 0) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              pageNum,
              isPlaceholder,
              placeholderHeight: isPlaceholder ? placeholderHeight : 0,
            },
          });
        },

      removePageBreak:
        (pageNum: number) =>
        ({ state, dispatch }) => {
          if (!dispatch) return false;

          let removed = false;
          state.doc.descendants((node, pos) => {
            if (
              node.type.name === this.name &&
              node.attrs.pageNum === pageNum
            ) {
              const tr = state.tr.delete(pos, pos + node.nodeSize);
              dispatch(tr);
              removed = true;
              return false;
            }
            return true;
          });

          return removed;
        },
    };
  },
});
