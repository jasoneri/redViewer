import type { Dispatch, MutableRefObject, PointerEvent, SetStateAction } from 'react'
import { isEdgeAction, type EdgeAction } from './EdgeTools'
import { ensureMeta, type SortMode } from './libraryCore'
import type { CgsSearchCandidate, CgsSearchBookInfo } from '../acquire-workspace/acquireTypes'
import type { ShelfBook } from '../mobileStore'
import { buildUrl } from '../mobileStore'

type View = 'library' | 'downloads' | 'reader' | 'acquire'
type ShelfSource = 'library' | 'downloads'
type ShowToast = (tone: 'ok' | 'warn' | 'error', text: string) => void
type StatusInfo = {
  path_configured?: boolean
  ero?: boolean | number
  mobile_contract?: boolean
}

type LibraryWorkspaceControllerDeps = {
  activeSourceIsOffline: boolean
  backendUrl: string
  busy: string
  deleteHardMode: boolean
  doujinTagPanel: { selectedTag: string } | null
  episodePageCount: number
  filterDraft: string
  query: string
  libraryPageCount: number
  nextSeriesBook: ShelfBook | null
  previousSeriesBook: ShelfBook | null
  selectedBook: ShelfBook | null
  selectedShelfSource: ShelfSource
  seriesBooks: ShelfBook[]
  sort: SortMode
  statusInfo: StatusInfo
  view: View
  edgePointerActiveRef: MutableRefObject<boolean>
  refreshCache: () => Promise<unknown>
  refreshLibrary: (url?: string, nextSort?: SortMode, resetPage?: boolean, showLoading?: boolean) => Promise<void>
  show: ShowToast
  setActiveToolPanel: Dispatch<SetStateAction<'filter' | 'sort' | null>>
  setBusy: Dispatch<SetStateAction<string>>
  setCgsSearchBookInfo: Dispatch<SetStateAction<CgsSearchBookInfo | null>>
  setDeleteHardMode: Dispatch<SetStateAction<boolean>>
  setDoujinTagPanel: Dispatch<SetStateAction<{
    bookId: string
    bookTitle: string
    tags: string[]
    selectedTag: string
    mode?: 'filter' | 'preview'
  } | null>>
  setDrawerOpen: Dispatch<SetStateAction<boolean>>
  setEdgeTipAction: Dispatch<SetStateAction<EdgeAction | null>>
  setEpisodePage: Dispatch<SetStateAction<number>>
  setFilterDraft: Dispatch<SetStateAction<string>>
  setKeyword: Dispatch<SetStateAction<string>>
  setLibraryPage: Dispatch<SetStateAction<number>>
  setQuery: Dispatch<SetStateAction<string>>
  setSelectedBook: Dispatch<SetStateAction<ShelfBook | null>>
  setSelectedShelfSource: Dispatch<SetStateAction<ShelfSource>>
  setSeriesOnly: Dispatch<SetStateAction<boolean>>
  setSort: Dispatch<SetStateAction<SortMode>>
  setStatusInfo: Dispatch<SetStateAction<StatusInfo>>
  setToolMenuOpen: Dispatch<SetStateAction<boolean>>
  setView: Dispatch<SetStateAction<View>>
}

