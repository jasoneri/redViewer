import type { Dispatch, MouseEvent, MutableRefObject, RefObject, SetStateAction, TouchEvent } from 'react'
import type { AppState } from '../app-shell/useAppState'
import { prefersReducedMotion } from '../acquire-workspace/acquireCore'
import {
  DEFAULT_READER_SETTINGS,
  PAGE_SWIPE_THRESHOLD,
  SCROLL_PROGRESS_DEBOUNCE_MS,
  clampReaderFloatingControlPosition,
  loadReaderFloatingControlPosition,
  normalizeReaderIntervalTime,
  normalizeReaderPageFlipDuration,
  normalizeReaderScrollDragStepPercent,
  readerChromeShouldShow,
  readerChromeShouldShowPage,
  saveReaderFloatingControlPosition,
  type ReaderFloatingControlPosition,
  type ReaderItem,
  type ReaderMode,
  type ReaderPageFlipState,
  type ReaderProgress,
  type ReaderSettings,
  type ReaderToolbarPosition,
} from './readerCore'
import {
  queueProgress,
  saveProgress,
  syncProgress,
  type ConnectionState,
  type Progress,
} from '../mobileStore'
import { progressIdentity, type ProgressMap } from '../library-workspace/libraryCore'

type ReaderRuntimeDeps = {
  activeItem: ReaderItem | null
  backendUrl: string
  deviceId: string
  pageIndex: number
  prefersReducedMotion: () => boolean
  progressIdentity: (book: string, ep: string) => string
  readerAutoScrolling: boolean
  readerFloatingControlPosition: ReaderFloatingControlPosition
  readerLoadedImages: number
  readerMaxScrollTop: number
  readerMode: ReaderMode
  readerPages: string[]
  readerScrollTop: number
  readerSettings: ReaderSettings
  readerShelfSource: 'library' | 'downloads'
  statusInfo: { mobile_contract?: boolean }
  autoScrollFrameRef: MutableRefObject<number | null>
  autoScrollIntervalRef: MutableRefObject<number | null>
  autoScrollingRef: MutableRefObject<boolean>
  pageTouchStartRef: MutableRefObject<{ x: number; y: number }>
  pageTouchSuppressClickRef: MutableRefObject<boolean>
  pendingReaderProgressRef: MutableRefObject<ReaderProgress>
  readerFloatingControlRestoreRef: MutableRefObject<ReaderFloatingControlPosition | null>
  readerInitialRestorePendingRef: MutableRefObject<boolean>
  readerPageFlipActiveRef: MutableRefObject<boolean>
  readerPageFlipKeyRef: MutableRefObject<number>
  readerProgrammaticScrollRef: MutableRefObject<boolean>
  readerUserScrolledRef: MutableRefObject<boolean>
  scrollProgressTimerRef: MutableRefObject<number | null>
  scrollReaderRef: RefObject<HTMLDivElement | null>
  setConnection: (connection: ConnectionState) => void
  setPageIndex: Dispatch<SetStateAction<number>>
  setProgressByKey: Dispatch<SetStateAction<ProgressMap>>
  setReaderAutoScrolling: Dispatch<SetStateAction<boolean>>
  setReaderChromeVisible: Dispatch<SetStateAction<boolean>>
  setReaderFloatingControlPosition: Dispatch<SetStateAction<ReaderFloatingControlPosition>>
  setReaderFloatingControlUnlocked: Dispatch<SetStateAction<boolean>>
  setReaderLoadedImages: Dispatch<SetStateAction<number>>
  setReaderMaxScrollTop: Dispatch<SetStateAction<number>>
  setReaderMode: Dispatch<SetStateAction<ReaderMode>>
  setReaderPageFlip: Dispatch<SetStateAction<ReaderPageFlipState | null>>
  setReaderPageJumpOpen: Dispatch<SetStateAction<boolean>>
  setReaderScrollTop: Dispatch<SetStateAction<number>>
  setReaderSettings: Dispatch<SetStateAction<ReaderSettings>>
  setReaderSettingsOpen: Dispatch<SetStateAction<boolean>>
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function useReaderRuntime(deps: ReaderRuntimeDeps) {
  async function saveReaderProgress(nextProgress: ReaderProgress) {
    if (!deps.activeItem || !deps.readerPages.length) return
    const safePageIndex = clamp(nextProgress.page_index, 0, Math.max(deps.readerPages.length - 1, 0))
    const safeScrollTop = Math.max(0, Math.round(nextProgress.scroll_top))
    deps.pendingReaderProgressRef.current = {
      page_index: safePageIndex,
      scroll_top: safeScrollTop,
      reading_mode: nextProgress.reading_mode,
    }
    if (nextProgress.reading_mode === 'page') {
      deps.setPageIndex(safePageIndex)
      deps.setReaderChromeVisible(readerChromeShouldShowPage(safePageIndex, deps.readerPages.length))
    }
    if (nextProgress.reading_mode === 'scroll') {
      deps.setReaderScrollTop(safeScrollTop)
      deps.setReaderChromeVisible(readerChromeShouldShow(safeScrollTop, deps.readerMaxScrollTop, deps.readerPages.length))
    }
    const progress: Progress = {
      book: deps.activeItem.book,
      ep: deps.activeItem.ep,
      device_id: deps.deviceId,
      page_index: safePageIndex,
      scroll_top: safeScrollTop,
      reading_mode: nextProgress.reading_mode,
      status: nextProgress.reading_mode === 'page'
        ? (safePageIndex >= deps.readerPages.length - 1 ? 'completed' : 'reading')
        : (safeScrollTop >= deps.readerMaxScrollTop && deps.readerMaxScrollTop > 0 ? 'completed' : 'reading'),
      updated_at: Date.now(),
    }
    await saveProgress(progress)
    deps.setProgressByKey((state) => ({ ...state, [deps.progressIdentity(deps.activeItem!.book, deps.activeItem!.ep)]: progress }))
    if (deps.readerShelfSource === 'downloads') {
      await queueProgress(progress)
      return
    }
    try {
      await syncProgress(deps.backendUrl, progress)
    } catch {
      if (deps.statusInfo.mobile_contract === false) return
      await queueProgress(progress)
      deps.setConnection('offline_cache_only')
    }
  }

  function setReaderToolbarVisible(nextVisible: boolean) {
    deps.setReaderChromeVisible(nextVisible)
  }

  function clearReaderPageFlip() {
    deps.readerPageFlipActiveRef.current = false
    deps.setReaderPageFlip(null)
  }

  async function preloadReaderPageImage(src: string): Promise<void> {
    if (typeof window === 'undefined' || !src) return
    await new Promise<void>((resolve) => {
      const image = new window.Image()
      let settled = false
      const settle = () => {
        if (settled) return
        settled = true
        resolve()
      }
      image.onload = settle
      image.onerror = settle
      image.src = src
      if (image.complete) settle()
    })
  }

  async function requestReaderPageTurn(toIndex: number, options?: { animated?: boolean }) {
    const safe = clamp(toIndex, 0, Math.max(deps.readerPages.length - 1, 0))
    const fromIndex = deps.pendingReaderProgressRef.current.reading_mode === 'page'
      ? deps.pendingReaderProgressRef.current.page_index
      : deps.pageIndex
    if (safe === fromIndex) return

    const shouldAnimate = options?.animated !== false
      && deps.readerMode === 'page'
      && !deps.readerPageFlipActiveRef.current
      && !deps.prefersReducedMotion()
      && Math.abs(safe - fromIndex) === 1

    if (!shouldAnimate) {
      if (deps.readerPageFlipActiveRef.current) return
      await saveReaderProgress({ page_index: safe, scroll_top: 0, reading_mode: 'page' })
      return
    }

    const fromSrc = deps.readerPages[fromIndex]
    const toSrc = deps.readerPages[safe]
    if (!fromSrc || !toSrc) {
      await saveReaderProgress({ page_index: safe, scroll_top: 0, reading_mode: 'page' })
      return
    }

    deps.readerPageFlipActiveRef.current = true
    let key = 0
    try {
      await preloadReaderPageImage(toSrc)
      const durationMs = normalizeReaderPageFlipDuration(deps.readerSettings.pageFlipDurationMs)
      deps.readerPageFlipKeyRef.current += 1
      key = deps.readerPageFlipKeyRef.current
      deps.setReaderPageFlip({
        direction: safe > fromIndex ? 'next' : 'prev',
        durationMs,
        fromIndex,
        fromSrc,
        key,
        toIndex: safe,
        toSrc,
      })
      await waitReaderPageFlip(durationMs)
      if (deps.readerPageFlipKeyRef.current === key) {
        await saveReaderProgress({ page_index: safe, scroll_top: 0, reading_mode: 'page' })
      }
    } finally {
      if (!key || deps.readerPageFlipKeyRef.current === key) clearReaderPageFlip()
    }
  }

  async function waitReaderPageFlip(durationMs: number) {
    if (durationMs <= 0) return
    await new Promise<void>((resolve) => window.setTimeout(resolve, durationMs))
  }

  async function jumpReaderPage(next: number) {
    const safe = clamp(next, 0, Math.max(deps.readerPages.length - 1, 0))
    if (deps.readerMode === 'scroll') {
      const image = deps.scrollReaderRef.current?.querySelectorAll('img')[safe]
      image?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }
    await requestReaderPageTurn(safe)
  }

  function handleReaderScroll() {
    const scroller = deps.scrollReaderRef.current
    if (!scroller || !deps.activeItem || !deps.readerPages.length) return
    const scrollTop = Math.max(scroller.scrollTop, 0)
    const maxScrollTop = Math.max(scroller.scrollHeight - scroller.clientHeight, 0)
    const pageIndexFromScroll = pageIndexFromScrollTop(scroller, scrollTop)
    const isProgrammaticScroll = deps.readerProgrammaticScrollRef.current
    deps.readerProgrammaticScrollRef.current = false
    const isLayoutScrollDuringInitialRestore = !isProgrammaticScroll && !deps.readerUserScrolledRef.current && deps.readerInitialRestorePendingRef.current
    if (!isLayoutScrollDuringInitialRestore) {
      deps.pendingReaderProgressRef.current = {
        page_index: pageIndexFromScroll,
        scroll_top: Math.round(scrollTop),
        reading_mode: 'scroll',
      }
    }
    deps.setReaderScrollTop(scrollTop)
    deps.setReaderMaxScrollTop(maxScrollTop)
    deps.setPageIndex(pageIndexFromScroll)
    deps.setReaderChromeVisible(readerChromeShouldShow(scrollTop, maxScrollTop, deps.readerPages.length))
    if (isLayoutScrollDuringInitialRestore) return
    if (deps.scrollProgressTimerRef.current !== null) window.clearTimeout(deps.scrollProgressTimerRef.current)
    deps.scrollProgressTimerRef.current = window.setTimeout(() => {
      void saveReaderProgress({ page_index: pageIndexFromScroll, scroll_top: scrollTop, reading_mode: 'scroll' })
    }, SCROLL_PROGRESS_DEBOUNCE_MS)
  }

  function handleReaderPageClick(event: MouseEvent<HTMLDivElement>) {
    if (deps.readerMode !== 'page') return
    if (deps.pageTouchSuppressClickRef.current) {
      deps.pageTouchSuppressClickRef.current = false
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const clickXRatio = (event.clientX - rect.left) / Math.max(rect.width, 1)
    if (clickXRatio < 0.5) {
      if (deps.pageIndex > 0) void jumpReaderPage(deps.pageIndex - 1)
      return
    }
    if (deps.pageIndex < deps.readerPages.length - 1) void jumpReaderPage(deps.pageIndex + 1)
  }

  function handleReaderPageTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    if (!touch) return
    deps.pageTouchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleReaderPageTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0]
    if (!touch) return
    const deltaX = touch.clientX - deps.pageTouchStartRef.current.x
    const deltaY = touch.clientY - deps.pageTouchStartRef.current.y
    if (Math.abs(deltaX) <= Math.abs(deltaY) || Math.abs(deltaX) <= PAGE_SWIPE_THRESHOLD) return
    deps.pageTouchSuppressClickRef.current = true
    if (deltaX > 0) void jumpReaderPage(deps.pageIndex - 1)
    else void jumpReaderPage(deps.pageIndex + 1)
  }

  function handleScrollImageLoad() {
    deps.setReaderLoadedImages((loaded) => {
      const nextLoaded = loaded + 1
      window.requestAnimationFrame(() => {
        calculateReaderScrollHeight()
        if (nextLoaded === deps.readerPages.length && deps.readerInitialRestorePendingRef.current && !deps.readerUserScrolledRef.current) {
          restoreReaderScrollTop()
        }
      })
      return nextLoaded
    })
  }

  function calculateReaderScrollHeight() {
    const scroller = deps.scrollReaderRef.current
    if (!scroller) return
    deps.setReaderMaxScrollTop(Math.max(scroller.scrollHeight - scroller.clientHeight, 0))
  }

  function restoreReaderScrollTop() {
    if (deps.readerMode !== 'scroll' || !deps.activeItem) return
    const scroller = deps.scrollReaderRef.current
    if (!scroller) return
    const maxScrollTop = Math.max(scroller.scrollHeight - scroller.clientHeight, 0)
    const targetScrollTop = Math.max(deps.pendingReaderProgressRef.current.scroll_top, 0)
    const scrollTop = clamp(targetScrollTop, 0, maxScrollTop)
    deps.readerProgrammaticScrollRef.current = true
    scroller.scrollTop = scrollTop
    deps.setReaderScrollTop(scrollTop)
    deps.setReaderMaxScrollTop(maxScrollTop)
    deps.setReaderChromeVisible(readerChromeShouldShow(scrollTop, maxScrollTop, deps.readerPages.length))
    if (targetScrollTop <= maxScrollTop || deps.readerLoadedImages >= deps.readerPages.length) {
      deps.readerInitialRestorePendingRef.current = false
    }
  }

  function markReaderUserScroll() {
    deps.readerUserScrolledRef.current = true
    deps.readerInitialRestorePendingRef.current = false
  }

  function showReaderChromeControls() {
    deps.setReaderChromeVisible(true)
    deps.setReaderSettingsOpen(false)
  }

  function moveReaderFloatingControl(position: ReaderFloatingControlPosition) {
    deps.setReaderFloatingControlPosition(clampReaderFloatingControlPosition(position))
  }

  function unlockReaderFloatingControl() {
    if (deps.readerMode !== 'scroll') return
    deps.readerFloatingControlRestoreRef.current = deps.readerFloatingControlPosition
    deps.setReaderFloatingControlUnlocked(true)
    deps.setReaderChromeVisible(true)
    deps.setReaderSettingsOpen(false)
  }

  function acceptReaderFloatingControlPosition() {
    const next = saveReaderFloatingControlPosition(deps.readerFloatingControlPosition)
    deps.setReaderFloatingControlPosition(next)
    deps.setReaderFloatingControlUnlocked(false)
    deps.readerFloatingControlRestoreRef.current = null
  }

  function cancelReaderFloatingControlPosition() {
    deps.setReaderFloatingControlPosition(deps.readerFloatingControlRestoreRef.current || loadReaderFloatingControlPosition())
    deps.setReaderFloatingControlUnlocked(false)
    deps.readerFloatingControlRestoreRef.current = null
  }

  function pageIndexFromScrollTop(scroller: HTMLDivElement, scrollTop: number): number {
    const images = Array.from(scroller.querySelectorAll('img'))
    if (!images.length) return 0
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    images.forEach((image, index) => {
      const distance = Math.abs(image.offsetTop - scrollTop)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })
    return nearestIndex
  }

  function jumpReaderScrollByDrag(dragRatio: number) {
    const scroller = deps.scrollReaderRef.current
    if (!scroller || deps.readerMode !== 'scroll') return
    const maxScrollTop = Math.max(scroller.scrollHeight - scroller.clientHeight, 0)
    const ratio = clamp(dragRatio, -1, 1)
    const maxStep = maxScrollTop * (normalizeReaderScrollDragStepPercent(deps.readerSettings.scrollDragStepPercent) / 100)
    const nextScrollTop = clamp(scroller.scrollTop + maxStep * ratio, 0, maxScrollTop)
    const pageIndexFromScroll = pageIndexFromScrollTop(scroller, nextScrollTop)
    deps.readerUserScrolledRef.current = true
    deps.readerInitialRestorePendingRef.current = false
    deps.pendingReaderProgressRef.current = {
      page_index: pageIndexFromScroll,
      scroll_top: Math.round(nextScrollTop),
      reading_mode: 'scroll',
    }
    scroller.scrollTop = nextScrollTop
    deps.setReaderScrollTop(nextScrollTop)
    deps.setReaderMaxScrollTop(maxScrollTop)
    deps.setPageIndex(pageIndexFromScroll)
    deps.setReaderChromeVisible(readerChromeShouldShow(nextScrollTop, maxScrollTop, deps.readerPages.length))
  }

  function scrollReaderToTop() {
    const scroller = deps.scrollReaderRef.current
    if (!scroller) return
    deps.readerUserScrolledRef.current = true
    deps.readerInitialRestorePendingRef.current = false
    deps.pendingReaderProgressRef.current = { page_index: 0, scroll_top: 0, reading_mode: 'scroll' }
    scroller.scrollTop = 0
    deps.setReaderScrollTop(0)
    deps.setPageIndex(0)
    deps.setReaderChromeVisible(true)
  }

  function toggleReaderAutoScroll() {
    if (deps.readerAutoScrolling) stopReaderAutoScroll()
    else startReaderAutoScroll()
  }

  function jumpReaderFirstPage() {
    void jumpReaderPage(0)
  }

  function jumpReaderLastPage() {
    void jumpReaderPage(Math.max(deps.readerPages.length - 1, 0))
  }

  function changeReaderMode(nextMode: ReaderMode) {
    if (nextMode === deps.readerMode) return
    stopReaderAutoScroll()
    deps.setReaderMode(nextMode)
    deps.setReaderSettings((state) => ({
      ...state,
      readingMode: nextMode,
      scrollIntervalTime: normalizeReaderIntervalTime(state.scrollIntervalTime, nextMode),
    }))
    deps.setReaderSettingsOpen(false)
    deps.setReaderPageJumpOpen(false)
    if (nextMode === 'page') {
      void saveReaderProgress({ page_index: deps.pageIndex, scroll_top: 0, reading_mode: 'page' })
      return
    }
    deps.pendingReaderProgressRef.current = {
      page_index: deps.pageIndex,
      scroll_top: deps.readerScrollTop,
      reading_mode: 'scroll',
    }
    deps.setReaderChromeVisible(true)
    window.setTimeout(restoreReaderScrollTop, 0)
  }

  function changeReaderShowCenterNextPrev(next: boolean) {
    deps.setReaderSettings((state) => ({ ...state, showCenterNextPrev: next }))
  }

  function changeReaderScrollIntervalTime(next: number) {
    deps.setReaderSettings((state) => ({ ...state, scrollIntervalTime: normalizeReaderIntervalTime(next, state.readingMode) }))
  }

  function changeReaderScrollIntervalPixel(next: number) {
    deps.setReaderSettings((state) => ({ ...state, scrollIntervalPixel: Math.max(1, Math.round(next) || DEFAULT_READER_SETTINGS.scrollIntervalPixel) }))
  }

  function changeReaderScrollDragStepPercent(next: number) {
    deps.setReaderSettings((state) => ({ ...state, scrollDragStepPercent: normalizeReaderScrollDragStepPercent(next) }))
  }

  function changeReaderPageFlipDuration(next: number) {
    deps.setReaderSettings((state) => ({ ...state, pageFlipDurationMs: normalizeReaderPageFlipDuration(next) }))
  }

  function changeReaderToolbarPosition(next: ReaderToolbarPosition) {
    deps.setReaderSettings((state) => ({ ...state, toolbarPosition: next === 'bottom' ? 'bottom' : 'top' }))
  }

  function startReaderAutoScroll() {
    if (!deps.activeItem) return
    stopReaderAutoScroll()
    deps.setReaderSettingsOpen(false)
    const intervalTime = normalizeReaderIntervalTime(deps.readerSettings.scrollIntervalTime, deps.readerMode)
    if (deps.readerMode === 'page') {
      const lastPageIndex = deps.readerPages.length - 1
      if (lastPageIndex <= 0 || deps.pageIndex >= lastPageIndex) return
      // RVUX0003: auto-page starts from settings but stops from the page indicator.
      deps.setReaderPageJumpOpen(false)
      let turning = false
      deps.autoScrollingRef.current = true
      deps.setReaderAutoScrolling(true)
      deps.autoScrollIntervalRef.current = window.setInterval(() => {
        if (turning) return
        const currentPageIndex = deps.pendingReaderProgressRef.current.reading_mode === 'page'
          ? deps.pendingReaderProgressRef.current.page_index
          : deps.pageIndex
        if (currentPageIndex >= lastPageIndex) {
          stopReaderAutoScroll()
          return
        }
        const nextPageIndex = currentPageIndex + 1
        turning = true
        void jumpReaderPage(nextPageIndex).finally(() => {
          turning = false
          if (nextPageIndex >= lastPageIndex) stopReaderAutoScroll()
        })
      }, intervalTime)
      return
    }
    deps.autoScrollingRef.current = true
    deps.setReaderAutoScrolling(true)
    const animateMode = intervalTime <= 200 && deps.readerSettings.scrollIntervalPixel <= 20
    if (animateMode) {
      let lastTimestamp = 0
      let currentSpeed = 0
      const targetSpeed = deps.readerSettings.scrollIntervalPixel / Math.max(intervalTime, 1)
      const acceleration = 0.002
      const maxSpeed = targetSpeed * 1.2
      const step = (timestamp: number) => {
        if (!deps.autoScrollingRef.current) return
        if (!lastTimestamp) lastTimestamp = timestamp
        const deltaTime = timestamp - lastTimestamp
        lastTimestamp = timestamp
        const scroller = deps.scrollReaderRef.current
        if (!scroller) {
          stopReaderAutoScroll()
          return
        }
        const currentScrollTop = scroller.scrollTop
        const maxScrollTop = Math.max(scroller.scrollHeight - scroller.clientHeight, 0)
        if (currentScrollTop >= maxScrollTop) {
          stopReaderAutoScroll()
          return
        }
        currentSpeed = Math.min(currentSpeed + acceleration * deltaTime, maxSpeed)
        const nextScrollTop = clamp(currentScrollTop + currentSpeed * deltaTime, 0, maxScrollTop)
        scroller.scrollTop = nextScrollTop
        deps.setReaderScrollTop(nextScrollTop)
        deps.autoScrollFrameRef.current = window.requestAnimationFrame(step)
      }
      deps.autoScrollFrameRef.current = window.requestAnimationFrame(step)
      return
    }
    deps.autoScrollIntervalRef.current = window.setInterval(() => {
      const scroller = deps.scrollReaderRef.current
      if (!scroller) {
        stopReaderAutoScroll()
        return
      }
      const currentScrollTop = scroller.scrollTop
      const maxScrollTop = Math.max(scroller.scrollHeight - scroller.clientHeight, 0)
      const nextScrollTop = clamp(currentScrollTop + deps.readerSettings.scrollIntervalPixel, 0, maxScrollTop)
      scroller.scrollTop = nextScrollTop
      deps.setReaderScrollTop(nextScrollTop)
      if (nextScrollTop >= maxScrollTop) stopReaderAutoScroll()
    }, intervalTime)
  }

  function stopReaderAutoScroll() {
    deps.autoScrollingRef.current = false
    deps.setReaderAutoScrolling(false)
    if (deps.autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(deps.autoScrollFrameRef.current)
      deps.autoScrollFrameRef.current = null
    }
    if (deps.autoScrollIntervalRef.current !== null) {
      window.clearInterval(deps.autoScrollIntervalRef.current)
      deps.autoScrollIntervalRef.current = null
    }
  }

  return {
    acceptReaderFloatingControlPosition,
    calculateReaderScrollHeight,
    cancelReaderFloatingControlPosition,
    changeReaderMode,
    changeReaderPageFlipDuration,
    changeReaderScrollDragStepPercent,
    changeReaderScrollIntervalPixel,
    changeReaderScrollIntervalTime,
    changeReaderShowCenterNextPrev,
    changeReaderToolbarPosition,
    clearReaderPageFlip,
    handleReaderPageClick,
    handleReaderPageTouchEnd,
    handleReaderPageTouchStart,
    handleReaderScroll,
    handleScrollImageLoad,
    jumpReaderFirstPage,
    jumpReaderLastPage,
    jumpReaderPage,
    jumpReaderScrollByDrag,
    markReaderUserScroll,
    moveReaderFloatingControl,
    requestReaderPageTurn,
    restoreReaderScrollTop,
    saveReaderProgress,
    scrollReaderToTop,
    setReaderToolbarVisible,
    showReaderChromeControls,
    stopReaderAutoScroll,
    toggleReaderAutoScroll,
    unlockReaderFloatingControl,
  }
}

