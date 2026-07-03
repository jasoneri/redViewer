import { buildUrl, type CgsBook, type CgsBookEpisode, type CgsConfig } from '../mobileStore'
import type { CoverOverlayTag } from '../shared/Cover'
import type {
  CgsAttachedBook,
  CgsConfigDraft,
  CgsConnectionState,
  CgsEpisodeSelectionPayload,
  CgsMcpFinalSummary,
  CgsMcpFinalSummaryBlock,
  CgsMcpFinalSummaryRow,
  CgsGateFlight,
  CgsGateFlightTarget,
  CgsMcpDetailBlock,
  CgsMcpErrorClass,
  CgsMcpLlmConfig,
  CgsMcpLlmField,
  CgsMcpPreferenceMode,
  RvAgentPreferenceBookKind,
  CgsMcpPreferencePromptContext,
  CgsMcpPreferenceScope,
  CgsMcpPreferenceSettings,
  CgsMcpPreferenceState,
  CgsMcpPreferenceItem,
  RvAgentRepairState,
  RvAgentOutcome,
  RvAgentOutcomeReason,
  RvAgentOutcomeResult,
  CgsRunBadge,
  CgsMcpSseEvent,
  RvAgentTimelineItem,
  RvAgentToolTone,
  CgsSubmitPosition,
  CgsWorkspaceMode,
} from './acquireTypes'

const CGS_SUBMIT_POSITION_KEY = 'rv_mobile_cgs_submit_position'
export const MULTI_CHECK_FLOAT_POSITION_KEY = 'rv_mobile_multicheck_float_position'
const CGS_SUBMIT_ACTION_WIDTH = 36
const CGS_SUBMIT_DEFAULT_ACTION_COUNT = 3
const CGS_SUBMIT_CONTROL_HEIGHT = 36
const CGS_SUBMIT_CONTROL_SAFE_BOTTOM = 84
const CGS_SUBMIT_CONTROL_EDGE_GAP = 8
const CGS_MCP_LLM_CONFIG_KEY = 'rv_mobile_cgs_mcp_llm'
const CGS_MCP_PROMPT_HISTORY_KEY = 'rv_mobile_cgs_mcp_prompt_history'
const CGS_MCP_PROMPT_HISTORY_LIMIT = 8
const CGS_MCP_PREFERENCE_TAGS_KEY = 'redviewer:cgs-mcp-preference-tags'
const CGS_MCP_AUTO_SUGGEST_THRESHOLD = 2
const CGS_MCP_ACTIVE_PROMPT_CAP = 8
const CGS_MCP_DEFAULT_AUTO_ACTIVATE_THRESHOLD = 5
const CGS_MCP_DEFAULT_LEARN_CAP = 2
const CGS_MCP_DEFAULT_PREFERENCE_BOOK_KIND: RvAgentPreferenceBookKind = 'doujinshi'
const CGS_MCP_PREFERENCE_BOOK_KINDS: RvAgentPreferenceBookKind[] = ['doujinshi', 'manga']

