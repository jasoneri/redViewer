import {
  ChevronFirst,
  ChevronLast,
  LoaderCircle,
  Save,
  Settings,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type Dispatch, type MouseEvent, type SetStateAction, type TouchEvent } from 'react'
import { ReaderPageTurnCanvas } from './ReaderPageTurnCanvas'
import type { ReaderFit, ReaderItem, ReaderMode, ReaderPageFlipState } from './readerCore'

type ReaderPageModeProps = {
  activeItem: ReaderItem
  deleteHardMode: boolean
  pageIndex: number
  readerAutoScrolling: boolean
  readerFit: ReaderFit
  readerMode: ReaderMode
  readerPageFlip: ReaderPageFlipState | null
  readerPageJumpOpen: boolean
  readerPages: string[]
  handleReaderPageClick: (event: MouseEvent<HTMLDivElement>) => void
  handleReaderPageTouchEnd: (event: TouchEvent<HTMLDivElement>) => void
  handleReaderPageTouchStart: (event: TouchEvent<HTMLDivElement>) => void
  jumpReaderFirstPage: () => void
  jumpReaderLastPage: () => void
  readerBookHandle: (handle: 'save' | 'remove' | 'del') => void
  saveReaderImageToGallery: (imageUrl: string, imagePageIndex: number) => void
  setReaderPageJumpOpen: Dispatch<SetStateAction<boolean>>
  showReaderChromeControls: () => void
  stopReaderAutoScroll: () => void
}

export function ReaderPageMode({
  activeItem,
  deleteHardMode,
  pageIndex,
  readerAutoScrolling,
  readerFit,
  readerMode,
  readerPageFlip,
  readerPageJumpOpen,
  readerPages,
  handleReaderPageClick,
  handleReaderPageTouchEnd,
  handleReaderPageTouchStart,
  jumpReaderFirstPage,
  jumpReaderLastPage,
  readerBookHandle,
  saveReaderImageToGallery,
  setReaderPageJumpOpen,
  showReaderChromeControls,
  stopReaderAutoScroll,
}: ReaderPageModeProps) {
  const [readerPageTurnCanvasReadyKey, setReaderPageTurnCanvasReadyKey] = useState(0)
  const markReaderPageTurnCanvasReady = useCallback((key: number) => {
    setReaderPageTurnCanvasReadyKey((current) => current === key ? current : key)
  }, [])
  const pageImage = readerPages[pageIndex] || ''
  const activePageTurn = readerPageFlip && readerPageFlip.fromIndex === pageIndex ? readerPageFlip : null
  const activePageTurnCanvasReady = activePageTurn ? readerPageTurnCanvasReadyKey === activePageTurn.key : false

  const longPressTimerRef = useRef<number | null>(null)
  const [isLongPressing, setIsLongPressing] = useState(false)

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current === null) return
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleImageTouchStart = useCallback((event: TouchEvent<HTMLImageElement>) => {
    handleReaderPageTouchStart(event)
    
    longPressTimerRef.current = window.setTimeout(() => {
      setIsLongPressing(true)
      if (pageImage) {
        saveReaderImageToGallery(pageImage, pageIndex)
      }
    }, 600)
  }, [handleReaderPageTouchStart, pageImage, pageIndex, saveReaderImageToGallery])

  const handleImageTouchEnd = useCallback((event: TouchEvent<HTMLImageElement>) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (isLongPressing) {
      setIsLongPressing(false)
      event.stopPropagation()
      return
    }

    handleReaderPageTouchEnd(event)
  }, [isLongPressing, handleReaderPageTouchEnd])

  const handleReaderPageCountClick = () => {
    if (readerMode === 'page' && readerAutoScrolling) {
      // RVUX0003: page-count tap expands the indicator and stops immersive auto-page.
      stopReaderAutoScroll()
      setReaderPageJumpOpen(true)
      return
    }
    setReaderPageJumpOpen((value) => !value)
  }

  return (
    <div
      className="reader-page-frame"
      onClick={handleReaderPageClick}
      onTouchStart={handleReaderPageTouchStart}
      onTouchEnd={handleReaderPageTouchEnd}
    >
      {pageImage ? (
        <>
          <img 
            className={`reader-page-image ${activePageTurn ? `reader-page-turn-source ${activePageTurnCanvasReady ? 'reader-page-turn-source-hidden' : ''}` : ''}`} 
            src={pageImage} 
            alt={activeItem.title}
            onTouchStart={handleImageTouchStart}
            onTouchEnd={handleImageTouchEnd}
          />
          {activePageTurn && <img className="reader-page-image reader-page-turn-bottom" src={activePageTurn.toSrc} alt="" aria-hidden="true" />}
          {activePageTurn && <ReaderPageTurnCanvas key={activePageTurn.key} onFirstFrame={markReaderPageTurnCanvasReady} pageTurn={activePageTurn} readerFit={readerFit} />}
        </>
      ) : <LoaderCircle className="spin" size={30} />}
      {readerPages.length > 0 && (
        <div className={`reader-page-indicator ${readerPageJumpOpen ? 'expanded' : ''}`} onClick={(event) => event.stopPropagation()}>
          {readerPageJumpOpen ? (
            <>
              <div className="reader-page-indicator-row reader-page-indicator-actions">
                <button className="handle-btn handle-saveBtn" onClick={() => readerBookHandle('save')} aria-label="保留">
                  <Save size={16} />
                </button>
                <button className="reader-page-settings" onClick={showReaderChromeControls} aria-label="显示阅读工具栏">
                  <Settings size={16} />
                </button>
                <button className={`handle-btn ${deleteHardMode ? 'handle-delBtn' : 'handle-removeBtn'}`} onClick={() => readerBookHandle(deleteHardMode ? 'del' : 'remove')} aria-label={deleteHardMode ? '彻底删除' : '移至回收'}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="reader-page-indicator-row reader-page-indicator-pages">
                <button className="reader-page-edge" onClick={jumpReaderFirstPage} disabled={pageIndex === 0} aria-label="首页">
                  <ChevronFirst size={16} />
                </button>
                <button className="reader-page-count" onClick={handleReaderPageCountClick}>
                  {pageIndex + 1} / {readerPages.length}
                </button>
                <button className="reader-page-edge" onClick={jumpReaderLastPage} disabled={pageIndex >= readerPages.length - 1} aria-label="末页">
                  <ChevronLast size={16} />
                </button>
              </div>
            </>
          ) : (
            <button className="reader-page-count" onClick={handleReaderPageCountClick}>
              {pageIndex + 1} / {readerPages.length}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
