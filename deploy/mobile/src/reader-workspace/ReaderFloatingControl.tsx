import { ArrowLeft, ChevronsLeft, ChevronsRight, Move, Save, Settings, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { CustomIcon } from '../icons/CustomIcon'
import type { ReaderFloatingControlPosition } from './readerCore'

type ReaderFloatingControlProps = {
  activeProgress: string
  deleteHardMode: boolean
  readerAutoScrolling: boolean
  readerFloatingControlPosition: ReaderFloatingControlPosition
  finishReaderFloatingControlDrag: (position: ReaderFloatingControlPosition) => void
  jumpReaderScrollByDrag: (dragRatio: number) => void
  moveReaderFloatingControl: (position: ReaderFloatingControlPosition) => void
  onBack: () => void
  openReaderNeighbor: (direction: number) => void
  readerBookHandle: (handle: 'save' | 'remove' | 'del') => void
  scrollReaderToTop: () => void
  showReaderChromeControls: () => void
  showFloatingNav: boolean
  stopReaderAutoScroll: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function ReaderFloatingControl({
  activeProgress,
  deleteHardMode,
  readerAutoScrolling,
  readerFloatingControlPosition,
  finishReaderFloatingControlDrag,
  jumpReaderScrollByDrag,
  moveReaderFloatingControl,
  onBack,
  openReaderNeighbor,
  readerBookHandle,
  scrollReaderToTop,
  showReaderChromeControls,
  showFloatingNav,
  stopReaderAutoScroll,
}: ReaderFloatingControlProps) {
  const [floatingMenuOpen, setFloatingMenuOpen] = useState(false)
  const floatingPointerRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startPosition: readerFloatingControlPosition,
    moved: false,
  })
  const moveDragRef = useRef<{ pointerId: number; startX: number; startY: number; startPosition: ReaderFloatingControlPosition } | null>(null)

  useEffect(() => {
    setFloatingMenuOpen(false)
  }, [readerAutoScrolling])

  const handleFloatingPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    floatingPointerRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: readerFloatingControlPosition,
      moved: false,
    }
  }

  const handleFloatingPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!floatingPointerRef.current.active) return
    event.preventDefault()
    const deltaX = event.clientX - floatingPointerRef.current.startX
    const deltaY = event.clientY - floatingPointerRef.current.startY
    if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) floatingPointerRef.current.moved = true
  }

  const handleFloatingPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!floatingPointerRef.current.active) return
    event.preventDefault()
    const deltaX = event.clientX - floatingPointerRef.current.startX
    const deltaY = event.clientY - floatingPointerRef.current.startY
    const moved = floatingPointerRef.current.moved
    floatingPointerRef.current.active = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!moved && readerAutoScrolling) {
      // RVUX0003: immersive auto-scroll stops from the floating progress control.
      setFloatingMenuOpen(false)
      stopReaderAutoScroll()
      return
    }
    if (moved && Math.abs(deltaX) > Math.abs(deltaY)) {
      const dragActivationPx = clamp(window.innerWidth * 0.3, 96, 128)
      jumpReaderScrollByDrag(clamp(deltaX / dragActivationPx, -1, 1))
      return
    }
    if (!moved) setFloatingMenuOpen((value) => !value)
  }

  const handleFloatingPointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    floatingPointerRef.current.active = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleMovePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    moveDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: readerFloatingControlPosition,
    }
  }

  const handleMovePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = moveDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    moveReaderFloatingControl({
      x: clamp(drag.startPosition.x + deltaX, 0, window.innerWidth),
      y: clamp(drag.startPosition.y - deltaY, 0, window.innerHeight),
    })
  }

  const handleMovePointerFinish = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = moveDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    moveDragRef.current = null
    finishReaderFloatingControlDrag(readerFloatingControlPosition)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const readerRect = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('.reader')?.getBoundingClientRect() : undefined
  const viewportWidth = readerRect?.width || (typeof window !== 'undefined' ? window.innerWidth : 0)
  const viewportHeight = readerRect?.height || (typeof window !== 'undefined' ? window.innerHeight : 0)
  const menuAlign = viewportWidth && readerFloatingControlPosition.x > viewportWidth / 2 ? 'align-right' : 'align-left'
  const navAlign = viewportWidth && readerFloatingControlPosition.x > viewportWidth / 2 ? 'nav-left' : 'nav-right'
  const menuSide = viewportHeight && readerFloatingControlPosition.y < viewportHeight / 2 ? 'open-up' : 'open-down'
  const navSide = menuSide === 'open-up' ? 'l-mode-up' : 'l-mode-down'
  const floatingNavOpen = showFloatingNav && floatingMenuOpen
  const wrapLMode = floatingNavOpen ? ` ${navAlign} ${navSide}` : ''

  return (
    <div className={`reader-floating-wrap${wrapLMode}`} style={{ left: readerFloatingControlPosition.x, bottom: readerFloatingControlPosition.y }}>
      <button
        className="reader-floating-control"
        onPointerDown={handleFloatingPointerDown}
        onPointerMove={handleFloatingPointerMove}
        onPointerUp={handleFloatingPointerUp}
        onPointerCancel={handleFloatingPointerCancel}
        aria-label="滚动进度控制"
      >
        <span>{activeProgress}</span>
      </button>
      {floatingNavOpen && (
        <div className={`reader-floating-nav btn-group ${navAlign} ${navSide}`} role="group" aria-label="悬浮阅读导航">
          <button className="reader-icon" onClick={onBack} aria-label="返回上级目录">
            <ArrowLeft size={16} />
          </button>
          <button className="reader-icon" onClick={() => openReaderNeighbor(-1)} aria-label="上一本">
            <ChevronsLeft size={16} />
          </button>
          <button className="reader-icon" onClick={() => openReaderNeighbor(1)} aria-label="下一本">
            <ChevronsRight size={16} />
          </button>
        </div>
      )}
      {floatingMenuOpen && (
        <div className={`reader-floating-teachtip ${menuAlign} ${menuSide}`} aria-label="滚动控制菜单">
          <button className="reader-icon" onClick={showReaderChromeControls} aria-label="显示阅读工具栏">
            <Settings size={18} />
          </button>
          <button className="reader-icon" onClick={scrollReaderToTop} aria-label="回到第一页">
            <CustomIcon name="scrollToTop" size={18} />
          </button>
          <button
            className="reader-icon reader-floating-drag"
            onPointerDown={handleMovePointerDown}
            onPointerMove={handleMovePointerMove}
            onPointerUp={handleMovePointerFinish}
            onPointerCancel={handleMovePointerFinish}
            aria-label="拖动滚动进度控制坐标"
          >
            <Move size={18} />
          </button>
          <button className="reader-icon handle-btn handle-saveBtn" onClick={() => readerBookHandle('save')} aria-label="保留">
            <Save size={18} />
          </button>
          <button
            className={`reader-icon handle-btn ${deleteHardMode ? 'handle-delBtn' : 'handle-removeBtn'}`}
            onClick={() => readerBookHandle(deleteHardMode ? 'del' : 'remove')}
            aria-label={deleteHardMode ? '彻底删除' : '移至回收'}
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