export function createCgsMcpSessionId(): string {
  return globalThis.crypto?.randomUUID?.() || `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function cgsAttachedBookIdentity(book: CgsAttachedBook): string {
  return (book.attach_book_id || book.id || book.book || book.title).trim()
}

export function mergeCgsAttachedBookList(current: CgsAttachedBook[], additions: CgsAttachedBook[]): CgsAttachedBook[] {
  const seen = new Set<string>()
  const result: CgsAttachedBook[] = []
  for (const book of current) {
    const key = cgsAttachedBookIdentity(book)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(book)
  }
  for (const book of additions) {
    const key = cgsAttachedBookIdentity(book)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(book)
  }
  return result
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function cssPxVariable(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const value = Number.parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

function cgsSubmitControlWidth(actionCount = CGS_SUBMIT_DEFAULT_ACTION_COUNT): number {
  return cssPxVariable('--cgs-submit-action-width', CGS_SUBMIT_ACTION_WIDTH) * actionCount
}

function cgsSubmitControlHeight(): number {
  return cssPxVariable('--cgs-submit-control-height', CGS_SUBMIT_CONTROL_HEIGHT)
}

function defaultCgsSubmitPosition(storageKey = CGS_SUBMIT_POSITION_KEY, actionCount = CGS_SUBMIT_DEFAULT_ACTION_COUNT): CgsSubmitPosition {
  if (typeof window === 'undefined') return { x: CGS_SUBMIT_CONTROL_EDGE_GAP, y: CGS_SUBMIT_CONTROL_EDGE_GAP }
  const controlWidth = cgsSubmitControlWidth(actionCount)
  const controlHeight = cgsSubmitControlHeight()
  const y = storageKey === CGS_SUBMIT_POSITION_KEY
    ? (window.innerHeight - controlHeight) / 2
    : window.innerHeight - controlHeight - CGS_SUBMIT_CONTROL_SAFE_BOTTOM
  return clampCgsSubmitPosition({
    x: window.innerWidth - controlWidth - 18,
    y,
  }, actionCount)
}

export function clampCgsSubmitPosition(position: CgsSubmitPosition, actionCount = CGS_SUBMIT_DEFAULT_ACTION_COUNT): CgsSubmitPosition {
  if (typeof window === 'undefined') return position
  const controlWidth = cgsSubmitControlWidth(actionCount)
  const controlHeight = cgsSubmitControlHeight()
  const maxX = Math.max(CGS_SUBMIT_CONTROL_EDGE_GAP, window.innerWidth - controlWidth - CGS_SUBMIT_CONTROL_EDGE_GAP)
  const maxY = Math.max(CGS_SUBMIT_CONTROL_EDGE_GAP, window.innerHeight - controlHeight - CGS_SUBMIT_CONTROL_EDGE_GAP)
  return {
    x: clamp(Math.round(position.x), CGS_SUBMIT_CONTROL_EDGE_GAP, maxX),
    y: clamp(Math.round(position.y), CGS_SUBMIT_CONTROL_EDGE_GAP, maxY),
  }
}

export function loadCgsSubmitPosition(storageKey = CGS_SUBMIT_POSITION_KEY, actionCount = CGS_SUBMIT_DEFAULT_ACTION_COUNT): CgsSubmitPosition {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return defaultCgsSubmitPosition(storageKey, actionCount)
    const parsed = JSON.parse(raw) as Partial<CgsSubmitPosition>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return defaultCgsSubmitPosition(storageKey, actionCount)
    if (typeof window !== 'undefined' && parsed.y > window.innerHeight * 0.7) return defaultCgsSubmitPosition(storageKey, actionCount)
    return clampCgsSubmitPosition({ x: parsed.x, y: parsed.y }, actionCount)
  } catch {
    return defaultCgsSubmitPosition(storageKey, actionCount)
  }
}

export function saveCgsSubmitPosition(position: CgsSubmitPosition, storageKey = CGS_SUBMIT_POSITION_KEY, actionCount = CGS_SUBMIT_DEFAULT_ACTION_COUNT): CgsSubmitPosition {
  const next = clampCgsSubmitPosition(position, actionCount)
  localStorage.setItem(storageKey, JSON.stringify(next))
  return next
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function getCgsStatusKey(status: Record<string, unknown> | null): string {
  const job = status?.job
  if (job && typeof job === 'object') {
    const jobStatus = (job as { status?: unknown }).status
    if (typeof jobStatus === 'string') return jobStatus
  }
  const value = status?.status
  return typeof value === 'string' ? value : status ? 'submitted' : '未提交'
}

export function getCgsStatusPercent(status: Record<string, unknown> | null): number | null {
  const job = status?.job
  const progress = job && typeof job === 'object' ? (job as { progress?: unknown }).progress : status?.progress
  if (!progress || typeof progress !== 'object') return null
  const percent = (progress as { percent?: unknown }).percent
  return typeof percent === 'number' ? percent : null
}

export function buildCgsGateFlight(
  from: DOMRect,
  to: DOMRect,
  mode: CgsWorkspaceMode,
  nextConnection: CgsConnectionState,
  target: CgsGateFlightTarget,
): CgsGateFlight {
  return {
    left: from.left,
    top: from.top,
    width: from.width,
    height: from.height,
    dx: to.left - from.left,
    dy: to.top - from.top,
    scaleX: to.width / Math.max(from.width, 1),
    scaleY: to.height / Math.max(from.height, 1),
    connection: nextConnection,
    mode,
    target,
  }
}

export function cgsTextValue(value: unknown): string {
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

export function cgsBookTitle(book: CgsBook): string {
  return cgsTextValue(book.title) || cgsTextValue(book.name) || cgsTextValue(book.book_key) || '未命名'
}

export function cgsBookSelectMode(book: CgsBook): 'book' | 'chapters' {
  return book.select_mode === 'chapters' ? 'chapters' : 'book'
}

export function cgsCoverUrl(backendUrl: string, book: CgsBook): string {
  const coverPath = cgsTextValue(book.cover_static_url)
  if (!coverPath.startsWith('/cover/')) return ''
  return buildUrl(backendUrl, `/root/cgs/cover?url=${encodeURIComponent(coverPath)}`)
}

export function cgsTags(book: CgsBook): string[] {
  return Array.isArray(book.tags)
    ? book.tags.map((tag) => cgsTextValue(tag)).filter(Boolean).slice(0, 8)
    : []
}

function cgsBookType(book: CgsBook): string {
  return cgsTextValue(book.btype) || cgsTextValue(book.category) || cgsTextValue(book.type)
}

function cgsMetaItems(book: CgsBook): Array<{ label: string; value: string }> {
  return [
    { label: '作者', value: cgsTextValue(book.artist) },
    { label: '页数', value: cgsTextValue(book.pages) || cgsTextValue(book.page_count) },
    { label: '日期', value: cgsTextValue(book.public_date) || cgsTextValue(book.date) },
  ].filter((item) => item.value)
}

export function cgsCoverOverlayTags(book: CgsBook): CoverOverlayTag[] {
  const bookType = cgsBookType(book)
  const typeTag: CoverOverlayTag[] = bookType
    ? [{ key: 'type', text: bookType, title: `类型 ${bookType}`, anchor: 'top-right', tone: 'light' }]
    : []
  const bottomTags = cgsMetaItems(book).map((item): CoverOverlayTag => ({
    key: item.label,
    text: `${item.label} ${item.value}`,
    title: `${item.label} ${item.value}`,
    anchor: 'bottom-left',
    tone: item.label === '作者' ? 'artist' : item.label === '页数' ? 'pages' : 'light',
  }))
  return [...typeTag, ...bottomTags]
}

export function cgsSubmitErrorMessage(error: unknown, rootSecretConfigured: boolean): string {
  const message = error instanceof Error ? error.message : ''
  if ((message.includes('401') || message.includes('403')) && !rootSecretConfigured) {
    return 'Root Secret 未配置，请先在连接设置保存 root secret 后重试'
  }
  return message || '提交失败'
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const key = cgsTextValue(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(key)
  }
  return result
}

export function cgsEpisodeIndex(value: string | number | null): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0
  if (typeof value !== 'string') return 0
  const text = value.trim()
  return /^-?\d+$/.test(text) ? Number(text) : 0
}

function cgsEpisodeSelectionLimit(count: number): number {
  return Math.max(1, Number.isFinite(count) ? Math.trunc(count) : 1)
}

export function cgsFirstEpisodeKeys(episodes: CgsBookEpisode[], count: number): string[] {
  return episodes.slice(0, cgsEpisodeSelectionLimit(count)).map((episode) => episode.episode_key)
}

export function cgsLatestEpisodeKeys(episodes: CgsBookEpisode[], count: number): string[] {
  return [...episodes]
    .sort((left, right) => cgsEpisodeIndex(right.idx) - cgsEpisodeIndex(left.idx))
    .slice(0, cgsEpisodeSelectionLimit(count))
    .map((episode) => episode.episode_key)
}

export function cgsSelectedEpisodeCount(selectedEpisodeKeysByBook: Record<string, string[]>): number {
  return Object.values(selectedEpisodeKeysByBook).reduce((total, keys) => total + uniqueStrings(keys).length, 0)
}

export function cgsSubmitSelectionCount(bookKeys: string[], selectedEpisodeKeysByBook: Record<string, string[]>): number {
  return uniqueStrings(bookKeys).length + cgsSelectedEpisodeCount(selectedEpisodeKeysByBook)
}

export function cgsEpisodeSelectionsPayload(
  selectedEpisodeKeysByBook: Record<string, string[]>,
): CgsEpisodeSelectionPayload[] {
  return Object.entries(selectedEpisodeKeysByBook)
    .map(([bookKey, episodeKeys]) => ({
      book_key: bookKey,
      episode_keys: uniqueStrings(episodeKeys),
    }))
    .filter((selection) => selection.book_key && selection.episode_keys.length > 0)
}

export function cgsSetBookEpisodeKeys(
  selectedEpisodeKeysByBook: Record<string, string[]>,
  bookKey: string,
  episodeKeys: string[],
): Record<string, string[]> {
  const key = cgsTextValue(bookKey)
  if (!key) return selectedEpisodeKeysByBook
  const nextKeys = uniqueStrings(episodeKeys)
  if (!nextKeys.length) {
    const { [key]: _removed, ...rest } = selectedEpisodeKeysByBook
    return rest
  }
  return { ...selectedEpisodeKeysByBook, [key]: nextKeys }
}

export function cgsToggleEpisodeKey(
  selectedEpisodeKeysByBook: Record<string, string[]>,
  bookKey: string,
  episodeKey: string,
  checked: boolean,
): Record<string, string[]> {
  const current = selectedEpisodeKeysByBook[bookKey] || []
  const next = checked ? [...current, episodeKey] : current.filter((key) => key !== episodeKey)
  return cgsSetBookEpisodeKeys(selectedEpisodeKeysByBook, bookKey, next)
}

export function cgsWorkResetJobRunning(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return message.includes('409') || message.includes('job_running')
}

export function cgsWorkResetErrorMessage(error: unknown, fallback: string): string {
  if (cgsWorkResetJobRunning(error)) return 'CGS 任务仍在运行，无法重置工作状态'
  return error instanceof Error && error.message ? error.message : fallback
}

export function normalizeCgsConfig(value: CgsConfig): CgsConfig {
  const downloadedHandle = cgsTextValue(value.downloaded_handle) || '-'
  return {
    downloaded_handle: downloadedHandle,
    downloaded_handle_options: Array.isArray(value.downloaded_handle_options)
      ? value.downloaded_handle_options.map((item) => cgsTextValue(item)).filter(Boolean)
      : ['-', '.cbz'],
    proxies: Array.isArray(value.proxies) ? value.proxies.map((item) => cgsTextValue(item)).filter(Boolean) : [],
    sv_path: cgsTextValue(value.sv_path),
  }
}

export function cgsDraftFromConfig(value: CgsConfig): CgsConfigDraft {
  return {
    downloaded_handle: value.downloaded_handle || '-',
    proxies_text: cgsProxyText(value.proxies || []),
    sv_path: value.sv_path || '',
  }
}

function cgsProxyText(value: string[]): string {
  return value.join(',')
}

export function cgsProxiesFromText(value: string): string[] {
  return value.replaceAll(' ', '').split(',').map((item) => item.trim()).filter(Boolean)
}

export function cgsRootActionErrorMessage(error: unknown, fallback: string, rootSecretConfigured: boolean): string {
  const message = error instanceof Error ? error.message : ''
  if ((message.includes('401') || message.includes('403')) && !rootSecretConfigured) {
    return 'Root Secret 未配置，请先在连接设置保存 root secret 后重试'
  }
  return message || fallback
}

export function loadCgsMcpLlmConfig(): CgsMcpLlmConfig {
  try {
    const raw = localStorage.getItem(CGS_MCP_LLM_CONFIG_KEY)
    if (!raw) return { base_url: '', api_key: '', model: '' }
    const parsed = JSON.parse(raw) as Partial<CgsMcpLlmConfig>
    return {
      base_url: cgsTextValue(parsed.base_url),
      api_key: cgsTextValue(parsed.api_key),
      model: cgsTextValue(parsed.model),
    }
  } catch {
    return { base_url: '', api_key: '', model: '' }
  }
}

export function saveCgsMcpLlmConfig(value: CgsMcpLlmConfig): CgsMcpLlmConfig {
  const next = {
    base_url: value.base_url.trim(),
    api_key: value.api_key.trim(),
    model: value.model.trim(),
  }
  localStorage.setItem(CGS_MCP_LLM_CONFIG_KEY, JSON.stringify(next))
  return next
}

export function cgsMcpConfigured(value: CgsMcpLlmConfig): boolean {
  return Boolean(value.base_url.trim() && value.api_key.trim() && value.model.trim())
}

function cgsMcpPreferenceSetting(value: unknown, fallback: number, min = 1): number {
  return clamp(Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback, min, 9)
}

function cgsMcpPreferenceSettings(value?: Partial<CgsMcpPreferenceSettings>): CgsMcpPreferenceSettings {
  return {
    auto_activate_threshold: cgsMcpPreferenceSetting(value?.auto_activate_threshold, CGS_MCP_DEFAULT_AUTO_ACTIVATE_THRESHOLD, 0),
    per_conversation_learn_cap: cgsMcpPreferenceSetting(value?.per_conversation_learn_cap, CGS_MCP_DEFAULT_LEARN_CAP),
    preview_switch: value?.preview_switch === true,
  }
}

function defaultCgsMcpPreferenceState(): CgsMcpPreferenceState {
  return {
    schema_version: 1,
    preferences: [],
    settings: cgsMcpPreferenceSettings(),
  }
}

function cgsMcpPreferenceItemText(value: unknown): string {
  return cgsTextValue(value).slice(0, 48)
}

function cgsMcpPreferenceMode(value: unknown): CgsMcpPreferenceMode {
  return value === 'match' || value === 'exclude' || value === 'neutral' ? value : 'neutral'
}

function cgsMcpNextPreferenceMode(value: CgsMcpPreferenceMode): CgsMcpPreferenceMode {
  if (value === 'neutral') return 'match'
  if (value === 'match') return 'exclude'
  return 'neutral'
}

function cgsMcpPreferenceScope(value?: Partial<CgsMcpPreferenceScope>): CgsMcpPreferenceScope {
  const bookKind = value?.book_kind === 'doujinshi' || value?.book_kind === 'manga' || value?.book_kind === 'unknown' ? value.book_kind : undefined
  return {
    panel: 'cgs-mcp',
    ...(bookKind ? { book_kind: bookKind } : {}),
    ...(typeof value?.site === 'string' ? { site: cgsTextValue(value.site) || null } : {}),
    ...(typeof value?.language === 'string' ? { language: cgsTextValue(value.language) || null } : {}),
  }
}

function cgsMcpScopeKey(scope: CgsMcpPreferenceScope): string {
  return [scope.panel, scope.book_kind || '', scope.site || '', scope.language || ''].join('|')
}

function cgsMcpPreferenceKey(text: string, scope: CgsMcpPreferenceScope): string {
  return `${text.toLowerCase()}|${cgsMcpScopeKey(scope)}`
}

function normalizeCgsMcpPreferenceItem(value: unknown): CgsMcpPreferenceItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Partial<CgsMcpPreferenceItem> & { active?: unknown; tag?: unknown; condition?: unknown }
  const text = cgsMcpPreferenceItemText(row.text || row.condition || row.tag)
  if (!text) return null
  const source = row.source === 'learned' ? 'learned' : 'manual'
  const hitCount = Math.max(0, Number.isFinite(Number(row.hit_count)) ? Math.trunc(Number(row.hit_count)) : source === 'manual' ? 1 : 0)
  const scope = cgsMcpPreferenceScope(row.scope)
  if (!scope.book_kind) return null
  const now = new Date().toISOString()
  const mode = row.mode ? cgsMcpPreferenceMode(row.mode) : row.active ? 'match' : 'neutral'
  return {
    text,
    mode,
    source,
    hit_count: hitCount,
    scope,
    created_at: cgsTextValue(row.created_at) || now,
    updated_at: cgsTextValue(row.updated_at) || now,
    last_used_at: row.last_used_at ? cgsTextValue(row.last_used_at) : null,
  }
}

function normalizeCgsMcpPreferenceState(value: unknown): CgsMcpPreferenceState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultCgsMcpPreferenceState()
  const row = value as Partial<CgsMcpPreferenceState> & { tags?: unknown }
  const settings = cgsMcpPreferenceSettings(row.settings)
  const preferencesRaw = Array.isArray(row.preferences) ? row.preferences : Array.isArray(row.tags) ? row.tags : []
  const seen = new Set<string>()
  const preferences: CgsMcpPreferenceItem[] = []
  for (const item of preferencesRaw) {
    const preference = normalizeCgsMcpPreferenceItem(item)
    if (!preference) continue
    const key = cgsMcpPreferenceKey(preference.text, preference.scope)
    if (seen.has(key)) continue
    seen.add(key)
    preferences.push(preference)
  }
  return { schema_version: 1, preferences, settings }
}

export function loadCgsMcpPreferenceState(): CgsMcpPreferenceState {
  try {
    const raw = localStorage.getItem(CGS_MCP_PREFERENCE_TAGS_KEY)
    return normalizeCgsMcpPreferenceState(raw ? JSON.parse(raw) : null)
  } catch {
    return defaultCgsMcpPreferenceState()
  }
}

export function saveCgsMcpPreferenceState(value: CgsMcpPreferenceState): CgsMcpPreferenceState {
  const next = normalizeCgsMcpPreferenceState(value)
  localStorage.setItem(CGS_MCP_PREFERENCE_TAGS_KEY, JSON.stringify(next))
  return next
}

function cgsMcpPreferenceScopeMatches(item: CgsMcpPreferenceItem, scopeValue?: Partial<CgsMcpPreferenceScope>): boolean {
  const scope = cgsMcpPreferenceScope(scopeValue)
  if (scope.book_kind && item.scope.book_kind !== scope.book_kind) return false
  if (typeof scope.site !== 'undefined' && item.scope.site !== scope.site) return false
  if (typeof scope.language !== 'undefined' && item.scope.language !== scope.language) return false
  return true
}

export function cgsMcpVisiblePreferenceItems(state: CgsMcpPreferenceState, scopeValue?: Partial<CgsMcpPreferenceScope>): CgsMcpPreferenceItem[] {
  return normalizeCgsMcpPreferenceState(state).preferences
    .filter((item) => item.source === 'manual' || item.hit_count >= CGS_MCP_AUTO_SUGGEST_THRESHOLD)
    .filter((item) => cgsMcpPreferenceScopeMatches(item, scopeValue))
}

export function cgsMcpAddManualPreferenceItem(state: CgsMcpPreferenceState, value: string, scopeValue?: Partial<CgsMcpPreferenceScope>): CgsMcpPreferenceState {
  const text = cgsMcpPreferenceItemText(value)
  if (!text) return state
  const next = normalizeCgsMcpPreferenceState(state)
  const scope = cgsMcpPreferenceScope(scopeValue)
  if (!scope.book_kind) return next
  const now = new Date().toISOString()
  const key = cgsMcpPreferenceKey(text, scope)
  const existingIndex = next.preferences.findIndex((item) => cgsMcpPreferenceKey(item.text, item.scope) === key)
  if (existingIndex >= 0) {
    next.preferences[existingIndex] = { ...next.preferences[existingIndex], mode: 'match', source: 'manual', hit_count: Math.max(1, next.preferences[existingIndex].hit_count), updated_at: now }
  } else {
    next.preferences.push({ text, mode: 'match', source: 'manual', hit_count: 1, scope, created_at: now, updated_at: now, last_used_at: null })
  }
  return saveCgsMcpPreferenceState(next)
}

export function cgsMcpTogglePreferenceItem(state: CgsMcpPreferenceState, value: string, scopeValue?: Partial<CgsMcpPreferenceScope>): CgsMcpPreferenceState {
  const text = cgsMcpPreferenceItemText(value)
  if (!text) return state
  const next = normalizeCgsMcpPreferenceState(state)
  const scope = cgsMcpPreferenceScope(scopeValue)
  const index = next.preferences.findIndex((item) => (
    item.text === text
    && (!scope.book_kind || cgsMcpPreferenceKey(item.text, item.scope) === cgsMcpPreferenceKey(text, scope))
  ))
  if (index < 0) return next
  next.preferences[index] = { ...next.preferences[index], mode: cgsMcpNextPreferenceMode(next.preferences[index].mode), updated_at: new Date().toISOString() }
  return saveCgsMcpPreferenceState(next)
}

export function cgsMcpDeletePreferenceItem(state: CgsMcpPreferenceState, value: string, scopeValue?: Partial<CgsMcpPreferenceScope>): CgsMcpPreferenceState {
  const text = cgsMcpPreferenceItemText(value)
  if (!text) return state
  const next = normalizeCgsMcpPreferenceState(state)
  const scope = cgsMcpPreferenceScope(scopeValue)
  next.preferences = next.preferences.filter((item) => (
    item.text !== text
    || (scope.book_kind && cgsMcpPreferenceKey(item.text, item.scope) !== cgsMcpPreferenceKey(text, scope))
  ))
  return saveCgsMcpPreferenceState(next)
}

export function cgsMcpSetPreferenceSetting(
  state: CgsMcpPreferenceState,
  key: keyof CgsMcpPreferenceSettings,
  value: CgsMcpPreferenceSettings[keyof CgsMcpPreferenceSettings],
): CgsMcpPreferenceState {
  const next = normalizeCgsMcpPreferenceState(state)
  next.settings = {
    ...next.settings,
    [key]: key === 'preview_switch' ? value === true : cgsMcpPreferenceSetting(value, Number(next.settings[key]), key === 'auto_activate_threshold' ? 0 : 1),
  }
  return saveCgsMcpPreferenceState(next)
}

function cgsMcpPreferenceMatchesBookKinds(item: CgsMcpPreferenceItem, bookKinds?: RvAgentPreferenceBookKind[]): boolean {
  const effectiveBookKinds = bookKinds?.length ? bookKinds : [CGS_MCP_DEFAULT_PREFERENCE_BOOK_KIND]
  const itemKind = item.scope.book_kind
  return itemKind === 'doujinshi' || itemKind === 'manga' ? effectiveBookKinds.includes(itemKind) : false
}

export function cgsMcpPreferencePromptContext(state: CgsMcpPreferenceState, bookKinds?: RvAgentPreferenceBookKind[]): CgsMcpPreferencePromptContext | undefined {
  const next = normalizeCgsMcpPreferenceState(state)
  const promptPreferences = cgsMcpVisiblePreferenceItems(next)
    .filter((item) => cgsMcpPreferenceMatchesBookKinds(item, bookKinds))
    .filter((item) => item.mode !== 'neutral')
    .sort((left, right) => right.hit_count - left.hit_count || cgsTextValue(right.last_used_at).localeCompare(cgsTextValue(left.last_used_at)))
    .slice(0, CGS_MCP_ACTIVE_PROMPT_CAP)
  const matchPreferences = promptPreferences
    .filter((item) => item.mode === 'match')
    .map((item) => ({ text: item.text, source: item.source, hit_count: item.hit_count, scope: item.scope }))
  const excludePreferences = promptPreferences
    .filter((item) => item.mode === 'exclude')
    .map((item) => ({ text: item.text, source: item.source, hit_count: item.hit_count, scope: item.scope }))
  if (!matchPreferences.length && !excludePreferences.length) return undefined
  return { schema_version: 1, match_preferences: matchPreferences, exclude_preferences: excludePreferences, settings: next.settings }
}

function cgsMcpPreferenceBookKindValue(value: unknown): RvAgentPreferenceBookKind | 'unknown' {
  const text = cgsTextValue(value).toLowerCase()
  if (text === 'doujinshi' || text === 'doujin' || text === '同人' || text === '同人志') return 'doujinshi'
  if (text === 'manga' || text === 'comic' || text === '漫画') return 'manga'
  return 'unknown'
}

export function cgsMcpSearchBookPreferenceKind(info?: CgsAttachedBook['searchInfo']): RvAgentPreferenceBookKind | 'unknown' {
  const explicitKind = cgsMcpPreferenceBookKindValue(info?.book_kind)
  if (explicitKind !== 'unknown') return explicitKind
  if (info?.local_library_kind === 'series') return 'manga'
  if (info?.select_mode === 'chapters') return 'manga'
  const fields = [
    info?.btype,
    info?.category,
    info?.type,
    info?.source,
    ...(info?.tags || []),
  ].map(cgsTextValue).join(' ').toLowerCase()
  if (fields.includes('doujin') || fields.includes('同人')) return 'doujinshi'
  if (fields.includes('manga') || fields.includes('漫画') || fields.includes('episode') || fields.includes('章节')) return 'manga'
  return 'unknown'
}

export function cgsMcpAttachedBookPreferenceKind(book: CgsAttachedBook): RvAgentPreferenceBookKind | 'unknown' {
  const explicitKind = cgsMcpPreferenceBookKindValue(book.book_kind)
  return explicitKind !== 'unknown' ? explicitKind : cgsMcpSearchBookPreferenceKind(book.searchInfo)
}

export function cgsMcpEffectivePreferenceBookKinds(attachedBookList: CgsAttachedBook[]): RvAgentPreferenceBookKind[] {
  const kinds = new Set<RvAgentPreferenceBookKind>()
  for (const book of attachedBookList) {
    const kind = cgsMcpAttachedBookPreferenceKind(book)
    kinds.add(CGS_MCP_PREFERENCE_BOOK_KINDS.includes(kind as RvAgentPreferenceBookKind) ? kind as RvAgentPreferenceBookKind : CGS_MCP_DEFAULT_PREFERENCE_BOOK_KIND)
  }
  return kinds.size ? [...kinds] : [CGS_MCP_DEFAULT_PREFERENCE_BOOK_KIND]
}

export function cgsMcpDoujinshiPreviewEnabled(state: CgsMcpPreferenceState, bookKinds?: RvAgentPreferenceBookKind[]): boolean {
  if (!normalizeCgsMcpPreferenceState(state).settings.preview_switch) return false
  return !bookKinds || (bookKinds.length === 1 && bookKinds[0] === 'doujinshi')
}

export function cgsMcpLearnPreferenceItems(
  state: CgsMcpPreferenceState,
  values: string[],
  scopeValue?: Partial<CgsMcpPreferenceScope>,
  maxCount?: number,
): CgsMcpPreferenceState {
  const next = normalizeCgsMcpPreferenceState(state)
  if (next.settings.auto_activate_threshold === 0) return next
  const scope = cgsMcpPreferenceScope(scopeValue)
  const texts = uniqueStrings(values).slice(0, Math.max(0, maxCount ?? next.settings.per_conversation_learn_cap))
  if (!texts.length) return next
  const now = new Date().toISOString()
  for (const text of texts) {
    const key = cgsMcpPreferenceKey(text, scope)
    const index = next.preferences.findIndex((item) => cgsMcpPreferenceKey(item.text, item.scope) === key)
    if (index >= 0) {
      const current = next.preferences[index]
      const hitCount = current.hit_count + 1
      next.preferences[index] = {
        ...current,
        hit_count: hitCount,
        mode: current.mode === 'neutral' && current.source === 'learned' && hitCount >= next.settings.auto_activate_threshold ? 'match' : current.mode,
        updated_at: now,
        last_used_at: now,
      }
    } else {
      next.preferences.push({
        text,
        mode: 'neutral',
        source: 'learned',
        hit_count: 1,
        scope,
        created_at: now,
        updated_at: now,
        last_used_at: now,
      })
    }
  }
  return saveCgsMcpPreferenceState(next)
}

function normalizeCgsMcpPromptHistory(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const prompt = (value || '').trim()
    if (!prompt || seen.has(prompt)) continue
    seen.add(prompt)
    result.push(prompt)
    if (result.length >= CGS_MCP_PROMPT_HISTORY_LIMIT) break
  }
  return result
}

export function loadCgsMcpPromptHistory(): string[] {
  try {
    const raw = localStorage.getItem(CGS_MCP_PROMPT_HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return normalizeCgsMcpPromptHistory(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [])
  } catch {
    return []
  }
}

export function saveCgsMcpPromptHistory(prompt: string, currentHistory: string[]): string[] {
  const nextHistory = normalizeCgsMcpPromptHistory([prompt, ...currentHistory])
  localStorage.setItem(CGS_MCP_PROMPT_HISTORY_KEY, JSON.stringify(nextHistory))
  return nextHistory
}

export function removeCgsMcpPromptHistory(prompt: string, currentHistory: string[]): string[] {
  const nextHistory = normalizeCgsMcpPromptHistory(currentHistory.filter((item) => item !== prompt))
  localStorage.setItem(CGS_MCP_PROMPT_HISTORY_KEY, JSON.stringify(nextHistory))
  return nextHistory
}

export function cgsMcpFailureStatus(value: string): boolean {
  const status = value.trim().toLowerCase()
  return ['error', 'failed', 'failure', 'fail', 'exception', 'unreachable', 'unavailable'].some((token) => status.includes(token)) || status.includes('失败') || status.includes('错误') || status.includes('不可用')
}

function cgsMcpWarnStatus(value: string): boolean {
  const status = value.trim().toLowerCase()
  return ['warn', 'warning', 'partial', 'skipped'].some((token) => status.includes(token)) || status.includes('警告')
}

function cgsMcpRecordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function cgsMcpUnavailableFlag(result: Record<string, unknown>): boolean {
  return result.available === false || result.configured === false
}

function cgsMcpFailureSignal(result: Record<string, unknown>): boolean {
  const status = cgsTextValue(result.status)
  const error = cgsTextValue(result.error)
  const exception = cgsTextValue(result.exception)
  const message = cgsTextValue(result.message)
  return result.success === false || result.ok === false || Boolean(error || exception) || cgsMcpFailureStatus(status) || cgsMcpFailureStatus(message)
}

function cgsMcpWarnSignal(result: Record<string, unknown>): boolean {
  const status = cgsTextValue(result.status)
  const message = cgsTextValue(result.warning) || cgsTextValue(result.warn) || cgsTextValue(result.message)
  return cgsMcpWarnStatus(status) || cgsMcpWarnStatus(message)
}

export function cgsMcpToolTone(result: Record<string, unknown>): RvAgentToolTone {
  const job = cgsMcpRecordValue(result.job)
  const previousJob = cgsMcpRecordValue(result.previous_job ?? result.previousJob)
  const toolBoundaries = [result, job, previousJob]
  if (toolBoundaries.some(cgsMcpUnavailableFlag) || toolBoundaries.some(cgsMcpFailureSignal) || toolBoundaries.some(cgsMcpWarnSignal)) return 'warn'
  return 'ok'
}

function cgsMcpNestedToolSummary(result: Record<string, unknown>): string {
  const job = cgsMcpRecordValue(result.job)
  const previousJob = cgsMcpRecordValue(result.previous_job ?? result.previousJob)
  const nested = [job, previousJob]
  for (const item of nested) {
    const message = cgsTextValue(item.error) || cgsTextValue(item.exception) || cgsTextValue(item.message)
    if (message) return message
    const status = cgsTextValue(item.status)
    if (cgsMcpFailureStatus(status) || cgsMcpWarnStatus(status)) return `CGS MCP 状态：${status}`
  }
  return ''
}

export function cgsMcpWorseTone(left: RvAgentToolTone | undefined, right: RvAgentToolTone): RvAgentToolTone {
  if (left === 'error' || right === 'error') return 'error'
  if (left === 'warn' || right === 'warn') return 'warn'
  return 'ok'
}

export function cgsMcpToolSummary(result: Record<string, unknown>): string {
  const summary = cgsTextValue(result.text) || cgsTextValue(result.summary) || cgsTextValue(result.message) || cgsTextValue(result.error) || cgsMcpNestedToolSummary(result) || cgsTextValue(result.status)
  if (summary) return summary
  if (Object.keys(result).length) {
    try {
      return JSON.stringify(result)
    } catch {
      return '查看结果详情'
    }
  }
  return 'ok'
}

function cgsMcpParseJsonText(value: string): unknown | null {
  const text = value.trim()
  if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function cgsMcpCodeBlock(value: unknown, language = ''): CgsMcpDetailBlock {
  if (language === 'json') {
    try {
      return { kind: 'code', language, text: JSON.stringify(value, null, 2) }
    } catch {
      return { kind: 'code', language, text: String(value) }
    }
  }
  return { kind: 'code', language, text: String(value) }
}

function cgsMcpDetailBlockForValue(value: unknown): CgsMcpDetailBlock | null {
  const text = cgsTextValue(value)
  if (text) {
    const parsedJson = cgsMcpParseJsonText(text)
    return parsedJson === null ? { kind: 'text', text } : cgsMcpCodeBlock(parsedJson, 'json')
  }
  if (Array.isArray(value) || (value && typeof value === 'object')) return cgsMcpCodeBlock(value, 'json')
  if (typeof value === 'boolean' || value === null || value === undefined) return cgsMcpCodeBlock(value)
  return null
}

export function cgsMcpToolDetailBlocks(item: Extract<RvAgentTimelineItem, { type: 'tool' }>): CgsMcpDetailBlock[] {
  const primaryValue = item.result.text ?? item.result.summary ?? item.result.message ?? item.result.error ?? item.result
  const primaryBlock = cgsMcpDetailBlockForValue(primaryValue)
  return primaryBlock ? [primaryBlock] : [{ kind: 'text', text: 'ok' }]
}

export function nextTimelineId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function appendCgsMcpFinalFailure(items: RvAgentTimelineItem[], summary: string): RvAgentTimelineItem[] {
  void summary
  return items
}

const CGS_MCP_ERROR_CLASSES: CgsMcpErrorClass[] = [
  'llm_config_missing',
  'llm_provider_rejected',
  'llm_model_access_denied',
  'llm_protocol_invalid',
  'mcp_transport_unavailable',
  'attach_book_invalid',
  'cgs_runtime_failed',
  'user_aborted',
]

const CGS_MCP_REPAIR_COPY: Record<CgsMcpErrorClass, { title: string; message: string; fields: CgsMcpLlmField[]; canRetry: boolean }> = {
  llm_config_missing: { title: 'LLM 配置不完整', message: '请在左侧抽屉的 RV Agent 配置中填写 LLM baseurl、API Key、Model 并保存', fields: ['base_url', 'api_key', 'model'], canRetry: true },
  llm_provider_rejected: { title: 'LLM 提供方拒绝', message: 'CGS MCP 已连通，但上游提供方拒绝了请求，请检查 API Key 或提供方设置', fields: ['api_key'], canRetry: true },
  llm_model_access_denied: { title: '模型不可用', message: 'CGS MCP 已连通，但当前模型被拒绝或无访问权限，请更换 Model 后重试', fields: ['model'], canRetry: true },
  llm_protocol_invalid: { title: 'LLM 接口不兼容', message: 'baseurl 不可达或不是 openai-chat 接口，请检查 baseurl（可尝试加 /v1）', fields: ['base_url'], canRetry: true },
  mcp_transport_unavailable: { title: 'MCP 服务不可用', message: 'rv 无法连接 CGS MCP，请重新检测 CGS Server 连接后重试', fields: [], canRetry: true },
  attach_book_invalid: { title: '附加书籍已失效', message: '后台附加书籍记录已失效，请重新附加当前书后重试', fields: [], canRetry: true },
  cgs_runtime_failed: { title: 'CGS 运行失败', message: '下载或工具执行失败，请查看进度详情或 CGS 状态', fields: [], canRetry: false },
  user_aborted: { title: '已停止', message: '本次对话已停止', fields: [], canRetry: false },
}

export function cgsMcpErrorClassFromData(data: Record<string, unknown>): CgsMcpErrorClass {
  const value = cgsMcpDataText(data, 'class')
  return (CGS_MCP_ERROR_CLASSES as string[]).includes(value) ? value as CgsMcpErrorClass : 'cgs_runtime_failed'
}

export function rvAgentRepairFromClass(errorClass: CgsMcpErrorClass, rawMessage: string, fields?: CgsMcpLlmField[]): RvAgentRepairState {
  const copy = CGS_MCP_REPAIR_COPY[errorClass]
  return {
    errorClass,
    title: copy.title,
    message: copy.message,
    fields: fields && fields.length ? fields : copy.fields,
    raw: rawMessage,
    canRetry: copy.canRetry,
  }
}

export function rvAgentRepairFromErrorEvent(data: Record<string, unknown>): RvAgentRepairState {
  const errorClass = cgsMcpErrorClassFromData(data)
  const raw = cgsMcpDataText(data, 'message')
  const fieldsRaw = Array.isArray(data.fields) ? data.fields : []
  const fields = fieldsRaw.filter((field): field is CgsMcpLlmField => field === 'base_url' || field === 'api_key' || field === 'model')
  return rvAgentRepairFromClass(errorClass, raw, fields)
}

function parseSseChunk(buffer: string): { events: CgsMcpSseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() || ''
  const events: CgsMcpSseEvent[] = []
  for (const part of parts) {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (!dataLines.length) continue
    const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>
    events.push({ event, data })
  }
  return { events, rest }
}

export function cgsMcpDataText(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  return typeof value === 'string' ? value : ''
}

export function cgsMcpDataObject(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = data[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const RV_AGENT_OUTCOME_RESULTS = new Set<RvAgentOutcomeResult>([
  'changed',
  'satisfied',
  'waiting_user',
  'blocked',
  'skipped',
  'cancelled',
  'failed',
])
const RV_AGENT_OUTCOME_REASONS = new Set<RvAgentOutcomeReason>([
  'downloaded',
  'already_downloaded',
  'already_latest',
  'not_published',
  'remote_missing',
  'ambiguous_selection',
  'preference_skipped',
  'preview_only',
  'user_cancelled',
  'external_unavailable',
  'runtime_error',
])
const RV_AGENT_OUTCOME_EVIDENCE_KINDS = new Set<RvAgentOutcome['evidence'][number]['kind']>([
  'local_library',
  'remote_catalog',
  'monitor',
  'tool_result',
  'user_choice',
  'policy',
])

export function rvAgentOutcomeFromData(data: Record<string, unknown>): RvAgentOutcome | null {
  const raw = cgsMcpDataObject(data, 'outcome')
  if (!Object.keys(raw).length || raw.schema_version !== 1) return null
  const result = cgsTextValue(raw.result) as RvAgentOutcomeResult
  const reason = cgsTextValue(raw.reason) as RvAgentOutcomeReason
  if (!RV_AGENT_OUTCOME_RESULTS.has(result) || !RV_AGENT_OUTCOME_REASONS.has(reason)) return null
  const subjectRaw = raw.subject && typeof raw.subject === 'object' && !Array.isArray(raw.subject)
    ? raw.subject as Record<string, unknown>
    : {}
  const subject = {
    attach_book_id: cgsTextValue(subjectRaw.attach_book_id || subjectRaw.attachBookId),
    book_id: cgsTextValue(subjectRaw.book_id || subjectRaw.bookId),
    book_title: cgsTextValue(subjectRaw.book_title || subjectRaw.bookTitle),
    source: cgsTextValue(subjectRaw.source),
    episode_key: cgsTextValue(subjectRaw.episode_key || subjectRaw.episodeKey),
    episode_label: cgsTextValue(subjectRaw.episode_label || subjectRaw.episodeLabel),
  }
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const record = item as Record<string, unknown>
      const kindText = cgsTextValue(record.kind)
      const kind = RV_AGENT_OUTCOME_EVIDENCE_KINDS.has(kindText as RvAgentOutcome['evidence'][number]['kind'])
        ? kindText as RvAgentOutcome['evidence'][number]['kind']
        : 'tool_result'
      const label = cgsTextValue(record.label)
      const value = cgsTextValue(record.value)
      return label && value ? [{ kind, label, value }] : []
    })
    : []
  const messageRaw = raw.assistant_message && typeof raw.assistant_message === 'object' && !Array.isArray(raw.assistant_message)
    ? raw.assistant_message as Record<string, unknown>
    : {}
  const title = cgsTextValue(messageRaw.title) || '处理结果'
  const body = cgsTextValue(messageRaw.body) || title
  return {
    schema_version: 1,
    result,
    reason,
    subject: Object.fromEntries(Object.entries(subject).filter(([, value]) => value)) as RvAgentOutcome['subject'],
    evidence,
    assistant_message: { title, body },
  }
}

export function rvAgentOutcomeAssistantText(outcome: RvAgentOutcome): string {
  const title = outcome.assistant_message.title.trim()
  const body = outcome.assistant_message.body.trim()
  if (!title) return body
  if (!body || body === title) return title
  return `${title}\n${body}`
}

export function rvAgentOutcomeUsesAssistantRoute(outcome: RvAgentOutcome): boolean {
  return outcome.result === 'satisfied'
    || outcome.result === 'waiting_user'
    || outcome.result === 'blocked'
    || outcome.result === 'skipped'
    || outcome.result === 'cancelled'
}

function cgsMcpBadgeFromUnknown(value: unknown): CgsRunBadge | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const rawType = cgsTextValue(record.type).toLowerCase()
  const type: CgsRunBadge['type'] = rawType === 'ep' || rawType === 'episode' ? 'ep' : 'book'
  const text = cgsTextValue(record.text) || cgsTextValue(record.label) || cgsTextValue(record.title) || cgsTextValue(record.name) || cgsTextValue(record.ep) || cgsTextValue(record.episode)
  if (!text) return null
  const id = cgsTextValue(record.id) || cgsTextValue(record.key)
  const bookKey = cgsTextValue(record.book_key) || cgsTextValue(record.bookKey) || cgsTextValue(record.book_id) || cgsTextValue(record.bookId)
  const bookTitle = cgsTextValue(record.book_title) || cgsTextValue(record.bookTitle) || cgsTextValue(record.book_name) || cgsTextValue(record.bookName)
  const episodeKey = cgsTextValue(record.episode_key) || cgsTextValue(record.episodeKey)
  const rawState = cgsTextValue(record.state || record.status).toLowerCase()
  const state = cgsMcpBadgeState(rawState, record)
  return {
    type,
    text,
    ...(id ? { id } : {}),
    ...(bookKey ? { bookKey } : {}),
    ...(bookTitle ? { bookTitle } : {}),
    ...(episodeKey ? { episodeKey } : {}),
    ...(state ? { state } : {}),
  }
}

function cgsCompletionUnitsFromData(data: Record<string, unknown>): CgsRunBadge[] {
  const units = Array.isArray(data.completion_units) ? data.completion_units : Array.isArray(data.completionUnits) ? data.completionUnits : []
  const attachedBook = cgsMcpDataObject(data, 'attached_book')
  const attachedBookTitle = cgsTextValue(attachedBook.title) || cgsTextValue(attachedBook.book)
  const badges: CgsRunBadge[] = []
  units.forEach((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const record = value as Record<string, unknown>
    const scope = record.scope && typeof record.scope === 'object' && !Array.isArray(record.scope) ? record.scope as Record<string, unknown> : {}
    const unit = record.unit && typeof record.unit === 'object' && !Array.isArray(record.unit) ? record.unit as Record<string, unknown> : record
    const rawKind = cgsTextValue(unit.kind || unit.type).toLowerCase()
    const type: CgsRunBadge['type'] = rawKind === 'ep' || rawKind === 'episode' ? 'ep' : 'book'
    const text = cgsTextValue(unit.label) || cgsTextValue(unit.text) || cgsTextValue(unit.title) || cgsTextValue(unit.name)
    if (!text) return
    const id = cgsTextValue(unit.unit_id) || cgsTextValue(unit.unitId) || cgsTextValue(unit.id)
    const bookKey = cgsTextValue(scope.book_id) || cgsTextValue(scope.bookId) || cgsTextValue(scope.attach_book_id) || cgsTextValue(scope.attachBookId) || cgsTextValue(unit.book_key) || cgsTextValue(unit.bookKey)
    const bookTitle = cgsTextValue(scope.book_title) || cgsTextValue(scope.bookTitle) || cgsTextValue(scope.book) || cgsTextValue(unit.book_title) || cgsTextValue(unit.bookTitle) || attachedBookTitle
    const episodeKey = cgsTextValue(unit.episode_key) || cgsTextValue(unit.episodeKey)
    badges.push({
      type,
      text,
      ...(id ? { id } : {}),
      ...(bookKey ? { bookKey } : {}),
      ...(bookTitle ? { bookTitle } : {}),
      ...(episodeKey ? { episodeKey } : {}),
      state: 'finished',
    })
  })
  return badges
}

function cgsMcpBadgeState(rawState: string, record: Record<string, unknown>): CgsRunBadge['state'] | undefined {
  if (['finished', 'complete', 'completed', 'done', 'success', 'succeeded'].includes(rawState)) return 'finished'
  if (['failed', 'failure', 'error'].includes(rawState)) return 'failed'
  if (['running', 'active', 'pending', 'submitted', 'progress'].includes(rawState)) return 'running'
  if (record.finished === true || record.done === true || record.completed === true) return 'finished'
  return undefined
}

function cgsBadgeBookScope(badge: CgsRunBadge): string {
  return cgsTextValue(badge.bookKey) || cgsTextValue(badge.bookTitle)
}

function cgsAttachedBookScopeKey(attachedBook: CgsAttachedBook | null | undefined): string {
  return cgsTextValue(attachedBook?.id)
    || cgsTextValue(attachedBook?.attach_book_id)
    || cgsTextValue(attachedBook?.book)
    || cgsTextValue(attachedBook?.title)
}

export function cgsScopeRunBadgesToAttachedBook(
  values: CgsRunBadge[],
  attachedBook: CgsAttachedBook | null | undefined,
): CgsRunBadge[] {
  const bookKey = cgsAttachedBookScopeKey(attachedBook)
  const bookTitle = cgsTextValue(attachedBook?.title) || cgsTextValue(attachedBook?.book)
  if (!bookKey && !bookTitle) return values
  return values.map((badge) => ({
    ...badge,
    ...(bookKey && !cgsTextValue(badge.bookKey) ? { bookKey } : {}),
    ...(bookTitle && badge.type === 'ep' && !cgsTextValue(badge.bookTitle) ? { bookTitle } : {}),
  }))
}

export function cgsFinishedRunBadgeIdentityKey(badge: CgsRunBadge): string {
  const bookScope = cgsBadgeBookScope(badge)
  const episodeKey = cgsTextValue(badge.episodeKey)
  const text = cgsTextValue(badge.text)
  if (badge.type === 'ep') return `ep:${bookScope}:${episodeKey || text}`.toLowerCase()
  return `book:${bookScope || cgsTextValue(badge.id) || text}`.toLowerCase()
}

export function cgsRunBadgeIdentityKey(badge: CgsRunBadge): string {
  const bookScope = cgsBadgeBookScope(badge)
  const episodeKey = cgsTextValue(badge.episodeKey)
  const text = cgsTextValue(badge.text)
  if (badge.type === 'ep') return `ep:${bookScope}:${episodeKey || text}`.toLowerCase()
  const bookKey = cgsTextValue(badge.bookKey)
  if (badge.type === 'book' && bookKey) return `book:${bookKey}`
  const id = cgsTextValue(badge.id)
  if (id) return `id:${id}`
  return `${badge.type}:${text}`
}

export function cgsNormalizeFinishedRunBadges(values: CgsRunBadge[]): CgsRunBadge[] {
  const seen = new Set<string>()
  const badges: CgsRunBadge[] = []
  for (const badge of values) {
    const text = cgsTextValue(badge.text)
    if (!text) continue
    const type: CgsRunBadge['type'] = badge.type === 'ep' ? 'ep' : 'book'
    const normalized: CgsRunBadge = { ...badge, type, text, state: 'finished' }
    const key = cgsFinishedRunBadgeIdentityKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    badges.push(normalized)
  }
  const episodeScopes = new Set(badges.filter((badge) => badge.type === 'ep').map(cgsBadgeBookScope))
  if (!episodeScopes.size) return badges
  return badges.filter((badge) => badge.type !== 'book' || !episodeScopes.has(cgsBadgeBookScope(badge)))
}

export function cgsRunBadgeIsFinished(badge: CgsRunBadge): boolean {
  return badge.state === 'finished'
}

function cgsTrimLine(value: unknown, limit = 120): string {
  const text = cgsTextValue(value)
  if (!text) return ''
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`
}

