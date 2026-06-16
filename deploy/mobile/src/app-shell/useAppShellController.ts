import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { TreeSelectProps } from 'antd'
import type { AppState } from './useAppState'
import {
  buildShelf,
  isMissingMobileContract,
  loadLegacyShelf,
  type SortMode,
} from '../library-workspace/libraryCore'
import {
  BACKEND_URL_KEY,
  type CachedItem,
  type ConnectionState,
  type LibraryResponse,
  type ShelfBook,
  buildUrl,
  apiGet,
  apiPost,
  cleanupInvalidOfflineCache,
  getOfflineCacheSummary,
  loadCachedItems,
  normalizeBackendUrl,
  syncPendingProgress,
} from '../mobileStore'

export type AppShellStatusInfo = {
  path_configured?: boolean
  ero?: boolean | number
  mobile_contract?: boolean
}

export type AppShellComicConfig = {
  path: string
  kemono_path?: string
  path_configured?: boolean
}

export type FilesystemSegment = {
  path: string
  name: string
}

export type FilesystemNode = {
  title: string
  value: string
  key: string
  isLeaf?: boolean
  children?: FilesystemNode[]
}

export type FilesystemSelectValue = {
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
type ShowToast = (tone: 'ok' | 'warn' | 'error', text: string) => void

const PATH_SUFFIX_LENGTH = 10
const BACKEND_URL_HISTORY_KEY = 'rv_mobile_backend_url_history'
const BACKEND_URL_HISTORY_LIMIT = 6
const ROOT_SECRET_STORAGE_KEY = 'rootSecret'
const BACKEND_HTTP_PORT = 12345
const BACKEND_PROBE_TIMEOUT_MS = 850
const BACKEND_PROBE_BATCH_SIZE = 32

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

export function loadBackendUrlHistory(currentUrl: string): string[] {
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

export function compactPathTail(path: string): string {
  const value = path.trim()
  if (!value) return '未配置'
  return value.length > PATH_SUFFIX_LENGTH ? `...${value.slice(-PATH_SUFFIX_LENGTH)}` : value
}

function formatByteSize(bytes: number | null, approximate = false): string {
  if (!Number.isFinite(bytes) || bytes === null || bytes < 0) return '--'
  const prefix = approximate ? '~' : ''
  if (bytes < 1024 * 1024) return `${prefix}${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${prefix}${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function filesystemQuery(path?: string): string {
  return path ? `?path=${encodeURIComponent(path)}` : ''
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length)
  result.set(left)
  result.set(right, left.length)
  return result
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

async function encryptRootSecretPayload(raw: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持 root 鉴权加密')
  const encoder = new TextEncoder()
  const secret = raw.split(':')[0]
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(secret))
  const key = await globalThis.crypto.subtle.importKey('raw', digest, { name: 'AES-CBC' }, false, ['encrypt'])
  const encrypted = await globalThis.crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, encoder.encode(raw))
  return bytesToBase64(concatBytes(iv, new Uint8Array(encrypted)))
}

export async function rootSecretHeaders(): Promise<Record<string, string>> {
  const secret = localStorage.getItem(ROOT_SECRET_STORAGE_KEY) || ''
  if (!secret) return {}
  return { 'X-Secret': await encryptRootSecretPayload(`${secret}:${Date.now()}`) }
}

export function hasRootSecret(): boolean {
  return typeof window !== 'undefined' && Boolean(localStorage.getItem(ROOT_SECRET_STORAGE_KEY))
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

function expandedFilesystemKeys(segments: FilesystemSegment[]): string[] {
  return segments.slice(0, -1).map((segment) => segment.path)
}

type AppShellControllerDeps = {
  busy: string
  backendDraft: string
  backendInputRef: RefObject<HTMLInputElement | null>
  backendUrl: string
  backendUrlHistory: string[]
  comicConfig: AppShellComicConfig | null
  comicPathDraft: string
  rootSecretDraft: string
  sort: SortMode
  show: ShowToast
  onRootSecretSaved?: () => void
  setBackendDraft: Dispatch<SetStateAction<string>>
  setBackendUrl: Dispatch<SetStateAction<string>>
  setBackendUrlHistory: Dispatch<SetStateAction<string[]>>
  setBusy: Dispatch<SetStateAction<string>>
  setCached: Dispatch<SetStateAction<CachedItem[]>>
  setCacheSummaryHint: Dispatch<SetStateAction<string>>
  setCacheSummaryText: Dispatch<SetStateAction<string>>
  setComicConfig: Dispatch<SetStateAction<AppShellComicConfig | null>>
  setComicPathDraft: Dispatch<SetStateAction<string>>
  setConnection: Dispatch<SetStateAction<ConnectionState>>
  setFilesystemBusy: Dispatch<SetStateAction<boolean>>
  setFilesystemExpandedKeys: Dispatch<SetStateAction<string[]>>
  setFilesystemTree: Dispatch<SetStateAction<FilesystemNode[]>>
  setLibraryPage: Dispatch<SetStateAction<number>>
  setPathBusy: Dispatch<SetStateAction<string>>
  setPathSegments: Dispatch<SetStateAction<FilesystemSegment[]>>
  setRootSecretAuthorized: Dispatch<SetStateAction<boolean>>
  setRootSecretConfigured: Dispatch<SetStateAction<boolean>>
  setRootSecretDraft: Dispatch<SetStateAction<string>>
  setShelf: Dispatch<SetStateAction<ShelfBook[]>>
  setStatusInfo: Dispatch<SetStateAction<AppShellStatusInfo>>
  setStorageBusy: Dispatch<SetStateAction<string>>
}

function isPrivateIpv4Host(value: string): boolean {
  const parts = value.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  return parts[0] === 192 && parts[1] === 168
}

function backendUrlForHost(host: string): string {
  return `http://${host}:${BACKEND_HTTP_PORT}`
}

function sameSubnetBackendCandidates(host: string): string[] {
  if (!isPrivateIpv4Host(host)) return []
  const prefix = host.split('.').slice(0, 3).join('.')
  return Array.from({ length: 254 }, (_, index) => backendUrlForHost(`${prefix}.${index + 1}`))
}

async function getLocalIpFromTauri(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('get_local_ip')
  } catch {
    return ''
  }
}

async function browserBackendCandidates(draft: string, currentUrl: string, history: string[]): Promise<string[]> {
  const candidates = new Set<string>()
  const add = (value: string) => {
    const next = normalizeBackendUrl(value)
    if (next) candidates.add(next)
  }

  add(draft)
  add(currentUrl)
  history.forEach(add)

  const host = typeof window === 'undefined' ? '' : window.location.hostname
  const effectiveHost = isPrivateIpv4Host(host) ? host : await getLocalIpFromTauri()
  if (effectiveHost) {
    add(backendUrlForHost(effectiveHost))
    sameSubnetBackendCandidates(effectiveHost).forEach(add)
  }
  add(backendUrlForHost('127.0.0.1'))
  add(backendUrlForHost('localhost'))

  return Array.from(candidates)
}

async function fetchOkWithTimeout(url: string, path: string): Promise<boolean> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), BACKEND_PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(buildUrl(url, path), { signal: controller.signal })
    return response.ok
  } finally {
    window.clearTimeout(timeout)
  }
}

