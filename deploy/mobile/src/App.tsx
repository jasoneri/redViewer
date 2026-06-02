import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronsLeft,
  ChevronsRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Download,
  Filter,
  FolderOpen,
  Globe2,
  Grid2X2,
  LoaderCircle,
  Menu,
  MoreVertical,
  Pause,
  PlugZap,
  RefreshCw,
  Search,
  Save,
  SlidersHorizontal,
  Tags,
  Settings,
  Trash2,
  UserSearch,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type TouchEvent } from 'react'
import { Badge, ConfigProvider, Pagination, Tag, TreeSelect, theme, type TreeSelectProps } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { CustomIcon } from './icons/CustomIcon'
import {
  BACKEND_URL_KEY,
  CachedItem,
  CgsBook,
  CgsSite,
  ConnectionState,
  LibraryItem,
  LibraryMeta,
  LibraryResponse,
  Manifest,
  Progress,
  ShelfBook,
  apiGet,
  apiPost,
  buildUrl,
  cacheManifest,
  deleteCachedItem,
  ensureDeviceId,
  getCachedItem,
  getCachedPages,
  loadAllProgress,
  loadCachedItems,
  loadProgress,
  normalizeBackendUrl,
  queueProgress,
  saveProgress,
  syncPendingProgress,
  syncProgress,
} from './mobileStore'

type View = 'library' | 'downloads' | 'reader' | 'acquire'
type SortMode = 'time_desc' | 'time_asc' | 'name_asc' | 'name_desc'
type ReaderMode = 'page' | 'scroll'
type ReaderFit = 'contain' | 'width'
type ReaderToolbarPosition = 'top' | 'bottom'
type ToastTone = 'ok' | 'warn' | 'error'
type Toast = { tone: ToastTone; text: string } | null
type StatusTone = 'ok' | 'warn' | 'error' | 'neutral'
type CoverOverlayAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type CoverOverlayTone = 'artist' | 'source' | 'type' | 'pages'
type StatusInfo = {
  path_configured?: boolean
  ero?: boolean | number
  mobile_contract?: boolean
}
type ReaderItem = {
  id: string
  book: string
  ep: string
  title: string
  page_count: number
  source: 'cache' | 'remote'
}
type ReaderProgress = {
  page_index: number
  scroll_top: number
  reading_mode: ReaderMode
}
type ReaderSettings = {
  readingMode: ReaderMode
  showSlider: boolean
  showNavBtn: boolean
  showCenterNextPrev: boolean
  btnGroupPosition: ReaderToolbarPosition
  scrollIntervalTime: number
  scrollIntervalPixel: number
}
type ProgressMap = Record<string, Progress>
type ContinueTarget = {
  item: LibraryItem
  progress: Progress
}
type LegacyComicBook = {
  book: string
  first_img?: string | null
  eps?: Array<{ ep: string; first_img?: string | null }>
}
type ComicConfig = {
  path: string
  kemono_path?: string
  path_configured?: boolean
}
type FilesystemSegment = {
  path: string
  name: string
}
type FilesystemNode = {
  title: string
  value: string
  key: string
  isLeaf?: boolean
  children?: FilesystemNode[]
}
type FilesystemSelectValue = {
  value: string
  label: string
}
type FilesystemResponse = {
  roots?: string[]
  directories?: string[]
  path_segments?: FilesystemSegment[]
}
type FilesystemLoadData = NonNullable<TreeSelectProps<FilesystemSelectValue, FilesystemNode>['loadData']>
type FilesystemExpandedKeys = Parameters<NonNullable<TreeSelectProps<FilesystemSelectValue, FilesystemNode>['onTreeExpand']>>[0]
const edgeActions = ['filter', 'sort', 'refresh', 'delete-mode', 'doujin'] as const
type EdgeAction = typeof edgeActions[number]
type CoverOverlayTag = {
  key: string
  text: string
  title: string
  anchor: CoverOverlayAnchor
  tone: CoverOverlayTone
}

function resolveDefaultBackend(): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'http://127.0.0.1:12345'
  return 'http://10.0.2.2:12345'
}

const DEFAULT_BACKEND = resolveDefaultBackend()
const EDGE_LOGO_SRC = './assets/rV.png'
const PATH_SUFFIX_LENGTH = 10
const READER_CHROME_THRESHOLD = 0.15
const SCROLL_PROGRESS_DEBOUNCE_MS = 600
const READER_SETTINGS_KEY = 'rv_mobile_reader_settings'
const BACKEND_URL_HISTORY_KEY = 'rv_mobile_backend_url_history'
const BACKEND_URL_HISTORY_LIMIT = 6
const BACKEND_URL_DATALIST_ID = 'backend-url-history'
const PAGE_SWIPE_THRESHOLD = 50
const DEFAULT_READER_SETTINGS: ReaderSettings = {
  readingMode: 'scroll',
  showSlider: false,
  showNavBtn: true,
  showCenterNextPrev: true,
  btnGroupPosition: 'top',
  scrollIntervalTime: 15,
  scrollIntervalPixel: 1,
}

const sortLabels: Record<SortMode, string> = {
  time_desc: '最近',
  time_asc: '最早',
  name_asc: '名称正序',
  name_desc: '名称倒序',
}

const EMPTY_META: LibraryMeta = {
  artist: null,
  source: null,
  preview_url: null,
  public_date: null,
  tags: [],
  pages: null,
  btype: null,
}

function isEdgeAction(value: string | undefined): value is EdgeAction {
  return Boolean(value && edgeActions.includes(value as EdgeAction))
}

function queryParam(name: string): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(name)?.trim() || ''
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function readerChromeShouldShow(scrollTop: number, maxScrollTop: number, pageCount: number): boolean {
  if (pageCount <= 1 || maxScrollTop <= 0) return true
  const threshold = maxScrollTop * READER_CHROME_THRESHOLD
  return scrollTop <= threshold || scrollTop >= maxScrollTop - threshold
}

function readerChromeShouldShowPage(pageIndex: number, pageCount: number): boolean {
  if (pageCount <= 1) return true
  const ratio = pageIndex / Math.max(pageCount - 1, 1)
  return ratio <= READER_CHROME_THRESHOLD || ratio >= 1 - READER_CHROME_THRESHOLD
}

function loadReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY)
    if (!raw) return DEFAULT_READER_SETTINGS
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>
    return {
      ...DEFAULT_READER_SETTINGS,
      ...parsed,
      readingMode: parsed.readingMode === 'page' ? 'page' : 'scroll',
      btnGroupPosition: parsed.btnGroupPosition === 'bottom' ? 'bottom' : 'top',
      scrollIntervalTime: Number(parsed.scrollIntervalTime) || DEFAULT_READER_SETTINGS.scrollIntervalTime,
      scrollIntervalPixel: Number(parsed.scrollIntervalPixel) || DEFAULT_READER_SETTINGS.scrollIntervalPixel,
    }
  } catch {
    return DEFAULT_READER_SETTINGS
  }
}

function normalizeBackendUrlHistory(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const next = normalizeBackendUrl(value || '')
    if (!next || seen.has(next)) continue
    seen.add(next)
    result.push(next)
    if (result.length >= BACKEND_URL_HISTORY_LIMIT) break
  }

  return result
}

