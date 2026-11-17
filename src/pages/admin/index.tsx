/**
 * @file 管理后台。连接路由与对应业务组件，呈现管理后台的界面与交互。
 */
import AdminLayout from '@/layouts/adminLayout';
/**
 * 呈现管理后台对应的业务页面。
 *
 * @returns 供页面渲染的组件内容。
 */
export default function admin() {
  return <AdminLayout />;
}
