import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './features/auth/AuthProvider.tsx'
import { isDemoMode } from './lib/demo'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Giữ cache lâu để bản lưu offline còn dữ liệu (mục AA)
      gcTime: 24 * 3600_000,
    },
  },
})

// Chế độ Supabase: lưu cache TanStack Query vào localStorage → mở app offline vẫn
// xem được dữ liệu đã tải (mục AA). Demo mode dữ liệu đã nằm sẵn ở localStorage nên
// không cần persist (tránh nhân đôi + lệch).
function Providers({ children }: { children: ReactNode }) {
  if (isDemoMode) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: 'sct-query-cache',
  })
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 3600_000 }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </Providers>
  </StrictMode>,
)
