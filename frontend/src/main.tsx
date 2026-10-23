import { ErrorBoundary } from './components/ui/ErrorBoundary';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './app/App.tsx';
import { LanguageProvider } from './i18n/LanguageContext';
import './index.css';
import { clearLegacyFinancialCache } from './services/privateCache';
import { startUpdateWatch } from './app/appUpdate';

// Remove old financial browser caches before authentication finishes.
clearLegacyFinancialCache();

// New builds open without an error page or a new sign-in (app/appUpdate.ts). Production only.
if ((import.meta as any).env?.PROD) startUpdateWatch();

// Register PWA service worker
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('PWA ServiceWorker registered successfully:', reg.scope);
      })
      .catch((err) => {
        console.log('PWA ServiceWorker registration failed:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><LanguageProvider>
      <App />
    </LanguageProvider></ErrorBoundary>
  </StrictMode>,
);
