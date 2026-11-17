/**
 * @file 文章。连接路由与对应业务组件，呈现文章的界面与交互。
 */
import FrontLayout from '@/layouts/frontLayout';
import MyContent from '@/layouts/frontLayout/MyContent';
import MainContainer from '@/layouts/frontLayout/MainContainer';
import MiddleContent from '@/layouts/frontLayout/MiddleContent/index';
import RightSide from '@/layouts/frontLayout/RightSide';
import { Outlet } from 'react-router-dom';

/**
 * 呈现文章，并连接对应状态与用户操作。
 *
 * @returns 供页面渲染的组件内容。
 */
export default function Post() {
  return (
    <>
      <FrontLayout>
        <MainContainer siderVisible={false}>
          <MyContent className="post-layout" style={{ maxWidth: '1400px' }}>
            <Outlet></Outlet>
          </MyContent>
        </MainContainer>
      </FrontLayout>
    </>
  );
}
