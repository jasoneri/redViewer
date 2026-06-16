import { useEffect, useLayoutEffect, useMemo, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import type { AppState } from './useAppState'
import type { useMobileAppShellControllerModel } from './useAppShellController'
import {
  APP_VERSION_FALLBACK,
  downloadAuthorAvatarToLocalStorage,
  warmSkinBundle,
  readStoredSkinAssets,
  queryParam,
  type SkinAssets,
} from './appMeta'
import {
  READER_SETTINGS_KEY,
  clampReaderFloatingControlPosition,
  readerChromeShouldShow,
  readerChromeShouldShowPage,
  type ReaderFloatingControlPosition,
  type ReaderItem,
  type ReaderMode,
  type ReaderSettings,
} from '../reader-workspace/readerCore'
import {
  cachedDisplayMeta,
  collectShelfProgressKeys,
  ensureMeta,
  metaEquals,
  progressIdentity,
  type ProgressMap,
} from '../library-workspace/libraryCore'
import {
  type CachedItem,
  type ConnectionState,
  type LibraryMeta,
  type Progress,
  type ShelfBook,
  getCachedCover,
  loadAllProgress,
  updateCachedItemMeta,
} from '../mobileStore'
import type { DoujinTagPanel } from '../acquire-workspace/acquireTypes'
import type { EdgeAction } from '../library-workspace/EdgeTools'
import type { useMobileShelfModel } from '../library-workspace/useMobileShelfModel'
import type { useMobileReaderRuntimeModel } from '../reader-workspace/useReaderRuntime'

type View = 'library' | 'downloads' | 'reader' | 'acquire'

type AppWorkspaceLifecycleDeps = {
  activeItem: ReaderItem | null
  appVersionFallback: string
  authorAvatarSrc: string
  autoOpenConsumed: boolean
  backendUrl: string
  cached: CachedItem[]
  cachedById: Map<string, CachedItem>
  cgsMcpRunning: boolean
  cgsMcpTimeline: unknown[]
  connection: ConnectionState
  detailShelf: ShelfBook[]
  doujinTagPanel: DoujinTagPanel | null
  drawerOpen: boolean
  episodePage: number
  episodePageCount: number
  episodePageCounts: Record<string, number>
  libraryMetaByCacheKey: Map<string, LibraryMeta>
  libraryPage: number
  libraryPageCount: number
  openFirstBook: boolean
  openOpsId: string
  pagedEpisodes: ShelfBook['episodes']
  pagedShelf: ShelfBook[]
  pageIndex: number
  readerFloatingControlUnlocked: boolean
  readerMaxScrollTop: number
  readerMode: ReaderMode
  readerPages: string[]
  readerScrollTop: number
  readerSettings: ReaderSettings
  readerSettingsOpen: boolean
  requestedBook: string
  selectedBook: ShelfBook | null
  selectedSkin: string
  shelf: ShelfBook[]
  statusInfo: { ero?: boolean | number }
  toolMenuOpen: boolean
  view: View
  cgsMcpAbortRef: MutableRefObject<AbortController | null>
  cgsMcpScrollRef: RefObject<HTMLDivElement | null>
  doujinTagLinkButtonRef: RefObject<HTMLButtonElement | null>
  offlineCoverUrlsRef: MutableRefObject<Record<string, string>>
  readerInitialRestorePendingRef: MutableRefObject<boolean>
  restoredScrollRef: MutableRefObject<string>
  scrollProgressTimerRef: MutableRefObject<number | null>
  checkBackend: () => Promise<unknown>
  clearReaderPageFlip: () => void
  downloadAuthorAvatar: (backendUrl: string) => Promise<string>
  loadManifest: (item: ShelfBook['episodes'][number]) => Promise<{ page_count: number }>
  refreshCache: () => Promise<unknown>
  refreshCacheSummary: () => Promise<unknown>
  refreshComicConfig: (url?: string, silent?: boolean) => Promise<unknown>
  restoreReaderScrollTop: () => void
  stopReaderAutoScroll: () => void
  setAuthorAvatarSrc: Dispatch<SetStateAction<string>>
  setAutoOpenConsumed: Dispatch<SetStateAction<boolean>>
  setDoujinTagPanel: Dispatch<SetStateAction<DoujinTagPanel | null>>
  setEdgeTipAction: Dispatch<SetStateAction<EdgeAction | null>>
  setEpisodePage: Dispatch<SetStateAction<number>>
  setEpisodePageCounts: Dispatch<SetStateAction<Record<string, number>>>
  setLibraryPage: Dispatch<SetStateAction<number>>
  setOfflineCoverUrls: Dispatch<SetStateAction<Record<string, string>>>
  setOpenOpsId: Dispatch<SetStateAction<string>>
  setProgressByKey: Dispatch<SetStateAction<ProgressMap>>
  setReaderChromeVisible: Dispatch<SetStateAction<boolean>>
  setReaderFloatingControlPosition: Dispatch<SetStateAction<ReaderFloatingControlPosition>>
  setReaderLoadedImages: Dispatch<SetStateAction<number>>
  setReaderMaxScrollTop: Dispatch<SetStateAction<number>>
  setSelectedBook: Dispatch<SetStateAction<ShelfBook | null>>
  setSkinAssets: Dispatch<SetStateAction<SkinAssets>>
  setAppVersion: Dispatch<SetStateAction<string>>
}

export function useAppWorkspaceLifecycle(deps: AppWorkspaceLifecycleDeps) {
  useEffect(() => {
    if (deps.authorAvatarSrc) return
    let cancelled = false
    void deps.downloadAuthorAvatar(deps.backendUrl)
      .then((avatar) => {
        if (!cancelled) deps.setAuthorAvatarSrc(avatar)
      })
      .catch(() => {
        if (!cancelled) deps.setAuthorAvatarSrc('')
      })
    return () => {
      cancelled = true
    }
  }, [deps.authorAvatarSrc, deps.backendUrl])

  useEffect(() => {
    let cancelled = false
    const cached = readStoredSkinAssets(deps.selectedSkin)
    if (cached) deps.setSkinAssets(cached)

    void warmSkinBundle(deps.selectedSkin).then((bundle) => {
      if (!cancelled) {
        const assets = bundle[deps.selectedSkin]
        if (assets) deps.setSkinAssets(assets)
      }
    })

    return () => {
      cancelled = true
    }
  }, [deps.selectedSkin])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const next: Record<string, string> = {}
      for (const item of deps.cached) {
        let url = ''
        try {
          url = await getCachedCover(item)
        } catch {
          url = ''
        }
        if (cancelled) {
          if (url) URL.revokeObjectURL(url)
          continue
        }
        if (url) next[item.id] = url
      }
      if (cancelled) {
        Object.values(next).forEach((url) => URL.revokeObjectURL(url))
        return
      }
      deps.setOfflineCoverUrls((current) => {
        Object.entries(current).forEach(([id, url]) => {
          if (url && url !== next[id]) URL.revokeObjectURL(url)
        })
        deps.offlineCoverUrlsRef.current = next
        return next
      })
    })()

    return () => {
      cancelled = true
    }
  }, [deps.cached])

  useEffect(() => () => {
    Object.values(deps.offlineCoverUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
    deps.offlineCoverUrlsRef.current = {}
  }, [])

  useEffect(() => {
    void deps.refreshCache()
    void deps.checkBackend()
    void deps.refreshComicConfig(deps.backendUrl, true)
    void deps.refreshCacheSummary()
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const mod = await import('@tauri-apps/api/app')
        const version = await mod.getVersion()
        if (!cancelled && version) deps.setAppVersion(version)
      } catch {
        if (!cancelled) deps.setAppVersion(deps.appVersionFallback)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!deps.drawerOpen) return
    void deps.refreshComicConfig(deps.backendUrl, true)
  }, [deps.backendUrl, deps.drawerOpen])

  useEffect(() => {
    void deps.refreshCacheSummary()
  }, [deps.cached])

  useEffect(() => {
    if (deps.toolMenuOpen) return
    deps.setEdgeTipAction(null)
  }, [deps.toolMenuOpen])

  useEffect(() => {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(deps.readerSettings))
  }, [deps.readerSettings])

  useEffect(() => {
    if (deps.libraryPage > deps.libraryPageCount) deps.setLibraryPage(deps.libraryPageCount)
  }, [deps.libraryPage, deps.libraryPageCount])

  useEffect(() => {
    if (!deps.selectedBook) return
    const nextBook = deps.detailShelf.find((book) => book.id === deps.selectedBook?.id)
    if (nextBook && nextBook !== deps.selectedBook) deps.setSelectedBook(nextBook)
  }, [deps.detailShelf, deps.selectedBook])

  useEffect(() => {
    deps.setEpisodePage(1)
  }, [deps.selectedBook?.id])

  useEffect(() => {
    if (!deps.doujinTagPanel) return
    if (deps.doujinTagPanel.mode === 'preview') return
    if (!deps.pagedShelf.some((book) => book.id === deps.doujinTagPanel?.bookId)) deps.setDoujinTagPanel(null)
  }, [deps.doujinTagPanel, deps.pagedShelf])

  useEffect(() => {
    if (!deps.openOpsId) return
    if (!deps.pagedShelf.some((book) => book.id === deps.openOpsId) && !deps.pagedEpisodes.some((episode) => episode.id === deps.openOpsId)) deps.setOpenOpsId('')
  }, [deps.openOpsId, deps.pagedEpisodes, deps.pagedShelf])

  useEffect(() => {
    if (!deps.doujinTagPanel) return
    const frame = window.requestAnimationFrame(() => deps.doujinTagLinkButtonRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [deps.doujinTagPanel?.bookId])

  useEffect(() => {
    if (!deps.doujinTagPanel) return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') deps.setDoujinTagPanel(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deps.doujinTagPanel])

  useEffect(() => {
    if (!deps.doujinTagPanel) return
    if (deps.doujinTagPanel.mode === 'preview') {
      if (deps.view !== 'acquire') deps.setDoujinTagPanel(null)
      return
    }
    if ((deps.view !== 'library' && deps.view !== 'downloads') || deps.selectedBook || (!deps.statusInfo.ero && deps.view !== 'downloads')) {
      deps.setDoujinTagPanel(null)
    }
  }, [deps.doujinTagPanel, deps.selectedBook, deps.statusInfo.ero, deps.view])

  useEffect(() => {
    if (deps.autoOpenConsumed || deps.selectedBook || deps.view !== 'library' || !deps.shelf.length) return
    const matched = deps.requestedBook
      ? deps.shelf.find((book) => book.book === deps.requestedBook || book.title === deps.requestedBook)
      : deps.openFirstBook
        ? deps.shelf[0]
        : null
    if (!matched) return
    deps.setSelectedBook(matched)
    deps.setAutoOpenConsumed(true)
  }, [deps.autoOpenConsumed, deps.openFirstBook, deps.requestedBook, deps.selectedBook, deps.shelf, deps.view])

  useEffect(() => {
    if (deps.episodePage > deps.episodePageCount) deps.setEpisodePage(deps.episodePageCount)
  }, [deps.episodePage, deps.episodePageCount])

  useEffect(() => {
    if (deps.view !== 'library' || deps.selectedBook?.kind !== 'series' || deps.connection !== 'online') return

    const targets = deps.pagedEpisodes.filter((episode) => {
      if (deps.episodePageCounts[episode.id]) return false
      if (deps.cachedById.get(episode.id)?.page_count) return false
      return true
    })
    if (!targets.length) return

    let cancelled = false
    void (async () => {
      for (const episode of targets) {
        try {
          const manifest = await deps.loadManifest(episode)
          if (cancelled) return
          if (manifest.page_count > 0) {
            deps.setEpisodePageCounts((state) => (state[episode.id] ? state : { ...state, [episode.id]: manifest.page_count }))
          }
        } catch {
          // Ignore background badge prefetch failures; opening the episode still performs a normal manifest load.
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [deps.cachedById, deps.connection, deps.episodePageCounts, deps.pagedEpisodes, deps.selectedBook?.kind, deps.view])

  useEffect(() => {
    return () => {
      deps.readerPages.forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [deps.readerPages])

  useEffect(() => {
    return () => {
      if (deps.scrollProgressTimerRef.current !== null) window.clearTimeout(deps.scrollProgressTimerRef.current)
      deps.stopReaderAutoScroll()
    }
  }, [])

  useEffect(() => {
    if (deps.readerMode !== 'scroll' || deps.view !== 'reader') deps.stopReaderAutoScroll()
  }, [deps.readerMode, deps.view])

  useEffect(() => {
    if (deps.view !== 'reader' || deps.readerMode !== 'page') deps.clearReaderPageFlip()
  }, [deps.readerMode, deps.view])

  useLayoutEffect(() => {
    if (deps.view !== 'reader') return

    const root = document.documentElement
    const body = document.body
    const previousRootOverflow = root.style.overflow
    const previousBodyOverflow = body.style.overflow

    root.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    root.scrollTop = 0
    body.scrollTop = 0
    window.scrollTo(0, 0)

    return () => {
      root.style.overflow = previousRootOverflow
      body.style.overflow = previousBodyOverflow
    }
  }, [deps.view])

  useEffect(() => {
    if (deps.view !== 'reader' || deps.readerMode !== 'scroll') return

    const clampFloatingControl = () => {
      deps.setReaderFloatingControlPosition((position) => {
        const next = clampReaderFloatingControlPosition(position)
        return next.x === position.x && next.y === position.y ? position : next
      })
    }

    clampFloatingControl()
    window.addEventListener('resize', clampFloatingControl)
    window.visualViewport?.addEventListener('resize', clampFloatingControl)

    return () => {
      window.removeEventListener('resize', clampFloatingControl)
      window.visualViewport?.removeEventListener('resize', clampFloatingControl)
    }
  }, [deps.readerMode, deps.view])

  useEffect(() => {
    if (deps.view !== 'reader' || deps.readerMode !== 'scroll' || !deps.activeItem) return
    const restoreKey = `${deps.activeItem.id}:${deps.readerMode}:${deps.readerPages.length}`
    if (deps.restoredScrollRef.current === restoreKey && !deps.readerInitialRestorePendingRef.current) return
    deps.restoredScrollRef.current = restoreKey
    window.setTimeout(() => deps.restoreReaderScrollTop(), 0)
  }, [deps.activeItem?.id, deps.readerMode, deps.readerPages.length, deps.view])

  useEffect(() => {
    if (deps.view !== 'reader' || deps.readerMode !== 'scroll') return
    deps.setReaderLoadedImages(0)
    deps.setReaderMaxScrollTop(0)
  }, [deps.activeItem?.id, deps.readerMode, deps.readerPages.length, deps.view])

  useEffect(() => {
    if (deps.view !== 'reader' || !deps.readerPages.length || deps.readerSettingsOpen || deps.readerFloatingControlUnlocked) return
    const shouldForceBoundaryChrome = deps.readerMode === 'scroll'
      ? readerChromeShouldShow(deps.readerScrollTop, deps.readerMaxScrollTop, deps.readerPages.length)
      : readerChromeShouldShowPage(deps.pageIndex, deps.readerPages.length)
    if (!shouldForceBoundaryChrome) return
    deps.setReaderChromeVisible((visible) => (visible ? visible : true))
  }, [deps.pageIndex, deps.readerFloatingControlUnlocked, deps.readerMaxScrollTop, deps.readerMode, deps.readerPages.length, deps.readerScrollTop, deps.readerSettingsOpen, deps.view])

  useEffect(() => {
    let cancelled = false
    const keys = collectShelfProgressKeys(deps.shelf)
    for (const item of deps.cached) keys.add(progressIdentity(item.book, item.ep))
    void loadAllProgress().then((rows) => {
      if (cancelled) return
      const next: ProgressMap = {}
      for (const progress of rows) {
        const key = progressIdentity(progress.book, progress.ep)
        if (keys.has(key)) next[key] = progress as Progress
      }
      deps.setProgressByKey(next)
    })
    return () => {
      cancelled = true
    }
  }, [deps.cached, deps.shelf])

  useEffect(() => {
    if (!deps.cached.length || !deps.libraryMetaByCacheKey.size) return
    let cancelled = false
    void (async () => {
      let changed = false
      for (const item of deps.cached) {
        const nextMeta = cachedDisplayMeta(item, deps.libraryMetaByCacheKey)
        if (metaEquals(ensureMeta(item.meta), nextMeta)) continue
        await updateCachedItemMeta(item.id, nextMeta)
        changed = true
      }
      if (!cancelled && changed) await deps.refreshCache()
    })()
    return () => {
      cancelled = true
    }
  }, [deps.cached, deps.libraryMetaByCacheKey])

  useEffect(() => {
    deps.cgsMcpScrollRef.current?.scrollTo({ top: deps.cgsMcpScrollRef.current.scrollHeight })
  }, [deps.cgsMcpTimeline, deps.cgsMcpRunning])

  useEffect(() => () => deps.cgsMcpAbortRef.current?.abort(), [])
}

type AppShellControllerModel = ReturnType<typeof useMobileAppShellControllerModel>
type ReaderRuntimeModel = ReturnType<typeof useMobileReaderRuntimeModel>
type ShelfModel = ReturnType<typeof useMobileShelfModel>

type MobileWorkspaceLifecycleDeps = {
  appShellController: AppShellControllerModel
  readerRuntime: ReaderRuntimeModel
  shelfModel: ShelfModel
}

export function useMobileWorkspaceLifecycleModel(appState: AppState, deps: MobileWorkspaceLifecycleDeps) {
  const {
    activeItem,
    authorAvatarSrc,
    autoOpenConsumed,
    backendUrl,
    cached,
    cgsMcpRunning,
    cgsMcpTimeline,
    connection,
    doujinTagPanel,
    drawerOpen,
    episodePage,
    episodePageCounts,
    libraryPage,
    openOpsId,
    pageIndex,
    readerMaxScrollTop,
    readerMode,
    readerPages,
    readerScrollTop,
    readerSettings,
    readerSettingsOpen,
    selectedBook,
    selectedSkin,
    shelf,
    statusInfo,
    toolMenuOpen,
    view,
    cgsMcpAbortRef,
    cgsMcpScrollRef,
    doujinTagLinkButtonRef,
    offlineCoverUrlsRef,
    readerInitialRestorePendingRef,
    restoredScrollRef,
    scrollProgressTimerRef,
    setAppVersion,
    setAuthorAvatarSrc,
    setAutoOpenConsumed,
    setDoujinTagPanel,
    setEpisodePage,
    setEpisodePageCounts,
    setLibraryPage,
    setOfflineCoverUrls,
    setOpenOpsId,
    setProgressByKey,
    setReaderChromeVisible,
    setReaderFloatingControlPosition,
    setReaderLoadedImages,
    setReaderMaxScrollTop,
    setSelectedBook,
    setSkinAssets,
  } = appState
  const requestedBook = useMemo(() => queryParam('book'), [])
  const openFirstBook = useMemo(() => queryParam('openFirst') === '1', [])

  useAppWorkspaceLifecycle({
    activeItem,
    appVersionFallback: APP_VERSION_FALLBACK,
    authorAvatarSrc,
    autoOpenConsumed,
    backendUrl,
    cached,
    cachedById: deps.shelfModel.cachedById,
    cgsMcpRunning,
    cgsMcpTimeline,
    connection,
    detailShelf: deps.shelfModel.detailShelf,
    doujinTagPanel,
    drawerOpen,
    episodePage,
    episodePageCount: deps.shelfModel.episodePageCount,
    episodePageCounts,
    libraryMetaByCacheKey: deps.shelfModel.libraryMetaByCacheKey,
    libraryPage,
    libraryPageCount: deps.shelfModel.libraryPageCount,
    openFirstBook,
    openOpsId,
    pagedEpisodes: deps.shelfModel.pagedEpisodes,
    pagedShelf: deps.shelfModel.pagedShelf,
    pageIndex,
    readerFloatingControlUnlocked: false,
    readerMaxScrollTop,
    readerMode,
    readerPages,
    readerScrollTop,
    readerSettings,
    readerSettingsOpen,
    requestedBook,
    selectedBook,
    selectedSkin,
    shelf,
    statusInfo,
    toolMenuOpen,
    view,
    cgsMcpAbortRef,
    cgsMcpScrollRef,
    doujinTagLinkButtonRef,
    offlineCoverUrlsRef,
    readerInitialRestorePendingRef,
    restoredScrollRef,
    scrollProgressTimerRef,
    checkBackend: deps.appShellController.checkBackend,
    clearReaderPageFlip: deps.readerRuntime.clearReaderPageFlip,
    downloadAuthorAvatar: downloadAuthorAvatarToLocalStorage,
    loadManifest: deps.shelfModel.loadManifest,
    refreshCache: deps.appShellController.refreshCache,
    refreshCacheSummary: deps.appShellController.refreshCacheSummary,
    refreshComicConfig: deps.appShellController.refreshComicConfig,
    restoreReaderScrollTop: deps.readerRuntime.restoreReaderScrollTop,
    stopReaderAutoScroll: deps.readerRuntime.stopReaderAutoScroll,
    setAuthorAvatarSrc,
    setAutoOpenConsumed,
    setDoujinTagPanel,
    setEdgeTipAction: () => {},
    setEpisodePage,
    setEpisodePageCounts,
    setLibraryPage,
    setOfflineCoverUrls,
    setOpenOpsId,
    setProgressByKey,
    setReaderChromeVisible,
    setReaderFloatingControlPosition,
    setReaderLoadedImages,
    setReaderMaxScrollTop,
    setSelectedBook,
    setSkinAssets,
    setAppVersion,
  })
}
