/**
 * @file 资源管理。连接路由与对应业务组件，呈现资源管理的界面与交互。
 */
import Resource from '@/components/Admin/Resource';

/**
 * 呈现资源管理对应的业务页面。
 *
 * @returns 供页面渲染的组件内容。
 */
function resource() {
  return <Resource />;
}

export default resource;
