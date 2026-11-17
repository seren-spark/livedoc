/**
 * @file 前台页面布局。组织前台页面布局的界面与交互。
 */
// 1.接收headerNode 作为头部导航
// 2.接收children 作为main
import MyHeader from './Header';
import './index.scss';
import { Layout, type MenuProps } from 'antd';
type MenuItem = Required<MenuProps>['items'][number];
interface frontLayoutProps {
  headerNode?: React.ReactNode;
  siderNode?: React.ReactNode;
  rightSide?: React.ReactNode;
  children?: React.ReactNode;
  menu?: MenuItem[]; //左侧导航栏
}

/**
 * 呈现前台页面布局，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export default function FrontLayout(props: frontLayoutProps) {
  const { headerNode, children } = props;
  return (
    <Layout
      className="frontLayout"
      style={{ minHeight: '1400px', background: '#f4f5f5' }}
    >
      {headerNode ? <>{headerNode}</> : <MyHeader></MyHeader>}

      {/*  内容区 */}
      <main className="main-container">{children}</main>
    </Layout>
  );
}
