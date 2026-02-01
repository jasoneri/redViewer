import { useEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Loader2, ChevronsLeft } from 'lucide-react';
import { cn } from './lib/utils';

declare global {
  interface Window {
    __TRANSLATIONS__?: Record<string, string>;
  }
}

function App() {
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragInitiated = useRef(false);

  const resetDragState = useCallback(() => {
    dragStartPos.current = null;
    isDragInitiated.current = false;
  }, []);

  useEffect(() => {
    const unlistenShow = listen('main-window-show', () => {
      setClosing(false);
      setError(null);
      resetDragState();
    });

    return () => {
      unlistenShow.then(fn => fn());
    };
  }, [resetDragState]);

  const handleOpenBrowser = async () => {
    setError(null);
    setLoading(true);
    try {
      await invoke('main_window_open_browser');
      await invoke('main_window_close');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleHideToTray = async () => {
    setClosing(true);
    try {
      await invoke('main_window_close');
    } catch (e) {
      console.error('Failed to hide window:', e);
      setClosing(false);
    }
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea')) return;

    dragStartPos.current = { x: e.clientX, y: e.clientY };
    isDragInitiated.current = false;
  }, []);

  const handlePointerMove = useCallback(async (e: React.PointerEvent) => {
    if (!dragStartPos.current || isDragInitiated.current) return;

    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;

    if (Math.hypot(dx, dy) > 4) {
      isDragInitiated.current = true;
      try {
        await getCurrentWindow().startDragging();
      } finally {
        resetDragState();
      }
    }
  }, [resetDragState]);

  const handlePointerUp = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  const handlePointerCancel = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className={cn('main-window-container', closing && 'closing')}
    >
      <button
        className="main-action-btn"
        onClick={handleOpenBrowser}
        disabled={loading || closing}
      >
        {loading ? (
          <Loader2 size={48} className="animate-spin text-white" />
        ) : (
          <img src="./assets/rV.png" alt="rV" />
        )}
      </button>
      <ChevronsLeft
        size={60}
        strokeWidth={2.25}
        color="red"
        className="hint-arrow animate-bounce-left"
        aria-hidden="true"
      />

      {error && (
        <div className="error-message absolute bottom-14 max-w-[360px]">
          {error}
        </div>
      )}

      <button
        className="close-to-tray-btn"
        onClick={handleHideToTray}
        disabled={closing}
      >
        <svg className="animate-pulse-slow" xmlns="http://www.w3.org/2000/svg" width="48" height="50" viewBox="0 0 14 14" aria-hidden="true">
          <path fill="#f04867" fillRule="evenodd" d="M10.974.595a.75.75 0 0 0-.666-.405H7.825a.75.75 0 0 0 0 1.5h1.033l-1.8 2.54a.75.75 0 0 0 .612 1.184h2.793a.75.75 0 0 0 0-1.5H9.12l1.8-2.54a.75.75 0 0 0 .054-.779M5.906 4.058a.75.75 0 0 0-.667-.405H2.588a.75.75 0 1 0 0 1.5h1.201L1.81 7.947a.75.75 0 0 0 .613 1.183h2.983a.75.75 0 1 0 0-1.5H3.872l1.98-2.794a.75.75 0 0 0 .054-.778m6.108 2.904a.75.75 0 0 1 .612 1.184l-3 4.235h2.614a.75.75 0 0 1 0 1.5H8.176a.75.75 0 0 1-.612-1.184l3-4.235H8.402a.75.75 0 1 1 0-1.5z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

export default App;
