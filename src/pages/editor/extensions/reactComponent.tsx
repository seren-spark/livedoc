/**
 * @file React 节点视图。通过 React 组件展示编辑器自定义节点。
 */
import type { ReactNodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import React from 'react';
import { Image } from 'antd';
interface ImgViewProps extends ReactNodeViewProps {
  src?: string;
}
// 在tiptap中使用react组件需要NodeViewWrapper包裹
/**
 * 呈现React 节点视图，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export const ImgView = (props: ImgViewProps) => {
  const { node, updateAttributes } = props;
  const src = node?.attrs?.src || '';
  return (
    <NodeViewWrapper className="react-component">
      <Image
        width={300}
        src={src}
        referrerPolicy={node?.attrs?.referrerPolicy}
      />
    </NodeViewWrapper>
  );
};
