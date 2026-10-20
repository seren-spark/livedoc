import { createRoot } from 'react-dom/client';
import '@/assets/styles/index.scss';
import App from './App.tsx';
import 'virtual:uno.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import store from '@/store';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { persistor } from '@/store';
const queryClient = new QueryClient();
import { ConfigProvider } from 'antd';
import zhCN from 'antd/es/locale/zh_CN';
import { BrowserRouter } from 'react-router-dom';
import { RoutesProvider } from '@/router/context/routesContext.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root was not found');
}

createRoot(rootElement).render(
  <Provider store={store}>
    <PersistGate loading={<div>Loading...</div>} persistor={persistor}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider
          locale={zhCN}
          theme={{
            token: {
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 14,
              fontSizeSM: 12,
              fontSizeLG: 18,
              fontSizeXL: 22,
              fontSizeHeading3: 24,
              lineHeight: 1.5,
            },
          }}
        >
          <BrowserRouter>
            <RoutesProvider>
              <App />
            </RoutesProvider>
          </BrowserRouter>
        </ConfigProvider>
      </QueryClientProvider>
    </PersistGate>
  </Provider>,
);
