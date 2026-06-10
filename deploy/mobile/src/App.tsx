import { AlertCircle, Check, Menu, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { LeftDrawer } from './app-shell/LeftDrawer'
import { useAppState } from './app-shell/useAppState'
import { useMobileAppModel, type ToastTone } from './app-shell/useMobileAppModel'
import { AcquireWorkspace } from './acquire-workspace/AcquireWorkspace'
import { DetailWorkspace } from './detail-workspace/DetailWorkspace'
import { LibraryWorkspace } from './library-workspace/LibraryWorkspace'
import { ReaderWorkspace } from './reader-workspace/ReaderWorkspace'

function MicroHeader({
  drawerOpen,
  onOpenDrawer,
  head,
  rail,
}: {
  drawerOpen: boolean
  onOpenDrawer: () => void
  head?: ReactNode
  rail?: ReactNode
}) {
  return (
    <>
      <button
        className="micro-menu-button"
        onClick={onOpenDrawer}
        aria-hidden={drawerOpen}
        aria-label="打开菜单"
        tabIndex={drawerOpen ? -1 : 0}
      >
        <Menu size={18} />
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

function ToastViewport({ toast }: { toast: { tone: ToastTone; text: string } | null }) {
  if (!toast) return null

  return (
    <div className={`toast ${toast.tone}`} role="status">
      <span className="toast-mark" aria-hidden="true">{toastIcon(toast.tone)}</span>
      <span>{toast.text}</span>
    </div>
  )
}

function toastIcon(tone: ToastTone): ReactNode {
  if (tone === 'ok') return <Check size={15} />
  if (tone === 'warn') return <AlertCircle size={15} />
  return <X size={15} />
}

export function App() {
  const appState = useAppState()
  const {
    acquireWorkspace,
    drawerOpen,
    leftDrawerProps,
    microHeaderStatus,
    readerWorkspaceProps,
    selectedBook,
    setDrawerOpen,
    shelfWorkspace,
    toast,
    view,
  } = useMobileAppModel(appState)

  return (
    <div className={`shell view-${view} ${selectedBook ? 'detail-open' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
      {view !== 'reader' && (
        <>
          <MicroHeader
            drawerOpen={drawerOpen}
            onOpenDrawer={() => setDrawerOpen(true)}
            head={microHeaderStatus.head}
            rail={microHeaderStatus.rail}
          />

          <LeftDrawer {...leftDrawerProps} />
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

      <ToastViewport toast={toast} />
    </div>
  )
}
