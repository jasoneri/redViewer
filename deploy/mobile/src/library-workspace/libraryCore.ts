import type { CoverOverlayTag } from '../shared/Cover'
import {
  apiGet,
  buildUrl,
  type CachedItem,
  type ConnectionState,
  type LibraryItem,
  type LibraryMeta,
  type Progress,
  type ShelfBook,
} from '../mobileStore'

export type SortMode = 'time_desc' | 'time_asc' | 'name_asc' | 'name_desc'
export type ProgressMap = Record<string, Progress>
export const MULTI_CHECK_PRIMARY_BATCH_ACTIONS = ['cacheAdd', 'attachAdd', 'save', 'del'] as const
export type MultiCheckBatchAction = typeof MULTI_CHECK_PRIMARY_BATCH_ACTIONS[number]
export type BookProgressEntry = {
  item: LibraryItem
  progress: Progress
}
export type ContinueTarget = {
  item: LibraryItem
  progress: Progress
}
type LegacyComicBook = {
  book: string
  first_img?: string | null
  eps?: Array<{ ep: string; first_img?: string | null }>
}

export const EMPTY_META: LibraryMeta = {
  artist: null,
  source: null,
  preview_url: null,
  public_date: null,
  tags: [],
  pages: null,
  btype: null,
}

export function ensureMeta(meta?: LibraryMeta | null): LibraryMeta {
  return {
    ...EMPTY_META,
    ...meta,
    tags: Array.isArray(meta?.tags) ? meta.tags.filter(Boolean) : [],
  }
}

function dedupeTags(values: string[]): string[] {
  const tags = new Set<string>()
  for (const value of values) {
    const tag = value.trim()
    if (tag) tags.add(tag)
  }
  return Array.from(tags)
}

export function mergeLibraryMeta(primary?: LibraryMeta | null, fallback?: LibraryMeta | null, pageCount?: number | null): LibraryMeta {
  const left = ensureMeta(primary)
  const right = ensureMeta(fallback)
  return {
    artist: left.artist || right.artist,
    source: left.source || right.source,
    preview_url: left.preview_url || right.preview_url,
    public_date: left.public_date || right.public_date,
    tags: dedupeTags([...left.tags, ...right.tags]),
    pages: left.pages ?? right.pages ?? (typeof pageCount === 'number' && pageCount > 0 ? pageCount : null),
    btype: left.btype || right.btype,
  }
}

export function metaEquals(left: LibraryMeta, right: LibraryMeta): boolean {
  return left.artist === right.artist
    && left.source === right.source
    && left.preview_url === right.preview_url
    && left.public_date === right.public_date
    && left.pages === right.pages
    && left.btype === right.btype
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index])
}

function cacheMetaKeys(item: Pick<LibraryItem, 'id' | 'book' | 'ep'>): string[] {
  return [item.id, progressIdentity(item.book, item.ep)]
}

export function buildLibraryMetaLookup(books: ShelfBook[]): Map<string, LibraryMeta> {
  const lookup = new Map<string, LibraryMeta>()
  const add = (item: LibraryItem) => {
    const meta = ensureMeta(item.meta)
    for (const key of cacheMetaKeys(item)) lookup.set(key, meta)
  }
  for (const book of books) {
    add(book)
    for (const episode of book.episodes) add(episode)
  }
  return lookup
}

function fallbackCachedMeta(item: CachedItem, lookup?: Map<string, LibraryMeta>): LibraryMeta | undefined {
  if (!lookup) return undefined
  for (const key of cacheMetaKeys(item)) {
    const meta = lookup.get(key)
    if (meta) return meta
  }
  return undefined
}

export function cachedDisplayMeta(item: CachedItem, lookup?: Map<string, LibraryMeta>): LibraryMeta {
  return mergeLibraryMeta(item.meta, fallbackCachedMeta(item, lookup), item.page_count)
}

function compactBadgeText(value: string, limit = 10): string {
  const trimmed = value.trim()
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
}

