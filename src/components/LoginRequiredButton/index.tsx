/**
 * @file 需登录操作按钮。组织需登录操作按钮的界面与交互。
 */
// src/components/LoginRequiredButton.jsx
import type React from 'react';
import { Button, type ButtonProps } from 'antd';
import { useAuth } from '@/contexts/authContext';
interface LoginRequiredButtonProps extends ButtonProps {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children?: React.ReactNode;
}
// 封装一个“需登录才能点击”的按钮
/**
 * 呈现需登录操作按钮，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
const LoginRequiredButton = ({
  onClick,
  children,
  ...props
}: LoginRequiredButtonProps) => {
  const { isLoggedIn, showLoginModal } = useAuth();

  // 点击时拦截：未登录则显示弹窗，已登录则执行原逻辑
  /**
   * 点击时拦截：未登录则显示弹窗，已登录则执行原逻辑
   *
   * @param e 当前界面事件或捕获的异常。
   */
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isLoggedIn) {
      showLoginModal(); // 未登录：显示弹窗
    } else {
      if (onClick) {
        onClick(e); // 已登录：执行原操作
      }
    }
  };

  return (
    <Button {...props} onClick={handleClick}>
      {children}
    </Button>
  );
};

export default LoginRequiredButton;
