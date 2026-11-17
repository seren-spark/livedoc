/**
 * @file 文档目录。组织文档目录的界面与交互。
 */
// @ts-nocheck
import { TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import type { PagedEditorManager } from '../../pages/editor/managers/PagedEditorManager';
import { message } from 'antd';

/**
 * 渲染单个标题目录项，并连接对应章节的跳转操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export const ToCItem = ({ item, onItemClick }) => {
  return (
    // item.isActive && !item.isScrolledOver
    <div
      className={`${item.isActive ? 'is-active' : ''} ${item.isScrolledOver ? 'is-scrolled-over' : ''}`}
      style={{
        '--level': item.level,
      }}
    >
      <a
        href={`#${item.id}`}
        onClick={(e) => onItemClick(e, item.id)}
        data-item-index={item.itemIndex}
      >
        {item.textContent}
      </a>
    </div>
  );
};

/**
 * 在文档尚无可导航标题时显示目录提示。
 *
 * @returns 供页面渲染的组件内容。
 */
export const ToCEmptyState = () => {
  return (
    <div className="empty-state">
      <p>Start editing your document to see the outline.</p>
    </div>
  );
};

interface TocProps {
  items: {
    id: string;
    level: number;
    textContent: string;
    isActive?: boolean;
    isScrolledOver?: boolean;
    itemIndex?: number;
    pageNumber?: number; // 添加页码属性
  }[];
  editor: Editor;
  pagedManager?: PagedEditorManager | null;
}

/**
 * 呈现文档目录，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export const Toc = ({ items = [], editor, pagedManager }: TocProps) => {
  // if (items.length === 0) {
  //   return <ToCEmptyState />
  // }
  console.log('目录结构', items);

  /**
   * 点击目录项后定位对应标题。
   *
   * @param e 当前界面事件或捕获的异常。
   * @param id 目标记录的唯一标识。
   * @param pageNumber 目标页面的页码（可选）。
   */
  const onItemClick = async (
    e: React.MouseEvent,
    id: string,
    pageNumber?: number,
  ) => {
    e.preventDefault();

    if (!editor) return;

    // 如果启用了分页模式，并且目标页面与当前页面不同，则先加载目标页面
    if (
      pagedManager &&
      pageNumber !== undefined &&
      (pagedManager as any).currentPage !== pageNumber
    ) {
      try {
        // 显示加载状态
        const loadingKey = `toc-loading-${id}`;
        message.loading({
          content: `正在跳转到第 ${pageNumber} 页...`,
          key: loadingKey,
          duration: 3,
        });

        // 切换到目标页面
        await (pagedManager as any).switchToPage(pageNumber);

        // 等待DOM更新
        setTimeout(() => {
          scrollToElement(id);
          message.destroy(loadingKey);
        }, 100);
      } catch (error) {
        console.error('切换页面失败:', error);
        message.error('跳转失败，请稍后重试');
      }
    } else {
      // 普通模式或同页跳转
      scrollToElement(id);
    }
  };

  /**
   * 将指定标题元素滚动到可见位置。
   *
   * @param id 目标记录的唯一标识。
   */
  const scrollToElement = (id: string) => {
    // 查找标题元素 - 标题使用 blockId 属性
    const element = editor.view.dom.querySelector(`[data-block-id="${id}"]`);
    if (!element) {
      console.warn(`未找到目录项，ID: ${id}`);
      console.log(
        '[Toc] 尝试查找所有标题元素:',
        editor.view.dom.querySelectorAll('h1, h2, h3, h4, h5, h6'),
      );
      return;
    }

    console.log('[Toc] 找到目标元素:', element);

    /**
     * 判断容器是否可以滚动，用于选择目录跳转的滚动目标。
     *
     * @param el el 参数（HTMLElement）。
     * @returns 条件是否满足的判断结果。
     */
    const isScrollable = (el: HTMLElement) => {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY || style.overflow;
      return overflowY === 'auto' || overflowY === 'scroll';
    };

    const scrollContainer = isScrollable(
      editor.view.dom.closest('#tiptap') as HTMLElement,
    )
      ? editor.view.dom.closest('#tiptap')
      : window;

    if (element && scrollContainer) {
      if (scrollContainer === window) {
        // 处理 window 滚动
        const elementRect = element.getBoundingClientRect();
        const scrollTop = window.scrollY + elementRect.top - 20; // 减去一些间距
        window.scrollTo({
          top: scrollTop,
          behavior: 'smooth',
        });
      } else {
        // 计算元素相对于容器的位置
        const containerRect = (
          scrollContainer as HTMLElement
        ).getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const scrollTop =
          (scrollContainer as HTMLElement).scrollTop +
          elementRect.top -
          containerRect.top -
          20; // 减去一些间距

        (scrollContainer as HTMLElement).scrollTo({
          top: scrollTop,
          behavior: 'smooth',
        });
      }

      // 设置光标位置
      const pos = editor.view.posAtDOM(element, 0);
      const tr = editor.view.state.tr;
      tr.setSelection(new TextSelection(tr.doc.resolve(pos)));
      editor.view.dispatch(tr);
      editor.view.focus();

      // 更新 URL hash
      if (history.pushState) {
        history.pushState(null, '', `#${id}`);
      }
    }

    // window.scrollTo({
    //   top: element.getBoundingClientRect().top + window.scrollY,
    //   behavior: 'smooth',
    // });
  };

  // 如果没有目录项，显示空状态
  if (items.length === 0) {
    return <ToCEmptyState />;
  }

  return (
    <div className="toc-container">
      {items.map((item, i) => {
        // 添加分页标记
        const pageInfo = item.pageNumber ? `(第 ${item.pageNumber} 页)` : '';
        const itemWithPage = {
          ...item,
          textContent: `${item.textContent} ${pageInfo}`.trim(),
        };

        return (
          <ToCItem
            onItemClick={(e) => onItemClick(e, item.id, item.pageNumber)}
            key={item.id}
            item={itemWithPage}
            index={i + 1}
          />
        );
      })}
    </div>
  );
};
