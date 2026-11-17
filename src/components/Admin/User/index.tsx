/**
 * @file 用户管理。组织用户管理的界面与交互。
 */
// 用户管理板块

import { Button, Card, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
const { Title } = Typography;
import './index.scss'; // 引入样式文件
import { Outlet } from 'react-router-dom';
import { Suspense, useState } from 'react';
import AddUser from '../AddUser';

interface AddUserFormData {
  userName: string;
  phoneNumber: string;
  emailId: string;
  address: string;
  creditLimit: number;
  lineBalance: number;
  joinDate: any;
}

/**
 * 呈现用户管理，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
function ContentHead() {
  const [modalVisible, setModalVisible] = useState(false);

  /**
   * 校验表单数据后提交当前操作。
   *
   * @param values 待转换或去重的值集合。
   */
  const handleSubmit = (values: AddUserFormData) => {
    console.log('提交的表单数据:', values);
    setModalVisible(false);
  };
  return (
    <Card>
      <div className="content-header">
        <Title className="content-title" level={4}>
          工作列表
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalVisible(true)}
        >
          添加新用户
        </Button>
        <AddUser
          visible={modalVisible}
          onCancel={() => setModalVisible(false)}
          onSubmit={handleSubmit}
          title="添加客户"
        />
      </div>

      {/* 数据表格 */}
      <Suspense fallback={<div>Loading...</div>}>
        <Outlet />
      </Suspense>
    </Card>
  );
}

export default ContentHead;