export function useMobileReaderRuntimeModel(appState: AppState) {
  const {
    activeItem,
    backendUrl,
    deviceId,
    pageIndex,
    readerAutoScrolling,
    readerFloatingControlPosition,
    readerLoadedImages,
    readerMaxScrollTop,
    readerMode,
    readerPages,
    readerScrollTop,
    readerSettings,
    readerShelfSource,
    statusInfo,
    autoScrollFrameRef,
    autoScrollIntervalRef,
    autoScrollingRef,
    pageTouchStartRef,
    pageTouchSuppressClickRef,
    pendingReaderProgressRef,
    readerFloatingControlRestoreRef,
    readerInitialRestorePendingRef,
    readerPageFlipActiveRef,
    readerPageFlipKeyRef,
    readerProgrammaticScrollRef,
    readerUserScrolledRef,
    scrollProgressTimerRef,
    scrollReaderRef,
    setConnection,
    setPageIndex,
    setProgressByKey,
    setReaderAutoScrolling,
    setReaderChromeVisible,
    setReaderFloatingControlPosition,
    setReaderFloatingControlUnlocked,
    setReaderLoadedImages,
    setReaderMaxScrollTop,
    setReaderMode,
    setReaderPageFlip,
    setReaderPageJumpOpen,
    setReaderScrollTop,
    setReaderSettings,
    setReaderSettingsOpen,
  } = appState

  return useReaderRuntime({
    activeItem,
    backendUrl,
    deviceId,
    pageIndex,
    prefersReducedMotion,
    progressIdentity,
    readerAutoScrolling,
    readerFloatingControlPosition,
    readerLoadedImages,
    readerMaxScrollTop,
    readerMode,
    readerPages,
    readerScrollTop,
    readerSettings,
    readerShelfSource,
    statusInfo,
    autoScrollFrameRef,
    autoScrollIntervalRef,
    autoScrollingRef,
    pageTouchStartRef,
    pageTouchSuppressClickRef,
    pendingReaderProgressRef,
    readerFloatingControlRestoreRef,
    readerInitialRestorePendingRef,
    readerPageFlipActiveRef,
    readerPageFlipKeyRef,
    readerProgrammaticScrollRef,
    readerUserScrolledRef,
    scrollProgressTimerRef,
    scrollReaderRef,
    setConnection,
    setPageIndex,
    setProgressByKey,
    setReaderAutoScrolling,
    setReaderChromeVisible,
    setReaderFloatingControlPosition,
    setReaderFloatingControlUnlocked,
    setReaderLoadedImages,
    setReaderMaxScrollTop,
    setReaderMode,
    setReaderPageFlip,
    setReaderPageJumpOpen,
    setReaderScrollTop,
    setReaderSettings,
    setReaderSettingsOpen,
  })
}
