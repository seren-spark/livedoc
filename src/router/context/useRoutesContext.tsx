/**
 * @file 路由上下文 Hook。读取共享路由数据并检查 Provider 是否存在。
 */
// useRoutesContext.tsx
import { createContext, useContext } from 'react';
import type { MenuItem } from '@/types/routes';

interface RoutesContextType {
  dynamicRoutes: any[];
  menus: MenuItem[];
  loading: boolean;
  refreshRoutes: () => Promise<void>;
}

export const RoutesContext = createContext<RoutesContextType | undefined>(
  undefined,
);

/**
 * 读取路由上下文，供菜单和页面组件使用。
 *
 * @returns RoutesContextType 类型的处理结果。
 */
export const useRoutesContext = () => {
  const context = useContext(RoutesContext);
  if (!context)
    throw new Error('useRoutesContext must be used within a RoutesProvider');
  return context;
};
