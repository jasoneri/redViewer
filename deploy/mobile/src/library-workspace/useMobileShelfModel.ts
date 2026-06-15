import { AlertCircle, BookOpen, LoaderCircle } from 'lucide-react'
import { createElement } from 'react'
import type { ToastTone } from '../app-shell/useMobileAppModel'
import type { AppState } from '../app-shell/useAppState'
import type { DetailWorkspaceProps } from '../detail-workspace/DetailWorkspace'
import { EmptyState } from '../shared/Cover'
import type { CachedItem, ConnectionState } from '../mobileStore'
import { EDGE_LOGO_SRC, MENU_LOGO_SRC } from '../app-shell/appMeta'
import type { useMobileReaderRuntimeModel } from '../reader-workspace/useReaderRuntime'
import { useLibraryReaderActions } from './useLibraryReaderActions'
import { useLibraryWorkspaceController } from './useLibraryWorkspaceController'
import { useShelfDerivedState } from './useShelfDerivedState'
import type { LibraryWorkspaceProps } from './LibraryWorkspace'
import {
  EMPTY_META,
  bookCachedCount,
  bookSummary,
  cacheLabel,
  coverUrl,
  detailBookSummary,
  detailChapterTotal,
  detailKindOverlayTags,
  detailMetaTiles,
  doujinCoverOverlayTags,
  ensureMeta,
  episodeCoverOverlayTags,
  latestBookProgress,
  latestBookProgressEntry,
  mangaCoverOverlayTags,
  offlineBookCoverUrl,
  progressIdentity,
  progressMeterValue,
  resolveEpisodePageCount,
  showShelfSummary,
  type SortMode,
  visibleDoujinTags,
} from './libraryCore'

type ShowToast = (tone: ToastTone, text: string) => void
type ReaderRuntimeModel = ReturnType<typeof useMobileReaderRuntimeModel>

type MobileShelfModelDeps = {
  authorizeAcquire: () => Promise<boolean>
  refreshCache: () => Promise<CachedItem[]>
  refreshLibrary: (url?: string, nextSort?: SortMode, resetPage?: boolean, showLoading?: boolean) => Promise<void>
  restoreReaderScrollTop: ReaderRuntimeModel['restoreReaderScrollTop']
  show: ShowToast
  stopReaderAutoScroll: ReaderRuntimeModel['stopReaderAutoScroll']
}

const sortLabels: Record<SortMode, string> = {
  time_desc: '最近',
  time_asc: '最早',
  name_asc: '名称正序',
  name_desc: '名称倒序',
}

type StatusInfo = {
  path_configured?: boolean
  ero?: boolean | number
}

function renderLibraryEmpty(
  connection: ConnectionState,
  statusInfo: StatusInfo,
  shelfLength: number,
  busy: string,
  openSettings: () => void,
) {
  if (busy === 'library') return createElement(EmptyState, { icon: createElement(LoaderCircle, { className: 'spin', size: 28 }), title: '正在加载书架' })
  if (shelfLength) return null
  if (connection === 'backend_unreachable') return createElement(EmptyState, { title: '服务不可达' })
  if (statusInfo.path_configured === false) {
    return createElement(EmptyState, {
      icon: createElement(AlertCircle, { size: 28 }),
      title: '漫画路径未配置',
      action: createElement('button', { onClick: openSettings }, '连接设置'),
    })
  }
  return createElement(EmptyState, { icon: createElement(BookOpen, { size: 28 }), title: '暂无书籍' })
}

