/**
 * @file 新增用户表单。组织新增用户表单的界面与交互。
 */
import type React from 'react';
import { useState } from 'react';
import { Modal, Form, Input, DatePicker, Button, message } from 'antd';

interface AddUserFormData {
  userName: string;
  phoneNumber: string;
  emailId: string;
  address: string;
  creditLimit: number;
  lineBalance: number;
  joinDate: any;
}

interface AddUserModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (values: AddUserFormData) => void;
  title?: string;
  initialValues?: Partial<AddUserFormData>;
}

/**
 * 呈现新增用户表单，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
const AddUser: React.FC<AddUserModalProps> = ({
  visible,
  onCancel,
  onSubmit,
  title = '添加客户',
  initialValues,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  /**
   * 校验表单数据后提交当前操作。
   */
  const handleSubmit = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();

      // 格式化日期
      const formattedValues = {
        ...values,
        joinDate: values.joinDate
          ? values.joinDate.format('YYYY-MM-DD')
          : undefined,
      };

      await onSubmit(formattedValues);
      form.resetFields();
      message.success('客户信息保存成功！');
    } catch (error) {
      console.error('表单验证失败:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 关闭当前弹窗并清理临时输入状态。
   */
  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={handleCancel}
      width={600}
      footer={null}
      destroyOnHidden
      maskClosable={false}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        className="mt-20"
      >
        {/* 表单项内容保持不变 */}
        <Form.Item
          label="用户名"
          name="userName"
          rules={[
            { required: true, message: '请输入用户名' },
            { min: 2, message: '用户名至少2个字符' },
          ]}
        >
          <Input placeholder="请输入用户名" size="large" />
        </Form.Item>

        <Form.Item
          label="电话号码"
          name="phoneNumber"
          rules={[
            { required: true, message: '请输入电话号码' },
            { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码' },
          ]}
        >
          <Input placeholder="请输入电话号码" size="large" />
        </Form.Item>

        <Form.Item
          label="电子邮件 ID"
          name="emailId"
          rules={[
            { required: true, message: '请输入电子邮件' },
            { type: 'email', message: '请输入正确的邮箱格式' },
          ]}
        >
          <Input placeholder="请输入电子邮件 ID" size="large" />
        </Form.Item>

        <Form.Item
          label="地址"
          name="address"
          rules={[{ required: true, message: '请输入地址' }]}
        >
          <Input.TextArea placeholder="请输入地址" rows={3} size="large" />
        </Form.Item>

        {/* <Form.Item
          label="额定值"
          name="creditLimit"
          rules={[
            { required: true, message: '请输入额定值' },
            { type: 'number', min: 0, message: '额定值不能为负数' },
          ]}
        >
          <InputNumber
            placeholder="请输入额定值"
            style={{ width: '100%' }}
            size="large"
            min={0}
            precision={2}
            formatter={(value) =>
              `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
            }
            parser={(value) => value!.replace(/¥\s?|(,*)/g, '')}
          />
        </Form.Item> */}

        {/* <Form.Item
          label="线包余额"
          name="lineBalance"
          rules={[
            { required: true, message: '请输入线包余额' },
            { type: 'number', min: 0, message: '线包余额不能为负数' },
          ]}
        >
          <InputNumber
            placeholder="请输入线包余额"
            style={{ width: '100%' }}
            size="large"
            min={0}
            precision={2}
            formatter={(value) =>
              `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
            }
            parser={(value) => value!.replace(/¥\s?|(,*)/g, '')}
          />
        </Form.Item> */}

        <Form.Item
          label="加入日期"
          name="joinDate"
          rules={[{ required: true, message: '请选择加入日期' }]}
        >
          <DatePicker
            placeholder="选择时间"
            style={{ width: '100%' }}
            size="large"
            format="YYYY-MM-DD"
          />
        </Form.Item>

        <Form.Item className="mt-30 mb-0">
          <div className="flex justify-end gap-12">
            <Button size="large" onClick={handleCancel}>
              取消
            </Button>
            <Button
              type="primary"
              size="large"
              loading={loading}
              onClick={handleSubmit}
              className="ml-10 bg-[#1677ff] border-[#539afd] hover:bg-[#4096ff]"
            >
              保存
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AddUser;
