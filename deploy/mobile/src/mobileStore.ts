export type ConnectionState = 'unknown' | 'online' | 'backend_unreachable' | 'offline_cache_only'

export type LibraryItem = {
  id: string
  book: string
  ep: string
  title: string
  first_img: string | null
  mtime: number
  ero: number
  meta: LibraryMeta
}

export type LibraryMeta = {
  artist: string | null
  source: string | null
  preview_url: string | null
  public_date: string | null
  tags: string[]
  pages: number | null
  btype: string | null
}

export type ShelfBook = LibraryItem & {
  kind: 'single' | 'series'
  episode_count: number
  episodes: LibraryItem[]
}

export type LibraryResponse = {
  items?: LibraryItem[]
  books?: ShelfBook[]
  count: number
  book_count?: number
  ero: number
  path_configured?: boolean
}

export type Manifest = LibraryItem & {
  page_count: number
  pages: string[]
  version: string
}

export type Progress = {
  book: string
  ep: string
  device_id: string
  page_index: number
  scroll_top: number
  reading_mode: 'scroll' | 'page'
  status: 'unread' | 'reading' | 'completed'
  updated_at: number
}

export type CachedItem = {
  id: string
  book: string
  ep: string
  title: string
  first_img: string | null
  meta: LibraryMeta
  page_count: number
  cached_pages: number
  cached_at: number
  version: string
  status: 'cached' | 'partial'
  pages: string[]
}

type StoredCachedItem = Omit<CachedItem, 'meta'> & {
  meta?: Partial<LibraryMeta> | null
}

type StoredPageRow = {
  key: string
  blob?: Blob
}

export type OfflineCacheSummary = {
  bytes: number | null
  item_count: number
  page_count: number
  exact: boolean
  source: 'indexeddb' | 'storage_estimate' | 'unavailable'
}

export type OfflineCacheCleanupSummary = {
  removed_manifest_count: number
  removed_page_blob_count: number
  removed_manifest_ids: string[]
}

export type OfflineCacheClearSummary = {
  removed_item_count: number
}

export type OfflineReadCleanupConfig = {
  delAfterHours: number
}

export type OfflineReadCleanupResult = {
  removed: number
  removedIds: string[]
}

export type CgsSite = {
  site_index?: number
  index?: number
  spider_name?: string
  name?: string
}

export type CgsBook = {
  book_key?: string
  select_mode?: 'book' | 'chapters' | string
  title?: string
  name?: string
  source?: string
  artist?: string
  pages?: number
  page_count?: number
  btype?: string
  category?: string
  type?: string
  public_date?: string
  date?: string
  tags?: string[]
  cover_static_url?: string
  unsupported_reason?: string
  supported?: boolean
  [key: string]: unknown
}

export type CgsBookEpisode = {
  episode_key: string
  idx: number | string | null
  name: string
  downloaded?: boolean
  [key: string]: unknown
}

export type CgsConfig = {
  downloaded_handle: string
  downloaded_handle_options?: string[]
  proxies: string[]
  sv_path: string
}

const DB_NAME = 'redviewer-mobile'
const DB_VERSION = 1
const META_STORE = 'items'
const PAGE_STORE = 'pages'
const PROGRESS_STORE = 'progress'
const QUEUE_STORE = 'pendingProgress'

export const DEVICE_ID_KEY = 'rv_mobile_device_id'
export const BACKEND_URL_KEY = 'rv_mobile_backend_url'
export const OFFLINE_READ_CLEANUP_HOURS_KEY = 'rv_mobile_offline_read_cleanup_hours'

const OFFLINE_READ_CLEANUP_COMPLETED_AT_KEY = 'rv_mobile_offline_read_cleanup_completed_at'

export const DEFAULT_OFFLINE_READ_CLEANUP_CONFIG: OfflineReadCleanupConfig = {
  delAfterHours: 0,
}

export const EMPTY_LIBRARY_META: LibraryMeta = {
  artist: null,
  source: null,
  preview_url: null,
  public_date: null,
  tags: [],
  pages: null,
  btype: null,
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(PAGE_STORE)) {
        db.createObjectStore(PAGE_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
        db.createObjectStore(PROGRESS_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'key' })
      }
    }
  })
  return dbPromise
}

function txStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const request = run(store)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        tx.onerror = () => reject(tx.error)
      }),
  )
}