export function useMobileShelfModel(appState: AppState, deps: MobileShelfModelDeps) {
  const {
    activeItem,
    activeToolPanel,
    backendUrl,
    busy,
    cached,
    cacheProgress,
    connection,
    deleteHardMode,
    doujinTagLinkButtonRef,
    doujinTagPanel,
    episodePage,
    episodePageCounts,
    filterDraft,
    libraryPage,
    offlineCoverUrls,
    openOpsId,
    pendingReaderProgressRef,
    progressByKey,
    query,
    readerInitialRestorePendingRef,
    readerReturnView,
    readerSettings,
    readerShelfSource,
    readerUserScrolledRef,
    restoredScrollRef,
    selectedBook,
    selectedShelfSource,
    seriesOnly,
    shelf,
    sort,
    statusInfo,
    toolMenuOpen,
    view,
    setActiveItem,
    setActiveToolPanel,
    setBusy,
    setCacheProgress,
    setCgsSearchBookInfo,
    setDeleteHardMode,
    setDoujinTagPanel,
    setDrawerOpen,
    setEpisodePage,
    setFilterDraft,
    setKeyword,
    setLibraryPage,
    setOpenOpsId,
    setPageIndex,
    setQuery,
    setReaderChromeVisible,
    setReaderLoadedImages,
    setReaderMaxScrollTop,
    setReaderMode,
    setReaderPageJumpOpen,
    setReaderPages,
    setReaderReturnView,
    setReaderScrollTop,
    setReaderSettingsOpen,
    setReaderShelfSource,
    setSelectedBook,
    setSelectedShelfSource,
    setSeriesOnly,
    setSort,
    setStatusInfo,
    setToolMenuOpen,
    setView,
  } = appState

  const shelfDerived = useShelfDerivedState({
    cached,
    episodePage,
    filterDraft,
    libraryPage,
    progressByKey,
    query,
    selectedBook,
    selectedShelfSource,
    seriesOnly,
    shelf,
    sort,
    view,
  })

  const {
    activeShelfSource,
    activeSourceIsOffline,
    cachedById,
    detailSourceIsOffline,
    episodePageCount,
    episodePageSafe,
    episodePageSize,
    filterBoardKeywords,
    filteredLibraryShelf,
    filteredOfflineShelf,
    filteredShelf,
    libraryPageCount,
    libraryPageSafe,
    libraryPageSize,
    nextSeriesBook,
    offlineShelf,
    pagedEpisodes,
    pagedShelf,
    previousSeriesBook,
    quickFilterKeywords,
    selectedSeriesValue,
    seriesBooks,
  } = shelfDerived

  const libraryReaderActions = useLibraryReaderActions({
    activeItem,
    backendUrl,
    cached,
    cachedById,
    connection,
    episodePageSize,
    filteredLibraryShelf,
    filteredOfflineShelf,
    offlineShelf,
    readerReturnView,
    readerSettings,
    readerShelfSource,
    selectedBook,
    shelf,
    sort,
    pendingReaderProgressRef,
    readerInitialRestorePendingRef,
    readerUserScrolledRef,
    restoredScrollRef,
    refreshCache: deps.refreshCache,
    refreshLibrary: deps.refreshLibrary,
    restoreReaderScrollTop: deps.restoreReaderScrollTop,
    show: deps.show,
    stopReaderAutoScroll: deps.stopReaderAutoScroll,
    setActiveItem,
    setBusy,
    setCacheProgress,
    setEpisodePage,
    setPageIndex,
    setReaderChromeVisible,
    setReaderLoadedImages,
    setReaderMaxScrollTop,
    setReaderMode,
    setReaderPageJumpOpen,
    setReaderPages,
    setReaderReturnView,
    setReaderScrollTop,
    setReaderSettingsOpen,
    setReaderShelfSource,
    setSelectedBook,
    setSelectedShelfSource,
    setView,
  })

  const libraryWorkspaceController = useLibraryWorkspaceController({
    activeSourceIsOffline,
    backendUrl,
    busy,
    deleteHardMode,
    doujinTagPanel,
    episodePageCount,
    filterDraft,
    query,
    libraryPageCount,
    nextSeriesBook,
    previousSeriesBook,
    authorizeAcquire: deps.authorizeAcquire,
    selectedBook,
    selectedShelfSource,
    seriesBooks,
    sort,
    statusInfo,
    view,
    refreshCache: deps.refreshCache,
    refreshLibrary: deps.refreshLibrary,
    show: deps.show,
    setActiveToolPanel,
    setBusy,
    setCgsSearchBookInfo,
    setDeleteHardMode,
    setDoujinTagPanel,
    setDrawerOpen,
    setEpisodePage,
    setFilterDraft,
    setKeyword,
    setLibraryPage,
    setQuery,
    setSelectedBook,
    setSelectedShelfSource,
    setSeriesOnly,
    setSort,
    setStatusInfo,
    setToolMenuOpen,
    setView,
  })

  const isDoujinMode = Boolean(statusInfo.ero)
  const libraryEmpty = renderLibraryEmpty(connection, statusInfo, shelf.length, busy, libraryWorkspaceController.openSettingsDrawer)
  const downloadsEmpty = !cached.length
    ? createElement(EmptyState, {
      title: '暂无离线内容，请在在线模式下缓存章节',
      action: createElement('button', { onClick: () => libraryWorkspaceController.openTab('library') }, '前往在线书架'),
    })
    : null
  const workspaceEmpty = activeSourceIsOffline ? downloadsEmpty : libraryEmpty

  const libraryWorkspaceProps: LibraryWorkspaceProps = {
    shelfView: {
      activeSourceIsOffline,
      activeShelfSource,
      busy,
      comicMode: isDoujinMode ? 'doujin' : 'manga',
      connection,
      deleteHardMode,
      doujinTagPanel,
      edgeLogoSrc: appState.edgeImgSrc || EDGE_LOGO_SRC,
      edgeEffectSrc: appState.edgeEffectSrc,
      edgeEffectDuration: appState.edgeEffectDuration,
      filterBoardKeywords,
      filterDraft,
      filteredTotal: filteredShelf.length,
      isDoujinMode,
      libraryPageSafe,
      libraryPageSize,
      openOpsId,
      pagedShelf,
      query,
      quickFilterKeywords,
      seriesOnly,
      sort,
      sortLabels,
      toolMenuOpen,
      activeToolPanel,
      workspaceEmpty,
    },
    shelfSelectors: {
      bookCachedCount: (book) => bookCachedCount(book, cachedById),
      bookSummary: (book) => bookSummary(book, cachedById, progressByKey),
      coverSrc: (book) => activeSourceIsOffline ? offlineBookCoverUrl(book, offlineCoverUrls) : coverUrl(backendUrl, book.first_img, connection),
      doujinCoverOverlayTags,
      ensureMeta,
      latestBookProgress: (book) => latestBookProgress(book, progressByKey),
      mangaCoverOverlayTags,
      showShelfSummary: (book) => showShelfSummary(book, isDoujinMode),
      visibleDoujinTags,
    },
    shelfActions: {
      applyDoujinTagFilter: libraryWorkspaceController.applyDoujinTagFilter,
      applyFilterDraft: libraryWorkspaceController.applyFilterDraft,
      cacheItem: libraryReaderActions.cacheItem,
      cacheSeries: libraryReaderActions.cacheSeries,
      changeLibraryPage: libraryWorkspaceController.changeLibraryPage,
      changeSort: libraryWorkspaceController.changeSort,
      clearFilter: libraryWorkspaceController.clearFilter,
      closeDoujinTagPanel: libraryWorkspaceController.closeDoujinTagPanel,
      closeOps: () => setOpenOpsId(''),
      closeToolPanel: () => setActiveToolPanel(null),
      handleBookAction: libraryReaderActions.handleBookAction,
      openCgsSearchFromBook: libraryWorkspaceController.openCgsSearchFromBook,
      openDoujinTagPanel: libraryWorkspaceController.openDoujinTagPanel,
      openEdgeMenu: libraryWorkspaceController.openEdgeMenu,
      closeEdgeMenu: libraryWorkspaceController.closeEdgeMenu,
      openShelfBook: libraryReaderActions.openShelfBook,
      removeCachedBook: libraryReaderActions.removeCachedBook,
      runEdgeAction: libraryWorkspaceController.runEdgeAction,
      selectDoujinTag: libraryWorkspaceController.selectDoujinTag,
      selectFilterKeyword: libraryWorkspaceController.selectFilterKeyword,
      setFilterDraft,
      toggleOps: (bookId) => setOpenOpsId((id) => (id === bookId ? '' : bookId)),
      toggleSeriesOnly: libraryWorkspaceController.toggleSeriesOnly,
    },
    doujinTagLinkButtonRef,
  }

  const selectedBookMeta = selectedBook ? ensureMeta(selectedBook.meta) : EMPTY_META
  const selectedBookProgressEntry = selectedBook ? latestBookProgressEntry(selectedBook, progressByKey) : undefined
  const selectedBookCachedCount = selectedBook ? bookCachedCount(selectedBook, cachedById) : 0
  const selectedBookChapterTotal = selectedBook ? detailChapterTotal(selectedBook) : 0

  const detailWorkspaceProps: DetailWorkspaceProps | null = selectedBook ? {
    detailView: {
      busy,
      cacheProgressValue: cacheProgress[selectedBook.id] || cacheLabel(cachedById.get(selectedBook.id)),
      cachedBookAvailable: cachedById.has(selectedBook.id),
      connection,
      deleteHardMode,
      detailSourceIsOffline,
      episodePageCount,
      episodePageSafe,
      episodePageSize,
      infoTiles: detailMetaTiles(selectedBook, selectedBookMeta, cachedById),
      kindOverlayTags: detailKindOverlayTags(selectedBook),
      meta: selectedBookMeta,
      nextSeriesBook,
      offlineLine: `离线/章节: ${selectedBookCachedCount}/${selectedBookChapterTotal}`,
      openOpsId,
      pagedEpisodes,
      previousSeriesBook,
      selectedBook,
      selectedSeriesValue,
      selectedShelfSource,
      seriesBooks,
      summary: detailBookSummary(selectedBook, selectedBookProgressEntry),
    },
    detailSelectors: {
      cachedEpisode: (episode) => cachedById.get(episode.id),
      detailCoverSrc: (book) => detailSourceIsOffline ? offlineBookCoverUrl(book, offlineCoverUrls) : coverUrl(backendUrl, book.first_img, connection),
      episodeCoverOverlayTags,
      episodeCoverSrc: (episode) => detailSourceIsOffline ? offlineCoverUrls[episode.id] || '' : coverUrl(backendUrl, episode.first_img, connection),
      episodePageCount: (episode, cachedEpisode) => resolveEpisodePageCount(episode, cachedEpisode, episodePageCounts[episode.id]),
      episodeProgress: (episode) => progressByKey[progressIdentity(episode.book, episode.ep)],
      progressMeterValue,
    },
    detailActions: {
      backToShelf: () => setSelectedBook(null),
      cacheItem: libraryReaderActions.cacheItem,
      cacheSeries: libraryReaderActions.cacheSeries,
      changeEpisodePage: libraryWorkspaceController.changeEpisodePage,
      closeOps: () => setOpenOpsId(''),
      handleDetailBookAction: libraryReaderActions.handleDetailBookAction,
      openCgsSearchFromBook: libraryWorkspaceController.openCgsSearchFromBook,
      openNextDetailSeries: libraryWorkspaceController.openNextDetailSeries,
      openPreviousDetailSeries: libraryWorkspaceController.openPreviousDetailSeries,
      openSourceItem: libraryReaderActions.openSourceItem,
      removeCached: libraryReaderActions.removeCached,
      removeCachedBook: libraryReaderActions.removeCachedBook,
      selectDetailSeries: libraryWorkspaceController.selectDetailSeries,
      toggleDeleteMode: libraryWorkspaceController.toggleDeleteMode,
      toggleOps: (itemId) => setOpenOpsId((id) => (id === itemId ? '' : itemId)),
    },
  } : null

  const shelfWorkspace = {
    detailWorkspaceProps,
    libraryWorkspaceProps,
  }

  return {
    ...shelfDerived,
    closeDoujinTagPanel: libraryWorkspaceController.closeDoujinTagPanel,
    loadManifest: libraryReaderActions.loadManifest,
    openCgsTagPanel: libraryWorkspaceController.openCgsTagPanel,
    openDrawerTab: libraryWorkspaceController.openDrawerTab,
    openReaderNeighbor: libraryReaderActions.openReaderNeighbor,
    readerBookHandle: libraryReaderActions.readerBookHandle,
    selectCgsSearchCandidate: libraryWorkspaceController.selectCgsSearchCandidate,
    selectDoujinTag: libraryWorkspaceController.selectDoujinTag,
    shelfWorkspace,
  }
}