export function cgsMcpBadgesFromData(data: Record<string, unknown>): CgsRunBadge[] {
  const direct = data.badges ?? data.run_badges ?? data.runBadges ?? data.running_badges ?? data.runningBadges
  if (Array.isArray(direct)) return direct.map(cgsMcpBadgeFromUnknown).filter((badge): badge is CgsRunBadge => Boolean(badge))
  const badges: CgsRunBadge[] = []
  const ep = cgsTextValue(data.ep) || cgsTextValue(data.episode) || cgsTextValue(data.episode_title) || cgsTextValue(data.episodeTitle)
  const book = cgsTextValue(data.book) || cgsTextValue(data.book_title) || cgsTextValue(data.bookTitle) || cgsTextValue(data.title)
  if (ep) badges.push({ type: 'ep', text: ep })
  if (book) badges.push({ type: 'book', text: book })
  return badges
}

export function cgsMcpStructuredBadgesFromData(data: Record<string, unknown>): CgsRunBadge[] {
  const direct = data.badges ?? data.run_badges ?? data.runBadges ?? data.running_badges ?? data.runningBadges
  if (!Array.isArray(direct)) return []
  return direct.map(cgsMcpBadgeFromUnknown).filter((badge): badge is CgsRunBadge => Boolean(badge))
}

