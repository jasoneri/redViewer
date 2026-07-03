import { ArrowLeft, ChevronsLeft, ChevronsRight, Settings } from 'lucide-react'
import { useCallback, useEffect, useRef, type Dispatch, type MouseEvent, type RefObject, type SetStateAction, type TouchEvent } from 'react'
import { ReaderFloatingControl } from './ReaderFloatingControl'
import { ReaderPageMode } from './ReaderPageMode'
import { ReaderSettingsPanel } from './ReaderSettingsPanel'
import type {
  ReaderFit,
  ReaderFloatingControlPosition,
  ReaderIntervalTimeBounds,
  ReaderItem,
  ReaderMode,
  ReaderPageFlipState,
  ReaderSettings,
  ReaderToolbarPosition,
} from './readerCore'

export type ReaderWorkspaceProps = {
  activeItem: ReaderItem
  activeProgress: string
  pageIndex: number
  readerAutoScrolling: boolean
  readerChromeVisible: boolean
  readerFit: ReaderFit
  readerMaxScrollTop: number
  readerMode: ReaderMode
  readerPageJumpOpen: boolean
  readerPageFlip: ReaderPageFlipState | null
  readerPages: string[]
  readerScrollRenderNonce: number
  readerScrollTop: number
  readerSettings: ReaderSettings
  readerSettingsOpen: boolean
  readerIntervalTimeBounds: ReaderIntervalTimeBounds
  readerPageFlipDurationBounds: ReaderIntervalTimeBounds
  readerFloatingControlPosition: ReaderFloatingControlPosition
  readerToolbarVisible: boolean
  scrollReaderRef: RefObject<HTMLDivElement | null>
  changeReaderMode: (mode: ReaderMode) => void
  changeReaderPageFlipDuration: (value: number) => void
  changeReaderScrollDragStepPercent: (value: number) => void
  changeReaderScrollIntervalPixel: (value: number) => void
  changeReaderScrollIntervalTime: (value: number) => void
  changeReaderShowCenterNextPrev: (value: boolean) => void
  changeReaderToolbarPosition: (position: ReaderToolbarPosition) => void
  handleReaderPageClick: (event: MouseEvent<HTMLDivElement>) => void
  handleReaderPageTouchEnd: (event: TouchEvent<HTMLDivElement>) => void
  handleReaderPageTouchStart: (event: TouchEvent<HTMLDivElement>) => void
  handleReaderScroll: () => void
  handleScrollImageLoad: () => void
  jumpReaderFirstPage: () => void
  jumpReaderLastPage: () => void
  jumpReaderPage: (page: number) => void
  jumpReaderScrollByDrag: (dragRatio: number) => void
  markReaderUserScroll: () => void
  moveReaderFloatingControl: (position: ReaderFloatingControlPosition) => void
  onBack: () => void
  openReaderNeighbor: (direction: number) => void
  readerBookHandle: (handle: 'save' | 'remove' | 'del') => void
  saveReaderImageToGallery: (imageUrl: string, imagePageIndex: number) => void
  scrollReaderToTop: () => void
  showReaderChromeControls: () => void
  finishReaderFloatingControlDrag: (position: ReaderFloatingControlPosition) => void
  deleteHardMode: boolean
  setReaderFit: Dispatch<SetStateAction<ReaderFit>>
  setReaderPageJumpOpen: Dispatch<SetStateAction<boolean>>
  setReaderSettingsOpen: Dispatch<SetStateAction<boolean>>
  stopReaderAutoScroll: () => void
  toggleReaderAutoScroll: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

type ReaderTopbarProps = {
  bookTitle: string
  chapterTitle: string
  bookSource: string | null
  onBack: () => void
  openReaderNeighbor: (direction: number) => void
  setReaderSettingsOpen: Dispatch<SetStateAction<boolean>>
}

function ReaderTopbar({
  bookTitle,
  chapterTitle,
  bookSource,
  onBack,
  openReaderNeighbor,
  setReaderSettingsOpen,
}: ReaderTopbarProps) {
  return (
    <div className="reader-topbar">
      <button className="reader-icon" onClick={onBack} aria-label="返回">
        <ArrowLeft size={19} />
      </button>
      <div className="reader-top-title">
        {bookSource && <p className="reader-book-source">{bookSource}</p>}
        <strong>{bookTitle}</strong>
        {chapterTitle && <span>{chapterTitle}</span>}
      </div>
      <div className="reader-top-actions">
        <button className="reader-icon" onClick={() => openReaderNeighbor(-1)} aria-label="上一章">
          <ChevronsLeft size={18} />
        </button>
        <button className="reader-icon" onClick={() => openReaderNeighbor(1)} aria-label="下一章">
          <ChevronsRight size={18} />
        </button>
        <button className="reader-icon" onClick={() => setReaderSettingsOpen((value) => !value)} aria-label="阅读设置">
          <Settings size={18} />
        </button>
      </div>
    </div>
  )
}

export function ReaderWorkspace({
  activeItem,
  activeProgress,
  pageIndex,
  readerAutoScrolling,
  readerChromeVisible,
  readerFit,
  readerMaxScrollTop,
  readerMode,
  readerPageJumpOpen,
  readerPageFlip,
  readerPages,
  readerScrollRenderNonce,
  readerScrollTop,
  readerSettings,
  readerSettingsOpen,
  readerIntervalTimeBounds,
  readerPageFlipDurationBounds,
  readerFloatingControlPosition,
  readerToolbarVisible,
  scrollReaderRef,
  changeReaderMode,
  changeReaderPageFlipDuration,
  changeReaderScrollDragStepPercent,
  changeReaderScrollIntervalPixel,
  changeReaderScrollIntervalTime,
  changeReaderShowCenterNextPrev,
  changeReaderToolbarPosition,
  handleReaderPageClick,
  handleReaderPageTouchEnd,
  handleReaderPageTouchStart,
  handleReaderScroll,
  handleScrollImageLoad,
  jumpReaderFirstPage,
  jumpReaderLastPage,
  jumpReaderScrollByDrag,
  markReaderUserScroll,
  moveReaderFloatingControl,
  onBack,
  openReaderNeighbor,
  readerBookHandle,
  saveReaderImageToGallery,
  scrollReaderToTop,
  showReaderChromeControls,
  finishReaderFloatingControlDrag,
  deleteHardMode,
  setReaderPageJumpOpen,
  setReaderSettingsOpen,
  stopReaderAutoScroll,
  toggleReaderAutoScroll,
}: ReaderWorkspaceProps) {
  const scrollLongPressTimerRef = useRef<number | null>(null)
  const scrollLongPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const scrollLongPressHandledRef = useRef(false)
  const readerTopbarBookTitle = activeItem.book || activeItem.title
  const readerTopbarChapterTitle = activeItem.ep && activeItem.ep !== activeItem.book ? activeItem.ep : ''
  const readerTopbarBookSource = readerTopbarChapterTitle ? null : activeItem.meta?.source || null
  const toolbarPosition = readerSettings.toolbarPosition === 'bottom' ? 'bottom' : 'top'
  const topbar = readerToolbarVisible ? (
    <ReaderTopbar
      bookTitle={readerTopbarBookTitle}
      chapterTitle={readerTopbarChapterTitle}
      bookSource={readerTopbarBookSource}
      onBack={onBack}
      openReaderNeighbor={openReaderNeighbor}
      setReaderSettingsOpen={setReaderSettingsOpen}
    />
  ) : null
  const settingsPanel = readerSettingsOpen && readerToolbarVisible ? (
    <ReaderSettingsPanel
      readerAutoScrolling={readerAutoScrolling}
      readerIntervalTimeBounds={readerIntervalTimeBounds}
      readerMode={readerMode}
      readerPageFlipDurationBounds={readerPageFlipDurationBounds}
      readerSettings={readerSettings}
      changeReaderMode={changeReaderMode}
      changeReaderPageFlipDuration={changeReaderPageFlipDuration}
      changeReaderScrollDragStepPercent={changeReaderScrollDragStepPercent}
      changeReaderScrollIntervalPixel={changeReaderScrollIntervalPixel}
      changeReaderScrollIntervalTime={changeReaderScrollIntervalTime}
      changeReaderShowCenterNextPrev={changeReaderShowCenterNextPrev}
      changeReaderToolbarPosition={changeReaderToolbarPosition}
      toggleReaderAutoScroll={toggleReaderAutoScroll}
    />
  ) : null

  const clearScrollLongPressTimer = useCallback(() => {
    if (scrollLongPressTimerRef.current === null) return
    window.clearTimeout(scrollLongPressTimerRef.current)
    scrollLongPressTimerRef.current = null
  }, [])

  useEffect(() => clearScrollLongPressTimer, [clearScrollLongPressTimer])

  const handleScrollImageTouchStart = useCallback((event: TouchEvent<HTMLImageElement>, page: string, imagePageIndex: number) => {
    const touch = event.touches[0]
    if (!touch) return
    scrollLongPressHandledRef.current = false
    scrollLongPressStartRef.current = { x: touch.clientX, y: touch.clientY }
    clearScrollLongPressTimer()
    scrollLongPressTimerRef.current = window.setTimeout(() => {
      scrollLongPressTimerRef.current = null
      scrollLongPressHandledRef.current = true
      saveReaderImageToGallery(page, imagePageIndex)
    }, 600)
  }, [clearScrollLongPressTimer, saveReaderImageToGallery])

  const handleScrollImageTouchMove = useCallback((event: TouchEvent<HTMLImageElement>) => {
    const start = scrollLongPressStartRef.current
    const touch = event.touches[0]
    if (!start || !touch) return
    const moved = Math.abs(touch.clientX - start.x) > 10 || Math.abs(touch.clientY - start.y) > 10
    if (moved) clearScrollLongPressTimer()
  }, [clearScrollLongPressTimer])

  const handleScrollImageTouchEnd = useCallback((event: TouchEvent<HTMLImageElement>) => {
    clearScrollLongPressTimer()
    scrollLongPressStartRef.current = null
    if (!scrollLongPressHandledRef.current) return
    event.stopPropagation()
  }, [clearScrollLongPressTimer])

  const handleScrollImageClick = useCallback((event: MouseEvent<HTMLImageElement>) => {
    if (!scrollLongPressHandledRef.current) return
    scrollLongPressHandledRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return (
    <section className={`reader mode-${readerMode} fit-${readerFit} toolbar-${toolbarPosition} ${readerChromeVisible ? 'chrome-on' : 'chrome-off'}`}>
      {toolbarPosition === 'top' && topbar}
      {settingsPanel}

      <div className="reader-stage">
        {readerMode === 'page' ? (
          <ReaderPageMode
            activeItem={activeItem}
            deleteHardMode={deleteHardMode}
            pageIndex={pageIndex}
            readerAutoScrolling={readerAutoScrolling}
            readerFit={readerFit}
            readerMode={readerMode}
            readerPageFlip={readerPageFlip}
            readerPageJumpOpen={readerPageJumpOpen}
            readerPages={readerPages}
            handleReaderPageClick={handleReaderPageClick}
            handleReaderPageTouchEnd={handleReaderPageTouchEnd}
            handleReaderPageTouchStart={handleReaderPageTouchStart}
            jumpReaderFirstPage={jumpReaderFirstPage}
            jumpReaderLastPage={jumpReaderLastPage}
            readerBookHandle={readerBookHandle}
            saveReaderImageToGallery={saveReaderImageToGallery}
            setReaderPageJumpOpen={setReaderPageJumpOpen}
            showReaderChromeControls={showReaderChromeControls}
            stopReaderAutoScroll={stopReaderAutoScroll}
          />
        ) : (
          <div
            key={readerScrollRenderNonce}
            ref={scrollReaderRef}
            className="reader-scroll-surface"
            onPointerDown={markReaderUserScroll}
            onTouchStart={markReaderUserScroll}
            onWheel={markReaderUserScroll}
            onClick={showReaderChromeControls}
            onScroll={handleReaderScroll}
          >
            {readerPages.map((page, index) => (
              <img
                key={page}
                src={page}
                alt={`${activeItem.title} ${index + 1}`}
                loading="lazy"
                onLoad={handleScrollImageLoad}
                onClick={handleScrollImageClick}
                onTouchStart={(event) => handleScrollImageTouchStart(event, page, index)}
                onTouchMove={handleScrollImageTouchMove}
                onTouchEnd={handleScrollImageTouchEnd}
                onTouchCancel={handleScrollImageTouchEnd}
              />
            ))}
          </div>
        )}
      </div>

      {readerMode === 'scroll' && readerMaxScrollTop > 0 && (
        <div className="reader-scroll-progress" aria-hidden="true">
          <div style={{ height: `${clamp((readerScrollTop / readerMaxScrollTop) * 100, 0, 100)}%` }} />
        </div>
      )}

      {readerMode === 'scroll' && (
        <ReaderFloatingControl
          activeProgress={activeProgress}
          deleteHardMode={deleteHardMode}
          readerAutoScrolling={readerAutoScrolling}
          readerFloatingControlPosition={readerFloatingControlPosition}
          finishReaderFloatingControlDrag={finishReaderFloatingControlDrag}
          jumpReaderScrollByDrag={jumpReaderScrollByDrag}
          moveReaderFloatingControl={moveReaderFloatingControl}
          onBack={onBack}
          openReaderNeighbor={openReaderNeighbor}
          readerBookHandle={readerBookHandle}
          scrollReaderToTop={scrollReaderToTop}
          showReaderChromeControls={showReaderChromeControls}
          showFloatingNav={readerSettings.showCenterNextPrev}
          stopReaderAutoScroll={stopReaderAutoScroll}
        />
      )}

      {toolbarPosition === 'bottom' && topbar}
    </section>
  )
}