function txStores<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  run: (stores: Record<string, IDBObjectStore>) => Promise<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeNames, mode)
        const stores = Object.fromEntries(storeNames.map((name) => [name, tx.objectStore(name)]))
        run(stores)
          .then((result) => {
            tx.oncomplete = () => resolve(result)
          })
          .catch((error) => {
            tx.abort()
            reject(error)
          })
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function normalizeBackendUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function buildUrl(backendUrl: string, path: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) return path
  return `${backendUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export function ensureDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID?.() ?? fallbackUUID()
  localStorage.setItem(DEVICE_ID_KEY, id)
  return id
}

function clampOfflineReadCleanupHours(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.min(Math.floor(parsed), 9999)
}

export function loadOfflineReadCleanupConfig(): OfflineReadCleanupConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_OFFLINE_READ_CLEANUP_CONFIG
  return {
    delAfterHours: clampOfflineReadCleanupHours(localStorage.getItem(OFFLINE_READ_CLEANUP_HOURS_KEY)),
  }
}

export function saveOfflineReadCleanupConfig(config: OfflineReadCleanupConfig): OfflineReadCleanupConfig {
  const next = { delAfterHours: clampOfflineReadCleanupHours(config.delAfterHours) }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(OFFLINE_READ_CLEANUP_HOURS_KEY, String(next.delAfterHours))
  }
  return next
}

function loadOfflineReadCleanupCompletedAt(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(OFFLINE_READ_CLEANUP_COMPLETED_AT_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => {
        const [key, value] = entry
        return Boolean(key) && typeof value === 'number' && Number.isFinite(value) && value > 0
      }),
    )
  } catch {
    return {}
  }
}

function saveOfflineReadCleanupCompletedAt(value: Record<string, number>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(OFFLINE_READ_CLEANUP_COMPLETED_AT_KEY, JSON.stringify(value))
}

function markOfflineReadCleanupProgress(progress: Progress): void {
  const key = progressKey(progress.book, progress.ep)
  const completedAt = loadOfflineReadCleanupCompletedAt()
  if (progress.status === 'completed') {
    if (!completedAt[key]) {
      completedAt[key] = progress.updated_at || Date.now()
      saveOfflineReadCleanupCompletedAt(completedAt)
    }
    return
  }
  if (completedAt[key]) {
    delete completedAt[key]
    saveOfflineReadCleanupCompletedAt(completedAt)
  }
}

function fallbackUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function apiGet<T>(backendUrl: string, path: string): Promise<T> {
  const response = await fetch(buildUrl(backendUrl, path))
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return response.json() as Promise<T>
}

export async function apiPost<T>(
  backendUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(buildUrl(backendUrl, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return response.json() as Promise<T>
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeLibraryMeta(meta: Partial<LibraryMeta> | null | undefined): LibraryMeta {
  return {
    artist: normalizeNullableString(meta?.artist),
    source: normalizeNullableString(meta?.source),
    preview_url: normalizeNullableString(meta?.preview_url),
    public_date: normalizeNullableString(meta?.public_date),
    tags: Array.isArray(meta?.tags) ? meta.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())) : [],
    pages: normalizeNullableNumber(meta?.pages),
    btype: normalizeNullableString(meta?.btype),
  }
}

function normalizeCachedItem(row: StoredCachedItem): CachedItem {
  return {
    ...row,
    meta: normalizeLibraryMeta(row.meta),
  }
}

export async function loadCachedItems(): Promise<CachedItem[]> {
  const rows = await txStore<StoredCachedItem[]>(META_STORE, 'readonly', (store) => store.getAll())
  return rows.map(normalizeCachedItem).sort((a, b) => b.cached_at - a.cached_at)
}

export async function getCachedItem(id: string): Promise<CachedItem | undefined> {
  const row = await txStore<StoredCachedItem | undefined>(META_STORE, 'readonly', (store) => store.get(id))
  return row ? normalizeCachedItem(row) : undefined
}

export async function updateCachedItemMeta(id: string, meta: Partial<LibraryMeta>): Promise<CachedItem | undefined> {
  const row = await txStore<StoredCachedItem | undefined>(META_STORE, 'readonly', (store) => store.get(id))
  if (!row) return undefined
  const next = normalizeCachedItem({ ...row, meta: normalizeLibraryMeta(meta) })
  await txStore(META_STORE, 'readwrite', (store) => store.put(next))
  return next
}

export async function getCachedPages(item: CachedItem): Promise<string[]> {
  const db = await openDb()
  const tx = db.transaction(PAGE_STORE, 'readonly')
  const store = tx.objectStore(PAGE_STORE)
  const blobs = await Promise.all(
    item.pages.map((_, index) => requestToPromise<StoredPageRow | undefined>(store.get(pageKey(item.id, index)))),
  )
  return blobs.map((row, index) => {
    if (!row?.blob) {
      throw new Error(`cached page blob missing: ${item.id} page ${index + 1}/${item.pages.length}`)
    }
    return URL.createObjectURL(row.blob)
  })
}

export async function getCachedCover(item: Pick<CachedItem, 'id' | 'cached_pages'>): Promise<string> {
  if (item.cached_pages <= 0) return ''
  const row = await txStore<StoredPageRow | undefined>(PAGE_STORE, 'readonly', (store) => store.get(pageKey(item.id, 0)))
  return row?.blob ? URL.createObjectURL(row.blob) : ''
}

export async function saveProgress(progress: Progress): Promise<void> {
  const key = progressKey(progress.book, progress.ep)
  await txStore(PROGRESS_STORE, 'readwrite', (store) => store.put({ ...progress, key }))
  markOfflineReadCleanupProgress(progress)
}

export async function loadProgress(book: string, ep: string): Promise<Progress | undefined> {
  const row = await txStore<(Progress & { key: string }) | undefined>(PROGRESS_STORE, 'readonly', (store) =>
    store.get(progressKey(book, ep)),
  )
  if (!row) return undefined
  const { key: _key, ...progress } = row
  return progress
}

export async function loadAllProgress(): Promise<Progress[]> {
  const rows = await txStore<(Progress & { key: string })[]>(PROGRESS_STORE, 'readonly', (store) => store.getAll())
  return rows.map(({ key: _key, ...progress }) => progress)
}

export async function queueProgress(progress: Progress): Promise<void> {
  const key = progressKey(progress.book, progress.ep)
  await txStore(QUEUE_STORE, 'readwrite', (store) => store.put({ ...progress, key }))
}

export async function syncProgress(backendUrl: string, progress: Progress): Promise<void> {
  await apiPost(backendUrl, '/mobile/progress', progress)
  await txStore(QUEUE_STORE, 'readwrite', (store) => store.delete(progressKey(progress.book, progress.ep)))
}

export async function syncPendingProgress(backendUrl: string): Promise<{ synced: number; failed: number }> {
  const rows = await txStore<(Progress & { key: string })[]>(QUEUE_STORE, 'readonly', (store) => store.getAll())
  let synced = 0
  let failed = 0
  for (const row of rows) {
    const { key: _key, ...progress } = row
    try {
      await syncProgress(backendUrl, progress)
      synced += 1
    } catch {
      failed += 1
    }
  }
  return { synced, failed }
}

export async function cacheManifest(
  backendUrl: string,
  manifest: Manifest,
  onProgress: (done: number, total: number) => void,
): Promise<CachedItem> {
  const cached: CachedItem = {
    id: manifest.id,
    book: manifest.book,
    ep: manifest.ep,
    title: manifest.title,
    first_img: manifest.first_img,
    meta: normalizeLibraryMeta({ ...manifest.meta, pages: manifest.meta?.pages ?? manifest.page_count }),
    page_count: manifest.page_count,
    cached_pages: 0,
    cached_at: Date.now(),
    version: manifest.version,
    status: 'partial',
    pages: manifest.pages,
  }

  await txStore(META_STORE, 'readwrite', (store) => store.put(cached))

  for (let index = 0; index < manifest.pages.length; index += 1) {
    const pageUrl = buildUrl(backendUrl, manifest.pages[index])
    const response = await fetch(pageUrl)
    if (!response.ok) throw new Error(`page ${index + 1}: ${response.status}`)
    const blob = await response.blob()
    await txStore(PAGE_STORE, 'readwrite', (store) => store.put({ key: pageKey(manifest.id, index), blob }))
    cached.cached_pages = index + 1
    cached.status = cached.cached_pages === manifest.page_count ? 'cached' : 'partial'
    await txStore(META_STORE, 'readwrite', (store) => store.put({ ...cached }))
    onProgress(cached.cached_pages, manifest.page_count)
  }

  return cached
}

export async function deleteCachedItem(item: CachedItem): Promise<void> {
  const readCleanupKey = progressKey(item.book, item.ep)
  await txStores([META_STORE, PAGE_STORE, PROGRESS_STORE, QUEUE_STORE], 'readwrite', async (stores) => {
    stores[META_STORE].delete(item.id)
    stores[PROGRESS_STORE].delete(readCleanupKey)
    stores[QUEUE_STORE].delete(readCleanupKey)
    for (let index = 0; index < item.pages.length; index += 1) {
      stores[PAGE_STORE].delete(pageKey(item.id, index))
    }
  })
  const completedAt = loadOfflineReadCleanupCompletedAt()
  if (completedAt[readCleanupKey]) {
    delete completedAt[readCleanupKey]
    saveOfflineReadCleanupCompletedAt(completedAt)
  }
}

export async function clearOfflineCache(): Promise<OfflineCacheClearSummary> {
  const cachedItems = await loadCachedItems()
  await txStores([META_STORE, PAGE_STORE, PROGRESS_STORE, QUEUE_STORE], 'readwrite', async (stores) => {
    stores[META_STORE].clear()
    stores[PAGE_STORE].clear()
    for (const item of cachedItems) {
      const key = progressKey(item.book, item.ep)
      stores[PROGRESS_STORE].delete(key)
      stores[QUEUE_STORE].delete(key)
    }
  })
  saveOfflineReadCleanupCompletedAt({})
  return { removed_item_count: cachedItems.length }
}

export async function cleanupExpiredOfflineReadCache(
  config: OfflineReadCleanupConfig = loadOfflineReadCleanupConfig(),
): Promise<OfflineReadCleanupResult> {
  const delAfterHours = clampOfflineReadCleanupHours(config.delAfterHours)
  if (delAfterHours <= 0) return { removed: 0, removedIds: [] }

  const cachedItems = await loadCachedItems()
  if (!cachedItems.length) return { removed: 0, removedIds: [] }

  const progressRows = await loadAllProgress()
  const progressByKey = new Map(progressRows.map((progress) => [progressKey(progress.book, progress.ep), progress]))
  const completedAt = loadOfflineReadCleanupCompletedAt()
  const cacheKeys = new Set(cachedItems.map((item) => progressKey(item.book, item.ep)))
  const cutoff = Date.now() - delAfterHours * 60 * 60 * 1000
  const removedIds: string[] = []
  let completedAtChanged = false

  for (const key of Object.keys(completedAt)) {
    const progress = progressByKey.get(key)
    if (!cacheKeys.has(key) || progress?.status !== 'completed') {
      delete completedAt[key]
      completedAtChanged = true
    }
  }

  for (const item of cachedItems) {
    const key = progressKey(item.book, item.ep)
    const progress = progressByKey.get(key)
    if (progress?.status !== 'completed') continue

    const completedTime = completedAt[key] || progress.updated_at || Date.now()
    if (!completedAt[key]) {
      completedAt[key] = completedTime
      completedAtChanged = true
    }
    if (completedTime > cutoff) continue

    await deleteCachedItem(item)
    removedIds.push(item.id)
    delete completedAt[key]
    completedAtChanged = true
  }

  if (completedAtChanged) saveOfflineReadCleanupCompletedAt(completedAt)
  return { removed: removedIds.length, removedIds }
}

export async function getOfflineCacheSummary(): Promise<OfflineCacheSummary> {
  let itemCount = 0

  try {
    const manifests = await txStore<StoredCachedItem[]>(META_STORE, 'readonly', (store) => store.getAll())
    itemCount = manifests.length
    const pageRows = await txStore<StoredPageRow[]>(PAGE_STORE, 'readonly', (store) => store.getAll())
    const bytes = pageRows.reduce((total, row) => total + (row.blob?.size || 0), 0)
    return {
      bytes,
      item_count: itemCount,
      page_count: pageRows.length,
      exact: true,
      source: 'indexeddb',
    }
  } catch {
    if (typeof navigator !== 'undefined' && typeof navigator.storage?.estimate === 'function') {
      try {
        const estimate = await navigator.storage.estimate()
        return {
          bytes: typeof estimate.usage === 'number' ? estimate.usage : null,
          item_count: itemCount,
          page_count: 0,
          exact: false,
          source: 'storage_estimate',
        }
      } catch {
        // Fall through to unavailable below.
      }
    }

    return {
      bytes: null,
      item_count: itemCount,
      page_count: 0,
      exact: false,
      source: 'unavailable',
    }
  }
}

export async function cleanupInvalidOfflineCache(): Promise<OfflineCacheCleanupSummary> {
  const manifests = await txStore<StoredCachedItem[]>(META_STORE, 'readonly', (store) => store.getAll())
  const pageRows = await txStore<StoredPageRow[]>(PAGE_STORE, 'readonly', (store) => store.getAll())
  const pageKeys = new Set(pageRows.map((row) => row.key).filter(Boolean))
  const pageRowsByItemId = new Map<string, StoredPageRow[]>()

  for (const row of pageRows) {
    const itemId = pageItemId(row.key)
    if (!itemId) continue
    const existing = pageRowsByItemId.get(itemId)
    if (existing) existing.push(row)
    else pageRowsByItemId.set(itemId, [row])
  }

  const removedManifestIds = new Set<string>()
  const removedPageKeys = new Set<string>()
  const manifestRowsById = new Map<string, StoredCachedItem>()

  for (const manifest of manifests) {
    const itemId = typeof manifest.id === 'string' ? manifest.id : ''
    if (itemId) manifestRowsById.set(itemId, manifest)

    if (isInvalidManifestRow(manifest, pageKeys)) {
      if (itemId) removedManifestIds.add(itemId)
      const relatedPages = pageRowsByItemId.get(itemId) || []
      for (const pageRow of relatedPages) {
        removedPageKeys.add(pageRow.key)
      }
    }
  }

  for (const pageRow of pageRows) {
    const itemId = pageItemId(pageRow.key)
    if (!itemId || !manifestRowsById.has(itemId) || removedManifestIds.has(itemId)) {
      removedPageKeys.add(pageRow.key)
    }
  }

  if (!removedManifestIds.size && !removedPageKeys.size) {
    return {
      removed_manifest_count: 0,
      removed_page_blob_count: 0,
      removed_manifest_ids: [],
    }
  }

  await txStores([META_STORE, PAGE_STORE, PROGRESS_STORE, QUEUE_STORE], 'readwrite', async (stores) => {
    for (const manifestId of removedManifestIds) {
      stores[META_STORE].delete(manifestId)
      const manifest = manifestRowsById.get(manifestId)
      if (manifest && typeof manifest.book === 'string' && typeof manifest.ep === 'string') {
        const key = progressKey(manifest.book, manifest.ep)
        stores[PROGRESS_STORE].delete(key)
        stores[QUEUE_STORE].delete(key)
      }
    }

    for (const pageKeyValue of removedPageKeys) {
      stores[PAGE_STORE].delete(pageKeyValue)
    }

    return undefined
  })

  return {
    removed_manifest_count: removedManifestIds.size,
    removed_page_blob_count: removedPageKeys.size,
    removed_manifest_ids: Array.from(removedManifestIds),
  }
}

function isInvalidManifestRow(row: StoredCachedItem, pageKeys: Set<string>): boolean {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const book = typeof row.book === 'string' ? row.book.trim() : ''
  const ep = typeof row.ep === 'string' ? row.ep : null
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const pageCount = typeof row.page_count === 'number' ? row.page_count : NaN
  const cachedPages = typeof row.cached_pages === 'number' ? row.cached_pages : NaN
  const pages = row.pages

  if (!id || !book || ep === null || !title) return true
  if (!Number.isInteger(pageCount) || pageCount <= 0) return true
  if (!Array.isArray(pages) || pages.length !== pageCount || pages.some((page) => typeof page !== 'string')) return true
  if (!Number.isInteger(cachedPages) || cachedPages < 0 || cachedPages > pageCount) return true
  if (row.status !== 'cached' && row.status !== 'partial') return true
  if (row.status === 'cached') {
    for (let index = 0; index < pageCount; index += 1) {
      if (!pageKeys.has(pageKey(id, index))) return true
    }
  }
  return false
}

function pageItemId(key: string): string {
  if (!key) return ''
  const separatorIndex = key.lastIndexOf(':')
  return separatorIndex <= 0 ? '' : key.slice(0, separatorIndex)
}

function pageKey(itemId: string, index: number): string {
  return `${itemId}:${index}`
}

function progressKey(book: string, ep: string): string {
  return `${book}::${ep || ''}`
}
