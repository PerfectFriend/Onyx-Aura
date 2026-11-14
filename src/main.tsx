import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      if (import.meta.env.DEV) {
        registration.unregister().catch(() => {});
      } else {
        registration.update().catch(() => {});
      }
    }
  }).catch(() => {
    // Ignore SW check errors
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary level="root">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

