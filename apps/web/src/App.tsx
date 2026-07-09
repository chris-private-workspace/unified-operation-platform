import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './router';
import { useUiStore } from './store/ui';

// Server state (later phases) = TanStack Query; provider set up now.
const queryClient = new QueryClient();

export function App() {
  const theme = useUiStore((s) => s.theme);

  // Mirror theme onto <html class="dark"> so the token :root/.dark swap applies.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