export function rvAgentFinishedBadgesFromData(data: Record<string, unknown>, fallback: CgsRunBadge[]): CgsRunBadge[] {
  const completionUnits = cgsCompletionUnitsFromData(data)
  if (completionUnits.length) return cgsNormalizeFinishedRunBadges(completionUnits)
  const direct = data.finished_badges ?? data.finishedBadges ?? data.fin_badges ?? data.finBadges
  if (!Array.isArray(direct)) return fallback
  const badges = direct.map(cgsMcpBadgeFromUnknown).filter((badge): badge is CgsRunBadge => Boolean(badge))
  return badges.length ? cgsNormalizeFinishedRunBadges(badges) : fallback
}

function cgsMcpFinalSummaryRowFromUnknown(value: unknown): CgsMcpFinalSummaryRow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const label = cgsTrimLine(row.label, 16)
  const valueText = cgsTrimLine(row.value, 120)
  const tone = cgsTextValue(row.tone)
  if (!label || !valueText) return null
  return {
    label,
    value: valueText,
    tone: tone === 'ok' || tone === 'warn' || tone === 'error' ? tone : 'default',
  }
}

function cgsMcpFinalSummaryBlockFromUnknown(value: unknown): CgsMcpFinalSummaryBlock | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const block = value as Record<string, unknown>
  const type = cgsTextValue(block.type)
  if (type === 'text') {
    const text = cgsTrimLine(block.text, 240)
    return text ? { type: 'text', text } : null
  }
  if (type === 'rows') {
    const rows = Array.isArray(block.rows)
      ? block.rows.map(cgsMcpFinalSummaryRowFromUnknown).filter((row): row is CgsMcpFinalSummaryRow => Boolean(row))
      : []
    return rows.length ? { type: 'rows', rows } : null
  }
  if (type === 'badges') return null
  return null
}

