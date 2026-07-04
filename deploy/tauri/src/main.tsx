import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getTranslations } from './lib/i18n'

// Load translations from source files
(window as any).__TRANSLATIONS__ = getTranslations();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
