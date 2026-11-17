/**
 * @file 代码块视图。展示编辑器代码内容及语言相关交互。
 */
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

interface CodeBlockProps {
  node: {
    attrs: {
      language?: string; // 必须可选或存在
    };
  };
  updateAttributes: (attrs: Record<string, any>) => void;
  extension: any;
}
/**
 * 呈现代码块视图，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
const CodeBlock = ({
  node: {
    attrs: { language: defaultLanguage = 'plaintext' },
  },
  updateAttributes,
  extension,
}: CodeBlockProps) => (
  <NodeViewWrapper className="code-block">
    <select
      contentEditable={false}
      defaultValue={defaultLanguage}
      onChange={(event) => updateAttributes({ language: event.target.value })}
    >
      <option value="null">auto</option>
      <option disabled>—</option>
      {extension.options.lowlight
        .listLanguages()
        .map((lang: any, index: any) => (
          <option key={index} value={lang}>
            {lang}
          </option>
        ))}
    </select>
    <pre>
      <code>
        <NodeViewContent />
      </code>

      {/* <NodeViewContent as="code" /> */}
    </pre>
  </NodeViewWrapper>
);
export default CodeBlock;
