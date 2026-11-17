/**
 * @file 普通用户管理。连接路由与对应业务组件，呈现普通用户管理的界面与交互。
 */
import GeneralUser from '@/components/Admin/GeneralUser';
/**
 * 呈现普通用户管理对应的业务页面。
 *
 * @returns 供页面渲染的组件内容。
 */
export default function general() {
  return <GeneralUser />;
}
