/**
 * @file 块属性扩展。维护编辑块标识和全局属性，支持后续定位与渲染。
 */
// @ts-nocheck
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  Plugin as ProseMirrorPlugin,
  PluginKey as PMPluginKey,
} from '@tiptap/pm/state';

/**
 * 块级节点属性扩展
 * 为 paragraph、heading、codeBlock、blockquote、listItem 统一添加虚拟化所需属性
 */

// 支持虚拟化的节点类型
export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'codeBlock',
  'blockquote',
  'listItem',
];

// 生成唯一 blockId
/**
 * 生成唯一 blockId
 *
 * @returns 整理后的文本或标识。
 */
function generateBlockId(): string {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const AUTO_BLOCK_ID_KEY = new PMPluginKey('autoBlockId');

export const BlockAttributes = Extension.create({
  name: 'blockAttributes',

  /**
   * 声明当前 TipTap 扩展的默认选项。
   *
   * @returns 整理后的状态与操作结果对象。
   */
  addOptions() {
    return {
      // 是否启用虚拟化（默认启用）
      enableVirtualization: true,
      // 预加载边距
      preloadMargin: '500px',
      // 延迟卸载时间
      unloadDelay: 500,
      // 默认占位符高度
      defaultHeight: 80,
      // 编辑缓冲区
      editingBuffer: 1000,
    };
  },

  /**
   * 向适用的 TipTap 节点补充共享属性定义。
   *
   * @returns 供后续操作使用的回调或清理函数；未找到或不可用时可能为空。
   */
  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          // 唯一标识，用于目录跳转和高度缓存
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) => {
              if (!attributes.blockId) return {};
              return {
                'data-block-id': attributes.blockId,
              };
            },
          },
          // 缓存高度（仅存在于文档模型，不渲染到 HTML）
          cachedHeight: {
            default: null,
            rendered: false,
          },
          // 文档中的偏移位置（仅模型）
          offsetTop: {
            default: null,
            rendered: false,
          },
        },
      },
    ];
  },

  // 🔥 暂时禁用 NodeView 虚拟化（使用 VirtualScroll 代替）
  // addNodeView() {
  //   return {};
  // },

  /**
   * 注册底层 ProseMirror 插件以处理事务、事件或视图装饰。
   *
   * @returns 整理后的结果列表。
   */
  addProseMirrorPlugins() {
    return [
      // 自动为新节点添加 blockId
      new ProseMirrorPlugin({
        key: AUTO_BLOCK_ID_KEY,

        /**
         * 在原事务处理后补充必要的节点属性或结构调整。
         *
         * @param transactions 已经执行的编辑器事务集合。
         * @param _oldState 回调签名保留的参数，当前实现不使用。
         * @param newState 本次事务处理后的编辑器状态。
         * @returns import("E:/LiveDoc/livedoc/node_modules/prosemirror-state/dist/index").Transaction 类型的处理结果。
         */
        appendTransaction(transactions, _oldState, newState) {
          // 防止无限循环：跳过自己创建的 transaction
          if (transactions.some((tr) => tr.getMeta('autoBlockId'))) {
            return null;
          }

          // 只处理文档变化
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }

          const tr = newState.tr;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (!BLOCK_TYPES.includes(node.type.name)) return true;

            const blockId = node.attrs.blockId as string | null;
            if (!blockId) {
              // 添加 blockId
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                blockId: generateBlockId(),
              });
              modified = true;
            }

            return true;
          });

          if (modified) {
            tr.setMeta('autoBlockId', true);
            return tr;
          }

          return null;
        },
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
      scrollToBlock:
        (blockId: string) =>
        ({ editor }: { editor: Editor }) => {
          const { view } = editor;
          let targetPos: number | null = null;

          // 查找目标 blockId 的文档位置
          view.state.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (node.attrs.blockId === blockId) {
              targetPos = pos;
              return false; // 找到后停止遍历
            }
            return true;
          });

          if (targetPos === null) return false;

          console.log(
            `[BlockAttributes] 目录跳转: blockId=${blockId}, pos=${targetPos}`,
          );

          // 1. 找到目标元素并滚动到它
          requestAnimationFrame(() => {
            try {
              if (targetPos === null) return;

              const coords = view.coordsAtPos(targetPos);
              const container = view.dom.closest(
                '.tiptap',
              ) as HTMLElement | null;

              if (!container) {
                console.warn('[BlockAttributes] 未找到滚动容器');
                return;
              }

              // 计算目标位置
              const targetTop =
                coords.top -
                container.getBoundingClientRect().top +
                container.scrollTop;

              // 2. 滚动到目标位置
              container.scrollTo({
                top: targetTop - 100,
                behavior: 'smooth',
              });

              console.log(`[BlockAttributes] 滚动到: top=${targetTop - 100}px`);

              // 3. 设置光标到目标位置
              setTimeout(() => {
                if (targetPos === null) return;

                try {
                  const $pos = view.state.doc.resolve(targetPos);
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const selection = (
                    view.state.selection.constructor as any
                  ).near($pos);
                  view.dispatch(view.state.tr.setSelection(selection));
                } catch (e) {
                  console.warn('[BlockAttributes] 设置光标失败:', e);
                }
              }, 300); // 等待滚动动画完成
            } catch (e) {
              console.warn('[BlockAttributes] 滚动失败:', e);
            }
          });

          return true;
        },
    };
  },
});

export default BlockAttributes;
// @ts-nocheck
