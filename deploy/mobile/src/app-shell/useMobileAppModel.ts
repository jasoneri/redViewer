import { createElement, useRef, useState } from 'react'
import type { AppState } from './useAppState'
import { useMobileWorkspaceLifecycleModel } from './useAppWorkspaceLifecycle'
import { useMicroHeaderStatus } from './useMicroHeaderStatus'
import type { LeftDrawerProps } from './LeftDrawer'
import {
  APP_AUTHOR,
  CHANGELOG_URL,
  CURRENT_LANGUAGE_LABEL,
  DOCS_URL,
  FAQ_URL,
  ISSUES_URL,
  RELEASES_URL,
} from './appMeta'
import { compactPathTail, useMobileAppShellControllerModel } from './useAppShellController'
import { getCgsStatusKey, getCgsStatusPercent } from '../acquire-workspace/acquireCore'
import { AcquireDrawerSettings } from '../acquire-workspace/AcquireWorkspace'
import { useMobileAcquireModel } from '../acquire-workspace/useMobileAcquireModel'
import type { ReaderWorkspaceProps } from '../reader-workspace/ReaderWorkspace'
import { READER_PAGE_FLIP_DURATION_BOUNDS, readerIntervalTimeBoundsForMode } from '../reader-workspace/readerCore'
import { useMobileReaderRuntimeModel } from '../reader-workspace/useReaderRuntime'
import { useMobileShelfModel } from '../library-workspace/useMobileShelfModel'

export type ToastTone = 'ok' | 'warn' | 'error'
type Toast = { tone: ToastTone; text: string } | null

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function useToastController() {
  const [toast, setToast] = useState<Toast>(null)
  const cgsStatusToastKeyRef = useRef('')

  function show(tone: ToastTone, text: string) {
    setToast({ tone, text })
    window.setTimeout(() => setToast(null), 2600)
  }

  function showCgsStatusToast(status: Record<string, unknown> | null) {
    if (!status) return
    const statusKey = getCgsStatusKey(status)
    if (statusKey === 'submitted' || statusKey === cgsStatusToastKeyRef.current) return
    cgsStatusToastKeyRef.current = statusKey
    const percent = getCgsStatusPercent(status)
    if (statusKey === 'completed') {
      show('ok', 'CGS 已入库')
      return
    }
    if (statusKey === 'failed') {
      show('error', 'CGS 入库失败')
      return
    }
    if (statusKey === 'running') {
      show('ok', percent !== null ? `CGS 进行中 ${percent}%` : 'CGS 进行中')
      return
    }
    if (statusKey === 'pending') show('warn', 'CGS 等待中')
  }

  async function openExternalLink(url: string, label: string) {
    try {
      if (typeof window === 'undefined' || typeof window.open !== 'function') {
        throw new Error(`${label} 打开失败`)
      }
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      if (!opened) throw new Error(`${label} 打开失败`)
    } catch (error) {
      show('error', error instanceof Error ? error.message : `${label} 打开失败`)
    }
  }

  return {
    cgsStatusToastKeyRef,
    openExternalLink,
    show,
    showCgsStatusToast,
    toast,
  }
}

