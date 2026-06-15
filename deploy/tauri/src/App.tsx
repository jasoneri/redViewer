import { useEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Loader2, ChevronsLeft, AlertTriangle, KeyRound } from 'lucide-react';
import { cn } from './lib/utils';
import SettingsView from './settings';
import { useDynamicFonts } from './hooks/useDynamicFonts';
import type {
  DesktopAdminState,
  DesktopLocksState,
  DesktopLocksUpdate,
  LockKey,
  SecretSavePhase,
} from './settings';
import packageJson from '../package.json';

declare global {
  interface Window {
    __TRANSLATIONS__?: Record<string, string>;
  }
}

type BackendStatus = 'STARTING' | 'RUNNING' | 'ERROR';
type DesktopView = 'main' | 'settings';

type DesktopAdminSecretResponse = {
  success: boolean;
  has_secret: boolean;
};

const LOCK_KEYS: LockKey[] = ['config_path', 'book_handle', 'switch_doujin', 'force_rescan'];
const DESKTOP_FONT_FILES = [
  'Inter-Regular.woff2',
  'Inter-SemiBold.woff2',
  'ZCOOLKuaiLe-Regular.ttf',
  'Roboto-Bold.ttf',
] as const;

function App() {
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lanUrl, setLanUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<BackendStatus>('STARTING');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [view, setView] = useState<DesktopView>('main');
  const [settingsState, setSettingsState] = useState<DesktopAdminState | null>(null);
  const [settingsBusy, setSettingsBusy] = useState<string | null>(null);
  const [, setSettingsError] = useState<string | null>(null);
  const [secretSavePhase, setSecretSavePhase] = useState<SecretSavePhase>('idle');

  // Load fonts from AppData.
  const { allLoaded: fontsLoaded } = useDynamicFonts(DESKTOP_FONT_FILES);

  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragInitiated = useRef(false);

  const resetDragState = useCallback(() => {
    dragStartPos.current = null;
    isDragInitiated.current = false;
  }, []);

  const loadDesktopAdminState = useCallback(async () => {
    setSettingsBusy('load');
    setSettingsError(null);
    try {
      const nextState = await invoke<DesktopAdminState>('desktop_admin_get_state');
      setSettingsState(nextState);
    } catch (e) {
      setSettingsError(String(e));
    } finally {
      setSettingsBusy(null);
    }
  }, []);

  const openSettingsView = useCallback(() => {
    setView('settings');
    setError(null);
    setSecretSavePhase('idle');
    void loadDesktopAdminState();
  }, [loadDesktopAdminState]);

  const returnToMainView = useCallback(() => {
    setView('main');
    setSettingsError(null);
    setSecretSavePhase('idle');
  }, []);

  // Listen for backend-ready event
  useEffect(() => {
    // On mount, check if backend is already ready (handles page refresh)
    invoke<{ status: BackendStatus; error?: string }>('get_backend_status')
      .then((res) => {
        setStatus(res.status);
        if (res.status === 'ERROR') {
          setErrorMessage(res.error || '后端未就绪');
        } else if (res.status === 'RUNNING') {
          setErrorMessage(null);
          invoke<string | null>('get_lan_url')
            .then(setLanUrl)
            .catch(console.error);
        }
      })
      .catch(console.error);

    // Also listen for the event (handles initial startup)
    const unlistenPromise = listen<{ status: BackendStatus; error?: string }>('backend-ready', (event) => {
      setStatus(event.payload.status);
      if (event.payload.status === 'RUNNING') {
        setErrorMessage(null);
        invoke<string | null>('get_lan_url')
          .then(setLanUrl)
          .catch(console.error);
      } else if (event.payload.status === 'ERROR') {
        setErrorMessage(event.payload.error || 'Backend startup failed');
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const unlistenShow = listen('main-window-show', () => {
      setClosing(false);
      setError(null);
      setView('main');
      resetDragState();
    });

    return () => {
      unlistenShow.then(fn => fn());
    };
  }, [resetDragState]);

  useEffect(() => {
    const unlistenSecret = listen('desktop-secret-update-requested', () => {
      setClosing(false);
      resetDragState();
      openSettingsView();
    });

    return () => {
      unlistenSecret.then(fn => fn());
    };
  }, [openSettingsView, resetDragState]);

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

  const handleSaveSecret = useCallback(async (secret: string) => {
    const nextSecret = secret.trim();
    setSecretSavePhase('idle');
    setSettingsError(null);
    if (!nextSecret) {
      setSettingsError('密钥不能为空');
      return false;
    }

    setSecretSavePhase('loading');
    setSettingsBusy('secret');
    try {
      const response = await invoke<DesktopAdminSecretResponse>('desktop_admin_update_secret', {
        secret: nextSecret,
      });
      setSettingsState((prev) => ({
        has_secret: response.has_secret,
        locks: prev?.locks ?? {
          config_path: false,
          book_handle: false,
          switch_doujin: false,
          force_rescan: false,
        },
      }));
      setSecretSavePhase('success');
      return true;
    } catch (e) {
      setSettingsError(String(e));
      setSecretSavePhase('idle');
      return false;
    } finally {
      setSettingsBusy(null);
    }
  }, []);

  const handleSecretEdit = useCallback(() => {
    if (secretSavePhase !== 'idle') {
      setSecretSavePhase('idle');
    }
  }, [secretSavePhase]);

  const applyLockUpdates = useCallback(async (updates: DesktopLocksUpdate) => {
    setSettingsError(null);
    setSettingsBusy('locks');
    try {
      const locks = await invoke<DesktopLocksState>('desktop_admin_update_locks', { updates });
      setSettingsState((prev) => ({
        has_secret: prev?.has_secret ?? false,
        locks,
      }));
    } catch (e) {
      setSettingsError(String(e));
    } finally {
      setSettingsBusy(null);
    }
  }, []);

  const handleToggleLock = useCallback(async (key: LockKey, value: boolean) => {
    await applyLockUpdates({ [key]: value });
  }, [applyLockUpdates]);

  const handleToggleReadOnly = useCallback(async (value: boolean) => {
    const updates = LOCK_KEYS.reduce<DesktopLocksUpdate>((acc, key) => {
      acc[key] = value;
      return acc;
    }, {});
    await applyLockUpdates(updates);
  }, [applyLockUpdates]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, label')) return;

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

  // Log font loading status for debugging
  useEffect(() => {
    if (fontsLoaded) {
      console.log('✅ All fonts loaded from AppData');
    }
  }, [fontsLoaded]);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className={cn('main-window-container', closing && 'closing')}
    >
      {status === 'STARTING' ? (
        <Loader2 size={48} className="animate-spin text-white" role="status" aria-label="正在启动后端服务" />
      ) : status === 'ERROR' ? (
        <div className="text-center text-red-400 px-4" role="alert">
          <AlertTriangle size={24} className="mx-auto mb-2" />
          <div className="text-sm mb-2">启动失败</div>
          <div className="text-xs opacity-70">{errorMessage}</div>
        </div>
      ) : (
        view === 'settings' ? (
          <SettingsView
            state={settingsState}
            busy={settingsBusy}
            secretSavePhase={secretSavePhase}
            onBack={returnToMainView}
            onSecretEdit={handleSecretEdit}
            onSaveSecret={handleSaveSecret}
            onToggleLock={handleToggleLock}
            onToggleReadOnly={handleToggleReadOnly}
          />
        ) : (
          <>
            {lanUrl && <div className="show-lan">{lanUrl}</div>}

            <div className="secret-btn-group" aria-label="Secret 快捷操作">
              <button
                type="button"
                className="transparentButton-icon-only"
                onClick={openSettingsView}
                disabled={closing}
                aria-label="更新 secret 与锁控制"
              >
                <KeyRound 
                  size={22} 
                  aria-hidden="true" 
                  style={{ 
                    fill: 'white', 
                    stroke: 'red', 
                    strokeWidth: '1px' 
                  }} 
                />
              </button>
            </div>

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
          </>
        )
      )}

      {error && (
        <div className="error-message absolute bottom-14 max-w-[360px]">
          {error}
        </div>
      )}

      {view === 'main' && (
        <>
          <button
            className="close-to-tray-btn"
            onClick={handleHideToTray}
            disabled={closing}
          >
            <svg className="animate-pulse-slow" xmlns="http://www.w3.org/2000/svg" width="48" height="50" viewBox="0 0 14 14" aria-hidden="true">
              <path fill="#f04867" fillRule="evenodd" d="M10.974.595a.75.75 0 0 0-.666-.405H7.825a.75.75 0 0 0 0 1.5h1.033l-1.8 2.54a.75.75 0 0 0 .612 1.184h2.793a.75.75 0 0 0 0-1.5H9.12l1.8-2.54a.75.75 0 0 0 .054-.779M5.906 4.058a.75.75 0 0 0-.667-.405H2.588a.75.75 0 1 0 0 1.5h1.201L1.81 7.947a.75.75 0 0 0 .613 1.183h2.983a.75.75 0 1 0 0-1.5H3.872l1.98-2.794a.75.75 0 0 0 .054-.778m6.108 2.904a.75.75 0 0 1 .612 1.184l-3 4.235h2.614a.75.75 0 0 1 0 1.5H8.176a.75.75 0 0 1-.612-1.184l3-4.235H8.402a.75.75 0 1 1 0-1.5z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="fixed bottom-2 left-2 text-xs text-white/40 select-none pointer-events-none">
            v{packageJson.version}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
