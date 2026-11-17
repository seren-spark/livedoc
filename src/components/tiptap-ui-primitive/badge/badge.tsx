/**
 * @file 状态徽标基础组件。封装状态徽标的交互、样式和对外导出。
 */
import * as React from 'react';
import '@/components/tiptap-ui-primitive/badge/badge-colors.scss';
import '@/components/tiptap-ui-primitive/badge/badge-group.scss';
import '@/components/tiptap-ui-primitive/badge/badge.scss';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'ghost' | 'white' | 'gray' | 'green' | 'default';
  size?: 'default' | 'small';
  appearance?: 'default' | 'subdued' | 'emphasized';
  trimText?: boolean;
}

/**
 * 呈现状态徽标基础组件，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @param ref 需要读取的参考资料。
 * @returns 供页面渲染的组件内容。
 */
export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  (
    {
      variant,
      size = 'default',
      appearance = 'default',
      trimText = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={`tiptap-badge ${className || ''}`}
        data-style={variant}
        data-size={size}
        data-appearance={appearance}
        data-text-trim={trimText ? 'on' : 'off'}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Badge.displayName = 'Badge';

export default Badge;
