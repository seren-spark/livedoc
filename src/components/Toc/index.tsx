/**
 * @file 文档目录。组织文档目录的界面与交互。
 */
// @ts-nocheck
import { TextSelection } from '@tiptap/pm/state';
import Editor from '../../pages/editor';

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

/**
 * 呈现文档目录，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export const Toc = ({ items = [], editor }) => {
  // if (items.length === 0) {
  //   return <ToCEmptyState />
  // }

  /**
   * 点击目录项后定位对应标题。
   *
   * @param e 当前界面事件或捕获的异常。
   * @param id 目标记录的唯一标识。
   */
  const onItemClick = (e, id) => {
    e.preventDefault();

    if (editor) {
      const element = editor.view.dom.querySelector(`[data-toc-id="${id}"`); //查找对应目录项

      // set focus
      console.log(editor.view.dom, 'dom');
      /**
       * 判断容器是否可以滚动，用于选择目录跳转的滚动目标。
       *
       * @param el el 参数（HTMLElement）。
       * @returns 条件是否满足的判断结果。
       */
      const isScrollable = (el: HTMLElement) => {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY || style.overflow;
        const hasOverflow = overflowY === 'auto' || overflowY === 'scroll';
        return hasOverflow;
      };

      const scrollContainer = isScrollable(editor.view.dom.closest('#tiptap'))
        ? editor.view.dom.closest('#tiptap')
        : window;
      // const scrollContainer = editor.view.dom.closest('.ant-layout-content')

      if (element && scrollContainer) {
        if (scrollContainer == window) {
          // 处理 window 滚动
          const elementRect = element.getBoundingClientRect();
          const scrollTop = window.scrollY + elementRect.top;
          window.scrollTo({
            top: scrollTop,
            behavior: 'smooth',
          });
        } else {
          // 计算元素相对于容器的位置
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();

          // 计算需要滚动的距离
          const scrollTop =
            scrollContainer.scrollTop + elementRect.top - containerRect.top;
          scrollContainer.scrollTo({
            top: scrollTop,
            behavior: 'smooth',
          });
          const pos = editor.view.posAtDOM(element, 0);
          const tr = editor.view.state.tr;
          tr.setSelection(new TextSelection(tr.doc.resolve(pos)));

          editor.view.dispatch(tr);

          editor.view.focus();

          if (history.pushState) {
            history.pushState(null, null, `#${id}`);
          }
        }
      }

      // window.scrollTo({
      //   top: element.getBoundingClientRect().top + window.scrollY,
      //   behavior: 'smooth',
      // });
    }
  };

  return (
    <>
      {items.map((item, i) => (
        <ToCItem
          onItemClick={onItemClick}
          key={item.id}
          item={item}
          index={i + 1}
        />
      ))}
    </>
  );
};
