import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './splash.css'

type SplashState = 'checking' | 'selecting_region' | 'downloading' | 'extracting' | 'complete' | 'error'

interface StatePayload {
  state: SplashState
  message?: string
}

interface ProgressPayload {
  current: number
  total: number | null
  percent: number
  mirror: string
}

function Splash() {
  const [state, setState] = useState<SplashState>('checking')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressPayload | null>(null)

  useEffect(() => {
    const unlistenState = listen<StatePayload>('splash:state', (event) => {
      setState(event.payload.state)
      if (event.payload.state === 'error') {
        setError(event.payload.message || 'Unknown error')
      } else {
        setError(null)
      }
    })

    const unlistenProgress = listen<ProgressPayload>('splash:progress', (event) => {
      setProgress(event.payload)
    })

    return () => {
      unlistenState.then(f => f())
      unlistenProgress.then(f => f())
    }
  }, [])

  const handleRegionSelect = async (region: 'cn' | 'global') => {
    try {
      await invoke('select_region', { region })
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }

  const handleRetry = async () => {
    try {
      setError(null)
      await invoke('retry_download')
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div
      className="splash-container"
      data-tauri-drag-region
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        getCurrentWindow().startDragging()
      }}
    >
      <div className="splash-content">
        <h1 className="splash-title">redViewer Setup</h1>

        {state === 'checking' && (
          <div className="splash-status">
            <div className="spinner" />
            <p>Checking environment...</p>
          </div>
        )}

        {state === 'selecting_region' && (
          <div className="region-selector">
            <p className="region-prompt">Select your region for optimal download speed:</p>
            <div className="region-buttons">
              <button
                className="region-btn region-cn"
                onClick={() => handleRegionSelect('cn')}
              >
                <span className="region-flag">CN</span>
                <span className="region-name">China</span>
                <span className="region-desc">Domestic mirrors</span>
              </button>
              <button
                className="region-btn region-global"
                onClick={() => handleRegionSelect('global')}
              >
                <span className="region-flag">Global</span>
                <span className="region-name">International</span>
                <span className="region-desc">GitHub releases</span>
              </button>
            </div>
          </div>
        )}

        {state === 'downloading' && (
          <div className="download-status">
            <p className="download-title">Downloading uv runtime...</p>
            {progress && (
              <>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="progress-info">
                  <span>{formatBytes(progress.current)}</span>
                  {progress.total && <span> / {formatBytes(progress.total)}</span>}
                  <span className="mirror-name"> ({progress.mirror})</span>
                </div>
              </>
            )}
          </div>
        )}

        {state === 'extracting' && (
          <div className="splash-status">
            <div className="spinner" />
            <p>Extracting...</p>
          </div>
        )}

        {state === 'complete' && (
          <div className="splash-status complete">
            <div className="checkmark">✓</div>
            <p>Setup complete!</p>
          </div>
        )}

        {state === 'error' && (
          <div className="error-status">
            <p className="error-title">Setup failed</p>
            <p className="error-message">{error}</p>
            <button className="retry-btn" onClick={handleRetry}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>,
)
