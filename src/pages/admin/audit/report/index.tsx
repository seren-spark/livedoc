/**
 * @file 举报审核。连接路由与对应业务组件，呈现举报审核的界面与交互。
 */
import ReportPhp from '@/components/Admin/ReportPhp';

/**
 * 整理核验结论、问题片段和覆盖情况。
 *
 * @returns 供页面渲染的组件内容。
 */
function report() {
  return <ReportPhp />;
}

export default report;
