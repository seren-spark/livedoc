/**
 * @file 用户管理。连接路由与对应业务组件，呈现用户管理的界面与交互。
 */
import User from '@/components/Admin/User';
/**
 * 呈现用户管理对应的业务页面。
 *
 * @returns 供页面渲染的组件内容。
 */
export default function user() {
  return <User />;
}
