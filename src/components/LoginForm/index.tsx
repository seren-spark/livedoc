import { useState } from 'react';
import { Button, Form, Input, Modal, Select, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { loginDemoUser } from '@/api/rag';
import { setToken } from '@/store/modules/testSlice';
import { setUserLogin } from '@/store/modules/userSlice';
import './index.scss';

interface LoginRegisterModalProps {
  open?: boolean;
  onCancel?: () => void;
  onLogin?: () => void;
}

type LoginValues = {
  email: string;
  password: string;
};

const demoAccounts = [
  { label: 'Alice · Alpha 团队', value: 'alice@livedoc.local' },
  { label: 'Bob · Alpha 团队', value: 'bob@livedoc.local' },
  { label: 'Carol · Beta 团队', value: 'carol@livedoc.local' },
];

export default function LoginRegisterModal({
  open = false,
  onCancel,
  onLogin,
}: LoginRegisterModalProps) {
  const dispatch = useDispatch();
  const [form] = Form.useForm<LoginValues>();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const result = await loginDemoUser(values.email, values.password);
      dispatch(setToken(result.token));
      dispatch(setUserLogin({ username: result.user.username }));
      message.success(`已切换为 ${result.user.username}`);
      onLogin?.();
    } catch (error: any) {
      if (!error?.errorFields) {
        message.error(
          error?.response?.data?.detail || '登录失败，请检查演示账号',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      className="login-modal"
      title="登录 LiveDoc"
      open={open}
      onCancel={onCancel}
      footer={null}
      centered
      width={420}
      destroyOnHidden={false}
    >
      <Form<LoginValues>
        form={form}
        layout="vertical"
        initialValues={{
          email: demoAccounts[0].value,
          password: 'Demo@123456',
        }}
        onFinish={handleLogin}
      >
        <Form.Item
          label="演示身份"
          name="email"
          rules={[{ required: true, message: '请选择演示身份' }]}
        >
          <Select
            options={demoAccounts}
            prefix={<UserOutlined />}
            onChange={() => form.setFieldValue('password', 'Demo@123456')}
          />
        </Form.Item>
        <Form.Item
          label="密码"
          name="password"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            autoComplete="current-password"
          />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          block
          size="large"
        >
          登录
        </Button>
      </Form>
    </Modal>
  );
}
