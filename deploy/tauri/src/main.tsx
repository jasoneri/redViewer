import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Mock Tauri API when running outside Tauri (for preview/testing)
if (!(window as any).__TAURI_INTERNALS__) {
  console.log('[Guide Preview] Running in mock mode');

  // Mock translations
  (window as any).__TRANSLATIONS__ = {
    welcome_message: '欢迎使用 redViewer！点击下方按钮在浏览器中打开。',
    open_browser: '打开浏览器',
  };

  // Mock @tauri-apps/api/core
  const mockInvoke = async (cmd: string) => {
    console.log(`[Mock] invoke('${cmd}')`);

    switch (cmd) {
      case 'guide_cancel_auto_close':
        console.log('[Mock] Auto-close cancelled, now in PERSISTENT mode');
        return;
      case 'guide_open_browser':
        console.log('[Mock] Opening browser at http://localhost:8080/');
        // Simulate success with delay
        await new Promise((r) => setTimeout(r, 500));
        // Trigger close event
        window.dispatchEvent(new CustomEvent('guide-close'));
        return;
      case 'guide_close':
        console.log('[Mock] Guide window closed');
        return;
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  };

  // Inject mock into globalThis for @tauri-apps/api
  (window as any).__TAURI_INVOKE__ = mockInvoke;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
