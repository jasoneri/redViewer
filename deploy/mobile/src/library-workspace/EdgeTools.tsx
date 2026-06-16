import { Filter, ListChecks, LoaderCircle, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { MouseEventHandler } from 'react'
import { useEffect, useRef, useState } from 'react'
import { CustomIcon } from '../icons/CustomIcon'

export const edgeActions = ['filter', 'sort', 'refresh', 'delete-mode', 'doujin', 'multi-check'] as const
export type EdgeAction = typeof edgeActions[number]

export function isEdgeAction(value: string | undefined): value is EdgeAction {
  return Boolean(value && edgeActions.includes(value as EdgeAction))
}

export function EdgeTools({
  open,
  logoSrc,
  busy,
  comicMode,
  deleteHardMode,
  showDoujinAction,
  showMultiCheckAction,
  multiCheckActive,
  onAction,
  onOpenMenu,
  onCloseMenu,
  effectSrc,
  effectDuration,
}: {
  open: boolean
  logoSrc: string
  busy: string
  comicMode: string
  deleteHardMode: boolean
  showDoujinAction: boolean
  showMultiCheckAction: boolean
  multiCheckActive: boolean
  onAction: (action: EdgeAction) => void
  onOpenMenu: () => void
  onCloseMenu: () => void
  effectSrc?: string
  effectDuration: number
}) {
  const [showEffect, setShowEffect] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const pendingOpenTimerRef = useRef<number | null>(null)
  const autoHideTimerRef = useRef<number | null>(null)

  const iconSize = 20.4
  const runAction: MouseEventHandler<HTMLButtonElement> = (event) => {
    const action = event.currentTarget.dataset.edgeAction
    if (!isEdgeAction(action)) return
    onCloseMenu()
    onAction(action)
  }

  const clearPendingOpen = (): boolean => {
    if (pendingOpenTimerRef.current === null) return false
    window.clearTimeout(pendingOpenTimerRef.current)
    pendingOpenTimerRef.current = null
    setShowEffect(false)
    return true
  }

  useEffect(() => {
    return () => {
      clearPendingOpen()
      if (autoHideTimerRef.current === null) return
      window.clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (autoHideTimerRef.current !== null) {
      window.clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = null
    }
    if (!open) return
    // RVUX0001: tap-open edge menu must collapse when left idle.
    autoHideTimerRef.current = window.setTimeout(() => {
      autoHideTimerRef.current = null
      onCloseMenu()
    }, 3000)
    return () => {
      if (autoHideTimerRef.current === null) return
      window.clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = null
    }
  }, [open, onCloseMenu])

  useEffect(() => {
    if (!open) return
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      const target = event.target
      if (!root || !(target instanceof Node) || root.contains(target)) return
      onCloseMenu()
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown, true)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
  }, [open, onCloseMenu])

  const handleStripClick: MouseEventHandler<HTMLButtonElement> = () => {
    if (open) return
    clearPendingOpen()
    if (effectSrc && !open) {
      setShowEffect(true)
      // RVUX0001: _act.edge is tap feedback before opening, not a hold gesture.
      pendingOpenTimerRef.current = window.setTimeout(() => {
        pendingOpenTimerRef.current = null
        setShowEffect(false)
        onOpenMenu()
      }, effectDuration)
      return
    }

    onOpenMenu()
  }

  return (
    <div ref={rootRef} className={`edge-tools ${open ? 'open' : ''} ${showEffect ? 'effect-active' : ''}`}>
      <button
        className="edge-strip"
        onClick={handleStripClick}
        aria-label="书架工具"
      >
        <img className="edge-img" src={logoSrc} alt="" />
        {effectSrc && showEffect && (
          <img className="edge-effect" src={effectSrc} alt="" />
        )}
      </button>
      <div className="edge-menu" aria-hidden={!open}>
        <button
          className="menu-card"
          data-edge-action="refresh"
          onClick={runAction}
          disabled={busy === 'library'}
        >
          {busy === 'library' ? <LoaderCircle className="spin" size={iconSize} /> : <RefreshCw size={iconSize} />}
          <span className="span-tip">刷新</span>
        </button>
        {showMultiCheckAction && (
          <button
            className={`menu-card ${multiCheckActive ? 'is-active' : ''}`}
            data-edge-action="multi-check"
            onClick={runAction}
            aria-pressed={multiCheckActive}
          >
            <ListChecks size={iconSize} />
            <span className="span-tip">多选</span>
          </button>
        )}
        {showDoujinAction && (
          <button
            className="menu-card"
            data-edge-action="doujin"
            onClick={runAction}
            disabled={busy === 'switch-ero'}
          >
            {busy === 'switch-ero' ? <LoaderCircle className="spin" size={iconSize} /> : <CustomIcon name="doujin" className={`doujin-mode-icon ${comicMode}`} size={iconSize} />}
            <span className="span-tip">切换同人</span>
          </button>
        )}
        <button
          className="menu-card"
          data-edge-action="delete-mode"
          onClick={runAction}
        >
          <Trash2 className={`delete-mode-icon ${deleteHardMode ? 'delete' : 'remove'}`} size={iconSize} />
          <span className="span-tip">删除模式</span>
        </button>
        <button
          className="menu-card"
          data-edge-action="sort"
          onClick={runAction}
        >
          <SlidersHorizontal size={iconSize} />
          <span className="span-tip">排序</span>
        </button>
        <button
          className="menu-card"
          data-edge-action="filter"
          onClick={runAction}
        >
          <Filter size={iconSize} />
          <span className="span-tip">筛选</span>
        </button>
      </div>
    </div>
  )
}
