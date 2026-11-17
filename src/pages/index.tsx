/**
 * @file 首页信息流布局。组合导航与文章列表，并把根路径引导至综合信息流。
 */
// index.tsx
import FrontLayout from '@/layouts/frontLayout';
import { Layout, theme, type MenuProps } from 'antd';
import { BookMarked, Star } from 'lucide-react';
import MySider from '@/layouts/frontLayout/Sider';
type MenuItem = Required<MenuProps>['items'][number];
import MainContainer from '@/layouts/frontLayout/MainContainer';
import MyContent from '@/layouts/frontLayout/MyContent';
import MiddleContent from '@/layouts/frontLayout/MiddleContent';
import RightSide from '@/layouts/frontLayout/RightSide';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const menu: MenuItem[] = [
  {
    key: '/following',
    icon: <BookMarked className="icon" size={15} />,
    label: '关注',
  },
  {
    key: '/synthesis',
    icon: <Star size={15} />,
    label: '综合',
  },
];

/**
 * 呈现首页信息流布局，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
function Sider() {
  return <MySider menu={menu} defaultSelectedKeys={['/synthesis']} />;
}
// 首页

/**
 * 呈现首页信息流布局，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
export default function Index() {
  const location = useLocation();

  // 如果当前路径是根路径，则重定向
  if (location.pathname === '/') {
    return <Navigate to="/synthesis" replace />;
  }

  return (
    <FrontLayout>
      <MainContainer siderNode={<Sider />}>
        <MyContent>
          <MiddleContent>
            <Outlet />
          </MiddleContent>
          <RightSide></RightSide>
        </MyContent>
      </MainContainer>
    </FrontLayout>
  );
}
