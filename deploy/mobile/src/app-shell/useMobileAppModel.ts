import { invoke } from '@tauri-apps/api/core'
import { createElement, useEffect, useRef, useState } from 'react'
import type { AppState } from './useAppState'
import { useMobileWorkspaceLifecycleModel } from './useAppWorkspaceLifecycle'
import { useMicroHeaderStatus } from './useMicroHeaderStatus'
import type { LeftDrawerProps } from './LeftDrawer'
import {
  APP_AUTHOR,
  CHANGELOG_URL,
  CURRENT_LANGUAGE_LABEL,
  DEFAULT_BACKEND,
  DOCS_URL,
  FAQ_URL,
  ISSUES_URL,
  MENU_LOGO_SRC,
  RELEASES_URL,
} from './appMeta'
import { compactPathTail, useMobileAppShellControllerModel } from './useAppShellController'
import { restoreCustomSettingsStorage, setSelectedSkinId } from './customSettingsStorage'
import { getCgsStatusKey, getCgsStatusPercent, loadCgsMcpLlmConfig, loadCgsMcpPreferenceState } from '../acquire-workspace/acquireCore'
import { AcquireDrawerSettings } from '../acquire-workspace/AcquireWorkspace'
import { useMobileAcquireModel } from '../acquire-workspace/useMobileAcquireModel'
import type { RvAgentSuccessTarget } from '../acquire-workspace/acquireTypes'
import type { ReaderWorkspaceProps } from '../reader-workspace/ReaderWorkspace'
import { READER_PAGE_FLIP_DURATION_BOUNDS, readerIntervalTimeBoundsForMode } from '../reader-workspace/readerCore'
import { useMobileReaderRuntimeModel } from '../reader-workspace/useReaderRuntime'
import { useMobileShelfModel } from '../library-workspace/useMobileShelfModel'
import {
  cleanupExpiredOfflineReadCache,
  DEFAULT_OFFLINE_READ_CLEANUP_CONFIG,
  loadOfflineReadCleanupConfig,
  saveOfflineReadCleanupConfig,
} from '../mobileStore'

export type ToastTone = 'ok' | 'warn' | 'error'
type Toast = { tone: ToastTone; text: string } | null

const OFFLINE_READ_CLEANUP_SWEEP_MS = 5 * 60 * 1000

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

