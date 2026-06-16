import { useRef, type Dispatch, type MutableRefObject, type PointerEvent, type SetStateAction } from 'react'
import {
  readerChromeShouldShowPage,
  type ReaderItem,
  type ReaderMode,
  type ReaderProgress,
  type ReaderSettings,
} from '../reader-workspace/readerCore'
import { clampCgsSubmitPosition, loadCgsSubmitPosition, saveCgsSubmitPosition, MULTI_CHECK_FLOAT_POSITION_KEY } from '../acquire-workspace/acquireCore'
import {
  isMissingMobileContract,
  legacyItemId,
  mergeLibraryMeta,
  type SortMode,
} from './libraryCore'
import {
  type CachedItem,
  type ConnectionState,
  type LibraryItem,
  type Manifest,
  type ShelfBook,
  apiGet,
  apiPost,
  buildUrl,
  cacheManifest,
  deleteCachedItem,
  getCachedItem,
  getCachedPages,
  loadProgress,
} from '../mobileStore'

type View = 'library' | 'downloads' | 'reader' | 'acquire'
type ShelfSource = 'library' | 'downloads'
type BookHandle = 'save' | 'remove' | 'del'
export type MultiCheckBatchAction = 'cacheAdd' | 'save' | 'del'
type ShowToast = (tone: 'ok' | 'warn' | 'error', text: string) => void
type MultiCheckFloatDragState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  lastPosition: { x: number; y: number }
}

type LibraryReaderActionsDeps = {
  activeItem: ReaderItem | null
  backendUrl: string
  cached: CachedItem[]
  cachedById: Map<string, CachedItem>
  connection: ConnectionState
  deleteHardMode: boolean
  episodePageSize: number
  filteredLibraryShelf: ShelfBook[]
  filteredOfflineShelf: ShelfBook[]
  offlineShelf: ShelfBook[]
  multiCheckMode: boolean
  multiCheckedIds: string[]
  multiCheckFloatPosition: { x: number; y: number }
  readerReturnView: View
  readerSettings: ReaderSettings
  readerShelfSource: ShelfSource
  selectedBook: ShelfBook | null
  shelf: ShelfBook[]
  sort: SortMode
  pendingReaderProgressRef: MutableRefObject<ReaderProgress>
  readerInitialRestorePendingRef: MutableRefObject<boolean>
  readerUserScrolledRef: MutableRefObject<boolean>
  restoredScrollRef: MutableRefObject<string>
  refreshCache: () => Promise<CachedItem[]>
  refreshLibrary: (url?: string, nextSort?: SortMode, resetPage?: boolean, showLoading?: boolean, sync?: boolean) => Promise<void>
  restoreReaderScrollTop: () => void
  show: ShowToast
  stopReaderAutoScroll: () => void
  setActiveItem: Dispatch<SetStateAction<ReaderItem | null>>
  setBusy: Dispatch<SetStateAction<string>>
  setCacheProgress: Dispatch<SetStateAction<Record<string, string>>>
  setEpisodePage: Dispatch<SetStateAction<number>>
  setPageIndex: Dispatch<SetStateAction<number>>
  setMultiCheckMode: Dispatch<SetStateAction<boolean>>
  setMultiCheckedIds: Dispatch<SetStateAction<string[]>>
  setMultiCheckFloatPosition: Dispatch<SetStateAction<{ x: number; y: number }>>
  setReaderChromeVisible: Dispatch<SetStateAction<boolean>>
  setReaderLoadedImages: Dispatch<SetStateAction<number>>
  setReaderMaxScrollTop: Dispatch<SetStateAction<number>>
  setReaderMode: Dispatch<SetStateAction<ReaderMode>>
  setReaderPageJumpOpen: Dispatch<SetStateAction<boolean>>
  setReaderPages: Dispatch<SetStateAction<string[]>>
  setReaderReturnView: Dispatch<SetStateAction<View>>
  setReaderScrollTop: Dispatch<SetStateAction<number>>
  setReaderSettingsOpen: Dispatch<SetStateAction<boolean>>
  setReaderShelfSource: Dispatch<SetStateAction<ShelfSource>>
  setSelectedBook: Dispatch<SetStateAction<ShelfBook | null>>
  setSelectedShelfSource: Dispatch<SetStateAction<ShelfSource>>
  setView: Dispatch<SetStateAction<View>>
}

