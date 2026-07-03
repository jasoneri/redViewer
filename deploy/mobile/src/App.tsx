import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { LeftDrawer } from './app-shell/LeftDrawer'
import { LocksModal } from './app-shell/LocksModal'
import { CustomSettingsModal } from './app-shell/CustomSettingsModal'
import { useAppState } from './app-shell/useAppState'
import { useMobileAppModel, type ToastTone } from './app-shell/useMobileAppModel'
import { MENU_LOGO_SRC } from './app-shell/appMeta'
import { toastStyleVars, getSkinToastIconSrc } from './app-shell/skinToast'
import { AcquireWorkspace } from './acquire-workspace/AcquireWorkspace'
import { DetailWorkspace } from './detail-workspace/DetailWorkspace'
import { LibraryWorkspace } from './library-workspace/LibraryWorkspace'
import { ReaderWorkspace } from './reader-workspace/ReaderWorkspace'
import type { SkinAssets } from './app-shell/appMeta'

function MicroHeader({
  drawerOpen,
  onOpenDrawer,
  menuImgSrc,
  menuVisiblePercent,
  menuEffectSrc,
  menuEffectDuration = 1000,
  head,
  rail,
}: {
  drawerOpen: boolean
  onOpenDrawer: () => void
  menuImgSrc: string
  menuVisiblePercent: number
  menuEffectSrc?: string
  menuEffectDuration?: number
  head?: ReactNode
  rail?: ReactNode
}) {
  const [showEffect, setShowEffect] = useState(false)
  const pendingOpenTimerRef = useRef<number | null>(null)
  const menuStyle = { '--menu-visible-ratio': menuVisiblePercent / 100 } as CSSProperties

  useEffect(() => {
    return () => {
      if (pendingOpenTimerRef.current === null) return
      window.clearTimeout(pendingOpenTimerRef.current)
      pendingOpenTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    if (pendingOpenTimerRef.current !== null) {
      window.clearTimeout(pendingOpenTimerRef.current)
      pendingOpenTimerRef.current = null
    }
    setShowEffect(false)
  }, [drawerOpen])

  const handleMenuClick = () => {
    if (drawerOpen) return
    if (pendingOpenTimerRef.current !== null) {
      window.clearTimeout(pendingOpenTimerRef.current)
      pendingOpenTimerRef.current = null
    }
    if (menuEffectSrc && !drawerOpen) {
      setShowEffect(true)
      pendingOpenTimerRef.current = window.setTimeout(() => {
        pendingOpenTimerRef.current = null
        setShowEffect(false)
        onOpenDrawer()
      }, menuEffectDuration)
    } else {
      onOpenDrawer()
    }
  }

  return (
    <>
      <button
        className={`micro-menu-strip ${showEffect ? 'effect-active' : ''}`}
        style={menuStyle}
        onClick={handleMenuClick}
        aria-hidden={drawerOpen}
        aria-label="打开菜单"
        tabIndex={drawerOpen ? -1 : 0}
      >
        <img className="menu-img" src={menuImgSrc} alt="" />
        {menuEffectSrc && showEffect && (
          <img className="menu-effect" src={menuEffectSrc} alt="" />
        )}
      </button>
      <header className="micro-header">
        <div className="micro-status-head">
          {head}
        </div>
        <div className="micro-status-rail">
          {rail}
        </div>
      </header>
    </>
  )
}

function ToastViewport({ 
  toast, 
  skinAssets 
}: { 
  toast: { tone: ToastTone; text: string } | null
  skinAssets: SkinAssets
}) {
  if (!toast) return null

  const iconSrc = getSkinToastIconSrc(toast.tone, skinAssets)
  const styleVars = toastStyleVars(toast.text)

  return (
    <div 
      className={`toast ${toast.tone}`} 
      role="status"
      style={styleVars}
    >
      {iconSrc && (
        <img 
          className="toast-icon" 
          src={iconSrc} 
          alt="" 
          aria-hidden="true"
        />
      )}
      <span className="toast-text">{toast.text}</span>
    </div>
  )
}

export function App() {
  const appState = useAppState()
  const [locksModalOpen, setLocksModalOpen] = useState(false)
  const {
    acquireWorkspace,
    customSettingsModalProps,
    drawerOpen,
    leftDrawerProps,
    menuImgSrc,
    menuVisiblePercent,
    menuEffectSrc,
    menuEffectDuration,
    microHeaderStatus,
    readerWorkspaceProps,
    selectedBook,
    setDrawerOpen,
    setLocksState,
    shelfWorkspace,
    toast,
    view,
  } = useMobileAppModel(appState, {
    onRootSecretSaved: () => {
      setDrawerOpen(false)
      setLocksModalOpen(true)
    },
  })

  return (
    <div className={`shell view-${view} ${selectedBook ? 'detail-open' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
      {view !== 'reader' && (
        <>
          <MicroHeader
            drawerOpen={drawerOpen}
            onOpenDrawer={() => setDrawerOpen(true)}
            menuImgSrc={menuImgSrc || MENU_LOGO_SRC}
            menuVisiblePercent={menuVisiblePercent}
            menuEffectSrc={menuEffectSrc}
            menuEffectDuration={menuEffectDuration}
            head={microHeaderStatus.head}
            rail={microHeaderStatus.rail}
          />

          <LeftDrawer {...leftDrawerProps} />
          
          <LocksModal
            open={locksModalOpen}
            onClose={() => setLocksModalOpen(false)}
            onLocksUpdate={setLocksState}
            backendUrl={appState.backendUrl}
          />

          <CustomSettingsModal {...customSettingsModalProps} />
        </>
      )}

      <main className="app-main">
        {(view === 'library' || view === 'downloads') && !selectedBook && (
          <LibraryWorkspace {...shelfWorkspace.libraryWorkspaceProps} />
        )}

        {(view === 'library' || view === 'downloads') && shelfWorkspace.detailWorkspaceProps && <DetailWorkspace {...shelfWorkspace.detailWorkspaceProps} />}

        {view === 'reader' && readerWorkspaceProps && <ReaderWorkspace {...readerWorkspaceProps} />}

        {view === 'acquire' && <AcquireWorkspace {...acquireWorkspace.workspaceProps} />}
      </main>

      <ToastViewport toast={toast} skinAssets={appState.skinAssets} />
    </div>
  )
}
