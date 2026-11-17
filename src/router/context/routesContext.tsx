/**
 * @file 路由上下文。向子组件提供动态路由数据。
 */
// src/router/context/routesContext.tsx
import { useEffect, useState } from 'react';
import { transformRoutes, generateMenus } from '@/utils/routeUtils';
import { RoutesContext } from './useRoutesContext';
import type { MenuItem } from '@/types/routes';
import { useSelector } from 'react-redux';
import type { RouteState } from '@/store/modules/routeSlice';

/**
 * 呈现路由上下文，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export const RoutesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [dynamicRoutes, setDynamicRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  // 从redux中获取路由数据
  const routes = useSelector((state: RouteState) => state.route.routes);

  // 数据处理与转换
  /**
   * 数据处理与转换
   */
  const fetchRoutes = async () => {
    try {
      setLoading(true);
      setDynamicRoutes(transformRoutes(routes));
      setMenus(generateMenus(routes));
    } catch (error) {
      console.error('Failed to fetch routes', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  // 向RoutesContext提供路由数据
  return (
    <RoutesContext.Provider
      value={{ dynamicRoutes, menus, loading, refreshRoutes: fetchRoutes }}
    >
      {children}
    </RoutesContext.Provider>
  );
};
