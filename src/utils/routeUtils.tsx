/**
 * @file 路由转换工具。将菜单或路由数据整理为页面渲染需要的结构。
 */
import { lazy } from 'react';
import type { BackendRoute, FrontendRoute, MenuItem } from '@/types/routes';
import { Link } from 'react-router-dom';
import {
  UserOutlined,
  HomeOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  TeamOutlined,
  SolutionOutlined,
  FileAddOutlined,
  FileExclamationOutlined,
  ClockCircleOutlined,
  FileProtectOutlined,
  VideoCameraOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import NoAccess from '@/layouts/adminLayout/NoAccess';

// 创建图标映射对象
const iconMap = {
  UserOutlined: <UserOutlined />,
  HomeOutlined: <HomeOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  ExclamationCircleOutlined: <ExclamationCircleOutlined />,
  TeamOutlined: <TeamOutlined />,
  SolutionOutlined: <SolutionOutlined />,
  FileAddOutlined: <FileAddOutlined />,
  FileExclamationOutlined: <FileExclamationOutlined />,
  ClockCircleOutlined: <ClockCircleOutlined />,
  FileProtectOutlined: <FileProtectOutlined />,
  VideoCameraOutlined: <VideoCameraOutlined />,
  FolderOpenOutlined: <FolderOpenOutlined />,
  HistoryOutlined: <HistoryOutlined />,
  SystemOutlined: <SettingOutlined />,
};

// 动态加载组件
/**
 * 动态加载组件
 *
 * @param componentName 需要懒加载的页面组件名称。
 * @param fullPath 当前页面或资源的完整路径（可选）。
 * @returns 当前步骤的处理结果。
 */
const lazyLoad = (componentName: string, fullPath?: string) => {
  if (fullPath == undefined || fullPath == componentName) {
    return lazy(() => import(`@/pages/admin/${componentName}/index.tsx`));
  } else {
    return lazy(() =>
      import(`@/pages/admin/${fullPath}/${componentName}/index.tsx`).catch(
        () => import('@/pages/admin/dashboard'),
      ),
    );
  }
};

// 将后端路由转换为React Router需要的结构
/**
 * 将后端路由转换为React Router需要的结构
 *
 * @param routes 需要转换或展示的路由配置。
 * @param permissions 当前身份持有的权限列表。
 * @param fullPath 当前页面或资源的完整路径（可选）。
 * @returns 整理后的结果列表。
 */
export const transformRoutes = (
  routes: BackendRoute[],
  permissions: string[] = [],
  fullPath?: string,
): FrontendRoute[] => {
  return routes.map((route) => {
    const routePath = `${route.key}`.replace(/\/+/g, '/');

    // 检查是否有权限访问该路由
    const hasPermission =
      !route.permissions ||
      route.permissions.some((p) => permissions.includes(p));
    let transformed: FrontendRoute;
    if (hasPermission) {
      const Component = lazyLoad(routePath, fullPath);
      transformed = {
        path: routePath,
        element: <Component />,
      };
    } else {
      // 无权限时显示无权限访问页面
      transformed = {
        path: routePath,
        element: <NoAccess />,
      };
    }

    if (route.children) {
      // 更新 fullPath 为当前路由的完整路径
      const newFullPath = routePath;
      transformed.children = transformRoutes(
        route.children,
        permissions,
        newFullPath,
      );
    }
    return transformed;
  });
};

// 生成菜单结构
/**
 * 生成菜单结构
 *
 * @param routes 需要转换或展示的路由配置。
 * @param permissions 当前身份持有的权限列表。
 * @param parentPath 父节点或父路由的完整路径（可选）。
 * @returns 整理后的结果列表。
 */
export const generateMenus = (
  routes: BackendRoute[],
  permissions: string[] = [],
  parentPath?: string,
): MenuItem[] => {
  return routes
    .filter((route) => {
      // 过滤隐藏菜单和无权限路由
      if (route.hidden) return false;
      if (
        route.permissions &&
        !route.permissions.some((p) => permissions.includes(p))
      ) {
        return false;
      }
      return true;
    })
    .map((route) => {
      // 构造完整的路径
      const fullPath = parentPath ? `${parentPath}/${route.key}` : route.key;
      return {
        key: route.key,
        label: !route.children ? (
          <Link to={fullPath}>{route.label}</Link>
        ) : (
          route.label
        ),
        icon:
          route.icon && iconMap[route.icon as keyof typeof iconMap]
            ? iconMap[route.icon as keyof typeof iconMap]
            : null,
        children: route.children
          ? generateMenus(route.children, permissions, fullPath)
          : undefined,
      };
    });
};
