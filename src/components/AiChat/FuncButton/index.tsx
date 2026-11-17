/**
 * @file 对话功能按钮。组织对话功能按钮的界面与交互。
 */
import React from 'react';
import { Button } from 'antd';

import './index.scss';

interface FuncButtonProps {
  quickActions: {
    key: string;
    icon: React.ReactElement;
    label: string;
    // color: string;
  }[];
  handleMenuClick: (e: any) => void;
}

/**
 * 呈现对话功能按钮，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
function FuncButton({ quickActions, handleMenuClick }: FuncButtonProps) {
  return (
    <div className="quick-actions">
      {quickActions.map((action, index) => (
        <Button
          className="action-button"
          key={index}
          size="large"
          value={action.key}
          icon={React.cloneElement(action.icon)}
          onClick={handleMenuClick}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

export default FuncButton;
