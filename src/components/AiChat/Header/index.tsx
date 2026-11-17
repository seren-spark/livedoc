/**
 * @file 页面顶部导航。组织页面顶部导航的界面与交互。
 */
import { Typography, Badge, Avatar, Tooltip, Dropdown, Button } from 'antd';
import { BellOutlined, HomeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

import './index.scss';

const { Title } = Typography;

interface HeaderProps {
  timePeriod: string;
  userName: string;
}

/**
 * 呈现页面顶部导航，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
function Header({ timePeriod, userName }: HeaderProps) {
  const navigate = useNavigate();

  const userMenuItems = [
    { key: '1', label: '个人设置' },
    { key: '2', label: '使用帮助' },
    { key: '3', label: '退出登录' },
  ];

  return (
    <div className="ai-header">
      <div className="header-tit">
        <Title level={4} className="title-text">
          {timePeriod}好，{userName}
        </Title>
      </div>

      <div className="header-inform">
        <Tooltip title="主页">
          <Button
            className="header-back"
            icon={<HomeOutlined />}
            onClick={() => navigate('/')}
          ></Button>{' '}
        </Tooltip>
        <Tooltip title="通知">
          <Badge count={0} size="small">
            <BellOutlined className="inform-icon" />
          </Badge>
        </Tooltip>

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <div className="user-avatar">
            <Avatar size={32} className="user-avatar-icon">
              多
            </Avatar>
          </div>
        </Dropdown>
      </div>
    </div>
  );
}

export default Header;
