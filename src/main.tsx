import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setupOfflineInterceptor, initAutoSyncListeners } from './lib/api';

// Initialize PWA Offline Interceptor & Sync Listeners
setupOfflineInterceptor();
initAutoSyncListeners();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