export function useLibraryWorkspaceController(deps: LibraryWorkspaceControllerDeps) {
  function changeQuery(next: string) {
    deps.setQuery(next)
    deps.setLibraryPage(1)
  }

  async function changeSortImpl(next: SortMode) {
    deps.setSort(next)
    deps.setLibraryPage(1)
    if (deps.view === 'downloads') {
      deps.setActiveToolPanel(null)
      return
    }
    await deps.refreshLibrary(deps.backendUrl, next)
  }

  function clearFilter() {
    deps.setFilterDraft('')
    deps.setQuery('')
    deps.setSeriesOnly(false)
    deps.setLibraryPage(1)
  }

  function applyFilterDraft(closePanel = true) {
    changeQuery(deps.filterDraft.trim())
    if (closePanel) deps.setActiveToolPanel(null)
  }

  function selectFilterKeyword(keyword: string) {
    deps.setFilterDraft(keyword)
    changeQuery(keyword)
    deps.setActiveToolPanel(null)
  }

  function closeDoujinTagPanel() {
    deps.setDoujinTagPanel(null)
  }

  function openDoujinTagPanel(book: ShelfBook) {
    const tags = ensureMeta(book.meta).tags.filter(Boolean)
    if (!tags.length) {
      deps.show('warn', '没有可筛选的标签')
      return
    }
    deps.setDoujinTagPanel({
      bookId: book.id,
      bookTitle: book.title || book.book,
      tags,
      selectedTag: tags[0],
    })
  }

  function openCgsTagPanel(bookId: string, bookTitle: string, tags: string[]) {
    const cleanTags = tags.filter(Boolean)
    if (!cleanTags.length) {
      deps.show('warn', '没有可选择的标签')
      return
    }
    deps.setDoujinTagPanel({
      bookId,
      bookTitle,
      tags: cleanTags,
      selectedTag: cleanTags[0],
      mode: 'preview',
    })
  }

  function selectDoujinTag(tag: string) {
    deps.setDoujinTagPanel((current) => (current ? { ...current, selectedTag: tag } : current))
  }

  function applyDoujinTagFilter() {
    if (!deps.doujinTagPanel?.selectedTag) return
    const selectedTag = deps.doujinTagPanel.selectedTag
    deps.setDoujinTagPanel(null)
    changeQuery(selectedTag)
  }

  function toggleSeriesOnly() {
    deps.setSeriesOnly((value) => !value)
    deps.setLibraryPage(1)
  }

  function changeLibraryPage(next: number) {
    deps.setLibraryPage(Math.min(Math.max(next, 1), deps.libraryPageCount))
  }

  function changeEpisodePage(next: number) {
    deps.setEpisodePage(Math.min(Math.max(next, 1), deps.episodePageCount))
  }

  function selectDetailSeries(bookId: string) {
    const target = deps.seriesBooks.find((book) => book.id === bookId)
    if (!target) return
    deps.setSelectedBook(target)
    deps.setSelectedShelfSource(deps.selectedShelfSource)
    deps.setEpisodePage(1)
  }

  function openPreviousDetailSeries() {
    if (!deps.previousSeriesBook) return
    deps.setSelectedBook(deps.previousSeriesBook)
    deps.setSelectedShelfSource(deps.selectedShelfSource)
    deps.setEpisodePage(1)
  }

  function openNextDetailSeries() {
    if (!deps.nextSeriesBook) return
    deps.setSelectedBook(deps.nextSeriesBook)
    deps.setSelectedShelfSource(deps.selectedShelfSource)
    deps.setEpisodePage(1)
  }

  function openSettingsDrawer() {
    deps.setDrawerOpen(true)
  }

  function openToolPanel(panel: 'filter' | 'sort') {
    if (panel === 'filter') deps.setFilterDraft(deps.query)
    deps.setActiveToolPanel(panel)
    deps.setToolMenuOpen(false)
  }

  function toggleDeleteMode() {
    const next = !deps.deleteHardMode
    deps.setDeleteHardMode(next)
    localStorage.setItem('rv_mobile_delete_mode', next ? 'del' : 'remove')
    deps.show(next ? 'error' : 'warn', next ? '删除模式：彻底删除' : '删除模式：移至回收')
  }

  async function switchDoujinMode() {
    const next = !Boolean(deps.statusInfo.ero)
    deps.setBusy('switch-ero')
    try {
      const response = await fetch(buildUrl(deps.backendUrl, `/comic/switch_ero?enable=${String(next)}`), { method: 'POST' })
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
      deps.setStatusInfo((state) => ({ ...state, ero: next }))
      deps.setSelectedBook(null)
      await deps.refreshLibrary(deps.backendUrl, deps.sort)
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '切换失败')
    } finally {
      deps.setBusy('')
    }
  }

  function runEdgeAction(action: EdgeAction) {
    if (action === 'filter' || action === 'sort') {
      openToolPanel(action)
      return
    }
    if (action === 'refresh' && deps.activeSourceIsOffline) void deps.refreshCache()
    if (action === 'refresh' && !deps.activeSourceIsOffline && deps.busy !== 'library') void deps.refreshLibrary()
    if (action === 'delete-mode') toggleDeleteMode()
    if (action === 'doujin') void switchDoujinMode()
  }

  function edgeActionFromPoint(clientX: number, clientY: number): EdgeAction | null {
    const target = document.elementFromPoint(clientX, clientY)
    const button = target?.closest?.('[data-edge-action]') as HTMLElement | null
    const action = button?.dataset.edgeAction
    return isEdgeAction(action) && button?.ariaDisabled !== 'true' ? action : null
  }

  function handleEdgeStripPointerDown(event: PointerEvent<HTMLButtonElement>) {
    deps.edgePointerActiveRef.current = true
    deps.setToolMenuOpen(true)
    deps.setEdgeTipAction(null)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleEdgePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!deps.edgePointerActiveRef.current) return
    event.preventDefault()
    deps.setEdgeTipAction(edgeActionFromPoint(event.clientX, event.clientY))
  }

  function handleEdgePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!deps.edgePointerActiveRef.current) return
    event.preventDefault()
    const action = edgeActionFromPoint(event.clientX, event.clientY)
    deps.edgePointerActiveRef.current = false
    deps.setEdgeTipAction(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (action) {
      deps.setToolMenuOpen(false)
      runEdgeAction(action)
      return
    }
    // RVUX0001: drag-open edge menu always collapses on release, selected or not.
    deps.setToolMenuOpen(false)
  }

  function handleEdgePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    deps.edgePointerActiveRef.current = false
    deps.setToolMenuOpen(false)
    deps.setEdgeTipAction(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function openTab(next: View) {
    deps.setView(next)
    deps.setSelectedBook(null)
    if (next === 'downloads') deps.setSelectedShelfSource('downloads')
    if (next === 'library') deps.setSelectedShelfSource('library')
  }

  function openDrawerTab(next: View) {
    openTab(next)
  }

  function buildCgsSearchBookInfo(book: ShelfBook): CgsSearchBookInfo {
    const meta = ensureMeta(book.meta)
    const title = book.title || book.book
    const rawCandidates: CgsSearchCandidate[] = [
      ...(meta.artist ? [{ key: 'artist', label: '作者', value: meta.artist }] : []),
      ...(title ? [{ key: 'title', label: '标题', value: title }] : []),
      ...meta.tags.map((tag, index) => ({ key: `tag:${index}`, label: tag, value: tag })),
    ]
    const seen = new Set<string>()
    const candidates = rawCandidates.filter((candidate) => {
      const value = candidate.value.trim()
      if (!value || seen.has(value)) return false
      seen.add(value)
      return true
    })
    return {
      id: book.id,
      book: book.book,
      title,
      artist: meta.artist,
      source: meta.source,
      tags: meta.tags,
      candidates,
    }
  }

  function selectCgsSearchCandidate(candidate: CgsSearchCandidate) {
    deps.setKeyword(candidate.value)
  }

  function openCgsSearchFromBook(book: ShelfBook) {
    const bookInfo = buildCgsSearchBookInfo(book)
    const defaultCandidate = bookInfo.candidates[0]
    if (!defaultCandidate) {
      deps.show('warn', '该作品无可搜索信息')
      return
    }
    deps.setCgsSearchBookInfo(bookInfo)
    deps.setKeyword(defaultCandidate.value)
    openTab('acquire')
  }

  return {
    applyDoujinTagFilter,
    applyFilterDraft,
    changeEpisodePage,
    changeLibraryPage,
    changeSort: changeSortImpl,
    clearFilter,
    closeDoujinTagPanel,
    handleEdgePointerCancel,
    handleEdgePointerMove,
    handleEdgePointerUp,
    handleEdgeStripPointerDown,
    openCgsSearchFromBook,
    openCgsTagPanel,
    openDrawerTab,
    openDoujinTagPanel,
    openNextDetailSeries,
    openPreviousDetailSeries,
    openSettingsDrawer,
    runEdgeAction,
    selectCgsSearchCandidate,
    selectDetailSeries,
    selectDoujinTag,
    selectFilterKeyword,
    openTab,
    toggleDeleteMode,
    toggleSeriesOnly,
  }
}
