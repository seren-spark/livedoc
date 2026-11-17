/**
 * @file 审核工作台。组织审核工作台的界面与交互。
 */
import { Card, Typography } from 'antd';
const { Title } = Typography;
import { Outlet } from 'react-router-dom';
import { Suspense } from 'react';
/**
 * 呈现审核工作台，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
export default function Audit() {
  return (
    <Card>
      <div className="content-header">
        <Title className="content-title" level={4}>
          工作列表
        </Title>
      </div>
      {/* 数据表格 */}
      <Suspense fallback={<div>Loading...</div>}>
        <Outlet />
      </Suspense>
    </Card>
  );
}
