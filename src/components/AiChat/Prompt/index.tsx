/**
 * @file 对话提示示例。组织对话提示示例的界面与交互。
 */
import './index.scss';

interface PromptProps {
  timePeriod: string;
  userName: string;
}
/**
 * 呈现对话提示示例，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
function Prompt({ timePeriod, userName }: PromptProps) {
  return (
    <div>
      <h1 className="promptText">
        {timePeriod}好，{userName}
      </h1>
    </div>
  );
}
export default Prompt;
