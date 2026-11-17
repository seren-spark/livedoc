/**
 * @file 前台内容布局。组织前台内容布局的界面与交互。
 */
import './index.scss';
import { Layout, Row } from 'antd';

import { useEffect, useRef, useState } from 'react';

import RightSide from '@/layouts/frontLayout/RightSide';
import MiddleContent from '../MiddleContent';
import { Outlet } from 'react-router-dom';
interface ContentProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const { Content } = Layout;
/**
 * 检查元素是否处于当前可视区域。
 *
 * @param element 需要定位或滚动到的 DOM 元素。
 * @returns 条件是否满足的判断结果。
 */
const isElementInView = (element: HTMLElement): boolean => {
  if (!element) return false;

  const rect = element.getBoundingClientRect();
  console.log(rect);
  // 判断元素是否完全在窗口内
  const isInView = !(rect.bottom < 0);

  return isInView;
};
/**
 * 呈现前台内容布局，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export default function MyContent({
  style,
  children,
  className,
}: ContentProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isTop, setIsTop] = useState<boolean>(false);

  useEffect(() => {
    /**
     * 检测侧栏是否进入视口，并更新悬浮展示状态。
     */
    const checkSidebarInView = () => {
      if (sidebarRef.current) {
        const isInView = isElementInView(sidebarRef.current);
        setIsTop(!isInView);
      }
    };

    // 初始检查
    checkSidebarInView();

    // 监听滚动和窗口大小变化事件
    window.addEventListener('scroll', checkSidebarInView);
    window.addEventListener('resize', checkSidebarInView);

    // 清理事件监听器
    return () => {
      window.removeEventListener('scroll', checkSidebarInView);
      window.removeEventListener('resize', checkSidebarInView);
    };
  }, []);

  return (
    <Content
      className={'content ' + `${className}`}
      style={{
        padding: 0,
        minHeight: 'calc(100vh - 64px)',
        maxWidth: '1000px',
        ...style,
      }}
    >
      <Row gutter={24} style={{ flexWrap: 'nowrap' }}>
        {/* <Outlet></Outlet> */}
        {children ? (
          <>{children}</>
        ) : (
          <>
            <MiddleContent></MiddleContent>
            <RightSide></RightSide>
          </>
        )}
      </Row>
    </Content>
  );
}
