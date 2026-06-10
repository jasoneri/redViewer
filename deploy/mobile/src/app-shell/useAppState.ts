import { useMemo, useRef, useState } from 'react'
import type { CgsBook, CgsConfig, CgsSite, ConnectionState, CachedItem, ShelfBook } from '../mobileStore'
import { BACKEND_URL_KEY, ensureDeviceId } from '../mobileStore'
import type {
  CgsConfigDraft,
  CgsConnectionState,
  CgsGateFlight,
  CgsGatePhase,
  CgsMcpLlmConfig,
  CgsMcpTimelineItem,
  CgsModeSwap,
  CgsSearchBookInfo,
  CgsSubmitDragState,
  CgsSubmitPosition,
  CgsWorkspaceMode,
} from '../acquire-workspace/acquireTypes'
import { loadCgsMcpLlmConfig, loadCgsMcpPromptHistory, loadCgsSubmitPosition } from '../acquire-workspace/acquireCore'
import type { EdgeAction } from '../library-workspace/EdgeTools'
import type { ProgressMap, SortMode } from '../library-workspace/libraryCore'
import type {
  ReaderFit,
  ReaderFloatingControlPosition,
  ReaderItem,
  ReaderMode,
  ReaderPageFlipState,
  ReaderProgress,
  ReaderSettings,
} from '../reader-workspace/readerCore'
import { loadReaderFloatingControlPosition, loadReaderSettings } from '../reader-workspace/readerCore'
import {
  APP_VERSION_FALLBACK,
  DEFAULT_BACKEND,
  readStoredAuthorAvatar,
} from './appMeta'
import {
  hasRootSecret,
  loadBackendUrlHistory,
  type AppShellComicConfig as ComicConfig,
  type AppShellStatusInfo as StatusInfo,
  type FilesystemNode,
  type FilesystemSegment,
} from './useAppShellController'

export type View = 'library' | 'downloads' | 'reader' | 'acquire'
export type ShelfSource = 'library' | 'downloads'
export type DoujinTagPanel = {
  bookId: string
  bookTitle: string
  tags: string[]
  selectedTag: string
  mode?: 'filter' | 'preview'
}