async function probeBackendCandidate(url: string): Promise<boolean> {
  try {
    if (await fetchOkWithTimeout(url, '/mobile/status')) return true
  } catch {
    // Try the legacy root health endpoint before rejecting this candidate.
  }
  try {
    return await fetchOkWithTimeout(url, '/root/')
  } catch {
    return false
  }
}

async function firstReachableBackend(candidates: string[] | Promise<string[]>): Promise<string> {
  const resolved = await candidates
  for (let index = 0; index < resolved.length; index += BACKEND_PROBE_BATCH_SIZE) {
    const batch = resolved.slice(index, index + BACKEND_PROBE_BATCH_SIZE)
    const results = await Promise.all(batch.map(async (candidate) => ({
      candidate,
      ok: await probeBackendCandidate(candidate),
    })))
    const found = results.find((result) => result.ok)
    if (found) return found.candidate
  }
  return ''
}

async function discoverBackendFromTauri(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const value = await invoke<string>('discover_backend')
    return normalizeBackendUrl(value)
  } catch {
    return ''
  }
}

export function useAppShellController(deps: AppShellControllerDeps) {
  async function refreshCacheSummary() {
    try {
      const summary = await getOfflineCacheSummary()
      const approximate = !summary.exact || summary.source !== 'indexeddb'
      deps.setCacheSummaryText(formatByteSize(summary.bytes, approximate))
      if (summary.source === 'indexeddb') {
        deps.setCacheSummaryHint(`${summary.item_count} 条缓存 · ${summary.page_count} 页`)
        return
      }
      if (summary.source === 'storage_estimate') {
        deps.setCacheSummaryHint(`约 ${summary.item_count} 条缓存 · origin 估算`)
        return
      }
      deps.setCacheSummaryHint(summary.item_count ? `${summary.item_count} 条缓存 · 存储信息不可用` : '存储信息不可用')
    } catch {
      deps.setCacheSummaryText('--')
      deps.setCacheSummaryHint('存储信息不可用')
    }
  }

  async function refreshCache() {
    const rows = await loadCachedItems()
    deps.setCached(rows)
    return rows
  }

  async function cleanupInvalidCache() {
    deps.setStorageBusy('cleanup-invalid-cache')
    try {
      const result = await cleanupInvalidOfflineCache()
      await refreshCache()
      await refreshCacheSummary()
      if (!result.removed_manifest_count && !result.removed_page_blob_count) {
        deps.show('ok', '未发现可清理的无效缓存')
        return
      }
      deps.show(
        'ok',
        `已清理 ${result.removed_manifest_count} 条缓存记录，移除 ${result.removed_page_blob_count} 个页面数据`,
      )
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '缓存清理失败')
    } finally {
      deps.setStorageBusy('')
    }
  }

  async function refreshLibrary(url = deps.backendUrl, nextSort: SortMode = deps.sort, resetPage = true, showLoading = true, sync = false) {
    if (showLoading) deps.setBusy('library')
    try {
      const syncQuery = sync ? '&sync=1' : ''
      const response = await apiGet<LibraryResponse>(url, `/mobile/library?sort=${encodeURIComponent(nextSort)}&compact=1${syncQuery}`)
      const books = response.books?.length !== undefined ? response.books : buildShelf(response.items || [])
      deps.setShelf(books)
      if (resetPage) deps.setLibraryPage(1)
      deps.setStatusInfo((state) => ({ ...state, mobile_contract: true, path_configured: response.path_configured, ero: response.ero }))
      deps.setConnection('online')
    } catch (error) {
      if (isMissingMobileContract(error)) {
        const books = await loadLegacyShelf(url, nextSort)
        deps.setShelf(books)
        if (resetPage) deps.setLibraryPage(1)
        deps.setStatusInfo((state) => ({
          ...state,
          mobile_contract: false,
        }))
        deps.setConnection('online')
        return
      }
      deps.setConnection('backend_unreachable')
      deps.show('error', error instanceof Error ? error.message : '读取书库失败')
      if (sync) throw error
    } finally {
      if (showLoading) deps.setBusy('')
    }
  }

  async function checkBackend(url = deps.backendUrl) {
    try {
      const status = await apiGet<AppShellStatusInfo & { status: string; library_loaded: boolean }>(url, '/mobile/status')
      deps.setStatusInfo({ ...status, mobile_contract: true })
      deps.setConnection('online')
      await refreshLibrary(url, deps.sort)
      await syncPendingProgress(url)
    } catch (error) {
      if (isMissingMobileContract(error)) {
        deps.setStatusInfo({ mobile_contract: false })
        deps.setConnection('online')
        await refreshLibrary(url, deps.sort)
        return
      }
      const rows = await loadCachedItems()
      deps.setCached(rows)
      deps.setConnection(rows.length ? 'offline_cache_only' : 'backend_unreachable')
    }
  }

  async function refreshComicConfig(url = deps.backendUrl, silent = false): Promise<AppShellComicConfig | null> {
    deps.setPathBusy('config')
    try {
      const config = await apiGet<AppShellComicConfig>(url, '/comic/conf')
      const nextConfig = {
        path: config.path || '',
        kemono_path: config.kemono_path || '',
        path_configured: config.path_configured,
      }
      deps.setComicConfig(nextConfig)
      deps.setComicPathDraft(nextConfig.path)
      if (typeof nextConfig.path_configured === 'boolean') {
        deps.setStatusInfo((state) => ({ ...state, path_configured: nextConfig.path_configured }))
      }
      return nextConfig
    } catch (error) {
      if (!silent) deps.show('error', error instanceof Error ? error.message : '配置读取失败')
      return null
    } finally {
      deps.setPathBusy('')
    }
  }

  async function applyBackendUrl(next: string, showSavedToast: boolean) {
    localStorage.setItem(BACKEND_URL_KEY, next)
    deps.setBackendUrlHistory(saveBackendUrlHistory(next, deps.backendUrlHistory))
    deps.setBackendUrl(next)
    deps.setBackendDraft(next)
    if (showSavedToast) deps.show('ok', '服务地址已保存')
    await checkBackend(next)
    await refreshComicConfig(next, true)
    deps.setPathSegments([])
    deps.setFilesystemTree([])
    deps.setFilesystemExpandedKeys([])
  }

  async function saveBackend() {
    const next = normalizeBackendUrl(deps.backendDraft)
    if (!next) {
      deps.show('warn', '服务地址不能为空')
      deps.backendInputRef.current?.focus()
      return
    }
    await applyBackendUrl(next, true)
  }

  async function discoverBackend() {
    if (deps.busy) return
    deps.setBusy('backend-discovery')
    try {
      const tauriCandidate = await discoverBackendFromTauri()
      const discovered = tauriCandidate && await probeBackendCandidate(tauriCandidate)
        ? tauriCandidate
        : await firstReachableBackend(browserBackendCandidates(deps.backendDraft, deps.backendUrl, deps.backendUrlHistory))
      if (!discovered) {
        deps.setConnection('backend_unreachable')
        deps.show('warn', '未发现局域网后端')
        return
      }
      await applyBackendUrl(discovered, false)
    } finally {
      deps.setBusy('')
    }
  }

  function moveBackendCaretToEnd() {
    const input = deps.backendInputRef.current
    if (!input) return
    const end = input.value.length
    window.requestAnimationFrame(() => input.setSelectionRange(end, end))
  }

  function clearBackendDraft() {
    deps.setBackendDraft('')
    window.requestAnimationFrame(() => deps.backendInputRef.current?.focus())
  }

  async function saveRootSecret() {
    const next = deps.rootSecretDraft.trim()
    const stored = localStorage.getItem(ROOT_SECRET_STORAGE_KEY) || ''
    const candidate = next || stored
    if (!candidate) {
      deps.setRootSecretAuthorized(false)
      deps.show('warn', 'rv-backend-secret 不能为空')
      return
    }
    try {
      const secret = await encryptRootSecretPayload(`${candidate}:${Date.now()}`)
      await apiPost<{ success: boolean; skip?: boolean }>(deps.backendUrl, '/root/auth', { secret })
      if (next) {
        localStorage.setItem(ROOT_SECRET_STORAGE_KEY, next)
        deps.setRootSecretDraft('')
      }
      deps.setRootSecretAuthorized(true)
      deps.setRootSecretConfigured(true)
      deps.onRootSecretSaved?.()
    } catch (error) {
      deps.setRootSecretAuthorized(false)
      const message = error instanceof Error ? error.message : 'rv-backend-secret 校验失败'
      if (!next && stored && message.startsWith('401')) {
        localStorage.removeItem(ROOT_SECRET_STORAGE_KEY)
        deps.setRootSecretConfigured(false)
        deps.show('error', '已保存的 rv-backend-secret 已失效，请重新输入')
        return
      }
      deps.setRootSecretConfigured(Boolean(stored))
      deps.show('error', message)
    }
  }

  async function authorizeStoredRootSecret(): Promise<boolean> {
    const stored = localStorage.getItem(ROOT_SECRET_STORAGE_KEY) || ''
    if (!stored) {
      deps.setRootSecretAuthorized(false)
      deps.show('warn', '请先通过 Root Secret 鉴权')
      return false
    }
    try {
      const secret = await encryptRootSecretPayload(`${stored}:${Date.now()}`)
      await apiPost<{ success: boolean; skip?: boolean }>(deps.backendUrl, '/root/auth', { secret })
      deps.setRootSecretAuthorized(true)
      deps.setRootSecretConfigured(true)
      return true
    } catch (error) {
      deps.setRootSecretAuthorized(false)
      const message = error instanceof Error ? error.message : 'rv-backend-secret 校验失败'
      if (message.startsWith('401')) {
        localStorage.removeItem(ROOT_SECRET_STORAGE_KEY)
        deps.setRootSecretConfigured(false)
        deps.show('error', '已保存的 rv-backend-secret 已失效，请重新输入')
        return false
      }
      deps.setRootSecretConfigured(true)
      deps.show('error', message)
      return false
    }
  }

  async function getFilesystem(path?: string, url = deps.backendUrl): Promise<FilesystemResponse> {
    return apiGet<FilesystemResponse>(url, `/comic/filesystem${filesystemQuery(path)}`)
  }

  async function refreshFilesystemSegments(path?: string, url = deps.backendUrl) {
    if (!path) {
      deps.setPathSegments([])
      deps.setFilesystemExpandedKeys([])
      return
    }
    const response = await getFilesystem(path, url)
    const segments = response.path_segments || []
    deps.setPathSegments(segments)
    deps.setFilesystemExpandedKeys(expandedFilesystemKeys(segments))
  }

  async function refreshFilesystem(path?: string, url = deps.backendUrl) {
    deps.setFilesystemBusy(true)
    try {
      const rootResponse = await getFilesystem(path || undefined, url)
      const segments = rootResponse.path_segments || []
      const currentRoot = segments[0]?.path
      const expanded = expandedFilesystemKeys(segments)
      const roots = createFilesystemNodes(rootResponse.roots || [], currentRoot)
      let nextTree = roots

      deps.setPathSegments(segments)

      if (!segments.length) {
        deps.setFilesystemTree(nextTree)
        deps.setFilesystemExpandedKeys(expanded)
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

      deps.setFilesystemTree(nextTree)
      deps.setFilesystemExpandedKeys(expanded)
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '目录读取失败')
    } finally {
      deps.setFilesystemBusy(false)
    }
  }

  const loadFilesystemNode: FilesystemLoadData = async (node) => {
    const path = String(node.value || '')
    if (!path) return
    const response = await getFilesystem(path)
    deps.setFilesystemTree((current) => upsertFilesystemChildren(current, path, createFilesystemChildren(path, response.directories || [])))
  }

  async function handleBooksPathChange(nextPath: string, url = deps.backendUrl) {
    deps.setComicPathDraft(nextPath)
    try {
      await refreshFilesystemSegments(nextPath || undefined, url)
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '目录读取失败')
    }
  }

  async function saveComicPath(path = deps.comicPathDraft) {
    const next = path.trim()
    if (!next) return
    deps.setPathBusy('save-path')
    try {
      await apiPost(deps.backendUrl, '/comic/conf', {
        path: next,
        kemono_path: deps.comicConfig?.kemono_path || undefined,
      })
      await refreshComicConfig(deps.backendUrl, true)
      deps.show('ok', '书库路径已保存')
      await refreshLibrary(deps.backendUrl, deps.sort)
    } catch (error) {
      deps.show('error', error instanceof Error ? error.message : '路径保存失败')
    } finally {
      deps.setPathBusy('')
    }
  }

  function changeFilesystemExpandedKeys(keys: FilesystemExpandedKeys) {
    deps.setFilesystemExpandedKeys(keys.map(String))
  }

  return {
    authorizeStoredRootSecret,
    changeFilesystemExpandedKeys,
    checkBackend,
    cleanupInvalidCache,
    clearBackendDraft,
    discoverBackend,
    handleBooksPathChange,
    loadFilesystemNode,
    moveBackendCaretToEnd,
    refreshCache,
    refreshCacheSummary,
    refreshComicConfig,
    refreshFilesystem,
    refreshLibrary,
    saveBackend,
    saveComicPath,
    saveRootSecret,
  }
}

