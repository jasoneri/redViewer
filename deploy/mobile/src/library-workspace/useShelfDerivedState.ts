import { useMemo } from 'react'
import type { CachedItem, ShelfBook } from '../mobileStore'
import {
  bookFilterKeywords,
  buildLibraryMetaLookup,
  buildOfflineShelf,
  searchableBookTokens,
  sortShelfBooks,
  type ProgressMap,
  type SortMode,
} from './libraryCore'

type View = 'library' | 'downloads' | 'reader' | 'acquire'
type ShelfSource = 'library' | 'downloads'

type ShelfDerivedStateDeps = {
  cached: CachedItem[]
  episodePage: number
  filterDraft: string
  libraryPage: number
  progressByKey: ProgressMap
  query: string
  selectedBook: ShelfBook | null
  selectedShelfSource: ShelfSource
  seriesOnly: boolean
  shelf: ShelfBook[]
  sort: SortMode
  view: View
}

const LIBRARY_PAGE_SIZE = 30
const EPISODE_PAGE_SIZE = 30

export function useShelfDerivedState(deps: ShelfDerivedStateDeps) {
  const cachedById = useMemo(() => new Map(deps.cached.map((item) => [item.id, item])), [deps.cached])
  const libraryMetaByCacheKey = useMemo(() => buildLibraryMetaLookup(deps.shelf), [deps.shelf])
  const offlineShelf = useMemo(() => buildOfflineShelf(deps.cached, libraryMetaByCacheKey), [deps.cached, libraryMetaByCacheKey])
  const activeShelfSource: ShelfSource = deps.view === 'downloads' ? 'downloads' : 'library'
  const activeShelf = activeShelfSource === 'downloads' ? offlineShelf : deps.shelf
  const detailShelf = deps.selectedShelfSource === 'downloads' ? offlineShelf : deps.shelf
  const activeSourceIsOffline = activeShelfSource === 'downloads'
  const detailSourceIsOffline = deps.selectedShelfSource === 'downloads'
  const cachedPages = useMemo(() => deps.cached.reduce((total, item) => total + item.cached_pages, 0), [deps.cached])
  const cachedComplete = useMemo(() => deps.cached.filter((item) => item.status === 'cached').length, [deps.cached])
  const progressCount = useMemo(() => Object.values(deps.progressByKey).filter((progress) => progress.status !== 'unread').length, [deps.progressByKey])
  
  const sortedLibraryShelf = useMemo(() => sortShelfBooks(deps.shelf, deps.sort), [deps.shelf, deps.sort])
  const sortedOfflineShelf = useMemo(() => sortShelfBooks(offlineShelf, deps.sort), [offlineShelf, deps.sort])
  const sortedActiveShelf = useMemo(() => sortShelfBooks(activeShelf, deps.sort), [activeShelf, deps.sort])
  
  const applyFilter = (sortedShelf: ShelfBook[]) => {
    const value = deps.query.trim().toLowerCase()
    return sortedShelf.filter((book) => {
      if (deps.seriesOnly && book.kind !== 'series') return false
      if (!value) return true
      return searchableBookTokens(book).some((token) => token.toLowerCase().includes(value))
    })
  }
  
  const filteredLibraryShelf = useMemo(() => applyFilter(sortedLibraryShelf), [deps.query, deps.seriesOnly, sortedLibraryShelf])
  const filteredOfflineShelf = useMemo(() => applyFilter(sortedOfflineShelf), [deps.query, deps.seriesOnly, sortedOfflineShelf])
  const filteredShelf = useMemo(() => applyFilter(sortedActiveShelf), [deps.query, deps.seriesOnly, sortedActiveShelf])
  const seriesBooks = useMemo(() => detailShelf.filter((book) => book.kind === 'series'), [detailShelf])
  const selectedSeriesIndex = useMemo(() => {
    if (deps.selectedBook?.kind !== 'series') return -1
    return seriesBooks.findIndex((book) => book.id === deps.selectedBook?.id)
  }, [deps.selectedBook, seriesBooks])
  const previousSeriesBook = selectedSeriesIndex > 0 ? seriesBooks[selectedSeriesIndex - 1] : null
  const nextSeriesBook = selectedSeriesIndex >= 0 && selectedSeriesIndex < seriesBooks.length - 1 ? seriesBooks[selectedSeriesIndex + 1] : null
  const selectedSeriesValue = deps.selectedBook?.kind === 'series' ? deps.selectedBook.id : deps.selectedBook?.id || ''
  const libraryPageCount = Math.max(1, Math.ceil(filteredShelf.length / LIBRARY_PAGE_SIZE))
  const libraryPageSafe = Math.min(deps.libraryPage, libraryPageCount)
  const pagedShelf = useMemo(() => {
    const start = (libraryPageSafe - 1) * LIBRARY_PAGE_SIZE
    return filteredShelf.slice(start, start + LIBRARY_PAGE_SIZE)
  }, [filteredShelf, libraryPageSafe])
  const episodePageCount = Math.max(1, Math.ceil((deps.selectedBook?.episodes.length || 0) / EPISODE_PAGE_SIZE))
  const episodePageSafe = Math.min(deps.episodePage, episodePageCount)
  const pagedEpisodes = useMemo(() => {
    const start = (episodePageSafe - 1) * EPISODE_PAGE_SIZE
    return deps.selectedBook?.episodes.slice(start, start + EPISODE_PAGE_SIZE) || []
  }, [episodePageSafe, deps.selectedBook])
  const filterKeywords = useMemo(() => {
    const keywords = new Set<string>()
    activeShelf.forEach((book) => {
      bookFilterKeywords(book).forEach((keyword) => keywords.add(keyword.slice(0, 20)))
    })
    return Array.from(keywords).sort((a, b) => a.localeCompare(b))
  }, [activeShelf])
  const quickFilterKeywords = useMemo(() => filterKeywords.slice(0, 8), [filterKeywords])
  const filterBoardKeywords = useMemo(() => {
    const value = deps.filterDraft.trim().toLowerCase()
    if (!value) return filterKeywords
    return filterKeywords.filter((keyword) => keyword.toLowerCase().includes(value))
  }, [deps.filterDraft, filterKeywords])

  return {
    activeShelfSource,
    activeSourceIsOffline,
    cachedById,
    cachedComplete,
    cachedPages,
    detailShelf,
    detailSourceIsOffline,
    episodePageCount,
    episodePageSafe,
    episodePageSize: EPISODE_PAGE_SIZE,
    filterBoardKeywords,
    filteredLibraryShelf,
    filteredOfflineShelf,
    filteredShelf,
    libraryMetaByCacheKey,
    libraryPageCount,
    libraryPageSafe,
    libraryPageSize: LIBRARY_PAGE_SIZE,
    nextSeriesBook,
    offlineShelf,
    pagedEpisodes,
    pagedShelf,
    previousSeriesBook,
    progressCount,
    quickFilterKeywords,
    selectedSeriesValue,
    seriesBooks,
  }
}
