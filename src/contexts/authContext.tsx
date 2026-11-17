/**
 * @file 登录状态上下文。统一会话状态、登录弹窗和鉴权失效后的处理。
 */
// src/context/AuthContext.tsx
import type { RootState } from '@/store';
import { clearToken } from '@/store/modules/testSlice';
import { setUserLogout, type UserState } from '@/store/modules/userSlice';
import { logoutDemoUser } from '@/api/rag';
import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

/**
 * 检查本地是否保存了可用于请求的会话令牌。
 *
 * @returns 条件是否满足的判断结果。
 */
function hasToken(): boolean {
  return Boolean(sessionStorage.getItem('token'));
}

interface AuthContextType {
  isLoginModalVisible: boolean;
  isLoggedIn: boolean;
  showLoginModal: () => void;
  hideLoginModal: () => void;
  login: () => void;
  logout: () => void;
  requireAuth: (callback: () => void) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 呈现登录状态上下文，并连接对应状态与用户操作。
 *
 * @param props 组件接收的属性。
 * @returns 供页面渲染的组件内容。
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // 从 Redux 获取用户状态
  const user = useSelector((state: RootState) => state.user as UserState);
  const dispatch = useDispatch();
  // const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  //   弹窗是否可见
  const [isLoginModalVisible, setIsLoginModalVisible] =
    useState<boolean>(false);
  const [authCallback, setAuthCallback] = useState<(() => void) | null>(null);

  useEffect(() => {
    /**
     * 接收鉴权失效通知，清理登录状态并展示登录入口。
     */
    const handleUnauthorized = () => {
      sessionStorage.removeItem('token');
      dispatch(setUserLogout());
      dispatch(clearToken());
      setIsLoginModalVisible(true);
    };
    window.addEventListener('livedoc:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('livedoc:unauthorized', handleUnauthorized);
  }, [dispatch]);

  /**
   * 打开全局登录弹窗。
   */
  const showLoginModal = () => {
    // 登录弹窗显示
    setIsLoginModalVisible(true);
  };

  /**
   * 关闭全局登录弹窗。
   */
  const hideLoginModal = () => {
    setIsLoginModalVisible(false);
    setAuthCallback(null);
  };

  //   登录操作
  /**
   * 校验登录输入并创建用户会话。
   */
  const login = () => {
    // setIsLoggedIn(true);
    setIsLoginModalVisible(false);

    // 执行之前需要登录的操作
    if (authCallback) {
      authCallback();
      setAuthCallback(null);
    }
  };

  /**
   * 撤销当前请求使用的登录会话。
   */
  const logout = () => {
    // setIsLoggedIn(false);
    // 更新 Redux 状态
    void logoutDemoUser().catch(() => undefined);
    sessionStorage.removeItem('token');
    dispatch(setUserLogout());
    dispatch(clearToken());
  };

  const isLoggedIn = user.isLogin && hasToken();

  // 需要登录验证的操作包装函数
  /**
   * 需要登录验证的操作包装函数
   *
   * @param callback 条件满足后执行的回调。
   */
  const requireAuth = (callback: () => void) => {
    if (isLoggedIn) {
      callback();
    } else {
      setAuthCallback(() => callback);
      showLoginModal();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoginModalVisible,
        isLoggedIn,
        showLoginModal,
        hideLoginModal,
        login,
        logout,
        requireAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/**
 * 读取共享登录状态与登录弹窗操作。
 *
 * @returns AuthContextType 类型的处理结果。
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