function loadBackendUrlHistory(currentUrl: string): string[] {
  try {
    const raw = localStorage.getItem(BACKEND_URL_HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const values = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
    return normalizeBackendUrlHistory([currentUrl, ...values])
  } catch {
    return normalizeBackendUrlHistory([currentUrl])
  }
}

function saveBackendUrlHistory(nextUrl: string, currentHistory: string[]): string[] {
  const nextHistory = normalizeBackendUrlHistory([nextUrl, ...currentHistory])
  localStorage.setItem(BACKEND_URL_HISTORY_KEY, JSON.stringify(nextHistory))
  return nextHistory
}

function compactPathTail(path: string): string {
  const value = path.trim()
  if (!value) return '未配置'
  return value.length > PATH_SUFFIX_LENGTH ? `...${value.slice(-PATH_SUFFIX_LENGTH)}` : value
}

function filesystemQuery(path?: string): string {
  return path ? `?path=${encodeURIComponent(path)}` : ''
}

function joinFilesystemPath(parentPath: string, childName: string): string {
  const sep = parentPath.includes('\\') ? '\\' : '/'
  return `${parentPath.replace(/[\\/]+$/, '')}${sep}${childName}`
}

function attachFilesystemChildren(nodes: FilesystemNode[], targetPath: string, children: FilesystemNode[]): FilesystemNode[] {
  return nodes.map((node) => {
    if (node.value === targetPath) return { ...node, children }
    if (!node.children?.length) return node
    return { ...node, children: attachFilesystemChildren(node.children, targetPath, children) }
  })
}

function createFilesystemNodes(values: string[], expandedPath?: string): FilesystemNode[] {
  return values.map((value) => ({
    title: value,
    value,
    key: value,
    isLeaf: false,
    ...(value === expandedPath ? { children: [] as FilesystemNode[] } : {}),
  }))
}

function createFilesystemChildren(parentPath: string, values: string[], expandedPath?: string): FilesystemNode[] {
  return values.map((value) => {
    const fullPath = joinFilesystemPath(parentPath, value)
    return {
      title: value,
      value: fullPath,
      key: fullPath,
      isLeaf: false,
      ...(fullPath === expandedPath ? { children: [] as FilesystemNode[] } : {}),
    }
  })
}

function upsertFilesystemChildren(list: FilesystemNode[], parentPath: string, children: FilesystemNode[]): FilesystemNode[] {
  return list.map((node) => {
    if (node.value === parentPath) return { ...node, children }
    if (!node.children?.length) return node
    return { ...node, children: upsertFilesystemChildren(node.children, parentPath, children) }
  })
}

function StatusBadgeIcon({
  Icon,
  ok,
  label,
  title,
}: {
  Icon: typeof Globe2
  ok: boolean
  label: string
  title: string
}) {
  return (
    <button className="accept-icon accept-status-icon" disabled aria-label={label} title={title}>
      <Icon size={16} />
      <span className={`accept-status-badge ${ok ? 'ok' : 'error'}`} aria-hidden="true" />
    </button>
  )
}

export function App() {
  const [backendUrl, setBackendUrl] = useState(localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND)
  const [backendDraft, setBackendDraft] = useState(backendUrl)
  const [backendUrlHistory, setBackendUrlHistory] = useState(() => loadBackendUrlHistory(backendUrl))
  const [deviceId] = useState(ensureDeviceId())
  const [view, setView] = useState<View>('library')
  const [connection, setConnection] = useState<ConnectionState>('unknown')
  const [statusInfo, setStatusInfo] = useState<StatusInfo>({})
  const [shelf, setShelf] = useState<ShelfBook[]>([])
  const [selectedBook, setSelectedBook] = useState<ShelfBook | null>(null)
  const [expandedTagBookId, setExpandedTagBookId] = useState('')
  const [openOpsId, setOpenOpsId] = useState('')
  const [cached, setCached] = useState<CachedItem[]>([])
  const [activeItem, setActiveItem] = useState<ReaderItem | null>(null)
  const [readerPages, setReaderPages] = useState<string[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [readerReturnView, setReaderReturnView] = useState<View>('library')
  const initialReaderSettings = useMemo(() => loadReaderSettings(), [])
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(initialReaderSettings)
  const [readerMode, setReaderMode] = useState<ReaderMode>(initialReaderSettings.readingMode)
  const [readerFit, setReaderFit] = useState<ReaderFit>('contain')
  const [readerChromeVisible, setReaderChromeVisible] = useState(true)
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false)
  const [readerScrollTop, setReaderScrollTop] = useState(0)
  const [readerMaxScrollTop, setReaderMaxScrollTop] = useState(0)
  const [, setReaderLoadedImages] = useState(0)
  const [readerAutoScrolling, setReaderAutoScrolling] = useState(false)
  const [readerPageJumpOpen, setReaderPageJumpOpen] = useState(false)
  const [readerScrollRenderNonce, setReaderScrollRenderNonce] = useState(0)
  const [toast, setToast] = useState<Toast>(null)
  const [busy, setBusy] = useState('')
  const [cacheProgress, setCacheProgress] = useState<Record<string, string>>({})
  const [progressByKey, setProgressByKey] = useState<ProgressMap>({})
  const [syncText, setSyncText] = useState('')
  const [query, setQuery] = useState('')
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
  const [filesystemTree, setFilesystemTree] = useState<FilesystemNode[]>([])
  const [filesystemExpandedKeys, setFilesystemExpandedKeys] = useState<string[]>([])
  const [filesystemBusy, setFilesystemBusy] = useState(false)
  const [deleteHardMode, setDeleteHardMode] = useState(localStorage.getItem('rv_mobile_delete_mode') === 'del')
  const [sites, setSites] = useState<CgsSite[]>([])
  const [selectedSite, setSelectedSite] = useState('')
  const [keyword, setKeyword] = useState('')
  const [autoOpenConsumed, setAutoOpenConsumed] = useState(false)
  const [cgsBooks, setCgsBooks] = useState<CgsBook[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [cgsSessionId, setCgsSessionId] = useState('')
  const [cgsStatus, setCgsStatus] = useState<Record<string, unknown> | null>(null)
  const [cgsEvents, setCgsEvents] = useState<Record<string, unknown> | null>(null)
  const scrollReaderRef = useRef<HTMLDivElement | null>(null)
  const scrollProgressTimerRef = useRef<number | null>(null)
  const pendingReaderProgressRef = useRef<ReaderProgress>({ page_index: 0, scroll_top: 0, reading_mode: 'scroll' })
  const restoredScrollRef = useRef('')
  const pageTouchStartRef = useRef({ x: 0, y: 0 })
  const autoScrollingRef = useRef(false)
  const autoScrollFrameRef = useRef<number | null>(null)
  const autoScrollIntervalRef = useRef<number | null>(null)
  const edgePointerActiveRef = useRef(false)
  const backendInputRef = useRef<HTMLInputElement | null>(null)

  const cachedById = useMemo(() => new Map(cached.map((item) => [item.id, item])), [cached])
  const cachedPages = useMemo(() => cached.reduce((total, item) => total + item.cached_pages, 0), [cached])
  const cachedComplete = useMemo(() => cached.filter((item) => item.status === 'cached').length, [cached])
  const progressCount = useMemo(() => Object.values(progressByKey).filter((progress) => progress.status !== 'unread').length, [progressByKey])
  const filteredShelf = useMemo(() => {
    const value = query.trim().toLowerCase()
    return shelf.filter((book) => {
      if (seriesOnly && book.kind !== 'series') return false
      if (!value) return true
      return searchableBookTokens(book).some((token) => token.toLowerCase().includes(value))
    })
  }, [query, seriesOnly, shelf])
  const libraryPageSize = 30
  const libraryPageCount = Math.max(1, Math.ceil(filteredShelf.length / libraryPageSize))
  const libraryPageSafe = Math.min(libraryPage, libraryPageCount)
  const pagedShelf = useMemo(() => {
    const start = (libraryPageSafe - 1) * libraryPageSize
    return filteredShelf.slice(start, start + libraryPageSize)
  }, [filteredShelf, libraryPageSafe])
  const episodePageSize = 30
  const episodePageCount = Math.max(1, Math.ceil((selectedBook?.episodes.length || 0) / episodePageSize))
  const episodePageSafe = Math.min(episodePage, episodePageCount)
  const pagedEpisodes = useMemo(() => {
    const start = (episodePageSafe - 1) * episodePageSize
    return selectedBook?.episodes.slice(start, start + episodePageSize) || []
  }, [episodePageSafe, selectedBook])
  const filterKeywords = useMemo(() => {
    const keywords = new Set<string>()
    shelf.forEach((book) => {
      bookFilterKeywords(book).forEach((keyword) => keywords.add(keyword.slice(0, 20)))
    })
    return Array.from(keywords).sort((a, b) => a.localeCompare(b))
  }, [shelf])
  const activeProgress = activeItem
    ? readerMode === 'scroll'
      ? `${Math.round(readerScrollTop)} / ${Math.round(readerMaxScrollTop)} px`
      : `${pageIndex + 1} / ${Math.max(readerPages.length || activeItem.page_count, 1)}`
    : ''
  const readerToolbarVisible = readerChromeVisible
  const readerToolbarAtTop = readerSettings.btnGroupPosition === 'top'
  const cgsPercent = getStatusPercent(cgsStatus)
  const cgsDone = getStatusKey(cgsStatus) === 'completed'
  const continueTarget = useMemo(() => findContinueTarget(shelf, cached, progressByKey), [cached, shelf, progressByKey])
  const libraryEmpty = renderLibraryEmpty(connection, statusInfo, shelf.length, busy, openSettingsDrawer)
  const backendAvailable = connection === 'online'
  const backendStatusText = backendAvailable ? '服务可用' : '服务不可用'
  const requestedBook = useMemo(() => queryParam('book'), [])
  const openFirstBook = useMemo(() => queryParam('openFirst') === '1', [])

  useEffect(() => {
    void refreshCache()
    void checkBackend()
    void refreshComicConfig(backendUrl, true, false)
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    void refreshComicConfig(backendUrl, true)
  }, [backendUrl, drawerOpen])

  useEffect(() => {
    if (!toolMenuOpen) setEdgeTipAction(null)
  }, [toolMenuOpen])

  useEffect(() => {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(readerSettings))
  }, [readerSettings])

  useEffect(() => {
    if (libraryPage > libraryPageCount) setLibraryPage(libraryPageCount)
  }, [libraryPage, libraryPageCount])

  useEffect(() => {
    setEpisodePage(1)
  }, [selectedBook?.id])

  useEffect(() => {
    if (!expandedTagBookId) return
    if (!pagedShelf.some((book) => book.id === expandedTagBookId)) setExpandedTagBookId('')
  }, [expandedTagBookId, pagedShelf])

  useEffect(() => {
    if (!openOpsId) return
    if (!pagedShelf.some((book) => book.id === openOpsId)) setOpenOpsId('')
  }, [openOpsId, pagedShelf])

  useEffect(() => {
    if (autoOpenConsumed || selectedBook || view !== 'library' || !shelf.length) return
    const matched = requestedBook
      ? shelf.find((book) => book.book === requestedBook || book.title === requestedBook)
      : openFirstBook
        ? shelf[0]
        : null
    if (!matched) return
    setSelectedBook(matched)
    setAutoOpenConsumed(true)
  }, [autoOpenConsumed, openFirstBook, requestedBook, selectedBook, shelf, view])

  useEffect(() => {
    if (episodePage > episodePageCount) setEpisodePage(episodePageCount)
  }, [episodePage, episodePageCount])

  useEffect(() => {
    return () => {
      readerPages.forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [readerPages])

  useEffect(() => {
    return () => {
      if (scrollProgressTimerRef.current !== null) window.clearTimeout(scrollProgressTimerRef.current)
      stopReaderAutoScroll()
    }
  }, [])

  useEffect(() => {
    if (readerMode !== 'scroll' || view !== 'reader') stopReaderAutoScroll()
  }, [readerMode, view])

  useEffect(() => {
    if (view !== 'reader' || readerMode !== 'scroll' || !activeItem) return
    const scroller = scrollReaderRef.current
    if (!scroller) return
    const scrollTop = pendingReaderProgressRef.current.scroll_top
    const restoreKey = `${activeItem.id}:${readerMode}:${readerPages.length}`
    if (restoredScrollRef.current === restoreKey) return
    restoredScrollRef.current = restoreKey
    window.setTimeout(() => {
      const nextScroller = scrollReaderRef.current
      if (!nextScroller) return
      const maxScrollTop = Math.max(nextScroller.scrollHeight - nextScroller.clientHeight, 0)
      const nextScrollTop = clamp(scrollTop, 0, maxScrollTop)
      nextScroller.scrollTop = nextScrollTop
      setReaderScrollTop(nextScrollTop)
      setReaderMaxScrollTop(maxScrollTop)
      setReaderChromeVisible(readerChromeShouldShow(nextScrollTop, maxScrollTop, readerPages.length))
    }, 0)
  }, [activeItem?.id, readerMode, readerPages.length, view])

  useEffect(() => {
    if (view !== 'reader' || readerMode !== 'scroll') return
    setReaderLoadedImages(0)
    setReaderMaxScrollTop(0)
  }, [activeItem?.id, readerMode, readerPages.length, view])

  useEffect(() => {
    if (view !== 'reader' || readerMode !== 'scroll') return
    setReaderLoadedImages(0)
    setReaderMaxScrollTop(0)
    setReaderScrollRenderNonce((value) => value + 1)
  }, [readerSettings.showSlider, readerMode, view])

  useEffect(() => {
    let cancelled = false
    const keys = collectShelfProgressKeys(shelf)
    for (const item of cached) keys.add(progressIdentity(item.book, item.ep))
    void loadAllProgress().then((rows) => {
      if (cancelled) return
      const next: ProgressMap = {}
      for (const progress of rows) {
        const key = progressIdentity(progress.book, progress.ep)
        if (keys.has(key)) next[key] = progress
      }
      setProgressByKey(next)
    })
    return () => {
      cancelled = true
    }
  }, [cached, shelf])

  function show(tone: ToastTone, text: string) {
    setToast({ tone, text })
    window.setTimeout(() => setToast(null), 2600)
  }

  async function checkBackend(url = backendUrl) {
    try {
      const status = await apiGet<StatusInfo & { status: string; library_loaded: boolean }>(url, '/mobile/status')
      setStatusInfo({ ...status, mobile_contract: true })
      setConnection('online')
      await refreshLibrary(url, sort)
      const result = await syncPendingProgress(url)
      setSyncText(`已同步 ${result.synced} · 待处理 ${result.failed}`)
    } catch (error) {
      if (isMissingMobileContract(error)) {
        setStatusInfo({ mobile_contract: false })
        setConnection('online')
        await refreshLibrary(url, sort)
        setSyncText('兼容模式 · 无进度同步')
        return
      }
      const rows = await loadCachedItems()
      setCached(rows)
      setConnection(rows.length ? 'offline_cache_only' : 'backend_unreachable')
      setSyncText(error instanceof Error ? error.message : '连接失败')
    }
  }

  async function refreshLibrary(url = backendUrl, nextSort: SortMode = sort, resetPage = true, showLoading = true) {
    if (showLoading) setBusy('library')
    try {
      const response = await apiGet<LibraryResponse>(url, `/mobile/library?sort=${encodeURIComponent(nextSort)}&compact=1`)
      const books = response.books?.length !== undefined ? response.books : buildShelf(response.items || [])
      setShelf(books)
      if (resetPage) setLibraryPage(1)
      setStatusInfo((state) => ({ ...state, mobile_contract: true, path_configured: response.path_configured, ero: response.ero }))
      setConnection('online')
    } catch (error) {
      if (isMissingMobileContract(error)) {
        const books = await loadLegacyShelf(url, nextSort)
        setShelf(books)
        if (resetPage) setLibraryPage(1)
        setStatusInfo((state) => ({
          ...state,
          mobile_contract: false,
        }))
        setConnection('online')
        return
      }
      setConnection('backend_unreachable')
      show('error', error instanceof Error ? error.message : '读取书库失败')
    } finally {
      if (showLoading) setBusy('')
    }
  }

  async function refreshCache() {
    const rows = await loadCachedItems()
    setCached(rows)
    return rows
  }

  async function saveBackend() {
    const next = normalizeBackendUrl(backendDraft)
    if (!next) {
      show('warn', '服务地址不能为空')
      backendInputRef.current?.focus()
      return
    }
    localStorage.setItem(BACKEND_URL_KEY, next)
    setBackendUrlHistory(saveBackendUrlHistory(next, backendUrlHistory))
    setBackendUrl(next)
    setBackendDraft(next)
    show('ok', '服务地址已保存')
    await checkBackend(next)
    await refreshComicConfig(next, true, false)
  }

  function moveBackendCaretToEnd() {
    const input = backendInputRef.current
    if (!input) return
    const end = input.value.length
    window.requestAnimationFrame(() => input.setSelectionRange(end, end))
  }

  function clearBackendDraft() {
    setBackendDraft('')
    window.requestAnimationFrame(() => backendInputRef.current?.focus())
  }

  async function refreshComicConfig(url = backendUrl, silent = false, loadFilesystem = true) {
    setPathBusy('config')
    try {
      const config = await apiGet<ComicConfig>(url, '/comic/conf')
      const nextConfig = {
        path: config.path || '',
        kemono_path: config.kemono_path || '',
        path_configured: config.path_configured,
      }
      setComicConfig(nextConfig)
      setComicPathDraft(nextConfig.path)
      if (typeof nextConfig.path_configured === 'boolean') {
        setStatusInfo((state) => ({ ...state, path_configured: nextConfig.path_configured }))
      }
      if (loadFilesystem) await refreshFilesystem(nextConfig.path, url)
    } catch (error) {
      if (!silent) show('error', error instanceof Error ? error.message : '配置读取失败')
    } finally {
      setPathBusy('')
    }
  }

  async function getFilesystem(path?: string, url = backendUrl): Promise<FilesystemResponse> {
    return apiGet<FilesystemResponse>(url, `/comic/filesystem${filesystemQuery(path)}`)
  }

  async function refreshFilesystem(path?: string, url = backendUrl) {
    setFilesystemBusy(true)
    try {
      const rootResponse = await getFilesystem(path || undefined, url)
      const segments = rootResponse.path_segments || []
      const currentRoot = segments[0]?.path
      const expanded = segments.slice(0, -1).map((segment) => segment.path)
      const roots = createFilesystemNodes(rootResponse.roots || [], currentRoot)
      let nextTree = roots

      if (!segments.length) {
        setFilesystemTree(nextTree)
        setFilesystemExpandedKeys(expanded)
        return
      }

      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index]
        const response = await getFilesystem(segment.path, url)
        const children = createFilesystemChildren(segment.path, response.directories || [], segments[index + 1]?.path)

        const findAndSet = (nodes: FilesystemNode[], targetPath: string): boolean => {
          for (const node of nodes) {
            if (node.value === targetPath) {
              node.children = children
              return true
            }
            if (node.children?.length && findAndSet(node.children, targetPath)) return true
          }
          return false
        }

        findAndSet(nextTree, segment.path)
        nextTree = attachFilesystemChildren(
          nextTree,
          segment.path,
          children,
        )
      }

      setFilesystemTree(nextTree)
      setFilesystemExpandedKeys(expanded)
    } catch (error) {
      show('error', error instanceof Error ? error.message : '目录读取失败')
    } finally {
      setFilesystemBusy(false)
    }
  }

  const loadFilesystemNode: FilesystemLoadData = async (node) => {
    const path = String(node.value || '')
    if (!path) return
    const response = await getFilesystem(path)
    setFilesystemTree((current) => upsertFilesystemChildren(current, path, createFilesystemChildren(path, response.directories || [])))
  }

  async function saveComicPath(path = comicPathDraft) {
    const next = path.trim()
    if (!next) return
    setPathBusy('save-path')
    try {
      await apiPost(backendUrl, '/comic/conf', {
        path: next,
        kemono_path: comicConfig?.kemono_path || undefined,
      })
      setComicConfig((state) => ({
        path: next,
        kemono_path: state?.kemono_path || '',
        path_configured: true,
      }))
      setComicPathDraft(next)
      setStatusInfo((state) => ({ ...state, path_configured: true }))
      show('ok', '书库路径已保存')
      await refreshFilesystem(next)
      await refreshLibrary(backendUrl, sort)
    } catch (error) {
      show('error', error instanceof Error ? error.message : '路径保存失败')
    } finally {
      setPathBusy('')
    }
  }

  async function changeSort(next: SortMode) {
    setSort(next)
    setLibraryPage(1)
    await refreshLibrary(backendUrl, next)
  }

  function clearFilter() {
    setQuery('')
    setSeriesOnly(false)
    setLibraryPage(1)
  }

  function changeQuery(next: string) {
    setQuery(next)
    setLibraryPage(1)
  }

  function toggleSeriesOnly() {
    setSeriesOnly((value) => !value)
    setLibraryPage(1)
  }

  function changeLibraryPage(next: number) {
    setLibraryPage(Math.min(Math.max(next, 1), libraryPageCount))
  }

  function changeEpisodePage(next: number) {
    setEpisodePage(Math.min(Math.max(next, 1), episodePageCount))
  }

  function openSettingsDrawer() {
    setDrawerOpen(true)
    void refreshComicConfig(backendUrl, true)
  }

  function changeFilesystemExpandedKeys(keys: FilesystemExpandedKeys) {
    setFilesystemExpandedKeys(keys.map(String))
  }

  function openToolPanel(panel: 'filter' | 'sort') {
    setActiveToolPanel(panel)
    setToolMenuOpen(false)
  }

  function toggleDeleteMode() {
    const next = !deleteHardMode
    setDeleteHardMode(next)
    localStorage.setItem('rv_mobile_delete_mode', next ? 'del' : 'remove')
    show(next ? 'error' : 'warn', next ? '删除模式：彻底删除' : '删除模式：移至回收')
  }

  async function switchDoujinMode() {
    const next = !Boolean(statusInfo.ero)
    setBusy('switch-ero')
    try {
      const response = await fetch(buildUrl(backendUrl, `/comic/switch_ero?enable=${String(next)}`), { method: 'POST' })
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
      setStatusInfo((state) => ({ ...state, ero: next }))
      setSelectedBook(null)
      await refreshLibrary(backendUrl, sort)
      show(next ? 'ok' : 'warn', next ? '已切换同人' : '已切换普通')
    } catch (error) {
      show('error', error instanceof Error ? error.message : '切换失败')
    } finally {
      setBusy('')
    }
  }

  function runEdgeAction(action: EdgeAction) {
    if (action === 'filter' || action === 'sort') {
      openToolPanel(action)
      return
    }
    setToolMenuOpen(false)
    if (action === 'refresh' && busy !== 'library') void refreshLibrary()
    if (action === 'delete-mode') toggleDeleteMode()
    if (action === 'doujin' && busy !== 'switch-ero') void switchDoujinMode()
  }

  function edgeActionFromPoint(clientX: number, clientY: number): EdgeAction | null {
    const element = document.elementFromPoint(clientX, clientY)
    const button = element?.closest<HTMLButtonElement>('[data-edge-action]')
    if (!button || button.disabled) return null
    return isEdgeAction(button.dataset.edgeAction) ? button.dataset.edgeAction : null
  }

  function handleEdgeStripPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    setToolMenuOpen(true)
    edgePointerActiveRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleEdgePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!edgePointerActiveRef.current) return
    event.preventDefault()
    setEdgeTipAction(edgeActionFromPoint(event.clientX, event.clientY))
  }

  function handleEdgePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!edgePointerActiveRef.current) return
    event.preventDefault()
    const action = edgeActionFromPoint(event.clientX, event.clientY)
    edgePointerActiveRef.current = false
    setToolMenuOpen(false)
    setEdgeTipAction(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (action) runEdgeAction(action)
  }

  function handleEdgePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    edgePointerActiveRef.current = false
    setToolMenuOpen(false)
    setEdgeTipAction(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function edgeButtonClass(action: EdgeAction): string {
    return ['menu-card', edgeTipAction === action ? 'tip-active' : '']
      .filter(Boolean)
      .join(' ')
  }

  async function handleBookAction(item: LibraryItem, handle: 'save' | 'remove' | 'del') {
    setBusy(`handle:${item.id}:${handle}`)
    try {
      await apiPost(backendUrl, '/comic/handle', {
        handle,
        book: item.book,
        ep: item.ep || null,
      })
      await refreshLibrary(backendUrl, sort, false, false)
      if (selectedBook?.book === item.book) setSelectedBook(null)
      if (handle === 'save') show('ok', '已移至保留')
      else show(handle === 'del' ? 'error' : 'warn', handle === 'del' ? '已彻底删除' : '已移至回收')
    } catch (error) {
      show('error', error instanceof Error ? error.message : '操作失败')
    } finally {
      setBusy('')
    }
  }

  async function fetchAndCache(item: LibraryItem) {
    const manifest = await loadManifest(item)
    return cacheManifest(backendUrl, manifest, (done, total) => {
      setCacheProgress((state) => ({ ...state, [item.id]: `${done}/${total}` }))
    })
  }

  async function cacheItem(item: LibraryItem) {
    setBusy(`cache:${item.id}`)
    try {
      await fetchAndCache(item)
      await refreshCache()
      show('ok', '已缓存')
    } catch (error) {
      show('error', error instanceof Error ? error.message : '缓存失败')
    } finally {
      setBusy('')
    }
  }

  async function cacheSeries(book: ShelfBook) {
    const targets = book.episodes.filter((item) => !cachedById.has(item.id))
    if (!targets.length) {
      show('ok', '已全部缓存')
      return
    }
    setBusy(`series:${book.id}`)
    try {
      for (let index = 0; index < targets.length; index += 1) {
        setCacheProgress((state) => ({ ...state, [book.id]: `${index + 1}/${targets.length}` }))
        await fetchAndCache(targets[index])
      }
      await refreshCache()
      show('ok', '系列缓存完成')
    } catch (error) {
      show('error', error instanceof Error ? error.message : '系列缓存失败')
    } finally {
      setBusy('')
    }
  }

  function findShelfBookForItem(item: ReaderItem | LibraryItem): ShelfBook | undefined {
    return shelf.find((book) => {
      if (book.kind === 'single') return book.book === item.book && book.ep === item.ep
      return book.book === item.book && book.episodes.some((episode) => episode.ep === item.ep)
    })
  }

  function findReaderNeighbor(direction: -1 | 1): LibraryItem | null {
    if (!activeItem) return null
    const currentBook = findShelfBookForItem(activeItem)
    if (currentBook?.kind === 'series') {
      const index = currentBook.episodes.findIndex((episode) => episode.ep === activeItem.ep)
      const next = currentBook.episodes[index + direction]
      return next || null
    }
    const singles = shelf.filter((book) => book.kind === 'single')
    const index = singles.findIndex((book) => book.book === activeItem.book && book.ep === activeItem.ep)
    return singles[index + direction] || null
  }

  async function openReaderNeighbor(direction: -1 | 1) {
    const target = findReaderNeighbor(direction)
    if (!target) {
      show('warn', direction > 0 ? '没有下一本' : '没有上一本')
      return
    }
    stopReaderAutoScroll()
    await openLibraryItem(target)
  }

  async function openLibraryItem(item: LibraryItem) {
    const cachedItem = cachedById.get(item.id)
    if (cachedItem) {
      await openCachedReader(cachedItem, 'library')
      return
    }
    if (connection !== 'online') {
      show('warn', '当前没有本地缓存')
      return
    }
    await openRemoteReader(item)
  }

  async function openRemoteReader(item: LibraryItem) {
    setBusy(`reader:${item.id}`)
    try {
      const manifest = await loadManifest(item)
      const progress = await loadProgress(manifest.book, manifest.ep)
      const pages = manifest.pages.map((page) => buildUrl(backendUrl, page))
      const nextMode = readerSettings.readingMode
      const nextPageIndex = Math.min(progress?.page_index || 0, Math.max(pages.length - 1, 0))
      const nextScrollTop = progress?.reading_mode === 'scroll' ? progress.scroll_top || 0 : 0
      setActiveItem({
        id: manifest.id,
        book: manifest.book,
        ep: manifest.ep,
        title: manifest.title,
        page_count: manifest.page_count,
        source: 'remote',
      })
      setReaderPages(pages)
      setPageIndex(nextPageIndex)
      setReaderMode(nextMode)
      setReaderScrollTop(nextScrollTop)
      setReaderMaxScrollTop(0)
      setReaderLoadedImages(0)
      setReaderPageJumpOpen(false)
      pendingReaderProgressRef.current = { page_index: nextPageIndex, scroll_top: nextScrollTop, reading_mode: nextMode }
      restoredScrollRef.current = ''
      if (nextMode === 'scroll') {
        setReaderChromeVisible(true)
        window.setTimeout(() => restoreReaderScrollTop(), 0)
      } else {
        setReaderChromeVisible(readerChromeShouldShowPage(nextPageIndex, pages.length))
      }
      setReaderReturnView('library')
      setReaderSettingsOpen(false)
      setView('reader')
    } catch (error) {
      show('error', error instanceof Error ? error.message : '打开失败')
    } finally {
      setBusy('')
    }
  }

  async function openCachedReader(item: CachedItem, returnView: View = 'downloads') {
    setBusy(`reader:${item.id}`)
    try {
      const latest = (await getCachedItem(item.id)) || item
      const pages = await getCachedPages(latest)
      const progress = await loadProgress(latest.book, latest.ep)
      const nextMode = readerSettings.readingMode
      const nextPageIndex = Math.min(progress?.page_index || 0, Math.max(pages.length - 1, 0))
      const nextScrollTop = progress?.reading_mode === 'scroll' ? progress.scroll_top || 0 : 0
      setActiveItem({
        id: latest.id,
        book: latest.book,
        ep: latest.ep,
        title: latest.title,
        page_count: latest.page_count,
        source: 'cache',
      })
      setReaderPages(pages)
      setPageIndex(nextPageIndex)
      setReaderMode(nextMode)
      setReaderScrollTop(nextScrollTop)
      setReaderMaxScrollTop(0)
      setReaderLoadedImages(0)
      setReaderPageJumpOpen(false)
      pendingReaderProgressRef.current = { page_index: nextPageIndex, scroll_top: nextScrollTop, reading_mode: nextMode }
      restoredScrollRef.current = ''
      if (nextMode === 'scroll') {
        setReaderChromeVisible(true)
        window.setTimeout(() => restoreReaderScrollTop(), 0)
      } else {
        setReaderChromeVisible(readerChromeShouldShowPage(nextPageIndex, pages.length))
      }
      setReaderReturnView(returnView)
      setReaderSettingsOpen(false)
      setView('reader')
    } catch (error) {
      show('error', error instanceof Error ? error.message : '打开缓存失败')
    } finally {
      setBusy('')
    }
  }

  async function removeCached(item: CachedItem) {
    await deleteCachedItem(item)
    await refreshCache()
    show('ok', '缓存已删除')
  }

  async function saveReaderProgress(nextProgress: ReaderProgress) {
    if (!activeItem || !readerPages.length) return
    const safePageIndex = clamp(nextProgress.page_index, 0, Math.max(readerPages.length - 1, 0))
    const safeScrollTop = Math.max(0, Math.round(nextProgress.scroll_top))
    pendingReaderProgressRef.current = {
      page_index: safePageIndex,
      scroll_top: safeScrollTop,
      reading_mode: nextProgress.reading_mode,
    }
    if (nextProgress.reading_mode === 'page') {
      setPageIndex(safePageIndex)
      setReaderChromeVisible(readerChromeShouldShowPage(safePageIndex, readerPages.length))
    }
    if (nextProgress.reading_mode === 'scroll') {
      setReaderScrollTop(safeScrollTop)
      setReaderChromeVisible(readerChromeShouldShow(safeScrollTop, readerMaxScrollTop, readerPages.length))
    }
    const progress: Progress = {
      book: activeItem.book,
      ep: activeItem.ep,
      device_id: deviceId,
      page_index: safePageIndex,
      scroll_top: safeScrollTop,
      reading_mode: nextProgress.reading_mode,
      status: nextProgress.reading_mode === 'page'
        ? (safePageIndex >= readerPages.length - 1 ? 'completed' : 'reading')
        : (safeScrollTop >= readerMaxScrollTop && readerMaxScrollTop > 0 ? 'completed' : 'reading'),
      updated_at: Date.now(),
    }
    await saveProgress(progress)
    setProgressByKey((state) => ({ ...state, [progressIdentity(activeItem.book, activeItem.ep)]: progress }))
    try {
      await syncProgress(backendUrl, progress)
      setSyncText('进度已同步')
    } catch {
      if (statusInfo.mobile_contract === false) {
        setSyncText('兼容模式 · 仅本机进度')
        return
      }
      await queueProgress(progress)
      setConnection('offline_cache_only')
      setSyncText('离线进度已保存')
    }
  }

  function setReaderToolbarVisible(nextVisible: boolean) {
    setReaderChromeVisible(nextVisible)
  }

  async function jumpReaderPage(next: number) {
    const safe = clamp(next, 0, Math.max(readerPages.length - 1, 0))
    if (readerMode === 'scroll') {
      const image = scrollReaderRef.current?.querySelectorAll('img')[safe]
      image?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }
    await saveReaderProgress({ page_index: safe, scroll_top: 0, reading_mode: 'page' })
  }

  async function loadManifest(item: LibraryItem): Promise<Manifest> {
    try {
      return await apiGet<Manifest>(
        backendUrl,
        `/mobile/manifest?book=${encodeURIComponent(item.book)}&ep=${encodeURIComponent(item.ep || '')}`,
      )
    } catch (error) {
      if (!isMissingMobileContract(error)) throw error
      const pages = await apiGet<string[]>(
        backendUrl,
        `/comic/${encodeURIComponent(item.book)}?ep=${encodeURIComponent(item.ep || '')}`,
      )
      return {
        ...item,
        id: item.id || legacyItemId(item.book, item.ep),
        page_count: pages.length,
        pages,
        version: `comic:${item.mtime || 0}:${pages.length}`,
      }
    }
  }

  function handleReaderScroll() {
    const scroller = scrollReaderRef.current
    if (!scroller || !activeItem || !readerPages.length) return
    const scrollTop = Math.max(scroller.scrollTop, 0)
    const maxScrollTop = Math.max(scroller.scrollHeight - scroller.clientHeight, 0)
    const pageIndexFromScroll = pageIndexFromScrollTop(scroller, scrollTop)
    setReaderScrollTop(scrollTop)
    setReaderMaxScrollTop(maxScrollTop)
    setPageIndex(pageIndexFromScroll)
    setReaderChromeVisible(readerChromeShouldShow(scrollTop, maxScrollTop, readerPages.length))
    if (scrollProgressTimerRef.current !== null) window.clearTimeout(scrollProgressTimerRef.current)
    scrollProgressTimerRef.current = window.setTimeout(() => {
      void saveReaderProgress({ page_index: pageIndexFromScroll, scroll_top: scrollTop, reading_mode: 'scroll' })
    }, SCROLL_PROGRESS_DEBOUNCE_MS)
  }

  function handleReaderPageClick(event: MouseEvent<HTMLDivElement>) {
    if (readerMode !== 'page') return
    const rect = event.currentTarget.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    if (clickX < rect.width * 0.5) void jumpReaderPage(pageIndex - 1)
    else void jumpReaderPage(pageIndex + 1)
  }

  function handleReaderPageTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    if (!touch) return
    pageTouchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleReaderPageTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0]
    if (!touch) return
    const deltaX = touch.clientX - pageTouchStartRef.current.x
    const deltaY = touch.clientY - pageTouchStartRef.current.y
    if (Math.abs(deltaX) <= Math.abs(deltaY) || Math.abs(deltaX) <= PAGE_SWIPE_THRESHOLD) return
    if (deltaX > 0) void jumpReaderPage(pageIndex - 1)
    else void jumpReaderPage(pageIndex + 1)
  }

  function handleScrollImageLoad() {
    setReaderLoadedImages((loaded) => {
      const nextLoaded = loaded + 1
      window.requestAnimationFrame(() => {
        calculateReaderScrollHeight()
        if (nextLoaded === readerPages.length) restoreReaderScrollTop()
      })
      return nextLoaded
    })
  }

  function calculateReaderScrollHeight() {
    const scroller = scrollReaderRef.current
    if (!scroller) return
    setReaderMaxScrollTop(Math.max(scroller.scrollHeight - scroller.clientHeight, 0))
  }

  function restoreReaderScrollTop() {
    if (readerMode !== 'scroll' || !activeItem) return
    const scroller = scrollReaderRef.current
    if (!scroller) return
    const maxScrollTop = Math.max(scroller.scrollHeight - scroller.clientHeight, 0)
    const scrollTop = clamp(pendingReaderProgressRef.current.scroll_top, 0, maxScrollTop)
    scroller.scrollTop = scrollTop
    setReaderScrollTop(scrollTop)
    setReaderMaxScrollTop(maxScrollTop)
    setReaderChromeVisible(readerChromeShouldShow(scrollTop, maxScrollTop, readerPages.length))
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

  function inputReaderScrollSlider(value: number) {
    const scroller = scrollReaderRef.current
    if (!scroller) return
    const nextScrollTop = clamp(value, 0, readerMaxScrollTop)
    scroller.scrollTop = nextScrollTop
    setReaderScrollTop(nextScrollTop)
    setReaderChromeVisible(readerChromeShouldShow(nextScrollTop, readerMaxScrollTop, readerPages.length))
  }

  function scrollReaderToTop() {
    const scroller = scrollReaderRef.current
    if (!scroller) return
    scroller.scrollTop = 0
    setReaderScrollTop(0)
    setReaderChromeVisible(true)
  }

  function toggleReaderAutoScroll() {
    if (readerAutoScrolling) stopReaderAutoScroll()
    else startReaderAutoScroll()
  }

  function saveCurrentReaderPage() {
    void saveReaderProgress({ page_index: pageIndex, scroll_top: 0, reading_mode: 'page' })
    show('ok', `已记录第 ${pageIndex + 1} 页`)
  }

  function jumpReaderFirstPage() {
    void jumpReaderPage(0)
  }

  function jumpReaderLastPage() {
    void jumpReaderPage(Math.max(readerPages.length - 1, 0))
  }

  function saveCurrentReaderScrollTop() {
    if (readerMode !== 'scroll') return
    const scroller = scrollReaderRef.current
    const scrollTop = Math.round(scroller?.scrollTop ?? readerScrollTop)
    void saveReaderProgress({ page_index: pageIndex, scroll_top: scrollTop, reading_mode: 'scroll' })
    show('ok', `已记录翻滚像素 ${scrollTop}`)
  }

  function changeReaderMode(nextMode: ReaderMode) {
    if (nextMode === readerMode) return
    stopReaderAutoScroll()
    setReaderMode(nextMode)
    setReaderSettings((state) => ({ ...state, readingMode: nextMode }))
    setReaderSettingsOpen(false)
    setReaderPageJumpOpen(false)
    if (nextMode === 'page') {
      void saveReaderProgress({ page_index: pageIndex, scroll_top: 0, reading_mode: 'page' })
      return
    }
    pendingReaderProgressRef.current = {
      page_index: pageIndex,
      scroll_top: readerScrollTop,
      reading_mode: 'scroll',
    }
    setReaderChromeVisible(true)
    window.setTimeout(restoreReaderScrollTop, 0)
  }

  function changeReaderToolbarPosition(position: ReaderToolbarPosition) {
    setReaderSettings((state) => ({ ...state, btnGroupPosition: position }))
  }

  function changeReaderShowSlider(next: boolean) {
    setReaderSettings((state) => ({ ...state, showSlider: next }))
  }

  function changeReaderShowNavBtn(next: boolean) {
    setReaderSettings((state) => ({ ...state, showNavBtn: next }))
  }

  function changeReaderShowCenterNextPrev(next: boolean) {
    setReaderSettings((state) => ({ ...state, showCenterNextPrev: next }))
  }

  function changeReaderScrollIntervalTime(next: number) {
    setReaderSettings((state) => ({ ...state, scrollIntervalTime: Math.max(1, Math.round(next) || DEFAULT_READER_SETTINGS.scrollIntervalTime) }))
  }

  function changeReaderScrollIntervalPixel(next: number) {
    setReaderSettings((state) => ({ ...state, scrollIntervalPixel: Math.max(1, Math.round(next) || DEFAULT_READER_SETTINGS.scrollIntervalPixel) }))
  }

  function startReaderAutoScroll() {
    if (readerMode !== 'scroll' || !activeItem) return
    stopReaderAutoScroll()
    autoScrollingRef.current = true
    setReaderAutoScrolling(true)
    const animateMode = readerSettings.scrollIntervalTime <= 200 && readerSettings.scrollIntervalPixel <= 20
    if (animateMode) {
      let lastTimestamp = 0
      let currentSpeed = 0
      const targetSpeed = readerSettings.scrollIntervalPixel / Math.max(readerSettings.scrollIntervalTime, 1)
      const acceleration = 0.002
      const maxSpeed = targetSpeed * 1.2
      const step = (timestamp: number) => {
        if (!autoScrollingRef.current) return
        if (!lastTimestamp) lastTimestamp = timestamp
        const deltaTime = timestamp - lastTimestamp
        lastTimestamp = timestamp
        const scroller = scrollReaderRef.current
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
        setReaderScrollTop(nextScrollTop)
        autoScrollFrameRef.current = window.requestAnimationFrame(step)
      }
      autoScrollFrameRef.current = window.requestAnimationFrame(step)
      return
    }
    autoScrollIntervalRef.current = window.setInterval(() => {
      const scroller = scrollReaderRef.current
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
      const nextScrollTop = clamp(currentScrollTop + readerSettings.scrollIntervalPixel, 0, maxScrollTop)
      scroller.scrollTop = nextScrollTop
      setReaderScrollTop(nextScrollTop)
    }, readerSettings.scrollIntervalTime)
  }

  function stopReaderAutoScroll() {
    autoScrollingRef.current = false
    setReaderAutoScrolling(false)
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
    if (autoScrollIntervalRef.current !== null) {
      window.clearInterval(autoScrollIntervalRef.current)
      autoScrollIntervalRef.current = null
    }
  }

  async function loadCgsSites() {
    setBusy('cgs-sites')
    try {
      const response = await apiGet<{ sites: CgsSite[] }>(backendUrl, '/root/cgs/sites')
      setSites(response.sites || [])
      const first = response.sites?.[0]
      const firstIndex = first?.site_index ?? first?.index
      if (firstIndex !== undefined) setSelectedSite(String(firstIndex))
      show('ok', '站点已加载')
    } catch (error) {
      show('error', error instanceof Error ? error.message : '来源不可用')
    } finally {
      setBusy('')
    }
  }

  async function searchCgs() {
    if (!selectedSite || !keyword.trim()) return
    setBusy('cgs-search')
    try {
      const response = await apiPost<{ session_id?: string; books: CgsBook[] }>(backendUrl, '/root/cgs/search', {
        site: Number(selectedSite),
        keyword: keyword.trim(),
        page: 1,
      })
      setCgsBooks(response.books || [])
      setCgsSessionId(response.session_id || '')
      setSelectedKeys([])
      show('ok', '搜索完成')
    } catch (error) {
      show('error', error instanceof Error ? error.message : '搜索失败')
    } finally {
      setBusy('')
    }
  }

  async function submitCgs() {
    if (!selectedKeys.length || !cgsSessionId) return
    setBusy('cgs-submit')
    try {
      const response = await apiPost<Record<string, unknown>>(backendUrl, '/root/cgs/submit-books', {
        session_id: cgsSessionId,
        book_keys: selectedKeys,
      })
      setCgsStatus(response)
      show('ok', '已提交')
      await refreshCgsStatus()
    } catch (error) {
      show('error', error instanceof Error ? error.message : '提交失败')
    } finally {
      setBusy('')
    }
  }

  async function refreshCgsStatus() {
    try {
      const [status, events] = await Promise.all([
        apiGet<Record<string, unknown>>(backendUrl, '/root/cgs/status'),
        apiGet<Record<string, unknown>>(backendUrl, '/root/cgs/events'),
      ])
      setCgsStatus(status)
      setCgsEvents(events)
    } catch (error) {
      show('error', error instanceof Error ? error.message : '状态读取失败')
    }
  }

  function openTab(next: View) {
    setView(next)
    if (next !== 'library') setSelectedBook(null)
  }

  function openDrawerTab(next: View) {
    openTab(next)
    setDrawerOpen(false)
  }

  function searchArtist(artist: string | null) {
    if (!artist) {
      show('warn', '该作品无作者信息')
      return
    }
    setKeyword(artist)
    openTab('acquire')
  }

  const libraryTotal = shelf.length
  const pathConfigured = statusInfo.path_configured !== false
  const pathStatusText = pathConfigured ? '书库路径可用' : '书库路径不可用'
  const booksPathValue = comicConfig?.path || comicPathDraft
  const booksPathLabel = compactPathTail(booksPathValue)
  const comicMode = statusInfo.ero ? 'doujin' : 'manga'
  const comicModeLabel = statusInfo.ero ? '同人志' : '漫画'
  const isDoujinMode = comicMode === 'doujin'
  const selectedBookMeta = selectedBook ? ensureMeta(selectedBook.meta) : EMPTY_META
  const selectedBookProgress = selectedBook ? latestBookProgress(selectedBook, progressByKey) : undefined
  const selectedBookStats = selectedBook ? detailMetaTiles(selectedBook, selectedBookMeta, cachedById) : []

  function renderConnectionStatusDot() {
    return (
      <span className={`status-dot ${connectionTone(connection)}`} aria-label="连接状态">
        {connection === 'online' ? <Activity size={13} /> : <WifiOff size={13} />}
      </span>
    )
  }

  function renderComicModeStatusDot() {
    return (
      <span className={`status-dot comic-mode ${comicMode}`} aria-label={comicModeLabel} title={comicModeLabel}>
        <CustomIcon name="doujin" size={13} />
      </span>
    )
  }

  function renderMicroStatusRail() {
    if (view === 'downloads') {
      return (
        <>
          {renderConnectionStatusDot()}
          <span className="status-dot" aria-label="完整缓存">
            <Check size={13} />
            <strong>{cachedComplete}/{cached.length}</strong>
          </span>
          <span className="status-dot" aria-label="缓存条目">
            <Download size={13} />
            <strong>{cached.length}</strong>
          </span>
          <span className="status-dot" aria-label="缓存页数">
            <Grid2X2 size={13} />
            <strong>{cachedPages}</strong>
          </span>
        </>
      )
    }

    if (view === 'library') {
      return (
        <>
          {renderConnectionStatusDot()}
          {renderComicModeStatusDot()}
          <span className={`status-dot path-value ${pathConfigured ? 'ok' : 'warn'}`} aria-label="书库路径" title={booksPathValue || '未配置'}>
            <FolderOpen size={13} />
            <strong>{booksPathLabel}</strong>
          </span>
          <span className="status-dot" aria-label="书架数量">
            <Grid2X2 size={13} />
            <strong>{libraryTotal}</strong>
          </span>
        </>
      )
    }

    return renderConnectionStatusDot()
  }

  return (
    <div className={`shell view-${view} ${selectedBook ? 'detail-open' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
      {view !== 'reader' && (
        <>
          <button
            className="micro-menu-button"
            onClick={() => setDrawerOpen(true)}
            aria-hidden={drawerOpen}
            aria-label="打开菜单"
            tabIndex={drawerOpen ? -1 : 0}
          >
            <Menu size={18} />
          </button>
          <header className="micro-header">
            <div className="micro-status-rail">
              {renderMicroStatusRail()}
            </div>
          </header>

          <button
            className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`}
            onClick={() => setDrawerOpen(false)}
            aria-label="关闭菜单"
            tabIndex={drawerOpen ? 0 : -1}
          />
          <aside className={`left-drawer ${drawerOpen ? 'open' : ''}`} aria-label="应用菜单" aria-hidden={!drawerOpen}>
            <nav className="drawer-nav">
              <button className={view === 'library' ? 'active' : ''} onClick={() => openDrawerTab('library')}>
                <Grid2X2 size={18} />
                <span>书架</span>
              </button>
              <button className={view === 'downloads' ? 'active' : ''} onClick={() => openDrawerTab('downloads')}>
                <CustomIcon name="offline" size={18} />
                <span>离线</span>
              </button>
              <button className={view === 'acquire' ? 'active' : ''} onClick={() => openDrawerTab('acquire')}>
                <Search size={18} />
                <span>获取</span>
              </button>
            </nav>
            <details className="drawer-settings" open={connection !== 'online' || !pathConfigured}>
              <summary>
                <Settings size={17} />
                <span>设置</span>
              </summary>
              <div className="drawer-settings-body">
                <label aria-label="api-url">
                  <div className="accept-field">
                    <StatusBadgeIcon Icon={Globe2} ok={backendAvailable} label={backendStatusText} title={backendStatusText} />
                    <input
                      ref={backendInputRef}
                      value={backendDraft}
                      aria-label="api-url"
                      list={BACKEND_URL_DATALIST_ID}
                      inputMode="url"
                      autoComplete="on"
                      onChange={(event) => setBackendDraft(event.target.value)}
                      onFocus={moveBackendCaretToEnd}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void saveBackend()
                      }}
                    />
                    <datalist id={BACKEND_URL_DATALIST_ID}>
                      {backendUrlHistory.map((url) => <option key={url} value={url} />)}
                    </datalist>
                    <button className="accept-clear" onClick={clearBackendDraft} disabled={!backendDraft} aria-label="清空服务地址">
                      <X size={16} />
                    </button>
                    <button className="accept-submit" onClick={() => void saveBackend()} aria-label="保存并检测服务地址">
                      <CornerDownLeft size={16} />
                    </button>
                  </div>
                </label>

                <label aria-label="books_path">
                  <div className="accept-field">
                    <StatusBadgeIcon Icon={FolderOpen} ok={pathConfigured} label={pathStatusText} title={pathStatusText} />
                    <TreeSelect<FilesystemSelectValue, FilesystemNode>
                      className="path-tree-select"
                      value={comicPathDraft ? { value: comicPathDraft, label: comicPathDraft } : undefined}
                      aria-label="books_path"
                      labelInValue
                      treeData={filesystemTree}
                      treeNodeLabelProp="value"
                      loadData={loadFilesystemNode}
                      classNames={{ popup: { root: 'path-tree-select-dropdown' } }}
                      treeExpandedKeys={filesystemExpandedKeys}
                      onTreeExpand={changeFilesystemExpandedKeys}
                      onChange={(value) => setComicPathDraft(value?.value || '')}
                      onOpenChange={(open) => {
                        if (open && !filesystemTree.length) void refreshFilesystem(comicPathDraft || undefined)
                      }}
                      showSearch
                      treeNodeFilterProp="title"
                      treeExpandAction="click"
                      placeholder={filesystemBusy ? '目录读取中' : '选择目录'}
                      disabled={pathBusy === 'save-path'}
                      status={pathConfigured ? undefined : 'warning'}
                      styles={{
                        root: { color: 'var(--text)', WebkitTextFillColor: 'var(--text)' },
                        input: { color: 'var(--text)', WebkitTextFillColor: 'var(--text)' },
                        content: { color: 'var(--text)', WebkitTextFillColor: 'var(--text)' },
                        placeholder: { color: 'var(--text-placeholder)' },
                        popup: { root: { background: 'var(--surface-overlay)', color: 'var(--text)' } },
                      }}
                      popupMatchSelectWidth={false}
                      listHeight={260}
                      variant="borderless"
                    />
                    <button className="accept-submit" onClick={() => void saveComicPath()} disabled={pathBusy === 'save-path'} aria-label="保存书库路径">
                      {pathBusy === 'save-path' ? <LoaderCircle className="spin" size={16} /> : <CornerDownLeft size={16} />}
                    </button>
                  </div>
                </label>
              </div>
            </details>
          </aside>
        </>
      )}

      <main className="app-main">
        {view === 'library' && !selectedBook && (
          <section className={`library-workspace ${libraryEmpty ? 'is-empty' : ''}`}>
            {libraryEmpty}

            {!libraryEmpty && (
              <>
                <ShelfPager
                  current={libraryPageSafe}
                  total={filteredShelf.length}
                  pageSize={libraryPageSize}
                  onChange={changeLibraryPage}
                  label="书架分页"
                />
                <div className="shelf-grid">
                {pagedShelf.map((book) => {
                  const bookProgress = latestBookProgress(book, progressByKey)
                  const isSingle = book.kind === 'single'
                  const bookMeta = ensureMeta(book.meta)
                  const coverMetaTags = isDoujinMode ? [] : mangaCoverOverlayTags(bookMeta)
                  const rowTags = visibleDoujinTags(book, expandedTagBookId === book.id)
                  const summaryText = bookSummary(book, cachedById, progressByKey)
                  const cardOpen = () => {
                    if (isSingle) void openLibraryItem(book)
                    else setSelectedBook(book)
                  }
                  return (
                  <article className={`book-tile ${isSingle && cachedById.has(book.id) ? 'is-cached' : ''} ${bookProgress ? 'has-progress' : ''} ${book.kind}-card`} key={book.id}>
                    <div className="poster-card">
                      <button className="cover-button" onClick={cardOpen} aria-label={`打开 ${book.book}`}>
                        <Cover src={coverUrl(backendUrl, book.first_img, connection)} title={book.book} badge={null} overlayTags={coverMetaTags} />
                      </button>
                      {isSingle && (
                        <div className={`cover-ops ${openOpsId === book.id ? 'ops-open' : ''}`}>
                          <button
                            className="op-corner"
                            aria-label={`${book.book} 操作`}
                            aria-haspopup="menu"
                            aria-expanded={openOpsId === book.id}
                            onClick={() => setOpenOpsId((id) => (id === book.id ? '' : book.id))}
                          >
                            <MoreVertical size={16} />
                          </button>
                          <div className="op-actions" role="menu" aria-label={`${book.book} 操作菜单`}>
                            <button
                              className="op-action op-search"
                              onClick={() => {
                                setOpenOpsId('')
                                searchArtist(bookMeta.artist)
                              }}
                              disabled={!!busy}
                              aria-label={bookMeta.artist ? `按作者搜索 ${bookMeta.artist}` : '按作者搜索'}
                              title="按作者搜索"
                            >
                              <UserSearch size={16} />
                            </button>
                            <button
                              className={`op-action op-del ${deleteHardMode ? 'is-hard' : ''}`}
                              onClick={() => {
                                setOpenOpsId('')
                                void handleBookAction(book, deleteHardMode ? 'del' : 'remove')
                              }}
                              disabled={!!busy}
                              aria-label={`${deleteHardMode ? '彻底删除' : '移至回收'} ${book.book}`}
                              title={deleteHardMode ? '彻底删除' : '移至回收'}
                            >
                              <Trash2 size={16} />
                            </button>
                            <button
                              className="op-action op-save"
                              onClick={() => {
                                setOpenOpsId('')
                                void handleBookAction(book, 'save')
                              }}
                              disabled={!!busy}
                              aria-label={`保留 ${book.book}`}
                              title="移至保留"
                            >
                              <Save size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="tile-copy">
                      <button className="link-title" onClick={cardOpen} title={book.book}>
                        {book.book}
                      </button>
                      {isDoujinMode ? (
                        <button
                          className={`doujin-tag-row ${expandedTagBookId === book.id ? 'expanded' : ''}`}
                          onClick={() => setExpandedTagBookId((current) => (current === book.id ? '' : book.id))}
                          aria-label={`${book.book} 标签`}
                          title={bookMeta.tags.join(' / ')}
                        >
                          {rowTags.length ? rowTags.map((tag) => <Tag key={tag}>{tag}</Tag>) : <span>{bookSummary(book, cachedById, progressByKey)}</span>}
                        </button>
                      ) : (
                        <span>{summaryText}</span>
                      )}
                      {showShelfSummary(book, isDoujinMode) && <span>{bookSummary(book, cachedById, progressByKey)}</span>}
                    </div>
                  </article>
                  )
                })}
              </div>
                <ShelfPager
                  current={libraryPageSafe}
                  total={filteredShelf.length}
                  pageSize={libraryPageSize}
                  onChange={changeLibraryPage}
                  label="书架分页"
                />
              </>
            )}

          <div className={`edge-tools ${toolMenuOpen ? 'open' : ''}`}>
              <button
                className="edge-strip"
                onPointerDown={handleEdgeStripPointerDown}
                onPointerMove={handleEdgePointerMove}
                onPointerUp={handleEdgePointerUp}
                onPointerCancel={handleEdgePointerCancel}
                aria-label="书架工具"
              >
                <img className="edge-img" src={EDGE_LOGO_SRC} alt="" />
              </button>
              <div className="edge-menu" aria-hidden={!toolMenuOpen}>
                <button
                  className={edgeButtonClass('refresh')}
                  data-edge-action="refresh"
                  disabled={busy === 'library'}
                >
                  {busy === 'library' ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
                  <span className="span-tip">刷新</span>
                </button>
                <button
                  className={edgeButtonClass('filter')}
                  data-edge-action="filter"
                >
                  <Filter size={17} />
                  <span className="span-tip">筛选</span>
                </button>
                <button
                  className={edgeButtonClass('sort')}
                  data-edge-action="sort"
                >
                  <SlidersHorizontal size={17} />
                  <span className="span-tip">排序</span>
                </button>
                <button
                  className={edgeButtonClass('doujin')}
                  data-edge-action="doujin"
                  disabled={busy === 'switch-ero'}
                >
                  {busy === 'switch-ero' ? <LoaderCircle className="spin" size={17} /> : <CustomIcon name="doujin" className={`doujin-mode-icon ${comicMode}`} size={17} />}
                  <span className="span-tip">切换同人</span>
                </button>
                <button
                  className={edgeButtonClass('delete-mode')}
                  data-edge-action="delete-mode"
                >
                  <Trash2 className={`delete-mode-icon ${deleteHardMode ? 'delete' : 'remove'}`} size={17} />
                  <span className="span-tip">删除模式</span>
                </button>
              </div>
            </div>

            {activeToolPanel && (
              <>
                <button className="tool-scrim" onClick={() => setActiveToolPanel(null)} aria-label="关闭工具面板" />
                <section className={`tool-panel floating-tool-panel ${activeToolPanel === 'filter' ? 'filter-panel' : 'sort-panel'}`} aria-label={activeToolPanel === 'filter' ? '筛选' : '排序'}>
                  <div className="tool-panel-head">
                    <strong>{activeToolPanel === 'filter' ? '筛选' : '排序'}</strong>
                    <button className="icon-only" onClick={() => setActiveToolPanel(null)} aria-label="关闭">
                      <X size={16} />
                    </button>
                  </div>
                  {activeToolPanel === 'filter' ? (
                    <>
                      <label className="search-field">
                        <Search size={17} />
                        <input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="搜索书名、作者、标签或章节" autoFocus />
                        {query && (
                          <button className="icon-only" onClick={() => changeQuery('')} aria-label="清空搜索">
                            <X size={16} />
                          </button>
                        )}
                      </label>
                      <div className="chip-row" aria-label="快捷筛选">
                        <button className={seriesOnly ? 'active' : ''} onClick={toggleSeriesOnly}>
                          <FolderOpen size={15} />
                          系列
                        </button>
                        {filterKeywords.slice(0, 8).map((keyword) => (
                          <button className={query === keyword ? 'active' : ''} key={keyword} onClick={() => changeQuery(keyword)}>
                            <Tags size={15} />
                            {keyword}
                          </button>
                        ))}
                      </div>
                      {(query || seriesOnly) && (
                        <button className="ghost clear-filter" onClick={clearFilter}>
                          <X size={16} />
                          清空
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="sort-panel-grid">
                      {Object.entries(sortLabels).map(([value, label]) => (
                        <button className={sort === value ? 'active' : ''} key={value} onClick={() => void changeSort(value as SortMode)}>
                          <SlidersHorizontal size={16} />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        )}

        {view === 'library' && selectedBook && (
          <section className="detail-workspace">
            <button className="back-line" onClick={() => setSelectedBook(null)}>
                <ArrowLeft size={17} />
                书架
            </button>
            <article className="book-overview">
              <Cover src={coverUrl(backendUrl, selectedBook.first_img, connection)} title={selectedBook.book} badge={null} />
              <div className="book-overview-copy">
                <div className="detail-heading">
                  <span className="detail-kicker">{selectedBook.kind === 'series' ? '系列详情' : '作品详情'}</span>
                  <h2>{selectedBook.book}</h2>
                  <p>{bookSummary(selectedBook, cachedById, progressByKey)}</p>
                </div>
                {selectedBookProgress && (
                  <Badge
                    className="progress-pill"
                    status={selectedBookProgress.status === 'completed' ? 'success' : 'processing'}
                    text={progressLabel(selectedBookProgress)}
                  />
                )}
              </div>
            </article>
            <section className="detail-meta-panel" aria-label="作品资料">
              <div className="section-bar">
                <div>
                  <h2>资料</h2>
                  <p>常规信息与书库状态</p>
                </div>
              </div>
              <div className="detail-stats-grid">
                {selectedBookStats.map((item) => (
                  <InfoTile key={`${selectedBook.id}-${item.label}`} label={item.label} value={item.value} />
                ))}
              </div>
            </section>
            {!isDoujinMode && selectedBookMeta.tags.length > 0 && (
              <section className="detail-tag-panel" aria-label="作品标签">
                <div className="section-bar">
                  <div>
                    <h2>标签</h2>
                    <p>{selectedBookMeta.tags.length} 个</p>
                  </div>
                </div>
                <div className="detail-tag-wall">
                  {selectedBookMeta.tags.map((tag) => (
                    <Tag key={`detail-${selectedBook.id}-${tag}`}>{tag}</Tag>
                  ))}
                </div>
              </section>
            )}

            {selectedBook.kind === 'single' ? (
              <div className="overview-actions">
                <button className="primary-wide" onClick={() => void openLibraryItem(selectedBook)}>
                  <BookOpen size={17} />
                  {cachedById.has(selectedBook.id) ? '阅读缓存' : '在线阅读'}
                </button>
                <button className="ghost" onClick={() => void cacheItem(selectedBook)} disabled={connection !== 'online' || !!busy}>
                  {busy === `cache:${selectedBook.id}` ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}
                  {cacheProgress[selectedBook.id] || cacheLabel(cachedById.get(selectedBook.id))}
                </button>
              </div>
            ) : (
              <section className="episode-panel chapter-grid-panel">
                <div className="section-bar">
                  <div>
                    <h2>章节</h2>
                    <p>{selectedBook.episode_count} 话 · {bookCachedCount(selectedBook, cachedById)} 个离线</p>
                  </div>
                  <button className="compact-button" onClick={() => void cacheSeries(selectedBook)} disabled={connection !== 'online' || !!busy}>
                    {busy === `series:${selectedBook.id}` ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
                    {cacheProgress[selectedBook.id] || seriesCacheLabel(selectedBook, cachedById)}
                  </button>
                </div>
                <ShelfPager
                  current={episodePageSafe}
                  total={selectedBook.episodes.length}
                  pageSize={episodePageSize}
                  onChange={changeEpisodePage}
                  label="章节分页"
                />
                <div className="episode-grid">
                  {pagedEpisodes.map((episode) => {
                    const episodeProgress = progressByKey[progressIdentity(episode.book, episode.ep)]
                    const cachedEpisode = cachedById.get(episode.id)
                    return (
                      <article className={`book-tile episode-card ${episodeProgress ? 'has-progress' : ''}`} key={episode.id}>
                        <div className="poster-card">
                          <button className="cover-button" onClick={() => void openLibraryItem(episode)} aria-label={`打开 ${episode.ep || episode.title}`}>
                            <Cover src={coverUrl(backendUrl, episode.first_img, connection)} title={episode.ep || episode.title} badge={episodeProgress ? progressBadge(episodeProgress) : cacheLabel(cachedEpisode)} compact />
                          </button>
                        </div>
                        <div className="tile-copy">
                          <button className="link-title" onClick={() => void openLibraryItem(episode)} title={episode.ep || episode.title}>
                            {episode.ep || episode.title}
                          </button>
                          <span>{episodeProgress ? progressLabel(episodeProgress) : cachedEpisode ? cacheLabel(cachedEpisode) : '未缓存'}</span>
                          <div className="meta-chip-row episode-meta-row">
                            <Tag>{formatDate(episode.mtime)}</Tag>
                            {episodeProgress && <Tag color="gold">{progressBadge(episodeProgress)}</Tag>}
                          </div>
                        </div>
                        <ProgressMeter value={episodeProgress ? progressMeterValue(episodeProgress, cachedEpisode?.page_count) : cachedEpisode ? 100 : 0} />
                        <div className="tile-actions">
                          <button onClick={() => void openLibraryItem(episode)}>
                            <BookOpen size={16} />
                            {cachedEpisode ? '读' : '看'}
                          </button>
                          <button className="ghost" onClick={() => void cacheItem(episode)} disabled={connection !== 'online' || !!busy}>
                            {busy === `cache:${episode.id}` ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
                            {cacheProgress[episode.id] || cacheLabel(cachedEpisode)}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
                <ShelfPager
                  current={episodePageSafe}
                  total={selectedBook.episodes.length}
                  pageSize={episodePageSize}
                  onChange={changeEpisodePage}
                  label="章节分页"
                />
              </section>
            )}
          </section>
        )}

        {view === 'downloads' && (
          <section className="downloads-workspace">
            <div className="section-bar">
              <div>
                <h2>离线书架</h2>
                <p>{cached.length} 个缓存 · {cachedPages} 页 · {connection === 'offline_cache_only' ? '离线可读' : '在线可同步'}</p>
              </div>
              <button className="compact-button" onClick={() => void refreshCache()}>
                <RefreshCw size={17} />
                刷新
              </button>
            </div>
            <div className="cache-summary">
              <InfoTile label="完整" value={`${cachedComplete}/${cached.length}`} />
              <InfoTile label="页面" value={`${cachedPages}`} />
              <InfoTile label="进度" value={`${progressCount}`} />
            </div>
            {!cached.length && <EmptyState title="暂无缓存" />}
            <div className="download-list">
              {cached.map((item) => {
                const itemProgress = progressByKey[progressIdentity(item.book, item.ep)]
                return (
                <article className={`download-row ${itemProgress ? 'has-progress' : ''}`} key={item.id}>
                  <Cover src={coverUrl(backendUrl, item.first_img, connection)} title={item.title} badge={itemProgress ? progressBadge(itemProgress) : cacheLabel(item)} compact />
                  <div className="row-copy">
                    <strong>{item.title}</strong>
                    <span>{item.cached_pages}/{item.page_count} 页 · {formatDate(item.cached_at / 1000)}{itemProgress ? ` · ${progressLabel(itemProgress)}` : ''}</span>
                    <ProgressMeter value={itemProgress ? progressMeterValue(itemProgress, item.page_count) : cacheMeterValue(item)} />
                  </div>
                  <div className="row-actions">
                    <button onClick={() => void openCachedReader(item, 'downloads')}>
                      <BookOpen size={16} />
                      阅读
                    </button>
                    <button className="ghost danger" onClick={() => void removeCached(item)} aria-label="删除缓存">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
                )
              })}
            </div>
          </section>
        )}

        {view === 'reader' && activeItem && (
          <section className={`reader mode-${readerMode} fit-${readerFit} ${readerToolbarAtTop ? 'toolbar-top' : 'toolbar-bottom'} ${readerChromeVisible ? 'chrome-on' : 'chrome-off'}`}>
            {readerToolbarVisible && readerToolbarAtTop && (
              <div className="reader-topbar">
                <button className="reader-icon" onClick={() => setView(readerReturnView === 'reader' ? 'library' : readerReturnView)} aria-label="返回">
                  <ArrowLeft size={19} />
                </button>
                <div>
                  <strong>{activeItem.title}</strong>
                  <span>{readerTrustLine(activeItem, readerMode, statusInfo, syncText)}</span>
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
            )}

            {!readerToolbarVisible && (
              <button className="reader-float-menu" onClick={() => setReaderChromeVisible(true)}>
                <Settings size={16} />
                {activeProgress}
              </button>
            )}

            {readerSettingsOpen && readerToolbarVisible && (
              <div className="reader-settings-panel">
                <div className="segmented">
                  <button className={readerMode === 'page' ? 'active' : ''} onClick={() => changeReaderMode('page')}>翻页</button>
                  <button className={readerMode === 'scroll' ? 'active' : ''} onClick={() => changeReaderMode('scroll')}>连续</button>
                </div>
                <div className="segmented">
                  <button className={readerFit === 'contain' ? 'active' : ''} onClick={() => setReaderFit('contain')}>适屏</button>
                  <button className={readerFit === 'width' ? 'active' : ''} onClick={() => setReaderFit('width')}>适宽</button>
                </div>
                <div className="segmented">
                  <button className={readerSettings.btnGroupPosition === 'top' ? 'active' : ''} onClick={() => changeReaderToolbarPosition('top')}>置顶</button>
                  <button className={readerSettings.btnGroupPosition === 'bottom' ? 'active' : ''} onClick={() => changeReaderToolbarPosition('bottom')}>置底</button>
                </div>
                <div className="segmented">
                  <button className={readerSettings.showSlider ? 'active' : ''} onClick={() => changeReaderShowSlider(!readerSettings.showSlider)}>滑块</button>
                  <button className={readerSettings.showNavBtn ? 'active' : ''} onClick={() => changeReaderShowNavBtn(!readerSettings.showNavBtn)}>导航</button>
                </div>
                <div className="segmented">
                  <button className={readerSettings.showCenterNextPrev ? 'active' : ''} onClick={() => changeReaderShowCenterNextPrev(!readerSettings.showCenterNextPrev)}>中置翻页</button>
                  <button className={readerAutoScrolling ? 'active' : ''} onClick={toggleReaderAutoScroll}>{readerAutoScrolling ? '停止' : '自动'}</button>
                </div>
                <div className="reader-setting-line">
                  <button className="ghost" onClick={scrollReaderToTop} disabled={readerMode !== 'scroll'}>回顶</button>
                  <button className="ghost" onClick={readerMode === 'scroll' ? saveCurrentReaderScrollTop : saveCurrentReaderPage}>记录</button>
                </div>
                <label className="reader-slider reader-speed">
                  <span>{readerSettings.scrollIntervalTime} ms · {readerSettings.scrollIntervalPixel} px</span>
                  <input
                    type="range"
                    min="1"
                    max="400"
                    value={readerSettings.scrollIntervalTime}
                    onChange={(event) => changeReaderScrollIntervalTime(Number(event.target.value))}
                  />
                  <input
                    type="range"
                    min="1"
                    max="40"
                    value={readerSettings.scrollIntervalPixel}
                    onChange={(event) => changeReaderScrollIntervalPixel(Number(event.target.value))}
                  />
                </label>
              </div>
            )}

            <div className={`reader-stage ${readerToolbarAtTop ? '' : 'dock-bottom'}`}>
              {readerMode === 'page' ? (
                <div
                  className="reader-page-frame"
                  onClick={handleReaderPageClick}
                  onTouchStart={handleReaderPageTouchStart}
                  onTouchEnd={handleReaderPageTouchEnd}
                >
                  {readerPages[pageIndex] ? <img src={readerPages[pageIndex]} alt={activeItem.title} /> : <LoaderCircle className="spin" size={30} />}
                  <button
                    className="reader-hit left"
                    onClick={(event) => {
                      event.stopPropagation()
                      void jumpReaderPage(pageIndex - 1)
                    }}
                    disabled={pageIndex <= 0}
                    aria-label="上一页"
                  />
                  <button
                    className="reader-hit right"
                    onClick={(event) => {
                      event.stopPropagation()
                      void jumpReaderPage(pageIndex + 1)
                    }}
                    disabled={pageIndex >= readerPages.length - 1}
                    aria-label="下一页"
                  />
                  {!readerSettings.showSlider && readerPages.length > 0 && (
                    <div className="reader-page-indicator" onClick={(event) => event.stopPropagation()}>
                      {readerPageJumpOpen && (
                        <button onClick={jumpReaderFirstPage} disabled={pageIndex === 0} aria-label="首页">
                          <ChevronsLeft size={16} />
                        </button>
                      )}
                      <button onClick={() => setReaderPageJumpOpen((value) => !value)}>
                        {pageIndex + 1} / {readerPages.length}
                      </button>
                      {readerPageJumpOpen && (
                        <button onClick={jumpReaderLastPage} disabled={pageIndex >= readerPages.length - 1} aria-label="末页">
                          <ChevronsRight size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div key={readerScrollRenderNonce} ref={scrollReaderRef} className="reader-scroll-surface" onScroll={handleReaderScroll}>
                  {readerPages.map((page, index) => (
                    <img key={page} src={page} alt={`${activeItem.title} ${index + 1}`} loading={readerSettings.showSlider ? 'eager' : 'lazy'} onLoad={handleScrollImageLoad} />
                  ))}
                </div>
              )}
            </div>

            {readerMode === 'scroll' && readerMaxScrollTop > 0 && (
              <div className="reader-scroll-progress" aria-hidden="true">
                <div style={{ height: `${clamp((readerScrollTop / readerMaxScrollTop) * 100, 0, 100)}%` }} />
              </div>
            )}

            {readerSettings.showCenterNextPrev && readerToolbarVisible && (
              <div className="reader-center-nav" aria-label="章节导航">
                <button onClick={() => openReaderNeighbor(-1)} aria-label="上一章">
                  <ChevronsLeft size={20} />
                </button>
                <button onClick={() => openReaderNeighbor(1)} aria-label="下一章">
                  <ChevronsRight size={20} />
                </button>
              </div>
            )}

            {readerToolbarVisible && (
              <div className={`reader-dock ${readerToolbarAtTop ? 'dock-top' : 'dock-bottom'}`}>
                {readerMode === 'page' && (
                  <button onClick={() => void jumpReaderPage(pageIndex - 1)} disabled={pageIndex <= 0}>
                    <ChevronLeft size={20} />
                    上一页
                  </button>
                )}
                {readerMode === 'scroll' && readerSettings.showNavBtn && (
                  <button onClick={scrollReaderToTop}>
                    <ArrowUp size={20} />
                    回顶
                  </button>
                )}
                {readerSettings.showSlider ? (
                  <label className="reader-slider">
                    <span>{activeProgress}</span>
                    <input
                      type="range"
                      min="0"
                      max={readerMode === 'scroll' ? Math.max(Math.round(readerMaxScrollTop), 0) : Math.max(readerPages.length - 1, 0)}
                      value={readerMode === 'scroll' ? Math.round(readerScrollTop) : pageIndex}
                      onChange={(event) => {
                        if (readerMode === 'scroll') inputReaderScrollSlider(Number(event.target.value))
                        else void jumpReaderPage(Number(event.target.value))
                      }}
                    />
                  </label>
                ) : (
                  <span className="reader-progress-text">{activeProgress}</span>
                )}
                {readerMode === 'scroll' ? (
                  <>
                    {readerSettings.showNavBtn && (
                      <button onClick={toggleReaderAutoScroll}>
                        {readerAutoScrolling ? <Pause size={20} /> : <ArrowDown size={20} />}
                        {readerAutoScrolling ? '停止' : '自动'}
                      </button>
                    )}
                    <button onClick={saveCurrentReaderScrollTop}>
                      <Save size={20} />
                      记录
                    </button>
                  </>
                ) : (
                  <button onClick={() => void jumpReaderPage(pageIndex + 1)} disabled={pageIndex >= readerPages.length - 1}>
                    下一页
                    <ChevronRight size={20} />
                  </button>
                )}
                {!readerToolbarAtTop && (
                  <button onClick={() => setReaderSettingsOpen((value) => !value)}>
                    <Settings size={20} />
                    设置
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {view === 'acquire' && (
          <section className="acquire-workspace">
            <div className="section-bar">
              <div>
                <h2>获取</h2>
                <p>搜索、提交、入库、缓存</p>
              </div>
              <button className="compact-button" onClick={() => void loadCgsSites()} disabled={busy === 'cgs-sites'}>
                {busy === 'cgs-sites' ? <LoaderCircle className="spin" size={17} /> : <PlugZap size={17} />}
                站点
              </button>
            </div>
            <div className="flow-strip" aria-label="获取流程">
              <span className={sites.length ? 'done' : 'current'}>1 站点</span>
              <span className={cgsBooks.length ? 'done' : sites.length ? 'current' : ''}>2 搜索</span>
              <span className={cgsStatus ? 'done' : cgsBooks.length ? 'current' : ''}>3 提交</span>
              <span className={cgsDone ? 'done' : cgsStatus ? 'current' : ''}>4 入库</span>
            </div>
            <div className="acquire-panel">
              <select value={selectedSite} onChange={(event) => setSelectedSite(event.target.value)} aria-label="选择站点">
                <option value="">选择站点</option>
                {sites.map((site) => {
                  const index = site.site_index ?? site.index
                  return (
                    <option value={index} key={String(index)}>
                      {site.spider_name || site.name || index}
                    </option>
                  )
                })}
              </select>
              <label className="search-field">
                <Search size={17} />
                <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="关键词或分享文本" />
              </label>
              <button onClick={() => void searchCgs()} disabled={busy === 'cgs-search' || !selectedSite || !keyword.trim()}>
                {busy === 'cgs-search' ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
                搜索
              </button>
            </div>
            <div className="cgs-results">
              {cgsBooks.map((book) => {
                const key = book.book_key || ''
                const checked = selectedKeys.includes(key)
                return (
                  <label className="result-row" key={key || JSON.stringify(book)}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!key || book.supported === false}
                      onChange={(event) =>
                        setSelectedKeys((rows) => (event.target.checked ? [...rows, key] : rows.filter((row) => row !== key)))
                      }
                    />
                    <div>
                      <strong>{book.title || book.name || key}</strong>
                      <span>{book.supported === false ? '不支持提交' : key ? '可提交' : '缺少标识'}</span>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="inline-actions acquire-actions">
              <button onClick={() => void submitCgs()} disabled={!selectedKeys.length || !cgsSessionId || busy === 'cgs-submit'}>
                {busy === 'cgs-submit' ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                提交选中
              </button>
              <button className="ghost" onClick={() => void refreshCgsStatus()}>
                <Activity size={16} />
                状态
              </button>
            </div>
            {(cgsStatus || cgsEvents) && (
              <div className="status-card">
                <div>
                  <strong>{getStatusLabel(cgsStatus)}</strong>
                  <span>{cgsPercent !== null ? `${cgsPercent}%` : '状态已更新'}</span>
                </div>
                {cgsPercent !== null && <ProgressMeter value={cgsPercent} />}
                {cgsDone && (
                  <div className="post-cgs-actions">
                    <button onClick={() => void refreshLibrary().then(() => openTab('library'))}>
                      <Grid2X2 size={16} />
                      打开书架
                    </button>
                    <button className="ghost" onClick={() => openTab('downloads')}>
                      <Download size={16} />
                      查看缓存
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

      </main>

      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          <span className="toast-mark" aria-hidden="true">{toastIcon(toast.tone)}</span>
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  )
}

const SHELF_PAGER_THEME = {
  algorithm: theme.darkAlgorithm,
  token: { colorPrimary: '#d9b35f' },
}

function ShelfPager({
  current,
  total,
  pageSize,
  onChange,
  label,
}: {
  current: number
  total: number
  pageSize: number
  onChange: (page: number) => void
  label: string
}) {
  return (
    <ConfigProvider theme={SHELF_PAGER_THEME} locale={zhCN}>
      <nav className="shelf-pager" aria-label={label}>
        <Pagination
          size="small"
          align="center"
          current={current}
          total={total}
          pageSize={pageSize}
          showSizeChanger={false}
          showQuickJumper
          showLessItems
          onChange={(page) => onChange(page)}
        />
      </nav>
    </ConfigProvider>
  )
}

function Cover({
  src,
  title,
  badge,
  overlayTags = [],
  compact = false,
  stackIndex,
}: {
  src: string
  title: string
  badge: string | null
  overlayTags?: CoverOverlayTag[]
  compact?: boolean
  stackIndex?: number
}) {
  const topLeft = overlayTags.filter((tag) => tag.anchor === 'top-left')
  const topRight = overlayTags.filter((tag) => tag.anchor === 'top-right')
  const bottomLeft = overlayTags.filter((tag) => tag.anchor === 'bottom-left')
  const bottomRight = overlayTags.filter((tag) => tag.anchor === 'bottom-right')
  return (
    <div className={`cover ${compact ? 'compact' : ''} ${stackIndex !== undefined ? `stack-cover stack-${stackIndex}` : ''}`}>
      <BookOpen size={compact ? 22 : 34} />
      {src && <img src={src} alt={title} loading="lazy" decoding="async" draggable={false} onError={(event) => { event.currentTarget.hidden = true }} />}
      {topLeft.length > 0 && (
        <div className="cover-overlay-stack top-left" aria-hidden="true">
          {topLeft.map((tag) => (
            <Tag key={tag.key} className={`cover-overlay-tag tone-${tag.tone}`} title={tag.title} bordered={false}>
              {tag.text}
            </Tag>
          ))}
        </div>
      )}
      {topRight.length > 0 && (
        <div className="cover-overlay-stack top-right" aria-hidden="true">
          {topRight.map((tag) => (
            <Tag key={tag.key} className={`cover-overlay-tag tone-${tag.tone}`} title={tag.title} bordered={false}>
              {tag.text}
            </Tag>
          ))}
        </div>
      )}
      {bottomLeft.length > 0 && (
        <div className="cover-overlay-stack bottom-left" aria-hidden="true">
          {bottomLeft.map((tag) => (
            <Tag key={tag.key} className={`cover-overlay-tag tone-${tag.tone}`} title={tag.title} bordered={false}>
              {tag.text}
            </Tag>
          ))}
        </div>
      )}
      {bottomRight.length > 0 && (
        <div className="cover-overlay-stack bottom-right" aria-hidden="true">
          {bottomRight.map((tag) => (
            <Tag key={tag.key} className={`cover-overlay-tag tone-${tag.tone}`} title={tag.title} bordered={false}>
              {tag.text}
            </Tag>
          ))}
        </div>
      )}
      {badge && <Tag className="cover-badge-tag">{badge}</Tag>}
    </div>
  )
}

function EmptyState({ icon, title, action }: { icon?: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      {action}
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ProgressMeter({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(Math.round(value), 100))
  return (
    <div className="progress-track" aria-label={`进度 ${safe}%`}>
      <div style={{ width: `${safe}%` }} />
    </div>
  )
}

function toastIcon(tone: ToastTone): React.ReactNode {
  if (tone === 'ok') return <Check size={15} />
  if (tone === 'warn') return <AlertCircle size={15} />
  return <X size={15} />
}

function syncShort(text: string): string {
  if (!text) return '待检测'
  if (text.includes('兼容')) return '本机'
  if (text.includes('待处理')) {
    const pending = text.match(/待处理\s*(\d+)/)?.[1]
    return pending && pending !== '0' ? `待 ${pending}` : '已同步'
  }
  if (text.includes('离线')) return '离线'
  if (text.includes('失败') || text.includes('Error')) return '异常'
  if (text.includes('/') || text.includes('http') || text.includes('HTTP')) return '异常'
  return text.slice(0, 4)
}

function syncDisplay(text: string): string {
  if (!text) return ''
  if (text.includes('兼容')) return '本机进度'
  if (text.includes('已同步')) return '已同步'
  if (text.includes('待处理')) return syncShort(text)
  if (text.includes('离线')) return '离线保存'
  if (text.includes('/') || text.includes('http') || text.includes('Error') || text.includes('失败')) return '连接异常'
  return text
}

function connectionTone(connection: ConnectionState): StatusTone {
  if (connection === 'online') return 'ok'
  if (connection === 'backend_unreachable') return 'error'
  if (connection === 'offline_cache_only') return 'warn'
  return 'neutral'
}

function ensureMeta(meta?: LibraryMeta | null): LibraryMeta {
  return {
    ...EMPTY_META,
    ...meta,
    tags: Array.isArray(meta?.tags) ? meta.tags.filter(Boolean) : [],
  }
}

function mangaCoverOverlayTags(meta: LibraryMeta): CoverOverlayTag[] {
  const tags: CoverOverlayTag[] = []
  if (meta.pages !== null) {
    tags.push({ key: 'pages', text: `${meta.pages}P`, title: `${meta.pages} 页`, anchor: 'top-left', tone: 'pages' })
  }
  if (meta.btype) {
    tags.push({ key: 'btype', text: meta.btype, title: meta.btype, anchor: 'top-right', tone: 'type' })
  }
  if (meta.artist) {
    tags.push({ key: 'artist', text: `作者 ${meta.artist}`, title: meta.artist, anchor: 'bottom-left', tone: 'artist' })
  }
  if (meta.source) {
    tags.push({ key: 'source', text: `源 ${meta.source}`, title: meta.source, anchor: 'bottom-right', tone: 'source' })
  }
  return tags
}

function detailMetaTiles(book: ShelfBook, meta: LibraryMeta, cachedById: Map<string, CachedItem>): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = []
  if (meta.artist) items.push({ label: '作者', value: meta.artist })
  if (meta.btype) items.push({ label: '类型', value: meta.btype })
  if (meta.source) items.push({ label: '源站', value: meta.source })
  if (meta.pages !== null) items.push({ label: '页数', value: `${meta.pages}P` })
  if (meta.public_date) items.push({ label: '更新', value: meta.public_date })
  if (book.kind === 'series') items.push({ label: '章节', value: `${book.episode_count} 话` })
  const cachedCount = bookCachedCount(book, cachedById)
  items.push({
    label: '离线',
    value: book.kind === 'series' ? `${cachedCount} / ${book.episode_count}` : cachedCount ? '已缓存' : '未缓存',
  })
  return items
}

function searchableBookTokens(book: ShelfBook): string[] {
  const meta = ensureMeta(book.meta)
  return [
    book.book,
    meta.artist || '',
    meta.source || '',
    meta.btype || '',
    ...meta.tags,
    ...book.episodes.flatMap((episode) => [episode.ep, episode.title]),
  ].filter(Boolean)
}

function bookFilterKeywords(book: ShelfBook): string[] {
  const meta = ensureMeta(book.meta)
  return [meta.artist || '', meta.source || '', meta.btype || '', ...meta.tags].filter(Boolean)
}

function visibleDoujinTags(book: ShelfBook, expanded: boolean): string[] {
  const tags = ensureMeta(book.meta).tags.slice(0, 5)
  if (expanded) return tags
  return tags
}

function showShelfSummary(book: ShelfBook, isDoujinMode: boolean): boolean {
  void book
  return isDoujinMode
}

function buildShelf(items: LibraryItem[]): ShelfBook[] {
  const singles: ShelfBook[] = []
  const grouped = new Map<string, LibraryItem[]>()
  for (const item of items) {
    if (item.ep) grouped.set(item.book, [...(grouped.get(item.book) || []), item])
    else singles.push({ ...item, kind: 'single', episode_count: 0, episodes: [] })
  }
  const series = Array.from(grouped.entries()).map(([book, episodes]) => {
    const sorted = [...episodes].sort((a, b) => a.ep.localeCompare(b.ep, undefined, { numeric: true }))
    const latest = sorted.reduce((prev, next) => (next.mtime > prev.mtime ? next : prev), sorted[0])
    return {
      id: latest.id,
      kind: 'series' as const,
      book,
      ep: '',
      title: book,
      first_img: sorted.find((item) => item.first_img)?.first_img || null,
      mtime: latest.mtime,
      ero: latest.ero,
      meta: ensureMeta(latest.meta),
      episode_count: sorted.length,
      episodes: sorted,
    }
  })
  return [...singles, ...series]
}

function legacyItemId(book: string, ep: string): string {
  return `${book}::${ep || ''}`
}

function legacyItem(book: string, ep: string, firstImg: string | null, title?: string): LibraryItem {
  return {
    id: legacyItemId(book, ep),
    book,
    ep,
    title: title || (ep ? `${book} / ${ep}` : book),
    first_img: firstImg,
    mtime: 0,
    ero: 0,
    meta: EMPTY_META,
  }
}

async function loadLegacyShelf(backendUrl: string, sort: SortMode): Promise<ShelfBook[]> {
  const rows = await apiGet<LegacyComicBook[]>(backendUrl, '/comic/')
  const books = rows.map((row) => {
    const episodes = Array.isArray(row.eps)
      ? row.eps.map((ep) => legacyItem(row.book, ep.ep || '', ep.first_img || row.first_img || null))
      : []
    if (episodes.length) {
      const sorted = episodes.sort((a, b) => a.ep.localeCompare(b.ep, undefined, { numeric: true }))
      return {
        ...legacyItem(row.book, '', row.first_img || sorted[0]?.first_img || null, row.book),
        kind: 'series' as const,
        episode_count: sorted.length,
        episodes: sorted,
      }
    }
    return {
      ...legacyItem(row.book, '', row.first_img || null, row.book),
      kind: 'single' as const,
      episode_count: 0,
      episodes: [],
    }
  })

  return books.sort((a, b) => {
    if (sort === 'name_asc') return a.book.localeCompare(b.book, undefined, { numeric: true })
    if (sort === 'name_desc') return b.book.localeCompare(a.book, undefined, { numeric: true })
    return 0
  })
}

function isMissingMobileContract(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes('404') && error.message.includes('Not Found')
}

function coverUrl(backendUrl: string, firstImg: string | null, connection: ConnectionState): string {
  if (!firstImg || connection === 'offline_cache_only') return ''
  return buildUrl(backendUrl, firstImg)
}

function cacheLabel(item?: CachedItem): string {
  if (!item) return '缓存'
  if (item.status === 'partial') return `${item.cached_pages}/${item.page_count}`
  return '已缓存'
}

function seriesCacheLabel(book: ShelfBook, cachedById: Map<string, CachedItem>): string {
  const count = book.episodes.filter((episode) => cachedById.has(episode.id)).length
  return count ? `${count}/${book.episode_count}` : '缓存'
}

function progressIdentity(book: string, ep: string): string {
  return `${book}::${ep || ''}`
}

function collectShelfProgressKeys(books: ShelfBook[]): Set<string> {
  const keys = new Set<string>()
  for (const book of books) {
    if (book.kind === 'series') {
      for (const episode of book.episodes) keys.add(progressIdentity(episode.book, episode.ep))
    } else {
      keys.add(progressIdentity(book.book, book.ep))
    }
  }
  return keys
}

function progressLabel(progress: Progress): string {
  const page = Math.max(progress.page_index + 1, 1)
  if (progress.status === 'completed') return `已读完 · 第 ${page} 页`
  return `读到第 ${page} 页`
}

function progressBadge(progress: Progress): string {
  if (progress.status === 'completed') return '读完'
  return `第 ${Math.max(progress.page_index + 1, 1)} 页`
}

function progressMeterValue(progress: Progress, pageCount?: number): number {
  if (progress.status === 'completed') return 100
  const total = Math.max(pageCount || progress.page_index + 1, 1)
  return ((progress.page_index + 1) / total) * 100
}

function cacheMeterValue(item: CachedItem): number {
  if (item.status === 'cached') return 100
  return (item.cached_pages / Math.max(item.page_count, 1)) * 100
}

function latestBookProgress(book: ShelfBook, progressByKey: ProgressMap): Progress | undefined {
  if (book.kind === 'single') return progressByKey[progressIdentity(book.book, book.ep)]
  return book.episodes
    .map((episode) => progressByKey[progressIdentity(episode.book, episode.ep)])
    .filter((progress): progress is Progress => Boolean(progress))
    .sort((a, b) => b.updated_at - a.updated_at)[0]
}

function bookCachedCount(book: ShelfBook, cachedById: Map<string, CachedItem>): number {
  if (book.kind === 'single') return cachedById.has(book.id) ? 1 : 0
  return book.episodes.filter((episode) => cachedById.has(episode.id)).length
}

function bookSummary(book: ShelfBook, cachedById: Map<string, CachedItem>, progressByKey: ProgressMap): string {
  const progress = latestBookProgress(book, progressByKey)
  const cached = bookCachedCount(book, cachedById)
  if (progress) return progressLabel(progress)
  if (book.kind === 'single') return cached ? '已缓存' : '单本'
  return cached ? `${book.episode_count} 话 · ${cached} 个离线` : `${book.episode_count} 话`
}

function cachedAsLibraryItem(item: CachedItem): LibraryItem {
  return {
    id: item.id,
    book: item.book,
    ep: item.ep,
    title: item.title,
    first_img: item.first_img,
    mtime: item.cached_at / 1000,
    ero: 0,
    meta: EMPTY_META,
  }
}

function findContinueTarget(shelf: ShelfBook[], cached: CachedItem[], progressByKey: ProgressMap): ContinueTarget | null {
  const items = new Map<string, LibraryItem>()
  for (const book of shelf) {
    if (book.kind === 'series') {
      for (const episode of book.episodes) items.set(progressIdentity(episode.book, episode.ep), episode)
    } else {
      items.set(progressIdentity(book.book, book.ep), book)
    }
  }
  for (const item of cached) items.set(progressIdentity(item.book, item.ep), cachedAsLibraryItem(item))

  return Object.entries(progressByKey)
    .map(([key, progress]) => ({ item: items.get(key), progress }))
    .filter((entry): entry is ContinueTarget => Boolean(entry.item))
    .sort((a, b) => b.progress.updated_at - a.progress.updated_at)[0] || null
}

function readerTrustLine(activeItem: ReaderItem, readerMode: ReaderMode, statusInfo: StatusInfo, syncText: string): string {
  const source = activeItem.source === 'cache' ? '本地缓存' : '在线书库'
  const mode = readerMode === 'page' ? '翻页' : '连续'
  const sync = statusInfo.mobile_contract === false ? '本机进度' : syncDisplay(syncText) || '进度同步'
  return `${source} · ${mode} · ${sync}`
}

function formatDate(seconds: number): string {
  if (!seconds) return '-'
  return new Date(seconds * 1000).toLocaleDateString()
}

function renderLibraryEmpty(
  connection: ConnectionState,
  statusInfo: StatusInfo,
  shelfLength: number,
  busy: string,
  openSettings: () => void,
) {
  if (busy === 'library') return <EmptyState icon={<LoaderCircle className="spin" size={28} />} title="正在加载书架" />
  if (shelfLength) return null
  if (connection === 'backend_unreachable') {
    return <EmptyState title="服务不可达" />
  }
  if (statusInfo.path_configured === false) {
    return <EmptyState icon={<AlertCircle size={28} />} title="漫画路径未配置" action={<button onClick={openSettings}>连接设置</button>} />
  }
  return <EmptyState icon={<BookOpen size={28} />} title="暂无书籍" />
}

function getStatusKey(status: Record<string, unknown> | null): string {
  const job = status?.job
  if (job && typeof job === 'object') {
    const jobStatus = (job as { status?: unknown }).status
    if (typeof jobStatus === 'string') return jobStatus
  }
  const value = status?.status
  return typeof value === 'string' ? value : status ? 'submitted' : '未提交'
}

function getStatusLabel(status: Record<string, unknown> | null): string {
  const key = getStatusKey(status)
  if (key === 'completed') return '已入库'
  if (key === 'submitted') return '已提交'
  if (key === 'running') return '进行中'
  if (key === 'failed') return '失败'
  if (key === 'pending') return '等待中'
  return '状态'
}

function getStatusPercent(status: Record<string, unknown> | null): number | null {
  const job = status?.job
  const progress = job && typeof job === 'object' ? (job as { progress?: unknown }).progress : status?.progress
  if (!progress || typeof progress !== 'object') return null
  const percent = (progress as { percent?: unknown }).percent
  return typeof percent === 'number' ? percent : null
}
