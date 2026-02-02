import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getTranslations } from './lib/i18n'

// Mock Tauri API when running outside Tauri (for preview/testing)
if (!(window as any).__TAURI_INTERNALS__) {
  console.log('[Main Window Preview] Running in mock mode');

  // Load translations from source files
  (window as any).__TRANSLATIONS__ = getTranslations();

  // Mock @tauri-apps/api/core
  const mockInvoke = async (cmd: string) => {
    console.log(`[Mock] invoke('${cmd}')`);

    switch (cmd) {
      case 'main_window_open_browser':
        console.log('[Mock] Opening browser at http://localhost:8080/');
        await new Promise((r) => setTimeout(r, 500));
        return;
      case 'main_window_close':
        console.log('[Mock] Main window closed');
        return;
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  };

  // Inject mock into globalThis for @tauri-apps/api
  (window as any).__TAURI_INVOKE__ = mockInvoke;

  // Mock getCurrentWindow for drag functionality
  (window as any).__TAURI_INTERNALS__ = {
    invoke: mockInvoke,
    metadata: { currentWindow: { label: 'main' } }
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
