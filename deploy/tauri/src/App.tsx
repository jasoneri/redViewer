import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DragRegion } from './components/DragRegion';
import { ActionButton } from './components/ActionButton';

type GuideMode = 'AUTO_CLOSE' | 'PERSISTENT' | 'CLOSING';

declare global {
  interface Window {
    __TRANSLATIONS__?: Record<string, string>;
  }
}

function t(key: string): string {
  return window.__TRANSLATIONS__?.[key] ?? key;
}

function App() {
  const [mode, setMode] = useState<GuideMode>('AUTO_CLOSE');
  const [isDark, setIsDark] = useState(false);
  const hasCancelledRef = useRef(false);

  // Theme detection
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Apply dark class to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // User activity detection - cancel auto close on first interaction
  const handleUserActivity = useCallback(async () => {
    if (mode !== 'AUTO_CLOSE' || hasCancelledRef.current) return;
    hasCancelledRef.current = true;

    try {
      await invoke('guide_cancel_auto_close');
      setMode('PERSISTENT');
    } catch (e) {
      console.error('Failed to cancel auto close:', e);
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'AUTO_CLOSE') return;

    const events = ['mousedown', 'keydown'] as const;
    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, { once: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserActivity);
      });
    };
  }, [mode, handleUserActivity]);

  // Listen for close signal from Rust (timeout or explicit close)
  useEffect(() => {
    const handleClose = () => {
      setMode('CLOSING');
      setTimeout(() => {
        invoke('guide_close').catch(console.error);
      }, 200);
    };

    // Rust will emit a custom event when auto-close timer fires
    window.addEventListener('guide-close', handleClose);
    return () => window.removeEventListener('guide-close', handleClose);
  }, []);

  const isClosing = mode === 'CLOSING';

  return (
    <div className={isDark ? 'dark' : ''}>
      <div
        className={`
          w-[400px] h-[240px] glass-card
          flex flex-col overflow-hidden
          transition-all duration-200
          ${isClosing ? 'closing' : ''}
        `}
      >
        <DragRegion>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            redViewer
          </span>
        </DragRegion>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <p className="text-center text-gray-700 dark:text-gray-200 text-base leading-relaxed">
            {t('welcome_message')}
          </p>

          <ActionButton label={t('open_browser')} />
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}

export default App;
