/**
 * @file 无权限提示页。组织无权限提示页的界面与交互。
 */
import LottieAccess from '@/components/Admin/LottieAccess';

/**
 * 呈现无权限提示页，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
function NoAccess() {
  return (
    <>
      <LottieAccess />
      <h1>无权限访问</h1>
    </>
  );
}
export default NoAccess;
