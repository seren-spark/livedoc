/**
 * @file 前台导航侧栏。组织前台导航侧栏的界面与交互。
 */
// MySider(若不传 则自动使用默认值)
// 1.接收props.children（插槽）,则直接渲染
// 2.接收menu  用于渲染菜单
// 3.接收defaultSelectedKeys  用于设置默认选中的菜单项

import { Menu, theme, type MenuProps } from 'antd';
import Sider from 'antd/es/layout/Sider';

import './index.scss';
import { BookMarked, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useScrollVisibility } from '@/hooks/useScrollVisibility';

interface MySiderProps {
  children?: React.ReactNode;
  menu?: MenuProps['items'];
  defaultSelectedKeys?: string[];
}

const defaultMenu = [
  {
    key: '/following',
    icon: <BookMarked className="icon" size={15} />,
    label: '关注',
  },
  {
    key: '/synthesis',
    icon: <Star size={15} />,
    label: '综合',
  },
];

/**
 * 呈现前台导航侧栏，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
const MySider: React.FC<MySiderProps> = (props: MySiderProps) => {
  const { menu, defaultSelectedKeys } = props;
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const navigate = useNavigate();
  const visible = useScrollVisibility();
  /**
   * 响应导航菜单选择并跳转对应页面。
   *
   * @param e 当前界面事件或捕获的异常。
   */
  const handleMenu: MenuProps['onClick'] = (e) => {
    navigate(e.key);
  };

  return (
    <Sider
      className={`sider ${visible ? '' : 'sideTop'}`}
      style={{ background: colorBgContainer }}
      width={200}
    >
      {!props.children ? (
        <Menu
          mode="inline"
          defaultSelectedKeys={defaultSelectedKeys || ['/following']}
          selectedKeys={[location.pathname]}
          style={{ height: '100%' }}
          onClick={handleMenu}
          items={menu || defaultMenu}
        />
      ) : (
        props.children
      )}
    </Sider>
  );
};
export default MySider;