export function useAppState() {
  const [backendUrl, setBackendUrl] = useState(localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND)
  const [backendDraft, setBackendDraft] = useState(backendUrl)
  const [rootSecretDraft, setRootSecretDraft] = useState('')
  const [rootSecretConfigured, setRootSecretConfigured] = useState(hasRootSecret())
  const [rootSecretHelpOpen, setRootSecretHelpOpen] = useState(false)
  const [backendUrlHistory, setBackendUrlHistory] = useState(() => loadBackendUrlHistory(backendUrl))
  const [deviceId] = useState(ensureDeviceId())
  const [view, setView] = useState<View>('library')
  const [connection, setConnection] = useState<ConnectionState>('unknown')
  const [statusInfo, setStatusInfo] = useState<StatusInfo>({})
  const [shelf, setShelf] = useState<ShelfBook[]>([])
  const [selectedBook, setSelectedBook] = useState<ShelfBook | null>(null)
  const [selectedShelfSource, setSelectedShelfSource] = useState<ShelfSource>('library')
  const [doujinTagPanel, setDoujinTagPanel] = useState<DoujinTagPanel | null>(null)
  const [openOpsId, setOpenOpsId] = useState('')
  const [cached, setCached] = useState<CachedItem[]>([])
  const [offlineCoverUrls, setOfflineCoverUrls] = useState<Record<string, string>>({})
  const [activeItem, setActiveItem] = useState<ReaderItem | null>(null)
  const [readerPages, setReaderPages] = useState<string[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [readerReturnView, setReaderReturnView] = useState<View>('library')
  const [readerShelfSource, setReaderShelfSource] = useState<ShelfSource>('library')
  const initialReaderSettings = useMemo(() => loadReaderSettings(), [])
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(initialReaderSettings)
  const [readerMode, setReaderMode] = useState<ReaderMode>(initialReaderSettings.readingMode)
  const [readerFit, setReaderFit] = useState<ReaderFit>('contain')
  const [readerChromeVisible, setReaderChromeVisible] = useState(true)
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false)
  const [readerScrollTop, setReaderScrollTop] = useState(0)
  const [readerMaxScrollTop, setReaderMaxScrollTop] = useState(0)
  const [readerLoadedImages, setReaderLoadedImages] = useState(0)
  const [readerAutoScrolling, setReaderAutoScrolling] = useState(false)
  const [readerPageJumpOpen, setReaderPageJumpOpen] = useState(false)
  const [readerPageFlip, setReaderPageFlip] = useState<ReaderPageFlipState | null>(null)
  const [readerScrollRenderNonce, setReaderScrollRenderNonce] = useState(0)
  const [readerFloatingControlPosition, setReaderFloatingControlPosition] = useState<ReaderFloatingControlPosition>(() => loadReaderFloatingControlPosition())
  const [readerFloatingControlUnlocked, setReaderFloatingControlUnlocked] = useState(false)
  const [busy, setBusy] = useState('')
  const [cacheProgress, setCacheProgress] = useState<Record<string, string>>({})
  const [episodePageCounts, setEpisodePageCounts] = useState<Record<string, number>>({})
  const [progressByKey, setProgressByKey] = useState<ProgressMap>({})
  const [query, setQuery] = useState('')
  const [filterDraft, setFilterDraft] = useState('')
  const [sort, setSort] = useState<SortMode>('time_desc')
  const [seriesOnly, setSeriesOnly] = useState(false)
  const [libraryPage, setLibraryPage] = useState(1)
  const [episodePage, setEpisodePage] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const [edgeTipAction, setEdgeTipAction] = useState<EdgeAction | null>(null)
  const [activeToolPanel, setActiveToolPanel] = useState<'filter' | 'sort' | null>(null)
  const [comicConfig, setComicConfig] = useState<ComicConfig | null>(null)
  const [comicPathDraft, setComicPathDraft] = useState('')
  const [pathBusy, setPathBusy] = useState('')
  const [pathSegments, setPathSegments] = useState<FilesystemSegment[]>([])
  const [filesystemTree, setFilesystemTree] = useState<FilesystemNode[]>([])
  const [filesystemExpandedKeys, setFilesystemExpandedKeys] = useState<string[]>([])
  const [filesystemBusy, setFilesystemBusy] = useState(false)
  const [deleteHardMode, setDeleteHardMode] = useState(localStorage.getItem('rv_mobile_delete_mode') === 'del')
  const [sites, setSites] = useState<CgsSite[]>([])
  const [selectedSite, setSelectedSite] = useState('')
  const [keyword, setKeyword] = useState('')
  const [cgsSearchBookInfo, setCgsSearchBookInfo] = useState<CgsSearchBookInfo | null>(null)
  const [autoOpenConsumed, setAutoOpenConsumed] = useState(false)
  const [cgsBooks, setCgsBooks] = useState<CgsBook[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [cgsSessionId, setCgsSessionId] = useState('')
  const [cgsStatus, setCgsStatus] = useState<Record<string, unknown> | null>(null)
  const [cgsConfig, setCgsConfig] = useState<CgsConfig | null>(null)
  const [cgsConfigDraft, setCgsConfigDraft] = useState<CgsConfigDraft>({ downloaded_handle: '-', proxies_text: '', sv_path: '' })
  const [cgsConfigBusy, setCgsConfigBusy] = useState('')
  const [cgsConnection, setCgsConnection] = useState<CgsConnectionState>('unknown')
  const [cgsWorkspaceMode, setCgsWorkspaceMode] = useState<CgsWorkspaceMode | null>(null)
  const [cgsGatePhase, setCgsGatePhase] = useState<CgsGatePhase>('idle')
  const [cgsGateLoadingMode, setCgsGateLoadingMode] = useState<CgsWorkspaceMode | null>(null)
  const [cgsGateFlight, setCgsGateFlight] = useState<CgsGateFlight | null>(null)
  const [cgsHeadGateFlight, setCgsHeadGateFlight] = useState<CgsGateFlight | null>(null)
  const [cgsModeSwap, setCgsModeSwap] = useState<CgsModeSwap | null>(null)
  const [cgsSubmitPosition, setCgsSubmitPosition] = useState<CgsSubmitPosition>(() => loadCgsSubmitPosition())
  const [cgsMcpLlmConfig, setCgsMcpLlmConfig] = useState<CgsMcpLlmConfig>(() => loadCgsMcpLlmConfig())
  const [cgsMcpLlmDraft, setCgsMcpLlmDraft] = useState<CgsMcpLlmConfig>(() => loadCgsMcpLlmConfig())
  const [cgsMcpModelHelpOpen, setCgsMcpModelHelpOpen] = useState(false)
  const [cgsMcpPrompt, setCgsMcpPrompt] = useState('')
  const [cgsMcpPromptHistory, setCgsMcpPromptHistory] = useState<string[]>(loadCgsMcpPromptHistory)
  const [cgsMcpHistoryOpen, setCgsMcpHistoryOpen] = useState(false)
  const [cgsMcpExpandedToolId, setCgsMcpExpandedToolId] = useState<string | null>(null)
  const [cgsMcpTimeline, setCgsMcpTimeline] = useState<CgsMcpTimelineItem[]>([])
  const [cgsMcpRunning, setCgsMcpRunning] = useState(false)
  const [appVersion, setAppVersion] = useState(APP_VERSION_FALLBACK)
  const [authorAvatarSrc, setAuthorAvatarSrc] = useState(readStoredAuthorAvatar)
  const [cacheSummaryText, setCacheSummaryText] = useState('--')
  const [cacheSummaryHint, setCacheSummaryHint] = useState('离线缓存占用')
  const [storageBusy, setStorageBusy] = useState('')
  const scrollReaderRef = useRef<HTMLDivElement | null>(null)
  const scrollProgressTimerRef = useRef<number | null>(null)
  const pendingReaderProgressRef = useRef<ReaderProgress>({ page_index: 0, scroll_top: 0, reading_mode: 'scroll' })
  const restoredScrollRef = useRef('')
  const readerInitialRestorePendingRef = useRef(false)
  const readerUserScrolledRef = useRef(false)
  const readerProgrammaticScrollRef = useRef(false)
  const readerFloatingControlRestoreRef = useRef<ReaderFloatingControlPosition | null>(null)
  const pageTouchStartRef = useRef({ x: 0, y: 0 })
  const pageTouchSuppressClickRef = useRef(false)
  const readerPageFlipActiveRef = useRef(false)
  const readerPageFlipKeyRef = useRef(0)
  const autoScrollingRef = useRef(false)
  const autoScrollFrameRef = useRef<number | null>(null)
  const autoScrollIntervalRef = useRef<number | null>(null)
  const edgePointerActiveRef = useRef(false)
  const backendInputRef = useRef<HTMLInputElement | null>(null)
  const doujinTagLinkButtonRef = useRef<HTMLButtonElement | null>(null)
  const cgsManualGateRef = useRef<HTMLButtonElement | null>(null)
  const cgsMcpGateRef = useRef<HTMLButtonElement | null>(null)
  const cgsStatusDotRef = useRef<HTMLSpanElement | null>(null)
  const cgsStatusHeadRef = useRef<HTMLButtonElement | null>(null)
  const cgsSubmitDragRef = useRef<CgsSubmitDragState | null>(null)
  const cgsMcpAbortRef = useRef<AbortController | null>(null)
  const cgsMcpComposerRef = useRef(false)
  const cgsMcpScrollRef = useRef<HTMLDivElement | null>(null)
  const cgsMcpSubmittedRef = useRef(false)
  const cgsMcpFailedRef = useRef(false)
  const offlineCoverUrlsRef = useRef<Record<string, string>>({})

  return {
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
  }
}

export type AppState = ReturnType<typeof useAppState>
