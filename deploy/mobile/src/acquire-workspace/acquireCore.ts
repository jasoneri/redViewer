import { buildUrl, type CgsBook, type CgsBookEpisode, type CgsConfig } from '../mobileStore'
import type { CoverOverlayTag } from '../shared/Cover'
import type {
  CgsConfigDraft,
  CgsConnectionState,
  CgsEpisodeSelectionPayload,
  CgsGateFlight,
  CgsGateFlightTarget,
  CgsMcpDetailBlock,
  CgsMcpLlmConfig,
  CgsMcpSseEvent,
  CgsMcpTimelineItem,
  CgsMcpToolTone,
  CgsSubmitPosition,
  CgsWorkspaceMode,
} from './acquireTypes'

const CGS_SUBMIT_POSITION_KEY = 'rv_mobile_cgs_submit_position'
const CGS_SUBMIT_CONTROL_WIDTH = 108
const CGS_SUBMIT_CONTROL_HEIGHT = 36
const CGS_SUBMIT_CONTROL_SAFE_BOTTOM = 84
const CGS_SUBMIT_CONTROL_EDGE_GAP = 8
const CGS_MCP_LLM_CONFIG_KEY = 'rv_mobile_cgs_mcp_llm'
const CGS_MCP_PROMPT_HISTORY_KEY = 'rv_mobile_cgs_mcp_prompt_history'
const CGS_MCP_PROMPT_HISTORY_LIMIT = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function cssPxVariable(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const value = Number.parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

function cgsSubmitControlWidth(): number {
  return cssPxVariable('--cgs-submit-control-width', CGS_SUBMIT_CONTROL_WIDTH)
}

function cgsSubmitControlHeight(): number {
  return cssPxVariable('--cgs-submit-control-height', CGS_SUBMIT_CONTROL_HEIGHT)
}

function defaultCgsSubmitPosition(): CgsSubmitPosition {
  if (typeof window === 'undefined') return { x: CGS_SUBMIT_CONTROL_EDGE_GAP, y: CGS_SUBMIT_CONTROL_EDGE_GAP }
  const controlWidth = cgsSubmitControlWidth()
  const controlHeight = cgsSubmitControlHeight()
  return {
    x: Math.max(CGS_SUBMIT_CONTROL_EDGE_GAP, window.innerWidth - controlWidth - 18),
    y: Math.max(CGS_SUBMIT_CONTROL_EDGE_GAP, window.innerHeight - controlHeight - CGS_SUBMIT_CONTROL_SAFE_BOTTOM),
  }
}

export function clampCgsSubmitPosition(position: CgsSubmitPosition): CgsSubmitPosition {
  if (typeof window === 'undefined') return position
  const controlWidth = cgsSubmitControlWidth()
  const controlHeight = cgsSubmitControlHeight()
  const maxX = Math.max(CGS_SUBMIT_CONTROL_EDGE_GAP, window.innerWidth - controlWidth - CGS_SUBMIT_CONTROL_EDGE_GAP)
  const maxY = Math.max(CGS_SUBMIT_CONTROL_EDGE_GAP, window.innerHeight - controlHeight - CGS_SUBMIT_CONTROL_EDGE_GAP)
  return {
    x: clamp(Math.round(position.x), CGS_SUBMIT_CONTROL_EDGE_GAP, maxX),
    y: clamp(Math.round(position.y), CGS_SUBMIT_CONTROL_EDGE_GAP, maxY),
  }
}

export function loadCgsSubmitPosition(): CgsSubmitPosition {
  try {
    const raw = localStorage.getItem(CGS_SUBMIT_POSITION_KEY)
    if (!raw) return defaultCgsSubmitPosition()
    const parsed = JSON.parse(raw) as Partial<CgsSubmitPosition>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return defaultCgsSubmitPosition()
    if (typeof window !== 'undefined' && parsed.y > window.innerHeight * 0.7) return defaultCgsSubmitPosition()
    return clampCgsSubmitPosition({ x: parsed.x, y: parsed.y })
  } catch {
    return defaultCgsSubmitPosition()
  }
}

export function saveCgsSubmitPosition(position: CgsSubmitPosition): CgsSubmitPosition {
  const next = clampCgsSubmitPosition(position)
  localStorage.setItem(CGS_SUBMIT_POSITION_KEY, JSON.stringify(next))
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

export function cgsMcpFailureStatus(value: string): boolean {
  const status = value.trim().toLowerCase()
  return ['error', 'failed', 'failure', 'fail', 'exception', 'unreachable'].some((token) => status.includes(token)) || status.includes('失败') || status.includes('错误')
}

function cgsMcpWarnStatus(value: string): boolean {
  const status = value.trim().toLowerCase()
  return ['warn', 'warning', 'partial', 'skipped'].some((token) => status.includes(token)) || status.includes('警告')
}

export function cgsMcpToolTone(result: Record<string, unknown>): CgsMcpToolTone {
  const status = cgsTextValue(result.status)
  if (result.success === false || result.ok === false || cgsTextValue(result.error) || cgsTextValue(result.exception) || cgsMcpFailureStatus(status)) return 'error'
  if (cgsMcpWarnStatus(status)) return 'warn'
  return 'ok'
}

export function cgsMcpWorseTone(left: CgsMcpToolTone | undefined, right: CgsMcpToolTone): CgsMcpToolTone {
  if (left === 'error' || right === 'error') return 'error'
  if (left === 'warn' || right === 'warn') return 'warn'
  return 'ok'
}

export function cgsMcpToolSummary(result: Record<string, unknown>): string {
  const summary = cgsTextValue(result.text) || cgsTextValue(result.summary) || cgsTextValue(result.message) || cgsTextValue(result.error) || cgsTextValue(result.status)
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

export function cgsMcpToolDetailBlocks(item: Extract<CgsMcpTimelineItem, { type: 'tool' }>): CgsMcpDetailBlock[] {
  const primaryValue = item.result.text ?? item.result.summary ?? item.result.message ?? item.result.error ?? item.result
  const primaryBlock = cgsMcpDetailBlockForValue(primaryValue)
  return primaryBlock ? [primaryBlock] : [{ kind: 'text', text: 'ok' }]
}

export function nextTimelineId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function appendCgsMcpFinalFailure(items: CgsMcpTimelineItem[], summary: string): CgsMcpTimelineItem[] {
  const last = items[items.length - 1]
  if (last?.type === 'final' && !last.success && last.summary === summary) return items
  return [...items, { id: nextTimelineId('mcp-final'), type: 'final', success: false, summary }]
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

export function cgsMcpProgressFromData(data: Record<string, unknown>): CgsMcpTimelineItem {
  const percent = typeof data.percent === 'number' ? data.percent : null
  const status = cgsMcpDataText(data, 'status') || 'progress'
  const summary = cgsMcpDataText(data, 'events_summary') || cgsMcpDataText(data, 'status_summary') || status
  return { id: nextTimelineId('mcp-progress'), type: 'progress', percent, status, summary }
}

export function appendMcpAssistantDelta(items: CgsMcpTimelineItem[], text: string): CgsMcpTimelineItem[] {
  const last = items[items.length - 1]
  if (last?.type === 'assistant') {
    return [...items.slice(0, -1), { ...last, text: `${last.text}${text}` }]
  }
  return [...items, { id: nextTimelineId('mcp-assistant'), type: 'assistant', text }]
}

export async function readCgsMcpSse(
  response: Response,
  onEvent: (event: CgsMcpSseEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error('MCP 对话响应不可读')
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
