/**
 * @file 封禁确认弹窗。组织封禁确认弹窗的界面与交互。
 */
import type React from 'react';
import { Modal, Button, Space, DatePicker, type DatePickerProps } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

import './index.scss';
import type { RangePickerProps } from 'antd/es/date-picker';

interface ArticleReviewModalProps {
  visible: boolean;
  onClose: () => void;
}

dayjs.extend(customParseFormat);

/**
 * 记录用户确认的解封时间，供当前弹窗处理。
 *
 * @param value 待校验或转换的值。
 */
const onOk = (value: DatePickerProps['value'] | RangePickerProps['value']) => {
  console.log('onOk: ', value);
};

/**
 * 呈现封禁确认弹窗，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
const LivingPopup: React.FC<ArticleReviewModalProps> = ({
  visible,
  onClose,
}) => {
  // 禁用今天之前的日期
  /**
   * 禁用今天之前的日期
   *
   * @param current 当前记录、节点或选中值。
   * @returns 条件是否满足的判断结果。
   */
  const disabledDate = (current: Dayjs) => {
    // 今天之前的日期全部禁用
    return current && current < dayjs().startOf('day');
  };

  // 禁用今天已过去的时间（仅在选中今天时生效）
  /**
   * 禁用今天已过去的时间（仅在选中今天时生效）
   *
   * @param current 当前记录、节点或选中值。
   * @returns 供后续操作使用的回调或清理函数；未找到或不可用时可能为空。
   */
  const disabledTime = (current: Dayjs | null) => {
    if (!current || !current.isSame(dayjs(), 'day')) {
      return {};
    }

    // 当前时间的小时、分钟、秒
    const now = dayjs();
    return {
      disabledHours: () => range(0, now.hour()),
      disabledMinutes: (selectedHour: number) => {
        if (selectedHour === now.hour()) {
          return range(0, now.minute());
        }
        return [];
      },
      disabledSeconds: (selectedHour: number, selectedMinute: number) => {
        if (selectedHour === now.hour() && selectedMinute === now.minute()) {
          return range(0, now.second());
        }
        return [];
      },
    };
  };

  // 生成范围数组的辅助函数
  /**
   * 生成从起始值到结束值之前的整数列表，供禁用已过去的时间选项使用。
   *
   * @param start 区间起始位置。
   * @param end 区间结束位置。
   * @returns 整理后的结果列表。
   */
  const range = (start: number, end: number) => {
    const result = [];
    for (let i = start; i < end; i++) {
      result.push(i);
    }
    return result;
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-3">
          <EditOutlined className="text-blue-500" />
          <span>修改解封时间</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={500}
      footer={null}
      className="article-review-modal"
    >
      <div className="max-h-[80vh] overflow-y-auto">
        <p className="text-lg font-bold">请选择解除封禁时间：</p>
        <div className="mt-10">
          <DatePicker
            showTime
            disabledDate={disabledDate}
            disabledTime={disabledTime}
            onChange={(value, dateString) => {
              console.log('Selected Time: ', value);
              console.log('Formatted Selected Time: ', dateString);
            }}
            onOk={onOk}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Space>
          <Button
            type="primary"
            className="bg-blue-500 hover:bg-blue-600"
            onClick={() => {
              console.log('提交审核');
            }}
          >
            确定
          </Button>
          <Button
            onClick={() => {
              onClose();
            }}
          >
            取消
          </Button>
        </Space>
      </div>
    </Modal>
  );
};

export default LivingPopup;
