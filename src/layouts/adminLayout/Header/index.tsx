/**
 * @file 页面顶部导航。组织页面顶部导航的界面与交互。
 */
import {
  Layout,
  Button,
  Input,
  Space,
  Dropdown,
  Avatar,
  Badge,
  type MenuProps,
} from 'antd';
import {
  MenuOutlined,
  SearchOutlined,
  UserOutlined,
  SettingOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { useState } from 'react';

import './index.scss'; // 引入样式

const { Header } = Layout;

/**
 * 呈现页面顶部导航，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
function LayoutBar() {
  const [collapsed, setCollapsed] = useState(false);

  // 用户菜单项
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      label: '退出登录',
    },
  ];

  return (
    <Header className="admin-header">
      <div className="header-btn">
        <Button
          type="text"
          className="menu-toggle"
          icon={<MenuOutlined />}
          onClick={() => setCollapsed(!collapsed)}
        />
        <Input
          placeholder="搜索..."
          prefix={<SearchOutlined />}
          className="search-input"
          style={{ width: 300, marginLeft: 16 }}
        />
      </div>

      <Space size="large">
        <Badge count={5}>
          <Button type="text" className="menu-toggle" icon={<BellOutlined />} />
        </Badge>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space className="user-menu">
            <Avatar src="public/logo/logo.png" />
            <span>管理员</span>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
}

export default LayoutBar;
