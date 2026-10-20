// 接收1.headerMenu,
import type React from 'react';
import './index.scss';
import {
  Layout,
  Menu,
  Row,
  theme,
  Col,
  type MenuProps,
  Input,
  Dropdown,
  Space,
  Badge,
  message,
} from 'antd';

import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { BellFilled, CaretDownFilled } from '@ant-design/icons';

import { useScrollVisibility } from '@/hooks/useScrollVisibility';

import UserDropdown from '@/components/UserDropdown';
import { useAuth } from '@/contexts/authContext';
import LoginRequiredButton from '@/components/LoginRequiredButton';

type MenuItem = Required<MenuProps>['items'][number];
interface MyHeaderProps {
  headMenu?: MenuItem[];
  children?: React.ReactNode;
}
const { Header } = Layout;
const { Search } = Input;

// 默认头部菜单
const defaultHeadMenu: MenuItem[] = [
  {
    key: '/synthesis',
    label: '首页',
  },
  {
    key: '/pins',
    label: '沸点',
  },
  {
    key: '/ai',
    label: 'AI',
  },
  {
    key: '/editor/draft',
    label: '编辑器',
  },
  {
    key: '/knowledge',
    label: '知识库',
  },
];
// 创作者中心菜单
const items = [
  {
    key: '/editor/draft',
    label: '写文章',
  },
  { key: '/creator/articles', label: '我的文章 / 草稿箱' },
  { key: '/creator/favorites', label: '我的收藏' },
  {
    key: '/pins',
    label: '写沸点',
  },
];

const messageItems: MenuProps['items'] = [
  {
    key: '1',
    label: (
      <NavLink target="_blank" rel="noopener noreferrer" to="/notification">
        评论
      </NavLink>
    ),
  },
  {
    key: '2',
    label: (
      <NavLink target="_blank" rel="noopener noreferrer" to="/notification">
        赞和收藏
      </NavLink>
    ),
  },
  {
    key: '4',
    label: (
      <a
        target="_blank"
        rel="noopener noreferrer"
        href="https://www.luohanacademy.com"
      >
        私信
      </a>
    ),
  },
  {
    key: '3',
    label: (
      <a
        target="_blank"
        rel="noopener noreferrer"
        href="https://www.luohanacademy.com"
      >
        系统通知
      </a>
    ),
  },
];
export default function MyHeader(props?: MyHeaderProps) {
  const { headMenu } = props || {};
  const { requireAuth, isLoggedIn } = useAuth();

  const {
    token: { colorBgContainer },
  } = theme.useToken();
  const navigate = useNavigate();
  const location = useLocation();
  const visible = useScrollVisibility();
  const handleMenu: MenuProps['onClick'] = (e) => {
    if (e.key.startsWith('/creator/') || e.key === '/editor/draft')
      requireAuth(() => navigate(e.key));
    else navigate(e.key);
  };
  const handleLoginModal = () => {
    requireAuth(() => {
      message.success('点赞成功');
    });
  };

  return (
    <Header
      className={`myHeader ${visible ? '' : 'hide'}`}
      style={{
        background: colorBgContainer,
      }}
    >
      <Row className=" header-container max-w-[1440px] w-full">
        {/* logo */}
        <Col span={4} className="flex-center">
          <div className="logo flex-center">
            <img src="/logo.png" alt="" />
          </div>
        </Col>
        {/* 导航菜单 */}
        <Col span={20}>
          <Row>
            <Col span={12}>
              {!props?.children && (
                <Menu
                  selectedKeys={[location.pathname]}
                  onClick={handleMenu}
                  mode="horizontal"
                  items={headMenu || defaultHeadMenu}
                />
              )}
              {props?.children}
            </Col>

            {/* 右侧菜单 */}
            <Col
              span={12}
              className="flex-center"
              style={{ alignItems: 'center', display: 'flex' }}
            >
              <Space align="center" style={{ width: '100%' }} size="middle">
                <Search className="top-search" placeholder="搜索" allowClear />

                <Dropdown.Button
                  type="primary"
                  menu={{ items, onClick: handleMenu }}
                  icon={<CaretDownFilled />}
                  onClick={() =>
                    requireAuth(() => navigate('/creator/articles'))
                  }
                >
                  创作者中心
                </Dropdown.Button>

                {isLoggedIn ? (
                  <>
                    <Dropdown menu={{ items: messageItems }}>
                      <Badge count={1} size="small" onClick={handleLoginModal}>
                        <BellFilled className="header-bell" />
                      </Badge>
                    </Dropdown>

                    <UserDropdown></UserDropdown>
                  </>
                ) : (
                  <>
                    <LoginRequiredButton color="primary" variant="outlined">
                      登录/注册
                    </LoginRequiredButton>
                  </>
                )}
              </Space>
            </Col>
          </Row>
        </Col>
      </Row>
    </Header>
  );
}
