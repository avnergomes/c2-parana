// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { initSentry } from '@/lib/sentry'
import './styles/index.css'
import './styles/leaflet-overrides.css'
import 'leaflet/dist/leaflet.css'
import '@/lib/leaflet-fix'

// Inicializar Sentry (so se DSN estiver configurado e pacote instalado)
initSentry().catch(() => {})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

// basename para GitHub Pages (em dev é vazio, em prod é /c2-parana)
const basename = import.meta.env.PROD ? '/c2-parana' : ''

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
