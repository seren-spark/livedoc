/**
 * @file 组件调试页。组织组件调试页的界面与交互。
 */
import { Button } from 'antd';
import './index.scss';
import { useQuery } from '@tanstack/react-query';
import { login } from '@/api/test';

/**
 * 呈现组件调试页，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
export default function Test() {
  const { data, isLoading } = useQuery({
    queryKey: ['info'],
    queryFn: () => {
      return login({
        username: 'admin',
        password: 'admin123123',
      });
    },
  });
  console.log(data, isLoading);

  return (
    <>
      <Button loading={isLoading} />

      <div className="">
        <p className="t-hover">12</p>
      </div>
    </>
  );
}
