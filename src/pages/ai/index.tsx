/**
 * @file AI 对话。连接路由与对应业务组件，呈现AI 对话的界面与交互。
 */
import AiChat from '@/components/AiChat';

/**
 * 呈现AI 对话对应的业务页面。
 *
 * @returns 供页面渲染的组件内容。
 */
function ai() {
  return <AiChat />;
}

export default ai;
