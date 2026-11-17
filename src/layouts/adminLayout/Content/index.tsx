/**
 * @file 页面内容容器。组织页面内容容器的界面与交互。
 */
// @ts-nocheck
import { Layout, Breadcrumb } from 'antd';

import './index.scss'; // 引入样式文件
import { matchRoutes, Outlet, useLocation } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';
import { useAdminRoutes } from '@/router/adminRoutes';

const { Content } = Layout;

/**
 * 呈现页面内容容器，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
function ContentPage() {
  const location = useLocation();
  const adminRoute = useAdminRoutes();

  const matchedRoutes = matchRoutes([adminRoute], location.pathname) || [];
  const items = [
    {
      href: '/admin',
      title: (
        <>
          <HomeOutlined />
          admin
        </>
      ),
    },
    // 动态添加匹配到的路由
    ...matchedRoutes
      .filter((route) => route.pathname !== '/admin') // 过滤掉根路由
      .map((route) => ({
        href: route.pathname,
        title: route.route.path === '*' ? '404' : route.route.path,
      })),
  ];

  return (
    <Content className="admin-content">
      {/* 面包屑导航 */}
      <Breadcrumb className="breadcrumb" items={items} />
      {/* 中心区 */}
      <Outlet />
    </Content>
  );
}
export default ContentPage;
