/**
 * @file 简化虚拟渲染。根据滚动范围和块高度控制可见块，并监听节点高度变化。
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * 简化版虚拟化渲染 - 基于 CSS class + IntersectionObserver
 *
 * 核心思路：
 * 1. 通过 appendTransaction 自动为块级节点添加 blockId
 * 2. 通过 nodeView 为每个块添加统一 class（block-node）
 * 3. 用 IntersectionObserver 监听可见性，动态添加/移除 .virtual-hidden
 * 4. CSS 控制 .virtual-hidden 显示占位符
 */

const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'listItem',
  'codeBlock',
  'blockquote',
];

/**
 * 为编辑块生成本地唯一标识。
 *
 * @returns 整理后的文本或标识。
 */
function genId() {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

class Metrics {
  heights = new Map<string, number>();
  order: string[] = [];
  estimate: Record<string, number> = {
    paragraph: 80,
    heading: 60,
    codeBlock: 200,
    listItem: 40,
    blockquote: 80,
  };
  /**
   * 根据当前高度缓存重新计算块的位置。
   */
  recalcPos() {
    let top = 0;
    this.pos = new Map();
    for (const id of this.order) {
      this.pos.set(id, top);
      top += this.heights.get(id) ?? 80;
    }
  }
  pos = new Map<string, number>();
  /**
   * 读取指定块相对文档顶部的位置。
   *
   * @param id 目标记录的唯一标识。
   * @returns 计算得到的数值。
   */
  getTop(id: string) {
    return this.pos.get(id) ?? 0;
  }
  /**
   * 读取指定块或缓存项的高度。
   *
   * @param id 目标记录的唯一标识。
   * @param type 当前数据或节点类型（可选）。
   * @returns 计算得到的数值。
   */
  getHeight(id: string, type?: string) {
    return this.heights.get(id) ?? this.estimate[type || 'paragraph'] ?? 80;
  }
  /**
   * 根据滚动位置求出需要渲染的块区间。
   *
   * @param scrollTop 容器当前的垂直滚动位置。
   * @param vh 当前视口高度。
   * @param buf 当前输入的二进制缓冲区。
   * @returns 整理后的状态与操作结果对象。
   */
  range(scrollTop: number, vh: number, buf: number) {
    if (!this.order.length) return { s: 0, e: -1 };
    let l = 0,
      r = this.order.length - 1,
      mid = 0;
    while (l <= r) {
      mid = (l + r) >> 1;
      const id = this.order[mid];
      const t = this.getTop(id);
      const b = t + this.getHeight(id);
      if (scrollTop >= t && scrollTop < b) break;
      if (scrollTop < t) r = mid - 1;
      else l = mid + 1;
    }
    const s = Math.max(0, mid - buf);
    let h = 0,
      e = mid;
    while (e < this.order.length && h < vh) {
      h += this.getHeight(this.order[e]);
      e++;
    }
    return { s, e: Math.min(this.order.length - 1, e + buf) };
  }
}
const metrics = new Metrics();

const key = new PluginKey('simpleVirtual');

export default Extension.create({
  name: 'virtualRendererSimple',

  /**
   * 声明当前 TipTap 扩展的默认选项。
   *
   * @returns 整理后的状态与操作结果对象。
   */
  addOptions() {
    return { buffer: 5, typingPause: 150 };
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
          blockId: {
            default: null,
            parseHTML: (e) => e.getAttribute('data-block-id'),
            renderHTML: (attributes) => {
              if (!attributes.blockId) return {};
              return { 'data-block-id': attributes.blockId };
            },
          },
        },
      },
    ];
  },

  // 🔥 添加 CSS 样式
  /**
   * 🔥 添加 CSS 样式
   */
  onBeforeCreate() {
    if (typeof document === 'undefined') return;

    const styleId = 'virtual-renderer-simple-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* 虚拟隐藏状态 - 保持高度但隐藏内容 */
      .virtual-hidden {
        min-height: 1px;
      }
      
      .virtual-hidden > * {
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  },
  /**
   * 注册底层 ProseMirror 插件以处理事务、事件或视图装饰。
   *
   * @returns 整理后的结果列表。
   */
  addProseMirrorPlugins() {
    const buffer = this.options.buffer;
    const typingPause: number = this.options.typingPause ?? 150;
    let viewDom: HTMLElement;
    let typing = false;
    let raf = 0;
    return [
      new Plugin({
        key,
        /**
         * 在原事务处理后补充必要的节点属性或结构调整。
         *
         * @param tx 当前数据库事务执行器。
         * @param _old 回调签名保留的参数，当前实现不使用。
         * @param ns 检查点命名空间。
         * @returns import("E:/LiveDoc/livedoc/node_modules/prosemirror-state/dist/index").Transaction 类型的处理结果。
         */
        appendTransaction(tx, _old, ns) {
          if (tx.some((t) => t.getMeta('autoId'))) return null;
          if (!tx.some((t) => t.docChanged)) return null;
          const tr = ns.tr;
          let m = false;
          ns.doc.descendants((n, pos) => {
            if (!BLOCK_TYPES.includes(n.type.name)) return true;
            const id = (n.attrs as any).blockId;
            if (!id) {
              tr.setNodeMarkup(pos, undefined, {
                ...n.attrs,
                blockId: genId(),
              });
              m = true;
            }
            return true;
          });
          if (m) {
            tr.setMeta('autoId', 1);
            return tr;
          }
          return null;
        },
        /**
         * 创建插件视图并注册滚动、尺寸或节点观察逻辑。
         *
         * @param view ProseMirror 编辑器视图。
         * @returns 整理后的状态与操作结果对象。
         */
        view(view) {
          viewDom = view.dom as HTMLElement;
          console.log(viewDom, 'viewDom');

          /* scroll handler */
          /**
           * 根据当前滚动范围更新虚拟渲染结果。
           */
          const applyVirtual = () => {
            const top = viewDom.scrollTop;
            const vh = viewDom.clientHeight;

            // 🔥 调试：检查滚动容器信息
            const totalBlocks = metrics.order.length;
            console.log(
              `[Virtual Debug] 滚动位置: ${top}px, 视口高度: ${vh}px, 总块数: ${totalBlocks}`,
            );

            const { s, e } = metrics.range(top, vh, buffer);
            let idx = -1;
            let hiddenCount = 0;
            let visibleCount = 0;
            let noIdCount = 0;
            let noDomCount = 0;

            view.state.doc.descendants((n, pos) => {
              if (!BLOCK_TYPES.includes(n.type.name)) return true;
              idx++;
              const id = (n.attrs as any).blockId;
              if (!id) {
                noIdCount++;
                return true;
              }
              const dom = view.nodeDOM(pos) as HTMLElement;
              if (!dom) {
                noDomCount++;
                return true;
              }
              const visible = idx >= s && idx <= e;
              if (typing || visible) {
                dom.classList.remove('virtual-hidden');
                visibleCount++;
              } else {
                console.log('有在视口外的');

                dom.classList.add('virtual-hidden');
                hiddenCount++;
              }
              return true;
            });

            // 🔥 详细调试日志
            console.log(
              `[Virtual] 可见: ${visibleCount}, 隐藏: ${hiddenCount}, 范围: ${s}-${e}`,
              `| 无ID: ${noIdCount}, 无DOM: ${noDomCount}`,
            );
          };
          /**
           * 在滚动时更新虚拟渲染的可见范围。
           */
          const onScroll = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(applyVirtual);
          };
          viewDom.addEventListener('scroll', onScroll, { passive: true });
          /* typing pause */
          viewDom.addEventListener('keydown', () => {
            typing = true;
          });
          /**
           * 在输入停顿后恢复虚拟渲染更新。
           */
          const stop = () => {
            setTimeout(() => {
              typing = false;
              applyVirtual();
            }, typingPause);
          };
          viewDom.addEventListener('keyup', stop);
          viewDom.addEventListener('compositionend', stop);
          /* height observer */
          const ro = new ResizeObserver((entries) => {
            entries.forEach((e) => {
              const id = e.target.getAttribute('data-block-id');
              if (id) metrics.heights.set(id, e.contentRect.height);
            });
            metrics.recalcPos();
            applyVirtual();
          });
          /**
           * 监听可见块的实际高度变化，修正虚拟布局缓存。
           */
          const observeHeights = () => {
            viewDom
              .querySelectorAll('[data-block-id]')
              .forEach((el) => ro.observe(el));
          };
          observeHeights();
          /* initial cache */
          /**
           * 收集当前文档块顺序，并初始化对应的高度与位置缓存。
           */
          const buildOrder = () => {
            const o: string[] = [];
            view.state.doc.descendants((n) => {
              if (BLOCK_TYPES.includes(n.type.name))
                o.push((n.attrs as any).blockId);
              return true;
            });
            metrics.order = o;
            metrics.recalcPos();
          };
          buildOrder();
          applyVirtual();
          return {
            /**
             * 重建块顺序、重新监听高度并刷新可见范围。
             */
            update() {
              buildOrder();
              observeHeights();
              applyVirtual();
            },
            /**
             * 组件或插件销毁时解绑监听、观察器与定时任务。
             */
            destroy() {
              ro.disconnect();
              viewDom.removeEventListener('scroll', onScroll);
            },
          };
        },
      }),
    ];
  },
});