function cgsUniqueBadgesForFinal(values: CgsRunBadge[]): CgsRunBadge[] {
  const seen = new Set<string>()
  const badges: CgsRunBadge[] = []
  values.forEach((badge) => {
    const text = cgsTrimLine(badge.text, 120)
    if (!text) return
    const type: CgsRunBadge['type'] = badge.type === 'ep' ? 'ep' : 'book'
    const normalized: CgsRunBadge = { ...badge, type, text }
    const key = cgsRunBadgeIdentityKey(normalized)
    if (seen.has(key)) return
    seen.add(key)
    badges.push(normalized)
  })
  return badges
}

export function cgsMcpFinalSummaryFromData(data: Record<string, unknown>): CgsMcpFinalSummary | null {
  const raw = data.final_summary
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const summary = raw as Record<string, unknown>
  if (summary.schema_version !== 1) return null
  const status = cgsTextValue(summary.status)
  if (status !== 'completed' && status !== 'partial' && status !== 'failed') return null
  const blocks = Array.isArray(summary.blocks)
    ? summary.blocks.map(cgsMcpFinalSummaryBlockFromUnknown).filter((block): block is CgsMcpFinalSummaryBlock => Boolean(block))
    : []
  const warnings = Array.isArray(summary.warnings)
    ? summary.warnings.map((item) => cgsTrimLine(item, 120)).filter(Boolean).slice(0, 3)
    : []
  return {
    schema_version: 1,
    status,
    title: cgsTrimLine(summary.title, 24) || '运行结果',
    headline: cgsTrimLine(summary.headline, 80) || cgsTrimLine(summary.summary, 80) || '运行结果',
    summary: cgsTrimLine(summary.summary, 220) || cgsTrimLine(summary.headline, 220) || '运行结果',
    blocks,
    finished_badges: [],
    warnings,
  }
}

