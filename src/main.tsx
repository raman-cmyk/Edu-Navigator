import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './lib/auth/AuthProvider';
import { OfflineBanner } from './components/OfflineBanner';
import { SkipLink } from './components/SkipLink';
import { replayQueuedWrites } from './lib/api/posts';
import { initAnalytics, initErrorReporting } from './lib/analytics';
import './i18n';
import './styles/globals.css';

// Privacy-respecting analytics + error reporting (no-op unless env is set).
initAnalytics();
initErrorReporting();

// Replay any writes queued while offline as soon as we're back online.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    replayQueuedWrites().catch(() => {
      /* kept in the queue for the next reconnect */
    });
  });
}

/*
 * TanStack Query for server state (caching, offline, optimistic updates).
 * staleTime tuned per docs/03: 60s on feed-like data, longer on static data.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <SkipLink />
          <OfflineBanner />
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
