/**
 * @file 后台导航栏。组织后台导航栏的界面与交互。
 */
import { Layout, Menu } from 'antd';
import { useState } from 'react';
import { useRoutesContext } from '@/router/context/useRoutesContext';

import './index.scss';

const { Sider } = Layout;

/**
 * 呈现后台导航栏，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { menus, loading } = useRoutesContext();
  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      width={280}
      className="admin_sidebar"
    >
      <div className="admin_sidebar_logo">
        {collapsed == false ? (
          <img
            className="logoImg"
            src="../../../public/logo-白-图汉字.png"
            alt=""
          />
        ) : (
          <img
            className="logoImg"
            src="../../../public/logo-图-白.png"
            alt=""
          />
        )}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        defaultSelectedKeys={['job-list']}
        defaultOpenKeys={['work']}
        // items={menuItems}
        items={loading ? [] : (menus as any)}
        className="admin_sidebar_menu"
      />
    </Sider>
  );
}

export default Sidebar;