export function cgsMcpFinalMarkdownFromData(data: Record<string, unknown>, fallback: string): string {
  const markdown = cgsMcpDataText(data, 'markdown')
    || cgsMcpDataText(data, 'final_markdown')
    || cgsMcpDataText(data, 'result_markdown')
    || fallback
  return markdown.trim() || fallback
}

export function cgsMcpProgressFromData(data: Record<string, unknown>): RvAgentTimelineItem | null {
  const percent = typeof data.percent === 'number' ? data.percent : null
  const status = cgsMcpDataText(data, 'status') || 'progress'
  const summary = cgsMcpDataText(data, 'events_summary') || cgsMcpDataText(data, 'status_summary') || status
  const parsedBadges = cgsMcpBadgesFromData(data)
  const stateFinishedBadges = parsedBadges.filter(cgsRunBadgeIsFinished)
  const badges = parsedBadges.filter((badge) => !cgsRunBadgeIsFinished(badge))
  const completed = ['completed', 'complete', 'done', 'success', 'finished'].some((token) => status.toLowerCase().includes(token)) || percent === 100
  const explicitFinishedBadges = rvAgentFinishedBadgesFromData(data, [])
  const finishedBadges = cgsUniqueBadgesForFinal([
    ...explicitFinishedBadges,
    ...stateFinishedBadges,
    ...(completed ? badges : []),
  ])
  if (!badges.length && !finishedBadges.length && (percent === null || percent <= 0)) return null
  return { id: nextTimelineId('mcp-progress'), type: 'progress', percent, status, summary, badges, completed, finishedBadges }
}

export function appendMcpAssistantDelta(items: RvAgentTimelineItem[], text: string): RvAgentTimelineItem[] {
  const last = items[items.length - 1]
  if (!text.trim()) {
    if (last?.type === 'assistant' && last.text.trim()) {
      return [...items.slice(0, -1), { ...last, text: `${last.text}${text}` }]
    }
    return items
  }
  if (last?.type === 'assistant') {
    return [...items.slice(0, -1), { ...last, text: `${last.text}${text}` }]
  }
  return [...items, { id: nextTimelineId('mcp-assistant'), type: 'assistant', text }]
}

export async function readCgsMcpSse(
  response: Response,
  onEvent: (event: CgsMcpSseEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error('CGS MCP 响应不可读')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSseChunk(buffer)
    buffer = parsed.rest
    parsed.events.forEach(onEvent)
  }
  buffer += decoder.decode()
  const parsed = parseSseChunk(`${buffer}\n\n`)
  parsed.events.forEach(onEvent)
}

export function cgsMcpPreviewBridgeData(event: CgsMcpSseEvent, previewMode: boolean): Record<string, unknown> | null {
  if (!previewMode) return null
  return event.event === 'cgs_preview_candidates' ? event.data : null
}
