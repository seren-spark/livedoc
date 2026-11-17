/**
 * @file 审核。连接路由与对应业务组件，呈现审核的界面与交互。
 */
import Audit from '@/components/Admin/Audit';
/**
 * 呈现审核对应的业务页面。
 *
 * @returns 供页面渲染的组件内容。
 */
export default function audit() {
  return <Audit />;
}