export function useMobileAppShellControllerModel(appState: AppState, show: ShowToast, options?: { onRootSecretSaved?: () => void }) {
  const {
    busy,
    backendDraft,
    backendInputRef,
    backendUrl,
    backendUrlHistory,
    comicConfig,
    comicPathDraft,
    rootSecretDraft,
    sort,
    setBackendDraft,
    setBackendUrl,
    setBackendUrlHistory,
    setBusy,
    setCached,
    setCacheSummaryHint,
    setCacheSummaryText,
    setComicConfig,
    setComicPathDraft,
    setConnection,
    setFilesystemBusy,
    setFilesystemExpandedKeys,
    setFilesystemTree,
    setLibraryPage,
    setPathBusy,
    setPathSegments,
    setRootSecretAuthorized,
    setRootSecretConfigured,
    setRootSecretDraft,
    setShelf,
    setStatusInfo,
    setStorageBusy,
  } = appState

  return useAppShellController({
    busy,
    backendDraft,
    backendInputRef,
    backendUrl,
    backendUrlHistory,
    comicConfig,
    comicPathDraft,
    rootSecretDraft,
    sort,
    show,
    onRootSecretSaved: options?.onRootSecretSaved,
    setBackendDraft,
    setBackendUrl,
    setBackendUrlHistory,
    setBusy,
    setCached,
    setCacheSummaryHint,
    setCacheSummaryText,
    setComicConfig,
    setComicPathDraft,
    setConnection,
    setFilesystemBusy,
    setFilesystemExpandedKeys,
    setFilesystemTree,
    setLibraryPage,
    setPathBusy,
    setPathSegments,
    setRootSecretAuthorized,
    setRootSecretConfigured,
    setRootSecretDraft,
    setShelf,
    setStatusInfo,
    setStorageBusy,
  })
}
