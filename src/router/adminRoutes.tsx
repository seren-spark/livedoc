/**
 * @file 后台路由配置。声明管理后台各页面及对应权限信息。
 */
import { lazy } from 'react';
import { useRoutesContext } from './context/useRoutesContext';
import NoFound from '@/pages/[...all]';

const AdminLayout = lazy(() => import('@/layouts/adminLayout'));
const Home = lazy(() => import('@/pages/admin/home'));

// 静态基础路由
const staticAdminRoutes = [
  {
    index: true,
    element: <Home />,
  },
];

// 获取完整管理路由（包含静态+动态）
/**
 * 获取完整管理路由（包含静态+动态）
 *
 * @returns 供页面渲染的组件内容。
 */
export const useAdminRoutes = () => {
  const { dynamicRoutes } = useRoutesContext();

  return [
    {
      path: '/admin',
      element: <AdminLayout />,
      children: [
        ...staticAdminRoutes,
        ...(dynamicRoutes || []), // 注入动态路由
        {
          path: '*',
          element: <NoFound />,
        },
      ],
    },
  ];
};
