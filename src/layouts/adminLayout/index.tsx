/**
 * @file 后台页面布局。组织后台页面布局的界面与交互。
 */
import { Layout } from 'antd';
import Sidebar from '@/layouts/adminLayout/Sidebar';
import Header from '@/layouts/adminLayout/Header';
import Content from '@/layouts/adminLayout/Content';

/**
 * 呈现后台页面布局，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
function AdminLayout() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 侧边栏 */}
      <Sidebar />
      {/* 主体内容区域 */}
      <Layout>
        {/* 顶部导航栏 */}
        <Header />
        {/* 主要内容区域 */}
        <Content />
      </Layout>
    </Layout>
  );
}

export default AdminLayout;
