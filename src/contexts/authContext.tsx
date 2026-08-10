// src/context/AuthContext.tsx
import type { RootState } from '@/store';
import { clearToken } from '@/store/modules/testSlice';
import { setUserLogout, type UserState } from '@/store/modules/userSlice';
import { logoutDemoUser } from '@/api/rag';
import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

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
    const handleUnauthorized = () => {
      sessionStorage.removeItem('token');
      dispatch(setUserLogout());
      dispatch(clearToken());
      setIsLoginModalVisible(true);
    };
    window.addEventListener('livedoc:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('livedoc:unauthorized', handleUnauthorized);
  }, [dispatch]);

  const showLoginModal = () => {
    // 登录弹窗显示
    setIsLoginModalVisible(true);
  };

  const hideLoginModal = () => {
    setIsLoginModalVisible(false);
    setAuthCallback(null);
  };

  //   登录操作
  const login = () => {
    // setIsLoggedIn(true);
    setIsLoginModalVisible(false);

    // 执行之前需要登录的操作
    if (authCallback) {
      authCallback();
      setAuthCallback(null);
    }
  };

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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