export function useLibraryReaderActions(deps: LibraryReaderActionsDeps) {
  function showBookHandleResult(handle: BookHandle) {
    if (handle === 'save') deps.show('ok', '已移至保留')
    else deps.show(handle === 'del' ? 'error' : 'warn', handle === 'del' ? '已彻底删除' : '已移至回收')
  }

  async function applyBookHandle(item: LibraryItem, handle: BookHandle) {
    await apiPost(deps.backendUrl, '/comic/handle', {
      handle,
      book: item.book,
      ep: item.ep || null,
    })
  }

  async function handleBookAction(item: LibraryItem, handle: BookHandle) {
    deps.setBusy(`handle:${item.id}:${handle}`)
    try {
      await applyBookHandle(item, handle)
      await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false)
      if (deps.selectedBook?.book === item.book) deps.setSelectedBook(null)
      showBookHandleResult(handle)
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '操作失败')
    } finally {
      deps.setBusy('')
    }
  }

  async function handleDetailBookAction(item: LibraryItem, handle: BookHandle) {
    const nextEpisodes = deps.selectedBook?.book === item.book
      ? deps.selectedBook.episodes.filter((episode) => episode.id !== item.id && !(episode.book === item.book && episode.ep === item.ep))
      : null
    deps.setBusy(`handle:${item.id}:${handle}`)
    try {
      await applyBookHandle(item, handle)
      await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false)
      if (nextEpisodes) {
        if (nextEpisodes.length > 0) {
          deps.setSelectedBook((current) => current?.book === item.book ? { ...current, episodes: nextEpisodes, episode_count: nextEpisodes.length } : current)
          deps.setEpisodePage((page) => Math.min(page, Math.max(1, Math.ceil(nextEpisodes.length / deps.episodePageSize))))
        } else {
          deps.setSelectedBook(null)
          deps.setEpisodePage(1)
        }
      }
      showBookHandleResult(handle)
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '操作失败')
    } finally {
      deps.setBusy('')
    }
  }

  async function loadManifest(item: LibraryItem): Promise<Manifest> {
    try {
      return await apiGet<Manifest>(
        deps.backendUrl,
        `/mobile/manifest?book=${encodeURIComponent(item.book)}&ep=${encodeURIComponent(item.ep || '')}`,
      )
    } catch (error) {
      if (!isMissingMobileContract(error)) throw error
      const pages = await apiGet<string[]>(
        deps.backendUrl,
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

  async function fetchAndCache(item: LibraryItem) {
    const manifest = await loadManifest(item)
    const mergedManifest: Manifest = {
      ...manifest,
      meta: mergeLibraryMeta(manifest.meta, item.meta, manifest.page_count),
    }
    return cacheManifest(deps.backendUrl, mergedManifest, (done, total) => {
      deps.setCacheProgress((state) => ({ ...state, [item.id]: `${done}/${total}` }))
    })
  }

  async function cacheItem(item: LibraryItem) {
    deps.setBusy(`cache:${item.id}`)
    try {
      await fetchAndCache(item)
      await deps.refreshCache()
      deps.show('ok', '已缓存')
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '缓存失败')
    } finally {
      deps.setBusy('')
    }
  }

  async function cacheSeries(book: ShelfBook) {
    const targets = book.episodes.filter((item) => !deps.cachedById.has(item.id))
    if (!targets.length) {
      deps.show('ok', '已全部缓存')
      return
    }
    deps.setBusy(`series:${book.id}`)
    try {
      for (let index = 0; index < targets.length; index += 1) {
        deps.setCacheProgress((state) => ({ ...state, [book.id]: `${index + 1}/${targets.length}` }))
        await fetchAndCache(targets[index])
      }
      await deps.refreshCache()
      deps.show('ok', '系列缓存完成')
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '系列缓存失败')
    } finally {
      deps.setBusy('')
    }
  }

  const multiCheckDragRef = useRef<MultiCheckFloatDragState | null>(null)

  async function runMultiCheckBatch(action: MultiCheckBatchAction) {
    const books = deps.filteredLibraryShelf.filter((book) => deps.multiCheckedIds.includes(book.id))
    if (!books.length) {
      if (deps.multiCheckedIds.length) {
        deps.setMultiCheckedIds([])
        deps.show('warn', '选中项已失效')
      }
      return
    }
    if (action === 'cacheAdd' && deps.connection !== 'online') {
      deps.show('warn', '当前不在线，无法缓存')
      return
    }
    deps.setBusy('multi-check')
    let ok = 0
    let fail = 0
    try {
      for (const book of books) {
        deps.setCacheProgress((state) => ({ ...state, 'multi-check': `${ok + fail + 1}/${books.length}` }))
        try {
          if (action === 'cacheAdd') {
            if (book.kind === 'series') {
              const targets = book.episodes.filter((episode) => !deps.cachedById.has(episode.id))
              for (const episode of targets) await fetchAndCache(episode)
            } else {
              await fetchAndCache(book)
            }
          } else {
            const handle: BookHandle = action === 'save' ? 'save' : deps.deleteHardMode ? 'del' : 'remove'
            await applyBookHandle(book, handle)
          }
          ok += 1
        } catch {
          fail += 1
        }
      }
      if (action === 'cacheAdd') await deps.refreshCache()
      else await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false)
      const label = action === 'cacheAdd' ? '缓存' : action === 'save' ? '保留' : deps.deleteHardMode ? '删除' : '移除'
      deps.show(fail ? 'warn' : 'ok', fail ? `${label}成功 ${ok}，失败 ${fail}` : `已${label} ${ok} 项`)
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '刷新失败')
    } finally {
      deps.setCacheProgress((state) => {
        const next = { ...state }
        delete next['multi-check']
        return next
      })
      deps.setMultiCheckedIds([])
      deps.setBusy('')
    }
  }

  function startMultiCheckDrag(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    const origin = clampCgsSubmitPosition(deps.multiCheckFloatPosition)
    multiCheckDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      lastPosition: origin,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveMultiCheckDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = multiCheckDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const next = clampCgsSubmitPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    })
    drag.lastPosition = next
    deps.setMultiCheckFloatPosition(next)
  }

  function finishMultiCheckDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = multiCheckDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    multiCheckDragRef.current = null
    deps.setMultiCheckFloatPosition(saveCgsSubmitPosition(drag.lastPosition, MULTI_CHECK_FLOAT_POSITION_KEY))
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function findShelfBookForItem(item: ReaderItem | LibraryItem): ShelfBook | undefined {
    const filteredShelf = deps.readerShelfSource === 'downloads' ? deps.filteredOfflineShelf : deps.filteredLibraryShelf
    return filteredShelf.find((book) => {
      if (book.kind === 'single') return book.book === item.book && book.ep === item.ep
      return book.book === item.book && book.episodes.some((episode) => episode.ep === item.ep)
    })
  }

  function findReaderNeighbor(direction: -1 | 1): LibraryItem | null {
    if (!deps.activeItem) return null
    const currentBook = findShelfBookForItem(deps.activeItem)
    if (currentBook?.kind === 'series') {
      const index = currentBook.episodes.findIndex((episode) => episode.ep === deps.activeItem?.ep)
      const next = currentBook.episodes[index + direction]
      return next || null
    }
    const filteredShelf = deps.readerShelfSource === 'downloads' ? deps.filteredOfflineShelf : deps.filteredLibraryShelf
    const singles = filteredShelf.filter((book) => book.kind === 'single')
    const index = singles.findIndex((book) => book.book === deps.activeItem?.book && book.ep === deps.activeItem?.ep)
    return singles[index + direction] || null
  }

  async function openReaderNeighbor(direction: -1 | 1) {
    const target = findReaderNeighbor(direction)
    if (!target) {
      deps.show('warn', direction > 0 ? '没有下一本' : '没有上一本')
      return
    }
    deps.stopReaderAutoScroll()
    await openSourceItem(target, deps.readerShelfSource)
  }

  async function readerBookHandle(handle: BookHandle) {
    if (!deps.activeItem) return
    if (deps.readerShelfSource === 'downloads') {
      if (handle === 'save') {
        deps.show('warn', '离线阅读不支持远程保留')
        return
      }
      const cachedActive = deps.cached.find((item) => item.id === deps.activeItem?.id || (item.book === deps.activeItem?.book && item.ep === deps.activeItem?.ep))
      if (!cachedActive) {
        deps.show('warn', '当前缓存不存在')
        return
      }
      const nextTarget = findReaderNeighbor(1)
      await removeCached(cachedActive)
      if (nextTarget) await openSourceItem(nextTarget, 'downloads')
      else {
        deps.setActiveItem(null)
        deps.setReaderPages([])
        deps.setSelectedBook(null)
        deps.setView('downloads')
      }
      return
    }
    const nextTarget = findReaderNeighbor(1)
    deps.setBusy(`handle:${deps.activeItem.id}:${handle}`)
    try {
      await apiPost(deps.backendUrl, '/comic/handle', {
        handle,
        book: deps.activeItem.book,
        ep: deps.activeItem.ep || null,
      })
      deps.stopReaderAutoScroll()
      await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false)
      await deps.refreshCache()
      deps.setSelectedBook(null)
      showBookHandleResult(handle)
      if (nextTarget) await openLibraryItem(nextTarget)
      else {
        deps.setActiveItem(null)
        deps.setReaderPages([])
        deps.setView(deps.readerReturnView === 'reader' ? 'library' : deps.readerReturnView)
      }
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '操作失败')
    } finally {
      deps.setBusy('')
    }
  }

  async function openLibraryItem(item: LibraryItem) {
    const cachedItem = deps.cachedById.get(item.id)
    if (cachedItem) {
      await openCachedReader(cachedItem, 'library')
      return
    }
    if (deps.connection !== 'online') {
      deps.show('warn', '当前没有本地缓存')
      return
    }
    await openRemoteReader(item)
  }

  async function openSourceItem(item: LibraryItem, source: ShelfSource) {
    if (source === 'downloads') {
      const cachedItem = deps.cachedById.get(item.id) || deps.cached.find((row) => row.book === item.book && row.ep === item.ep)
      if (!cachedItem) {
        deps.show('warn', '当前章节没有本地缓存')
        return
      }
      await openCachedReader(cachedItem, 'downloads')
      return
    }
    await openLibraryItem(item)
  }

  function openShelfBook(book: ShelfBook, source: ShelfSource) {
    deps.setSelectedShelfSource(source)
    if (book.kind === 'single') void openSourceItem(book, source)
    else {
      deps.setSelectedBook(book)
      deps.setEpisodePage(1)
    }
  }

  function findShelfItemByIdentity(book: string, ep: string): LibraryItem | undefined {
    for (const shelfBook of deps.shelf) {
      if (shelfBook.book !== book) continue
      if (shelfBook.kind === 'single' && shelfBook.ep === ep) return shelfBook
      const episode = shelfBook.episodes.find((row) => row.ep === ep)
      if (episode) return episode
    }
    return undefined
  }

  function openReader(
    item: ReaderItem,
    pages: string[],
    progress: Awaited<ReturnType<typeof loadProgress>> | null,
    source: ReaderItem['source'],
    returnView: View,
  ) {
    const nextMode = deps.readerSettings.readingMode
    const nextPageIndex = Math.min(progress?.page_index || 0, Math.max(pages.length - 1, 0))
    const nextScrollTop = progress?.reading_mode === 'scroll' ? progress.scroll_top || 0 : 0
    deps.setActiveItem({ ...item, source })
    deps.setReaderPages(pages)
    deps.setPageIndex(nextPageIndex)
    deps.setReaderMode(nextMode)
    deps.setReaderScrollTop(nextScrollTop)
    deps.setReaderMaxScrollTop(0)
    deps.setReaderLoadedImages(0)
    deps.setReaderPageJumpOpen(false)
    deps.pendingReaderProgressRef.current = { page_index: nextPageIndex, scroll_top: nextScrollTop, reading_mode: nextMode }
    deps.restoredScrollRef.current = ''
    deps.readerInitialRestorePendingRef.current = nextMode === 'scroll'
    deps.readerUserScrolledRef.current = false
    if (nextMode === 'scroll') {
      deps.setReaderChromeVisible(true)
      window.setTimeout(() => deps.restoreReaderScrollTop(), 0)
    } else {
      deps.setReaderChromeVisible(readerChromeShouldShowPage(nextPageIndex, pages.length))
    }
    deps.setReaderShelfSource(returnView === 'downloads' ? 'downloads' : 'library')
    deps.setReaderReturnView(returnView)
    deps.setReaderSettingsOpen(false)
    deps.setView('reader')
  }

  async function openRemoteReader(item: LibraryItem) {
    deps.setBusy(`reader:${item.id}`)
    try {
      const manifest = await loadManifest(item)
      const progress = await loadProgress(manifest.book, manifest.ep)
      const pages = manifest.pages.map((page) => buildUrl(deps.backendUrl, page))
      const meta = mergeLibraryMeta(manifest.meta, item.meta, manifest.page_count)
      openReader({
        id: manifest.id,
        book: manifest.book,
        ep: manifest.ep,
        title: manifest.title,
        page_count: manifest.page_count,
        source: 'remote',
        meta,
      }, pages, progress, 'remote', 'library')
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '打开失败')
    } finally {
      deps.setBusy('')
    }
  }

  async function openCachedReader(item: CachedItem, returnView: View = 'downloads') {
    deps.setBusy(`reader:${item.id}`)
    try {
      const latest = (await getCachedItem(item.id)) || item
      const pages = await getCachedPages(latest)
      const progress = await loadProgress(latest.book, latest.ep)
      const fallbackItem = findShelfItemByIdentity(latest.book, latest.ep)
      const meta = mergeLibraryMeta(latest.meta, fallbackItem?.meta, latest.page_count)
      openReader({
        id: latest.id,
        book: latest.book,
        ep: latest.ep,
        title: latest.title,
        page_count: latest.page_count,
        source: 'cache',
        meta,
      }, pages, progress, 'cache', returnView)
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '打开缓存失败')
    } finally {
      deps.setBusy('')
    }
  }

  async function removeCached(item: CachedItem) {
    await deleteCachedItem(item)
    await deps.refreshCache()
    deps.show('ok', '缓存已删除')
  }

  async function removeCachedBook(book: ShelfBook) {
    const targets = book.kind === 'single'
      ? [deps.cachedById.get(book.id)].filter((item): item is CachedItem => Boolean(item))
      : book.episodes.map((episode) => deps.cachedById.get(episode.id)).filter((item): item is CachedItem => Boolean(item))
    if (!targets.length) {
      deps.show('warn', '没有可删除的本地缓存')
      return
    }
    for (const item of targets) await deleteCachedItem(item)
    await deps.refreshCache()
    if (deps.selectedBook?.id === book.id) deps.setSelectedBook(null)
    deps.show('ok', targets.length > 1 ? `已删除 ${targets.length} 个缓存` : '缓存已删除')
  }

  return {
    cacheItem,
    cacheSeries,
    finishMultiCheckDrag,
    handleBookAction,
    handleDetailBookAction,
    loadManifest,
    moveMultiCheckDrag,
    openReaderNeighbor,
    openShelfBook,
    openSourceItem,
    readerBookHandle,
    removeCached,
    removeCachedBook,
    runMultiCheckBatch,
    startMultiCheckDrag,
  }
}
