/**
 * @file 编辑器路由入口。根据页面参数呈现文档编辑界面。
 */
import React from 'react';
// import MdEditor from './editor/mdEditor';
import { Outlet } from 'react-router-dom';
/**
 * 呈现编辑器路由入口，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
export default function Editor() {
  return (
    <div id="web-editor">
      <Outlet></Outlet>
    </div>
  );
}