function metaLang(meta: LibraryMeta): string | null {
  const value = (meta as LibraryMeta & { lang?: unknown }).lang
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function appendTopRightBadges(tags: CoverOverlayTag[], meta: LibraryMeta) {
  const lang = metaLang(meta)
  const entries = [
    ['source', meta.source],
    ['btype', meta.btype],
    ['lang', lang],
  ] as const

  for (const [key, value] of entries) {
    if (!value) continue
    tags.push({ key, text: value, title: value, anchor: 'top-right', tone: 'light' })
  }
}

export function mangaCoverOverlayTags(book: ShelfBook, meta: LibraryMeta): CoverOverlayTag[] {
  const tags: CoverOverlayTag[] = []
  if (book.kind === 'series' && book.episode_count > 0) {
    tags.push({ key: 'episodes', text: String(book.episode_count), title: `${book.episode_count} 话`, anchor: 'bottom-left', tone: 'episodes', icon: 'episodes' })
  }
  if (meta.artist) {
    tags.push({ key: 'artist', text: compactBadgeText(meta.artist), title: meta.artist, anchor: 'bottom-left', tone: 'artist' })
  }
  appendTopRightBadges(tags, meta)
  return tags
}

export function doujinCoverOverlayTags(meta: LibraryMeta): CoverOverlayTag[] {
  const tags: CoverOverlayTag[] = []
  if (meta.pages !== null) {
    tags.push({ key: 'pages', text: `p${meta.pages}`, title: `${meta.pages} 页`, anchor: 'bottom-left', tone: 'pages' })
  }
  if (meta.artist) {
    tags.push({ key: 'artist', text: compactBadgeText(meta.artist), title: meta.artist, anchor: 'bottom-left', tone: 'artist' })
  }
  appendTopRightBadges(tags, meta)
  return tags
}

export function episodeCoverOverlayTags(pageCount: number | null): CoverOverlayTag[] {
  const tags: CoverOverlayTag[] = []
  if (pageCount !== null) {
    tags.push({ key: 'pages', text: `p${pageCount}`, title: `${pageCount} 页`, anchor: 'bottom-left', tone: 'pages' })
  }
  return tags
}

export function resolveEpisodePageCount(episode: LibraryItem, cachedEpisode?: CachedItem, prefetchedPageCount?: number): number | null {
  const metaPages = ensureMeta(episode.meta).pages
  if (metaPages !== null) return metaPages
  if (typeof prefetchedPageCount === 'number' && prefetchedPageCount > 0) return prefetchedPageCount
  if (typeof cachedEpisode?.page_count === 'number' && cachedEpisode.page_count > 0) return cachedEpisode.page_count
  return null
}

export function detailMetaTiles(book: ShelfBook, meta: LibraryMeta, cachedById: Map<string, CachedItem>): Array<{ label: string; value: string }> {
  void book
  void cachedById
  const items: Array<{ label: string; value: string }> = []
  if (meta.artist) items.push({ label: '作者', value: meta.artist })
  if (meta.btype) items.push({ label: '类型', value: meta.btype })
  if (meta.source) items.push({ label: '源站', value: meta.source })
  if (meta.pages !== null) items.push({ label: '页数', value: `${meta.pages}P` })
  if (meta.public_date) items.push({ label: '下载日期', value: meta.public_date })
  return items
}

export function detailKindOverlayTags(book: ShelfBook): CoverOverlayTag[] {
  const text = book.kind === 'series' ? '系列' : '作品'
  return [{ key: 'kind', text, title: text, anchor: 'top-right', tone: 'light' }]
}

export function detailChapterTotal(book: ShelfBook): number {
  return book.kind === 'series' ? book.episode_count : 1
}

export function searchableBookTokens(book: ShelfBook): string[] {
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

export function bookFilterKeywords(book: ShelfBook): string[] {
  const meta = ensureMeta(book.meta)
  return [meta.artist || '', meta.source || '', meta.btype || '', ...meta.tags].filter(Boolean)
}

export function visibleDoujinTags(book: ShelfBook): string[] {
  return ensureMeta(book.meta).tags.slice(0, 3)
}

export function showShelfSummary(book: ShelfBook, isDoujinMode: boolean): boolean {
  void book
  return isDoujinMode
}

export function buildShelf(items: LibraryItem[]): ShelfBook[] {
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

export function sortShelfBooks(books: ShelfBook[], sort: SortMode): ShelfBook[] {
  return [...books].sort((a, b) => {
    if (sort === 'name_asc') return a.book.localeCompare(b.book, undefined, { numeric: true })
    if (sort === 'name_desc') return b.book.localeCompare(a.book, undefined, { numeric: true })
    if (sort === 'time_asc') return a.mtime - b.mtime
    return b.mtime - a.mtime
  })
}

function mergeCachedMeta(items: CachedItem[], lookup?: Map<string, LibraryMeta>): LibraryMeta {
  const newestFirst = [...items].sort((a, b) => b.cached_at - a.cached_at)
  const scalar = newestFirst.map((item) => cachedDisplayMeta(item, lookup))
  const tags = new Set<string>()
  for (const meta of scalar) {
    for (const tag of meta.tags) tags.add(tag)
  }
  return {
    artist: scalar.find((meta) => meta.artist)?.artist || null,
    source: scalar.find((meta) => meta.source)?.source || null,
    preview_url: scalar.find((meta) => meta.preview_url)?.preview_url || null,
    public_date: scalar.find((meta) => meta.public_date)?.public_date || null,
    tags: Array.from(tags),
    pages: scalar.find((meta) => meta.pages !== null)?.pages ?? null,
    btype: scalar.find((meta) => meta.btype)?.btype || null,
  }
}

export function buildOfflineShelf(items: CachedItem[], lookup?: Map<string, LibraryMeta>): ShelfBook[] {
  const grouped = new Map<string, CachedItem[]>()
  for (const item of items) {
    const key = item.book.trim() || item.title.trim() || item.id
    grouped.set(key, [...(grouped.get(key) || []), item])
  }

  return Array.from(grouped.entries()).map(([book, rows]) => {
    const newestFirst = [...rows].sort((a, b) => b.cached_at - a.cached_at)
    const latest = newestFirst[0]
    const firstImg = newestFirst.find((item) => item.first_img)?.first_img || null
    const episodes = [...rows]
      .sort((a, b) => {
        const epCompare = a.ep.localeCompare(b.ep, undefined, { numeric: true })
        return epCompare || b.cached_at - a.cached_at
      })
      .map((item) => cachedAsLibraryItem(item, lookup))

    if (rows.length === 1 && !latest.ep.trim()) {
      return {
        ...cachedAsLibraryItem(latest, lookup),
        kind: 'single' as const,
        episode_count: 0,
        episodes: [],
      }
    }

    return {
      id: latest.id,
      kind: 'series' as const,
      book,
      ep: '',
      title: book,
      first_img: firstImg,
      mtime: latest.cached_at / 1000,
      ero: 0,
      meta: mergeCachedMeta(newestFirst, lookup),
      episode_count: episodes.length,
      episodes,
    }
  })
}

export function legacyItemId(book: string, ep: string): string {
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

export async function loadLegacyShelf(backendUrl: string, sort: SortMode): Promise<ShelfBook[]> {
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

export function isMissingMobileContract(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes('404') && error.message.includes('Not Found')
}

export function coverUrl(backendUrl: string, firstImg: string | null, connection: ConnectionState): string {
  if (!firstImg || connection === 'offline_cache_only') return ''
  return buildUrl(backendUrl, firstImg)
}

export function offlineBookCoverUrl(book: ShelfBook, offlineCoverUrls: Record<string, string>): string {
  if (book.kind === 'single') return offlineCoverUrls[book.id] || ''
  return book.episodes.map((episode) => offlineCoverUrls[episode.id]).find(Boolean) || ''
}

export function cacheLabel(item?: CachedItem): string {
  if (!item) return '缓存'
  if (item.status === 'partial') return `${item.cached_pages}/${item.page_count}`
  return '已缓存'
}

export function seriesCacheLabel(book: ShelfBook, cachedById: Map<string, CachedItem>): string {
  const count = book.episodes.filter((episode) => cachedById.has(episode.id)).length
  return count ? `${count}/${book.episode_count}` : '缓存'
}

export function progressIdentity(book: string, ep: string): string {
  return `${book}::${ep || ''}`
}

export function collectShelfProgressKeys(books: ShelfBook[]): Set<string> {
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

export function progressBadge(progress: Progress): string {
  if (progress.status === 'completed') return '读完'
  return `第 ${Math.max(progress.page_index + 1, 1)} 页`
}

export function progressMeterValue(progress: Progress, pageCount?: number): number {
  if (progress.status === 'completed') return 100
  const total = Math.max(pageCount || progress.page_index + 1, 1)
  return ((progress.page_index + 1) / total) * 100
}

export function cacheMeterValue(item: CachedItem): number {
  if (item.status === 'cached') return 100
  return (item.cached_pages / Math.max(item.page_count, 1)) * 100
}

export function latestBookProgressEntry(book: ShelfBook, progressByKey: ProgressMap): BookProgressEntry | undefined {
  if (book.kind === 'single') {
    const progress = progressByKey[progressIdentity(book.book, book.ep)]
    return progress ? { item: book, progress } : undefined
  }
  return book.episodes
    .map((episode) => {
      const progress = progressByKey[progressIdentity(episode.book, episode.ep)]
      return progress ? { item: episode, progress } : undefined
    })
    .filter((entry): entry is BookProgressEntry => Boolean(entry))
    .sort((a, b) => b.progress.updated_at - a.progress.updated_at)[0]
}

export function latestBookProgress(book: ShelfBook, progressByKey: ProgressMap): Progress | undefined {
  return latestBookProgressEntry(book, progressByKey)?.progress
}

export function bookCachedCount(book: ShelfBook, cachedById: Map<string, CachedItem>): number {
  if (book.kind === 'single') return cachedById.has(book.id) ? 1 : 0
  return book.episodes.filter((episode) => cachedById.has(episode.id)).length
}

export function bookSummary(book: ShelfBook, cachedById: Map<string, CachedItem>, progressByKey: ProgressMap): string {
  const progressEntry = latestBookProgressEntry(book, progressByKey)
  const cached = bookCachedCount(book, cachedById)
  if (progressEntry) return bookProgressLabel(book, progressEntry)
  if (book.kind === 'single') return cached ? '已缓存' : '单本'
  return cached ? `${book.episode_count} 话 · ${cached} 个离线` : `${book.episode_count} 话`
}

export function detailBookSummary(book: ShelfBook, progressEntry?: BookProgressEntry): string | null {
  if (progressEntry) return bookProgressLabel(book, progressEntry)
  return null
}

function bookProgressLabel(book: ShelfBook, entry: BookProgressEntry): string {
  if (book.kind === 'single') return progressLabel(entry.progress)
  const chapter = episodeDisplayName(entry.item)
  return entry.progress.status === 'completed' ? `已读完 ${chapter}` : `最近阅读：${chapter}`
}

export function episodeDisplayName(item: LibraryItem): string {
  const label = item.ep || item.title
  if (!label) return '章节'
  return /^\d+$/.test(label) ? `第 ${label} 话` : label
}

export function cachedAsLibraryItem(item: CachedItem, lookup?: Map<string, LibraryMeta>): LibraryItem {
  return {
    id: item.id,
    book: item.book,
    ep: item.ep,
    title: item.title,
    first_img: item.first_img,
    mtime: item.cached_at / 1000,
    ero: 0,
    meta: cachedDisplayMeta(item, lookup),
  }
}

export function findContinueTarget(shelf: ShelfBook[], cached: CachedItem[], progressByKey: ProgressMap): ContinueTarget | null {
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

export function formatDate(seconds: number): string {
  if (!seconds) return '-'
  return new Date(seconds * 1000).toLocaleDateString()
}