export function useMobileAppModel(appState: AppState) {
  const {
    activeItem, activeToolPanel, appVersion, authorAvatarSrc, autoOpenConsumed, autoScrollFrameRef, autoScrollIntervalRef, autoScrollingRef,
    backendDraft, backendInputRef, backendUrl, backendUrlHistory, busy, cached, cacheProgress, cacheSummaryHint, cacheSummaryText,
    cgsBooks, cgsConfig, cgsConfigBusy, cgsConfigDraft, cgsConnection, cgsGateFlight, cgsGateLoadingMode, cgsGatePhase, cgsHeadGateFlight,
    cgsManualGateRef, cgsMcpAbortRef, cgsMcpComposerRef, cgsMcpExpandedToolId, cgsMcpFailedRef, cgsMcpGateRef, cgsMcpHistoryOpen,
    cgsMcpLlmConfig, cgsMcpLlmDraft, cgsMcpModelHelpOpen, cgsMcpPrompt, cgsMcpPromptHistory, cgsMcpRunning, cgsMcpScrollRef,
    cgsMcpSubmittedRef, cgsMcpTimeline, cgsModeSwap, cgsSearchBookInfo, cgsSessionId, cgsStatus, cgsStatusDotRef, cgsStatusHeadRef,
    cgsSubmitDragRef, cgsSubmitPosition, cgsWorkspaceMode, comicConfig, comicPathDraft, connection, deleteHardMode, deviceId,
    doujinTagLinkButtonRef, doujinTagPanel, drawerOpen, edgePointerActiveRef, edgeTipAction, episodePage, episodePageCounts,
    filesystemBusy, filesystemExpandedKeys, filesystemTree, filterDraft, keyword, libraryPage, offlineCoverUrls, offlineCoverUrlsRef,
    openOpsId, pageIndex, pageTouchStartRef, pageTouchSuppressClickRef, pathBusy, pathSegments, pendingReaderProgressRef,
    progressByKey, query, readerAutoScrolling, readerChromeVisible, readerFit, readerFloatingControlPosition, readerFloatingControlRestoreRef,
    readerFloatingControlUnlocked, readerInitialRestorePendingRef, readerLoadedImages, readerMaxScrollTop, readerMode, readerPageFlip,
    readerPageFlipActiveRef, readerPageFlipKeyRef, readerPageJumpOpen, readerPages, readerProgrammaticScrollRef, readerReturnView,
    readerScrollRenderNonce, readerScrollTop, readerSettings, readerSettingsOpen, readerShelfSource, readerUserScrolledRef,
    restoredScrollRef, rootSecretConfigured, rootSecretDraft, rootSecretHelpOpen, scrollProgressTimerRef, scrollReaderRef, selectedBook,
    selectedKeys, selectedShelfSource, selectedSite, seriesOnly, setActiveItem, setActiveToolPanel, setAppVersion, setAuthorAvatarSrc,
    setAutoOpenConsumed, setBackendDraft, setBackendUrl, setBackendUrlHistory, setBusy, setCached, setCacheProgress, setCacheSummaryHint,
    setCacheSummaryText, setCgsBooks, setCgsConfig, setCgsConfigBusy, setCgsConfigDraft, setCgsConnection, setCgsGateFlight,
    setCgsGateLoadingMode, setCgsGatePhase, setCgsHeadGateFlight, setCgsMcpExpandedToolId, setCgsMcpHistoryOpen, setCgsMcpLlmConfig,
    setCgsMcpLlmDraft, setCgsMcpModelHelpOpen, setCgsMcpPrompt, setCgsMcpPromptHistory, setCgsMcpRunning, setCgsMcpTimeline,
    setCgsModeSwap, setCgsSearchBookInfo, setCgsSessionId, setCgsStatus, setCgsSubmitPosition, setCgsWorkspaceMode, setComicConfig,
    setComicPathDraft, setConnection, setDeleteHardMode, setDoujinTagPanel, setDrawerOpen, setEdgeTipAction, setEpisodePage,
    setEpisodePageCounts, setFilesystemBusy, setFilesystemExpandedKeys, setFilesystemTree, setFilterDraft, setKeyword, setLibraryPage,
    setOfflineCoverUrls, setOpenOpsId, setPageIndex, setPathBusy, setPathSegments, setProgressByKey, setQuery, setReaderAutoScrolling,
    setReaderChromeVisible, setReaderFit, setReaderFloatingControlPosition, setReaderFloatingControlUnlocked, setReaderLoadedImages,
    setReaderMaxScrollTop, setReaderMode, setReaderPageFlip, setReaderPageJumpOpen, setReaderPages, setReaderReturnView,
    setReaderScrollTop, setReaderSettings, setReaderSettingsOpen, setReaderShelfSource, setRootSecretConfigured, setRootSecretDraft,
    setRootSecretHelpOpen, setSelectedBook, setSelectedKeys, setSelectedShelfSource, setSelectedSite, setSeriesOnly, setShelf, setSites,
    setSort, setStatusInfo, setStorageBusy, setToolMenuOpen, setView, shelf, sites, sort, statusInfo, storageBusy, toolMenuOpen, view,
  } = appState
  const {
    cgsStatusToastKeyRef,
    openExternalLink,
    show,
    showCgsStatusToast,
    toast,
  } = useToastController()

  const readerRuntime = useMobileReaderRuntimeModel(appState)
  const appShellController = useMobileAppShellControllerModel(appState, show)
  const {
    changeFilesystemExpandedKeys,
    checkBackend,
    cleanupInvalidCache,
    clearBackendDraft,
    discoverBackend,
    handleBooksPathChange,
    loadFilesystemNode,
    moveBackendCaretToEnd,
    refreshCache,
    refreshCacheSummary,
    refreshComicConfig,
    refreshFilesystem,
    refreshLibrary,
    saveBackend,
    saveComicPath,
    saveRootSecret,
  } = appShellController
  const shelfModel = useMobileShelfModel(appState, {
    refreshCache,
    refreshLibrary,
    restoreReaderScrollTop: readerRuntime.restoreReaderScrollTop,
    show,
    stopReaderAutoScroll: readerRuntime.stopReaderAutoScroll,
  })
  const {
    cachedById,
    cachedComplete,
    cachedPages,
    closeDoujinTagPanel,
    detailShelf,
    episodePageCount,
    libraryMetaByCacheKey,
    libraryPageCount,
    loadManifest,
    openCgsTagPanel,
    openDrawerTab,
    openReaderNeighbor,
    pagedEpisodes,
    pagedShelf,
    readerBookHandle,
    selectCgsSearchCandidate,
    selectDoujinTag,
    shelfWorkspace,
  } = shelfModel
  const {
    acquireWorkspace,
    cgsGateBusy,
    switchCgsWorkspaceMode,
  } = useMobileAcquireModel(appState, {
    cgsStatusToastKeyRef,
    closeDoujinTagPanel,
    openCgsTagPanel,
    refreshLibrary,
    selectCgsSearchCandidate,
    selectDoujinTag,
    show,
    showCgsStatusToast,
  })
  const backendAvailable = connection === 'online'
  const backendScanning = busy === 'backend-discovery'
  const backendStatusKnown = connection !== 'unknown'
  const backendStatusText = backendAvailable ? '服务可用' : '服务不可用'
  useMobileWorkspaceLifecycleModel(appState, {
    appShellController,
    readerRuntime,
    shelfModel,
  })

  const libraryTotal = shelf.length
  const pathConfigured = statusInfo.path_configured !== false
  const pathStatusText = pathConfigured ? '书库路径可用' : '书库路径不可用'
  const booksPathValue = comicConfig?.path || comicPathDraft
  const booksPathLabel = compactPathTail(booksPathValue)
  const booksPathActive = comicPathDraft || comicConfig?.path || ''
  const booksPathCurrent = pathSegments[pathSegments.length - 1]?.path || ''
  const comicMode = statusInfo.ero ? 'doujin' : 'manga'
  const comicModeLabel = statusInfo.ero ? '同人志' : '漫画'
  const readerWorkspaceProps: ReaderWorkspaceProps | null = activeItem ? {
    activeItem,
    activeProgress: readerMode === 'scroll'
      ? `${Math.round(readerMaxScrollTop > 0 ? clamp((readerScrollTop / readerMaxScrollTop) * 100, 0, 100) : 0)}%`
      : `${pageIndex + 1} / ${Math.max(readerPages.length || activeItem.page_count, 1)}`,
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
    readerIntervalTimeBounds: readerIntervalTimeBoundsForMode(readerMode),
    readerPageFlipDurationBounds: READER_PAGE_FLIP_DURATION_BOUNDS,
    readerFloatingControlPosition,
    readerFloatingControlUnlocked,
    readerToolbarVisible: readerChromeVisible,
    scrollReaderRef,
    changeReaderMode: readerRuntime.changeReaderMode,
    changeReaderPageFlipDuration: readerRuntime.changeReaderPageFlipDuration,
    changeReaderScrollDragStepPercent: readerRuntime.changeReaderScrollDragStepPercent,
    changeReaderScrollIntervalPixel: readerRuntime.changeReaderScrollIntervalPixel,
    changeReaderScrollIntervalTime: readerRuntime.changeReaderScrollIntervalTime,
    changeReaderShowCenterNextPrev: readerRuntime.changeReaderShowCenterNextPrev,
    changeReaderToolbarPosition: readerRuntime.changeReaderToolbarPosition,
    handleReaderPageClick: readerRuntime.handleReaderPageClick,
    handleReaderPageTouchEnd: readerRuntime.handleReaderPageTouchEnd,
    handleReaderPageTouchStart: readerRuntime.handleReaderPageTouchStart,
    handleReaderScroll: readerRuntime.handleReaderScroll,
    handleScrollImageLoad: readerRuntime.handleScrollImageLoad,
    jumpReaderFirstPage: readerRuntime.jumpReaderFirstPage,
    jumpReaderLastPage: readerRuntime.jumpReaderLastPage,
    jumpReaderPage: (page) => void readerRuntime.jumpReaderPage(page),
    jumpReaderScrollByDrag: readerRuntime.jumpReaderScrollByDrag,
    markReaderUserScroll: readerRuntime.markReaderUserScroll,
    moveReaderFloatingControl: readerRuntime.moveReaderFloatingControl,
    onBack: () => setView(readerReturnView === 'reader' ? 'library' : readerReturnView),
    openReaderNeighbor: (direction) => void openReaderNeighbor(direction as -1 | 1),
    readerBookHandle: (handle) => void readerBookHandle(handle),
    scrollReaderToTop: readerRuntime.scrollReaderToTop,
    showReaderChromeControls: readerRuntime.showReaderChromeControls,
    acceptReaderFloatingControlPosition: readerRuntime.acceptReaderFloatingControlPosition,
    cancelReaderFloatingControlPosition: readerRuntime.cancelReaderFloatingControlPosition,
    unlockReaderFloatingControl: readerRuntime.unlockReaderFloatingControl,
    deleteHardMode,
    setReaderFit,
    setReaderPageJumpOpen,
    setReaderSettingsOpen,
    stopReaderAutoScroll: readerRuntime.stopReaderAutoScroll,
    toggleReaderAutoScroll: readerRuntime.toggleReaderAutoScroll,
  } : null

  const microHeaderStatus = useMicroHeaderStatus({
    booksPathLabel,
    booksPathValue,
    busy,
    cachedComplete,
    cachedLength: cached.length,
    cachedPages,
    cgsConnection,
    cgsGateBusy,
    cgsGatePhase,
    cgsHeadGateFlight,
    cgsInactiveMode: acquireWorkspace.cgsInactiveMode,
    cgsModeSwap,
    cgsModeSwapBusy: acquireWorkspace.cgsModeSwapBusy,
    cgsWorkspaceMode,
    comicMode,
    comicModeLabel,
    connection,
    libraryTotal,
    pathConfigured,
    view,
    cgsStatusDotRef,
    cgsStatusHeadRef,
    switchCgsWorkspaceMode,
  })
  const leftDrawerProps: LeftDrawerProps = {
    open: drawerOpen,
    activeView: view,
    onClose: () => setDrawerOpen(false),
    onOpenTab: openDrawerTab,
    libraryView: {
      appAuthor: APP_AUTHOR,
      appVersion,
      authorAvatarSrc,
      backendAvailable,
      backendDraft,
      backendInputRef,
      backendScanning,
      backendStatusKnown,
      backendStatusText,
      backendUrlHistory,
      booksPathActive,
      booksPathCurrent,
      comicPathDraft,
      currentLanguageLabel: CURRENT_LANGUAGE_LABEL,
      filesystemBusy,
      filesystemExpandedKeys,
      filesystemTree,
      pathBusy,
      pathConfigured,
      pathStatusText,
      rootSecretConfigured,
      rootSecretDraft,
      rootSecretHelpOpen,
    },
    downloadsView: {
      cacheSummaryHint,
      cacheSummaryText,
      storageBusy,
    },
    links: {
      changelog: CHANGELOG_URL,
      docs: DOCS_URL,
      faq: FAQ_URL,
      issues: ISSUES_URL,
      releases: RELEASES_URL,
    },
    actions: {
      changeFilesystemExpandedKeys,
      cleanupInvalidCache,
      clearBackendDraft,
      discoverBackend,
      handleBooksPathChange,
      loadFilesystemNode,
      moveBackendCaretToEnd,
      openExternalLink,
      refreshFilesystem,
      saveBackend,
      saveComicPath,
      saveRootSecret,
      setBackendDraft,
      setRootSecretDraft,
      toggleRootSecretHelp: () => setRootSecretHelpOpen((open) => !open),
    },
    acquireSettings: view === 'acquire' ? createElement(AcquireDrawerSettings, acquireWorkspace.drawerSettingsProps) : null,
  }
  return {
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
  }
}
