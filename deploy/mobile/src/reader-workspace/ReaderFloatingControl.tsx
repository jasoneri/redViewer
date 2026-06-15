import { Save, Settings, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { ReaderFloatingControlPosition } from './readerCore'

type ReaderFloatingControlProps = {
  activeProgress: string
  deleteHardMode: boolean
  readerAutoScrolling: boolean
  readerFloatingControlPosition: ReaderFloatingControlPosition
  finishReaderFloatingControlDrag: (position: ReaderFloatingControlPosition) => void
  jumpReaderScrollByDrag: (dragRatio: number) => void
  moveReaderFloatingControl: (position: ReaderFloatingControlPosition) => void
  readerBookHandle: (handle: 'save' | 'remove' | 'del') => void
  scrollReaderToTop: () => void
  showReaderChromeControls: () => void
  stopReaderAutoScroll: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function MoveIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M12 3v6m-9 3h6m12 0h-6m-3 9v-6.5M9 6l1.705-1.952C11.315 3.35 11.621 3 12 3c.38 0 .684.35 1.295 1.048L15 6m0 12l-1.705 1.952C12.685 20.65 12.379 21 12 21c-.38 0-.684-.35-1.295-1.048L9 18m9-9l1.952 1.705C20.65 11.315 21 11.621 21 12c0 .38-.35.684-1.048 1.295L18 15M6 15l-1.952-1.705C3.35 12.685 3 12.379 3 12c0-.38.35-.684 1.048-1.295L6 9"
      />
    </svg>
  )
}

function TopIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M0 0h16v16H0z" fill="none" />
      <path
        fill="currentColor"
        d="M3 2.25a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 2.25m5.53 2.97l3.75 3.75a.749.749 0 1 1-1.06 1.06L8.75 7.561v6.689a.75.75 0 0 1-1.5 0V7.561L4.78 10.03a.749.749 0 1 1-1.06-1.06l3.75-3.75a.75.75 0 0 1 1.06 0"
      />
    </svg>
  )
}

export function ReaderFloatingControl({
  activeProgress,
  deleteHardMode,
  readerAutoScrolling,
  readerFloatingControlPosition,
  finishReaderFloatingControlDrag,
  jumpReaderScrollByDrag,
  moveReaderFloatingControl,
  readerBookHandle,
  scrollReaderToTop,
  showReaderChromeControls,
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
      y: clamp(drag.startPosition.y + deltaY, 0, window.innerHeight),
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
  const menuSide = viewportHeight && readerFloatingControlPosition.y + 22 > viewportHeight / 2 ? 'open-up' : 'open-down'

  return (
    <div className="reader-floating-wrap" style={{ left: readerFloatingControlPosition.x, top: readerFloatingControlPosition.y }}>
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
      {floatingMenuOpen && (
        <div className={`reader-floating-teachtip ${menuAlign} ${menuSide}`} aria-label="滚动控制菜单">
          <button className="reader-icon" onClick={showReaderChromeControls} aria-label="显示阅读工具栏">
            <Settings size={18} />
          </button>
          <button className="reader-icon" onClick={scrollReaderToTop} aria-label="回到第一页">
            <TopIcon size={18} />
          </button>
          <button
            className="reader-icon reader-floating-drag"
            onPointerDown={handleMovePointerDown}
            onPointerMove={handleMovePointerMove}
            onPointerUp={handleMovePointerFinish}
            onPointerCancel={handleMovePointerFinish}
            aria-label="拖动滚动进度控制坐标"
          >
            <MoveIcon size={18} />
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
