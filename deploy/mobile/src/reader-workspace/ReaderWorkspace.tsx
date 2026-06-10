import { ArrowLeft, ChevronsLeft, ChevronsRight, Settings } from 'lucide-react'
import type { Dispatch, MouseEvent, RefObject, SetStateAction, TouchEvent } from 'react'
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
  readerFloatingControlUnlocked: boolean
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
  scrollReaderToTop: () => void
  showReaderChromeControls: () => void
  acceptReaderFloatingControlPosition: () => void
  cancelReaderFloatingControlPosition: () => void
  unlockReaderFloatingControl: () => void
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
  onBack: () => void
  openReaderNeighbor: (direction: number) => void
  setReaderSettingsOpen: Dispatch<SetStateAction<boolean>>
}

function ReaderTopbar({
  bookTitle,
  chapterTitle,
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
  readerFloatingControlUnlocked,
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
  scrollReaderToTop,
  showReaderChromeControls,
  acceptReaderFloatingControlPosition,
  cancelReaderFloatingControlPosition,
  unlockReaderFloatingControl,
  deleteHardMode,
  setReaderPageJumpOpen,
  setReaderSettingsOpen,
  stopReaderAutoScroll,
  toggleReaderAutoScroll,
}: ReaderWorkspaceProps) {
  const readerTopbarBookTitle = activeItem.book || activeItem.title
  const readerTopbarChapterTitle = activeItem.ep && activeItem.ep !== activeItem.book ? activeItem.ep : ''
  const toolbarPosition = readerSettings.toolbarPosition === 'bottom' ? 'bottom' : 'top'
  const topbar = readerToolbarVisible ? (
    <ReaderTopbar
      bookTitle={readerTopbarBookTitle}
      chapterTitle={readerTopbarChapterTitle}
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
              <img key={page} src={page} alt={`${activeItem.title} ${index + 1}`} loading="lazy" onLoad={handleScrollImageLoad} />
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
          readerFloatingControlUnlocked={readerFloatingControlUnlocked}
          acceptReaderFloatingControlPosition={acceptReaderFloatingControlPosition}
          cancelReaderFloatingControlPosition={cancelReaderFloatingControlPosition}
          jumpReaderScrollByDrag={jumpReaderScrollByDrag}
          moveReaderFloatingControl={moveReaderFloatingControl}
          readerBookHandle={readerBookHandle}
          scrollReaderToTop={scrollReaderToTop}
          showReaderChromeControls={showReaderChromeControls}
          stopReaderAutoScroll={stopReaderAutoScroll}
          unlockReaderFloatingControl={unlockReaderFloatingControl}
        />
      )}

      {readerMode === 'scroll' && readerSettings.showCenterNextPrev && readerToolbarVisible && (
        <div className="reader-center-nav" aria-label="章节导航">
          <button onClick={() => openReaderNeighbor(-1)} aria-label="上一章">
            <ChevronsLeft size={20} />
          </button>
          <button onClick={() => openReaderNeighbor(1)} aria-label="下一章">
            <ChevronsRight size={20} />
          </button>
        </div>
      )}

      {toolbarPosition === 'bottom' && topbar}
    </section>
  )
}