export function useMobileAppModel(appState: AppState, options?: { onRootSecretSaved?: () => void }) {
  const [offlineDelAfterHourDraft, setOfflineDelAfterHourDraft] = useState(() => String(loadOfflineReadCleanupConfig().delAfterHours))
  const offlineReadCleanupRunningRef = useRef(false)
  const readerImageSavingRef = useRef(false)
  const {
    activeItem, appVersion, authorAvatarSrc,
    backendDraft, backendInputRef, backendUrl, backendUrlHistory, busy, cached, cacheSummaryHint, cacheSummaryText,
    cgsConnection, cgsGatePhase, cgsHeadGateFlight,
    cgsModeSwap, cgsStatusDotRef, cgsStatusHeadRef,
    cgsWorkspaceMode, comicConfig, comicPathDraft, connection, deleteHardMode,
    drawerOpen,
    filesystemBusy, filesystemExpandedKeys, filesystemTree,
    pageIndex, pathBusy, pathSegments,
    readerAutoScrolling, readerChromeVisible, readerFit, readerFloatingControlPosition,
    readerMaxScrollTop, readerMode, readerPageFlip,
    readerPageJumpOpen, readerPages, readerReturnView,
    readerScrollRenderNonce, readerScrollTop, readerSettings, readerSettingsOpen,
    rootSecretAuthorized, rootSecretConfigured, rootSecretDraft, rootSecretHelpOpen, scrollReaderRef, selectedBook,
    setAuthorAvatarSrc,
    setBackendDraft, setBackendUrl, setBackendUrlHistory,
    setCgsMcpLlmConfig, setCgsMcpLlmDraft,
    setDeleteHardMode, setDrawerOpen,
    setRvAgentHistoryOpen, setRvAgentModelHelpOpen, setRvAgentPreferenceOpen, setRvAgentPreferenceState, setRvAgentPromptHistory,
    setReaderFit,
    setReaderPageJumpOpen,
    setReaderSettingsOpen, setRootSecretConfigured, setRootSecretDraft,
    setRootSecretHelpOpen, setSelectedBook, setSelectedShelfSource,
    setView, shelf, sort, statusInfo, storageBusy, view,
  } = appState
  const {
    cgsStatusToastKeyRef,
    openExternalLink,
    show,
    showCgsStatusToast,
    toast,
  } = useToastController()

  const readerRuntime = useMobileReaderRuntimeModel(appState)
  const appShellController = useMobileAppShellControllerModel(appState, show, { onRootSecretSaved: options?.onRootSecretSaved })
  const {
    authorizeStoredRootSecret,
    changeFilesystemExpandedKeys,
    clearCache,
    cleanupInvalidCache,
    clearBackendDraft,
    discoverBackend,
    handleBooksPathChange,
    loadFilesystemNode,
    moveBackendCaretToEnd,
    refreshCache,
    refreshFilesystem,
    refreshLibrary,
    saveBackend,
    saveComicPath,
    saveRootSecret,
  } = appShellController

  async function runOfflineReadCleanup() {
    if (offlineReadCleanupRunningRef.current) return
    offlineReadCleanupRunningRef.current = true
    try {
      const result = await cleanupExpiredOfflineReadCache()
      if (result.removed > 0) await refreshCache()
    } catch {
      // Silent by design: read cleanup should not interrupt the drawer/reader flow.
    } finally {
      offlineReadCleanupRunningRef.current = false
    }
  }

  async function saveOfflineConfig() {
    const saved = saveOfflineReadCleanupConfig({ delAfterHours: Number(offlineDelAfterHourDraft) })
    setOfflineDelAfterHourDraft(String(saved.delAfterHours))
    await runOfflineReadCleanup()
  }

  useEffect(() => {
    void runOfflineReadCleanup()
    const timer = window.setInterval(() => void runOfflineReadCleanup(), OFFLINE_READ_CLEANUP_SWEEP_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void runOfflineReadCleanup()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  async function authorizeAcquire(): Promise<boolean> {
    if (rootSecretAuthorized) return true
    return authorizeStoredRootSecret()
  }

  const shelfModel = useMobileShelfModel(appState, {
    authorizeAcquire,
    refreshCache,
    refreshLibrary,
    restoreReaderScrollTop: readerRuntime.restoreReaderScrollTop,
    show,
    stopReaderAutoScroll: readerRuntime.stopReaderAutoScroll,
  })
  const {
    cachedComplete,
    cachedPages,
    closeDoujinTagPanel,
    openCgsTagPanel,
    openDrawerTab,
    openReaderNeighbor,
    openSourceItem,
    readerBookHandle,
    selectCgsSearchCandidate,
    selectDoujinTag,
    shelfWorkspace,
  } = shelfModel
  async function openAcquireSuccessTarget(target: RvAgentSuccessTarget) {
    const latestShelf = target.kind === 'detail' ? await refreshLibrary(backendUrl, sort, false, false, true) : shelf
    const targetBook = latestShelf.find((book) => book.id === target.shelfBookId)
    if (!targetBook) {
      show('warn', '结果已同步，但当前书架里未定位到目标')
      return
    }
    setDrawerOpen(false)
    if (target.kind === 'detail') {
      setSelectedShelfSource('library')
      setSelectedBook(targetBook)
      setView('library')
      return
    }
    const readerItem = targetBook.kind === 'single'
      ? targetBook
      : target.itemId ? targetBook.episodes.find((item) => item.id === target.itemId) : undefined
    if (!readerItem) {
      show('warn', '结果已同步，但当前阅读目标未定位到章节')
      return
    }
    await openSourceItem(readerItem, 'library')
  }
  function openRvAgentLlmConfig() {
    setDrawerOpen(true)
    openDrawerTab('acquire')
  }
  const {
    acquireWorkspace,
    cgsGateBusy,
    switchCgsWorkspaceMode,
  } = useMobileAcquireModel(appState, {
    cgsStatusToastKeyRef,
    closeDoujinTagPanel,
    openCgsTagPanel,
    openRvAgentLlmConfig,
    openSuccessTarget: openAcquireSuccessTarget,
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
  const activeReaderShelfItem = activeItem
    ? shelf.find((book) => {
      if (book.book !== activeItem.book) return false
      if (book.kind === 'single') return book.ep === activeItem.ep
      return book.episodes.some((episode) => episode.ep === activeItem.ep)
    })
    : undefined
  const activeReaderShelfEpisode = activeReaderShelfItem?.episodes.find((episode) => episode.ep === activeItem?.ep)
  const activeReaderFallbackMeta = activeReaderShelfEpisode?.meta || activeReaderShelfItem?.meta
  const activeReaderItem = activeItem ? {
    ...activeItem,
    meta: {
      ...activeItem.meta,
      source: activeItem.meta?.source || activeReaderFallbackMeta?.source || null,
      btype: activeItem.meta?.btype || activeReaderFallbackMeta?.btype || null,
    },
  } : null

  async function saveReaderImageToGallery(imageUrl: string, imagePageIndex: number) {
    if (readerImageSavingRef.current) return
    if (!activeReaderItem) {
      show('error', '保存失败：未定位到当前页面')
      return
    }

    readerImageSavingRef.current = true
    const timestamp = new Date().getTime()
    const title = activeReaderItem.book || activeReaderItem.title
    const filename = `${title}_page${imagePageIndex + 1}_${timestamp}.jpg`
      .replace(/[/\\:*?"<>|]/g, '_')

    try {
      const success = await invoke<boolean>('save_image_to_gallery', {
        url: imageUrl,
        filename,
      })
      show(success ? 'ok' : 'error', success ? '图片已保存到相册' : '保存失败')
    } catch (error) {
      console.error('保存图片失败:', error)
      const message = error instanceof Error ? error.message : String(error)
      show('error', `保存失败: ${message}`)
    } finally {
      readerImageSavingRef.current = false
    }
  }

  const readerWorkspaceProps: ReaderWorkspaceProps | null = activeReaderItem ? {
    activeItem: activeReaderItem,
    activeProgress: readerMode === 'scroll'
      ? `${Math.round(readerMaxScrollTop > 0 ? clamp((readerScrollTop / readerMaxScrollTop) * 100, 0, 100) : 0)}%`
      : `${pageIndex + 1} / ${Math.max(readerPages.length || activeReaderItem.page_count, 1)}`,
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
    saveReaderImageToGallery: (imageUrl, imagePageIndex) => void saveReaderImageToGallery(imageUrl, imagePageIndex),
    scrollReaderToTop: readerRuntime.scrollReaderToTop,
    showReaderChromeControls: readerRuntime.showReaderChromeControls,
    finishReaderFloatingControlDrag: readerRuntime.finishReaderFloatingControlDrag,
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

  const settingsClickCountRef = useRef(0)
  const settingsClickTimerRef = useRef<number | null>(null)

  function openCustomSettingsFromBackground() {
    if (settingsClickTimerRef.current) {
      window.clearTimeout(settingsClickTimerRef.current)
    }
    
    const nextCount = settingsClickCountRef.current + 1
    
    if (nextCount >= 3) {
      settingsClickCountRef.current = 0
      settingsClickTimerRef.current = null
      setDrawerOpen(false)
      appState.setCustomSettingsModalOpen(true)
    } else {
      settingsClickCountRef.current = nextCount
      const timer = window.setTimeout(() => {
        settingsClickCountRef.current = 0
        settingsClickTimerRef.current = null
      }, 2000)
      settingsClickTimerRef.current = timer
    }
  }

  function handleSkinChange(skinId: string) {
    appState.setSelectedSkin(skinId)
    setSelectedSkinId(skinId)
    show('ok', '皮肤已切换')
  }

  function handleRestoreSettings() {
    if (!confirm('除已下载的离线缓存书籍以外，其他习惯、输入历史、皮肤资源将进行初始化，是否继续？')) {
      return
    }
    
    restoreCustomSettingsStorage()
    
    setBackendUrl(DEFAULT_BACKEND)
    setBackendDraft(DEFAULT_BACKEND)
    setBackendUrlHistory([DEFAULT_BACKEND])
    setRootSecretConfigured(false)
    setRootSecretDraft('')
    appState.setSelectedSkin('default')
    setAuthorAvatarSrc('')
    setDeleteHardMode(false)
    const resetLlmConfig = loadCgsMcpLlmConfig()
    setCgsMcpLlmConfig(resetLlmConfig)
    setCgsMcpLlmDraft(resetLlmConfig)
    setRvAgentPromptHistory([])
    setRvAgentHistoryOpen(false)
    setRvAgentModelHelpOpen(false)
    setRvAgentPreferenceState(loadCgsMcpPreferenceState())
    setRvAgentPreferenceOpen(false)
    saveOfflineReadCleanupConfig(DEFAULT_OFFLINE_READ_CLEANUP_CONFIG)
    setOfflineDelAfterHourDraft(String(DEFAULT_OFFLINE_READ_CLEANUP_CONFIG.delAfterHours))
    
    show('ok', '设置已还原，正在刷新')
    appState.setCustomSettingsModalOpen(false)
    window.location.reload()
  }

  function guardedOpenDrawerTab(next: Parameters<typeof openDrawerTab>[0]) {
    openDrawerTab(next)
  }

  const leftDrawerProps: LeftDrawerProps = {
    open: drawerOpen,
    activeView: view,
    onClose: () => { setDrawerOpen(false) },
    onOpenTab: guardedOpenDrawerTab,
    libraryView: {
      appAuthor: APP_AUTHOR,
      appVersion,
      authorAvatarSrc,
      settingsBottomGifSrc: appState.skinAssets.settingsBottomGifSrc,
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
      offlineDelAfterHourDraft,
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
      clearCache,
      cleanupInvalidCache,
      clearBackendDraft,
      discoverBackend,
      handleBooksPathChange,
      loadFilesystemNode,
      moveBackendCaretToEnd,
      openCustomSettingsFromBackground,
      openExternalLink,
      refreshFilesystem,
      saveOfflineConfig,
      saveBackend,
      saveComicPath,
      saveRootSecret,
      setBackendDraft,
      setOfflineDelAfterHourDraft,
      setRootSecretDraft,
      toggleRootSecretHelp: () => setRootSecretHelpOpen((open) => !open),
    },
    acquireSettings: view === 'acquire' ? createElement(AcquireDrawerSettings, acquireWorkspace.drawerSettingsProps) : null,
  }
  return {
    acquireWorkspace,
    customSettingsModalProps: {
      open: appState.customSettingsModalOpen,
      selectedSkin: appState.selectedSkin,
      availableSkins: ['default'],
      onClose: () => appState.setCustomSettingsModalOpen(false),
      onSkinChange: handleSkinChange,
      onRestoreSettings: handleRestoreSettings,
    },
    drawerOpen,
    leftDrawerProps,
    menuImgSrc: appState.skinAssets.menuImgSrc || MENU_LOGO_SRC,
    menuVisiblePercent: appState.skinAssets.menuVisiblePercent,
    menuEffectSrc: appState.skinAssets.menuEffectSrc,
    menuEffectDuration: appState.skinAssets.menuEffectDuration,
    microHeaderStatus,
    readerWorkspaceProps,
    selectedBook,
    setDrawerOpen,
    setLocksState: (locks: Record<string, boolean>) => {
      // Update settings store or state if needed
      console.log('Locks updated:', locks)
    },
    shelfWorkspace,
    toast,
    view,
  }
}
