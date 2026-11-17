/**
 * @file 前端根组件。挂载鉴权上下文、全局登录弹窗与路由页面。
 */
import { Suspense } from 'react';
import './App.scss';

// import useRouter from '@/router/index';
// import routes from '~react-pages';
// function App() {
//   return (
//     <div className="App">
//         {/* <Test />
//       <Button>123</Button> */}
//       <Suspense fallback={<div>Loading...</div>}>
//         <RouterProvider router={router}></RouterProvider>
//       </Suspense>
//     </div>
//   );
// }
import { useRoutes } from 'react-router-dom';
// import { staticRouter } from './router';
import { useAppRouter } from './router';
import { useAuth } from '@/contexts/authContext';
import { AuthProvider } from '@/contexts/authContext';
import LoginRegisterModal from '@/components/LoginForm';

// function App() {
//   const routes = useAppRouter();
//   console.log(routes);
//   const { isLoginModalVisible, hideLoginModal, login } = useAuth();
//   return (
//     <div className="App">
//       {/* <Test />
//       <Button>123</Button> */}
//       <AuthProvider>
//         <LoginRegisterModal
//           open={isLoginModalVisible}
//           onCancel={hideLoginModal}
//           onLogin={login}
//         />
//         <Suspense fallback={<div>Loading...</div>}>
//           {useRoutes(routes)}
//         </Suspense>
//       </AuthProvider>
//     </div>
//   );
// }
/**
 * 读取登录上下文，统一展示登录弹窗与当前路由页面。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
function AppContent({ routes }: { routes: ReturnType<typeof useAppRouter> }) {
  const { isLoginModalVisible, hideLoginModal, login } = useAuth();

  return (
    <>
      <LoginRegisterModal
        open={isLoginModalVisible}
        onCancel={hideLoginModal}
        onLogin={login}
      />
      <Suspense fallback={<div>Loading...</div>}>{useRoutes(routes)}</Suspense>
    </>
  );
}
/**
 * 装配应用级 Provider 和根界面，启动页面渲染。
 *
 * @returns 供页面渲染的组件内容。
 */
function App() {
  const routes = useAppRouter();

  return (
    <div className="App">
      <AuthProvider>
        <AppContent routes={routes} />
      </AuthProvider>
    </div>
  );
}
export default App;
