import { useEffect, useRef } from 'react'
import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, MutableRefObject, PointerEvent, RefObject, SetStateAction } from 'react'
import {
  appendMcpAssistantDelta,
  buildCgsGateFlight,
  cgsDraftFromConfig,
  cgsEpisodeSelectionsPayload,
  cgsFirstEpisodeKeys,
  cgsLatestEpisodeKeys,
  cgsMcpBadgesFromData,
  cgsMcpConfigured,
  cgsMcpDataObject,
  cgsMcpDataText,
  cgsMcpErrorClassFromData,
  cgsMcpDoujinshiPreviewEnabled,
  cgsMcpEffectivePreferenceBookKinds,
  cgsMcpFinalSummaryFromData,
  cgsMcpFinalMarkdownFromData,
  cgsMcpFailureStatus,
  rvAgentFinishedBadgesFromData,
  rvAgentOutcomeAssistantText,
  rvAgentOutcomeFromData,
  rvAgentOutcomeUsesAssistantRoute,
  cgsMcpProgressFromData,
  cgsMcpLearnPreferenceItems,
  cgsMcpPreviewBridgeData,
  cgsMcpPreferencePromptContext,
  cgsMcpSearchBookPreferenceKind,
  cgsNormalizeFinishedRunBadges,
  cgsScopeRunBadgesToAttachedBook,
  rvAgentRepairFromClass,
  rvAgentRepairFromErrorEvent,
  cgsFinishedRunBadgeIdentityKey,
  cgsRunBadgeIdentityKey,
  cgsRunBadgeIsFinished,
  cgsMcpStructuredBadgesFromData,
  cgsMcpToolSummary,
  cgsMcpToolTone,
  cgsProxiesFromText,
  cgsRootActionErrorMessage,
  cgsSetBookEpisodeKeys,
  cgsSubmitSelectionCount,
  cgsSubmitErrorMessage,
  cgsToggleEpisodeKey,
  cgsWorkResetErrorMessage,
  cgsWorkResetJobRunning,
  getCgsStatusKey,
  clampCgsSubmitPosition,
  nextTimelineId,
  normalizeCgsConfig,
  prefersReducedMotion,
  readCgsMcpSse,
  removeCgsMcpPromptHistory as removeStoredCgsMcpPromptHistory,
  saveCgsMcpLlmConfig,
  saveCgsMcpPromptHistory,
  saveCgsSubmitPosition,
} from './acquireCore'
import type {
  CgsAttachedBook,
  CgsConfigDraft,
  CgsConnectionState,
  CgsEpisodeLoadState,
  CgsGateFlight,
  CgsGatePhase,
  CgsMcpErrorClass,
  CgsMcpChatPayload,
  CgsMcpFinalSummary,
  CgsMcpLlmConfig,
  CgsMcpPreferenceState,
  RvAgentRepairState,
  CgsMcpSseEvent,
  RvAgentSuccessTarget,
  RvAgentTimelineItem,
  CgsRunBadge,
  CgsModeSwap,
  CgsSearchBookInfo,
  CgsSubmitDragState,
  CgsSubmitPosition,
  CgsWorkspaceMode,
} from './acquireTypes'
import {
  coverUrl as libraryCoverUrl,
  doujinCoverOverlayTags,
  ensureMeta,
  mangaCoverOverlayTags,
  type SortMode,
} from '../library-workspace/libraryCore'
import type { AppState } from '../app-shell/useAppState'
import { hasRootSecret, rootSecretHeaders } from '../app-shell/useAppShellController'
import {
  type CgsBook,
  type CgsBookEpisode,
  type CgsConfig,
  type LibraryItem,
  type ShelfBook,
  type CgsSite,
  apiGet,
  apiPost,
  buildUrl,
} from '../mobileStore'

type ShowToast = (tone: 'ok' | 'warn' | 'error', text: string) => void
type ShowCgsStatusToast = (status: Record<string, unknown> | null) => void

const CGS_STATUS_POLL_INTERVAL_MS = 1200
const CGS_STATUS_POLL_LIMIT = 120
const CGS_STATUS_TERMINAL = new Set(['completed', 'failed'])
const CGS_MCP_PREVIEW_PROMPT_SUFFIX = [
  '',
  '',
  '[RV internal preview mode]',
  'The explicit RV preview switch is enabled. Search and filter CGS candidates, then stop.',
  'Do not call cgs_submit_books and do not start a download. RV mobile will hand the search result to acquire-content for manual CGS Server submit.',
].join('\n')

type MobileAcquireControllerDeps = {
  cgsBookshelfPath: string
  cgsGateBusy: boolean
  cgsStatusToastKeyRef: MutableRefObject<string>
  refreshLibrary: (url?: string, nextSort?: SortMode, resetPage?: boolean, showLoading?: boolean, sync?: boolean) => Promise<ShelfBook[]>
  show: ShowToast
  showCgsStatusToast: ShowCgsStatusToast
}

type AcquireWorkspaceControllerDeps = {
  backendUrl: string
  busy: string
  cgsBookshelfPath: string
  cgsConfigDraft: CgsConfigDraft
  cgsGateBusy: boolean
  cgsGatePhase: CgsGatePhase
  cgsMcpLlmConfig: CgsMcpLlmConfig
  cgsMcpLlmDraft: CgsMcpLlmConfig
  cgsAttachedBook: CgsAttachedBook | null
  cgsAttachedBookList: CgsAttachedBook[]
  rvAgentLibrarySyncing: boolean
  rvAgentPrompt: string
  rvAgentPreferenceState: CgsMcpPreferenceState
  rvAgentRepair: RvAgentRepairState | null
  rvAgentRunning: boolean
  cgsModeSwap: CgsModeSwap | null
  cgsPendingAttachBookId: string | null
  cgsSearchBookInfo: CgsSearchBookInfo | null
  cgsSessionId: string
  cgsCurrentPage: number
  cgsStatus: Record<string, unknown> | null
  cgsSubmitStatusInfoText: string
  cgsSubmitPosition: CgsSubmitPosition
  cgsWorkspaceMode: CgsWorkspaceMode | null
  episodesByBook: Record<string, CgsBookEpisode[]>
  hasRootSecret: () => boolean
  keyword: string
  refreshLibrary: (url?: string, nextSort?: SortMode, resetPage?: boolean, showLoading?: boolean, sync?: boolean) => Promise<ShelfBook[]>
  rootSecretHeaders: () => Promise<Record<string, string>>
  selectedEpisodeKeysByBook: Record<string, string[]>
  selectedKeys: string[]
  selectedSite: string
  sites: CgsSite[]
  show: ShowToast
  showCgsStatusToast: (status: Record<string, unknown> | null) => void
  sort: SortMode
  cgsManualGateRef: RefObject<HTMLButtonElement | null>
  rvAgentAbortRef: MutableRefObject<AbortController | null>
  rvAgentComposerRef: MutableRefObject<boolean>
  rvAgentFailedRef: MutableRefObject<boolean>
  rvAgentLastRunRef: MutableRefObject<{ prompt: string; attachedBookList: CgsAttachedBook[] } | null>
  rvAgentGateRef: RefObject<HTMLButtonElement | null>
  rvAgentSubmittedRef: MutableRefObject<boolean>
  rvAgentLastSubmitBadgesRef: MutableRefObject<CgsRunBadge[]>
  cgsStatusDotRef: RefObject<HTMLSpanElement | null>
  cgsStatusHeadRef: RefObject<HTMLButtonElement | null>
  cgsStatusToastKeyRef: MutableRefObject<string>
  cgsSubmitDragRef: MutableRefObject<CgsSubmitDragState | null>
  setChapterPanelBookKey: Dispatch<SetStateAction<string>>
  setBusy: Dispatch<SetStateAction<string>>
  setCgsBooks: Dispatch<SetStateAction<CgsBook[]>>
  setCgsAttachedBook: Dispatch<SetStateAction<CgsAttachedBook | null>>
  setCgsAttachedBookList: Dispatch<SetStateAction<CgsAttachedBook[]>>
  setCgsConfig: Dispatch<SetStateAction<CgsConfig | null>>
  setCgsConfigBusy: Dispatch<SetStateAction<string>>
  setCgsConfigDraft: Dispatch<SetStateAction<CgsConfigDraft>>
  setCgsConnection: Dispatch<SetStateAction<CgsConnectionState>>
  setCgsGateFlight: Dispatch<SetStateAction<CgsGateFlight | null>>
  setCgsGateLoadingMode: Dispatch<SetStateAction<CgsWorkspaceMode | null>>
  setCgsGatePhase: Dispatch<SetStateAction<CgsGatePhase>>
  setCgsHeadGateFlight: Dispatch<SetStateAction<CgsGateFlight | null>>
  setCgsSubmitStatusInfoOpen: Dispatch<SetStateAction<boolean>>
  setCgsSubmitStatusInfoText: Dispatch<SetStateAction<string>>
  setRvAgentExpandedToolId: Dispatch<SetStateAction<string | null>>
  setRvAgentHistoryOpen: Dispatch<SetStateAction<boolean>>
  setRvAgentLibrarySyncing: Dispatch<SetStateAction<boolean>>
  setCgsMcpLlmConfig: Dispatch<SetStateAction<CgsMcpLlmConfig>>
  setRvAgentPrompt: Dispatch<SetStateAction<string>>
  setRvAgentPreferenceState: Dispatch<SetStateAction<CgsMcpPreferenceState>>
  setRvAgentPromptHistory: Dispatch<SetStateAction<string[]>>
  setRvAgentRepair: Dispatch<SetStateAction<RvAgentRepairState | null>>
  setRvAgentRunning: Dispatch<SetStateAction<boolean>>
  setRvAgentTimeline: Dispatch<SetStateAction<RvAgentTimelineItem[]>>
  setCgsModeSwap: Dispatch<SetStateAction<CgsModeSwap | null>>
  setCgsPendingAttachBookId: Dispatch<SetStateAction<string | null>>
  setCgsSearchBookInfo: Dispatch<SetStateAction<CgsSearchBookInfo | null>>
  setCgsSessionId: Dispatch<SetStateAction<string>>
  setCgsCurrentPage: Dispatch<SetStateAction<number>>
  setCgsStatus: Dispatch<SetStateAction<Record<string, unknown> | null>>
  setCgsSubmitPosition: Dispatch<SetStateAction<CgsSubmitPosition>>
  setCgsWorkspaceMode: Dispatch<SetStateAction<CgsWorkspaceMode | null>>
  setEpisodeLoadByBook: Dispatch<SetStateAction<Record<string, CgsEpisodeLoadState>>>
  setEpisodesByBook: Dispatch<SetStateAction<Record<string, CgsBookEpisode[]>>>
  setKeyword: Dispatch<SetStateAction<string>>
  setSelectedEpisodeKeysByBook: Dispatch<SetStateAction<Record<string, string[]>>>
  setSelectedKeys: Dispatch<SetStateAction<string[]>>
  setSelectedSite: Dispatch<SetStateAction<string>>
  setSites: Dispatch<SetStateAction<CgsSite[]>>
}

type CgsMcpSearchPreviewPayload = {
  books: CgsBook[]
  keyword: string
  page: number
  selectedSite: string
  sessionId: string
}

function cgsMcpTransportPrompt(prompt: string, previewMode: boolean): string {
  return previewMode ? `${prompt}${CGS_MCP_PREVIEW_PROMPT_SUFFIX}` : prompt
}

function cgsMcpSearchPreviewPayload(
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): CgsMcpSearchPreviewPayload | null {
  const searchResult = cgsObject(result.search_result) || result
  if (!Array.isArray(searchResult.books)) return null
  const sessionId = (
    cgsString(searchResult.session_id)
    || cgsString(searchResult.sessionId)
    || cgsString(result.session_id)
    || cgsString(result.sessionId)
  ).trim()
  if (!sessionId) return null
  const pageRaw = Number(searchResult.page ?? result.page ?? args.page)
  const siteRaw = searchResult.site ?? result.site ?? args.site
  return {
    books: searchResult.books as CgsBook[],
    keyword: (cgsString(searchResult.keyword) || cgsString(result.keyword) || cgsString(args.keyword)).trim(),
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
    selectedSite: siteRaw === null || siteRaw === undefined ? '' : String(siteRaw),
    sessionId,
  }
}

function cgsGateFlightVisualRect(element: HTMLElement | null): DOMRect | null {
  if (!element) return null
  const iconRect = element.querySelector('svg')?.getBoundingClientRect()
  if (iconRect && iconRect.width > 0 && iconRect.height > 0) return iconRect
  return element.getBoundingClientRect()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function createCgsMcpSessionId(): string {
  return globalThis.crypto?.randomUUID?.() || `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function cgsObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function cgsString(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
}

function cgsJobId(status: Record<string, unknown> | null): string {
  const job = cgsObject(status?.job)
  return cgsString(job?.job_id || status?.job_id).trim()
}

function cgsJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function cgsEventLine(event: unknown): string {
  const row = cgsObject(event)
  if (!row) return cgsString(event)
  const type = cgsString(row.type || 'event')
  const message = cgsString(row.message || row.error || row.detail || row.stage || row.name)
  const page = cgsString(row.page)
  const code = cgsString(row.code)
  return [type, code, page ? `page=${page}` : '', message].filter(Boolean).join(' ')
}

function formatCgsSubmitStatusInfo(
  status: Record<string, unknown> | null,
  eventsPayload?: Record<string, unknown> | null,
  errorText?: string,
): string {
  const lines: string[] = []
  const job = cgsObject(status?.job)
  if (!status) {
    lines.push('status: 未提交')
  } else {
    lines.push(`status: ${getCgsStatusKey(status)}`)
    const jobId = cgsJobId(status)
    if (jobId) lines.push(`job_id: ${jobId}`)
    if (job?.origin) lines.push(`origin: ${cgsString(job.origin)}`)
    if (job?.stage) lines.push(`stage: ${cgsString(job.stage)}`)
    if (job?.progress) lines.push(`progress: ${cgsJson(job.progress)}`)
    if (job?.task) lines.push(`task: ${cgsJson(job.task)}`)
    const errorCode = cgsString(job?.error_code || status.error_code)
    const error = cgsString(job?.error || status.error || status.message)
    if (errorCode) lines.push(`error_code: ${errorCode}`)
    if (error) lines.push(`error: ${error}`)
    const repairs = status.repairs
    if (Array.isArray(repairs) && repairs.length) lines.push(`repairs: ${cgsJson(repairs)}`)
  }
  if (errorText) lines.push(`request_error: ${errorText}`)

  const events = Array.isArray(eventsPayload?.events) ? eventsPayload.events : []
  const logs = Array.isArray(eventsPayload?.logs) ? eventsPayload.logs : []
  const recent = [...events, ...logs].slice(-10).map(cgsEventLine).filter(Boolean)
  if (recent.length) {
    lines.push('recent:')
    lines.push(...recent.map((line) => `- ${line}`))
  }
  return lines.join('\n')
}

function cgsUniqueRunBadges(values: CgsRunBadge[]): CgsRunBadge[] {
  const seen = new Set<string>()
  const badges: CgsRunBadge[] = []
  for (const badge of values) {
    const text = cgsString(badge.text).trim()
    if (!text) continue
    const nextBadge = { ...badge, text }
    const key = cgsRunBadgeIdentityKey(nextBadge)
    if (seen.has(key)) continue
    seen.add(key)
    badges.push(nextBadge)
  }
  return badges
}

function cgsUniqueFinishedRunBadges(values: CgsRunBadge[]): CgsRunBadge[] {
  return cgsNormalizeFinishedRunBadges(values)
}

function cgsRunBadgeTextKey(badge: CgsRunBadge): string {
  return `${badge.type}:${cgsString(badge.text).trim().toLowerCase()}`
}

function cgsMergeBadgeContext(badge: CgsRunBadge, context: CgsRunBadge | undefined): CgsRunBadge {
  if (!context) return badge
  return {
    ...badge,
    ...(!cgsString(badge.bookKey).trim() && cgsString(context.bookKey).trim() ? { bookKey: context.bookKey } : {}),
    ...(!cgsString(badge.bookTitle).trim() && cgsString(context.bookTitle).trim() ? { bookTitle: context.bookTitle } : {}),
    ...(!cgsString(badge.episodeKey).trim() && cgsString(context.episodeKey).trim() ? { episodeKey: context.episodeKey } : {}),
  }
}

function cgsInheritRunBadgeContext(
  previous: Pick<Extract<RvAgentTimelineItem, { type: 'progress' }>, 'badges' | 'finishedBadges'> | null,
  badges: CgsRunBadge[],
): CgsRunBadge[] {
  const context = new Map<string, CgsRunBadge>()
  ;[...(previous?.badges || []), ...(previous?.finishedBadges || [])].forEach((badge) => {
    const key = cgsRunBadgeTextKey(badge)
    if (!context.has(key)) context.set(key, badge)
  })
  return badges.map((badge) => cgsMergeBadgeContext(badge, context.get(cgsRunBadgeTextKey(badge))))
}

function cgsScopeSeedBadgesForCompletion(seedBadges: CgsRunBadge[], deterministicBadges: CgsRunBadge[], attachedBook: CgsAttachedBook | null): CgsRunBadge[] {
  const scopes = new Set(deterministicBadges.map((badge) => cgsString(badge.bookKey).trim()).filter(Boolean))
  if (scopes.size === 1) {
    const [bookKey] = [...scopes]
    return seedBadges.map((badge) => ({
      ...badge,
      ...(cgsString(badge.bookKey).trim() ? {} : { bookKey }),
      ...(badge.type === 'ep' && !cgsString(badge.bookTitle).trim() ? { bookTitle: cgsString(attachedBook?.title || attachedBook?.book).trim() } : {}),
    }))
  }
  return cgsScopeRunBadgesToAttachedBook(seedBadges, attachedBook)
}

function cgsAttachBookTitleToEpisodeBadges(values: CgsRunBadge[], attachedBook: CgsAttachedBook | null): CgsRunBadge[] {
  const bookTitle = cgsString(attachedBook?.title || attachedBook?.book).trim()
  if (!bookTitle) return values
  return values.map((badge) => badge.type === 'ep' && !cgsString(badge.bookTitle).trim() ? { ...badge, bookTitle } : badge)
}

function cgsMergeRunBadgeLifecycle(
  previous: Pick<Extract<RvAgentTimelineItem, { type: 'progress' }>, 'badges' | 'finishedBadges' | 'completed'> | null,
  incomingRunning: CgsRunBadge[],
  incomingFinished: CgsRunBadge[],
  completed: boolean,
  failed: boolean,
): { running: CgsRunBadge[]; finished: CgsRunBadge[] } {
  const runningWithContext = cgsInheritRunBadgeContext(previous, incomingRunning)
  const finishedWithContext = cgsInheritRunBadgeContext(previous, incomingFinished)
  const explicitFinished = cgsUniqueFinishedRunBadges([
    ...(previous?.finishedBadges || []),
    ...runningWithContext.filter(cgsRunBadgeIsFinished),
    ...finishedWithContext,
  ])
  const finishedKeys = new Set(explicitFinished.map(cgsFinishedRunBadgeIdentityKey))
  const running = cgsUniqueRunBadges([
    ...(previous?.badges || []),
    ...runningWithContext.filter((badge) => !cgsRunBadgeIsFinished(badge)),
  ]).filter((badge) => !finishedKeys.has(cgsFinishedRunBadgeIdentityKey({ ...badge, state: 'finished' })))
  if (completed && !failed) return { running: [], finished: cgsUniqueFinishedRunBadges([...explicitFinished, ...running]) }
  return { running, finished: explicitFinished }
}

function cgsSubmitSelectionBadgesFromPayload(payload: Record<string, unknown>): CgsRunBadge[] {
  const selections = Array.isArray(payload.episode_selections)
    ? payload.episode_selections
    : Array.isArray(payload.episodeSelections)
      ? payload.episodeSelections
      : []
  const badges: CgsRunBadge[] = []
  selections.forEach((value) => {
    const selection = cgsObject(value)
    if (!selection) return
    const bookTitle = cgsString(selection.book_title || selection.bookTitle || selection.book || selection.title).trim()
    const episodeTitles = Array.isArray(selection.episode_titles)
      ? selection.episode_titles
      : Array.isArray(selection.episodeTitles)
        ? selection.episodeTitles
        : []
    if (!episodeTitles.length && bookTitle) badges.push({ type: 'book', text: bookTitle, bookTitle })
    episodeTitles.forEach((episodeTitle) => {
      const text = cgsString(episodeTitle).trim()
      if (text) badges.push({ type: 'ep', text, ...(bookTitle ? { bookTitle } : {}) })
    })
  })
  return badges
}

function cgsMcpBadgesFromSubmitPayload(args: Record<string, unknown>, result: Record<string, unknown>): CgsRunBadge[] {
  const resultArgs = cgsObject(result.arguments)
  const badges: CgsRunBadge[] = [
    ...cgsSubmitSelectionBadgesFromPayload(args),
    ...(resultArgs ? cgsSubmitSelectionBadgesFromPayload(resultArgs) : []),
    ...cgsMcpBadgesFromData(args),
    ...cgsMcpBadgesFromData(result),
  ]
  const job = cgsObject(result.job)
  if (job) badges.push(...cgsMcpBadgesFromData(job))
  const task = cgsObject(job?.task || result.task)
  if (task) badges.push(...cgsMcpBadgesFromData(task))
  return cgsUniqueRunBadges(cgsInheritRunBadgeContext({ badges, finishedBadges: [] }, badges))
}

function cgsMcpBadgesFromStatusPayload(
  status: Record<string, unknown> | null,
  eventsPayload: Record<string, unknown> | null,
  fallback: CgsRunBadge[],
): CgsRunBadge[] {
  const badges: CgsRunBadge[] = []
  if (status) {
    badges.push(...cgsMcpStructuredBadgesFromData(status))
    const job = cgsObject(status.job)
    if (job) badges.push(...cgsMcpStructuredBadgesFromData(job))
    const task = cgsObject(job?.task || status.task)
    if (task) badges.push(...cgsMcpStructuredBadgesFromData(task))
  }
  const events = Array.isArray(eventsPayload?.events) ? eventsPayload?.events : []
  const logs = Array.isArray(eventsPayload?.logs) ? eventsPayload?.logs : []
  ;[...events, ...logs].forEach((event) => {
    const row = cgsObject(event)
    if (row) badges.push(...cgsMcpStructuredBadgesFromData(row))
  })
  return cgsUniqueRunBadges(badges.length ? badges : fallback).filter((badge) => !cgsRunBadgeIsFinished(badge))
}

function rvAgentFinishedBadgesFromStatusPayload(
  status: Record<string, unknown> | null,
  eventsPayload: Record<string, unknown> | null,
): CgsRunBadge[] {
  const finishedBadges: CgsRunBadge[] = []
  const collect = (value: Record<string, unknown> | null) => {
    if (!value) return
    finishedBadges.push(...rvAgentFinishedBadgesFromData(value, []))
    finishedBadges.push(...cgsMcpStructuredBadgesFromData(value).filter(cgsRunBadgeIsFinished))
  }
  if (status) {
    collect(status)
    const job = cgsObject(status.job)
    collect(job)
    collect(cgsObject(job?.task || status.task))
  }
  const events = Array.isArray(eventsPayload?.events) ? eventsPayload?.events : []
  const logs = Array.isArray(eventsPayload?.logs) ? eventsPayload?.logs : []
  ;[...events, ...logs].forEach((event) => collect(cgsObject(event)))
  return cgsUniqueFinishedRunBadges(finishedBadges)
}

function cgsStatusPercent(status: Record<string, unknown> | null): number | null {
  const job = cgsObject(status?.job)
  const progress = cgsObject(job?.progress || status?.progress)
  const percent = progress?.percent
  return typeof percent === 'number' && Number.isFinite(percent) ? percent : null
}

function cgsSuccessMatchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cgsSuccessMatchLoose(left: string, right: string): boolean {
  const leftText = cgsSuccessMatchText(left)
  const rightText = cgsSuccessMatchText(right)
  if (!leftText || !rightText) return false
  if (leftText === rightText) return true
  if (Math.min(leftText.length, rightText.length) < 4) return false
  return leftText.includes(rightText) || rightText.includes(leftText)
}

function cgsSuccessBookTexts(book: ShelfBook): string[] {
  return [book.book, book.title, book.id].map(cgsString).filter(Boolean)
}

function cgsSuccessItemTexts(item: LibraryItem): string[] {
  return [item.ep, item.title, item.id].map(cgsString).filter(Boolean)
}

function cgsSuccessBadgeTexts(badge: CgsRunBadge): string[] {
  return [badge.text, badge.id, badge.bookKey, badge.episodeKey].map(cgsString).filter(Boolean)
}

function cgsSuccessOverlayTags(book: ShelfBook) {
  const meta = ensureMeta(book.meta)
  return book.kind === 'single' && (meta.pages !== null || meta.btype)
    ? doujinCoverOverlayTags(meta)
    : mangaCoverOverlayTags(book, meta)
}

function cgsSuccessTargetFromBook(book: ShelfBook, backendUrl: string): RvAgentSuccessTarget {
  if (book.kind === 'series') {
    return {
      kind: 'detail',
      shelfBookId: book.id,
      title: book.book || book.title || '系列',
      actionLabel: '进入详情',
      coverSrc: libraryCoverUrl(backendUrl, book.first_img, 'online'),
      overlayTags: cgsSuccessOverlayTags(book),
    }
  }
  return {
    kind: 'reader',
    shelfBookId: book.id,
    itemId: book.id,
    title: book.title || book.book || '作品',
    actionLabel: '开始阅读',
    coverSrc: libraryCoverUrl(backendUrl, book.first_img, 'online'),
    overlayTags: cgsSuccessOverlayTags(book),
  }
}

function cgsMcpPreferenceBookKind(book: ShelfBook): 'doujinshi' | 'manga' | 'unknown' {
  if (book.kind === 'series') return 'manga'
  const meta = ensureMeta(book.meta)
  const fields = [meta.btype, book.meta?.source, ...meta.tags].map(cgsString).join(' ').toLowerCase()
  if (fields.includes('doujin') || fields.includes('同人')) return 'doujinshi'
  if (fields.includes('manga') || fields.includes('漫画')) return 'manga'
  return book.kind === 'single' ? 'doujinshi' : 'unknown'
}

function cgsMcpLearnPreferencesFromSuccessTargets(
  state: CgsMcpPreferenceState,
  books: ShelfBook[],
  successTargets: RvAgentSuccessTarget[],
): CgsMcpPreferenceState {
  const targetIds = new Set(successTargets.map((target) => target.shelfBookId))
  let remaining = state.settings.per_conversation_learn_cap
  let nextState = state
  for (const book of books) {
    if (remaining <= 0) break
    if (!targetIds.has(book.id)) continue
    const tags = ensureMeta(book.meta).tags.map(cgsString).filter(Boolean)
    if (!tags.length) continue
    nextState = cgsMcpLearnPreferenceItems(nextState, tags, { book_kind: cgsMcpPreferenceBookKind(book) }, remaining)
    remaining -= Math.min(new Set(tags).size, remaining)
  }
  return nextState
}

export function cgsResolveSuccessTargets(
  books: ShelfBook[],
  backendUrl: string,
  attachedBook: CgsAttachedBook | null,
  finishedBadges: CgsRunBadge[],
  preSyncBooks?: ShelfBook[],
): RvAgentSuccessTarget[] {
  const bookBadgeTexts = finishedBadges.filter((badge) => badge.type === 'book').flatMap(cgsSuccessBadgeTexts)
  const episodeBadgeTexts = finishedBadges.filter((badge) => badge.type === 'ep').flatMap(cgsSuccessBadgeTexts)
  const attachedTexts = [attachedBook?.book || '', attachedBook?.title || ''].filter(Boolean)
  const hasExplicitTargetAnchor = attachedTexts.length > 0 || bookBadgeTexts.length > 0 || episodeBadgeTexts.length > 0
  const bookAnchorTexts = attachedTexts.length ? attachedTexts : bookBadgeTexts
  const matches: Array<{ book: ShelfBook; score: number; episodeMatches: number }> = []

  books.forEach((book) => {
    let score = 0
    const bookTexts = cgsSuccessBookTexts(book)
    const bookAnchorMatched = bookAnchorTexts.some((text) => bookTexts.some((candidate) => cgsSuccessMatchLoose(text, candidate)))
    if (bookAnchorTexts.length && !bookAnchorMatched) return
    if (attachedTexts.some((text) => bookTexts.some((candidate) => cgsSuccessMatchLoose(text, candidate)))) score += 8
    score += bookBadgeTexts.filter((text) => cgsSuccessBookTexts(book).some((candidate) => cgsSuccessMatchLoose(text, candidate))).length * 5
    const episodeMatches = episodeBadgeTexts.filter((text) =>
      (book.kind === 'series' ? book.episodes : [book]).some((item) => cgsSuccessItemTexts(item).some((candidate) => cgsSuccessMatchLoose(text, candidate))),
    ).length
    score += episodeMatches * 10
    if (score <= 0) return
    matches.push({ book, score, episodeMatches })
  })

  // Union with newly added/updated singles discovered by diffing the
  // post-sync shelf against the pre-sync snapshot. Badge/event text matching
  // can miss unanchored whole-book items whose titles or ids do not align with
  // finished badges, so the shelf diff is only a fallback when no explicit
  // attached-book or finished-unit anchor exists.
  const matchedIds = new Set(matches.map((match) => match.book.id))
  if (preSyncBooks && !hasExplicitTargetAnchor) {
    const preSyncById = new Map(preSyncBooks.map((book) => [book.id, book]))
    const diffMatches: Array<{ book: ShelfBook; score: number; episodeMatches: number }> = []
    books.forEach((book) => {
      if (book.kind !== 'single') return
      if (matchedIds.has(book.id)) return
      const previous = preSyncById.get(book.id)
      const isNew = !previous
      const isUpdated = previous && previous.mtime < book.mtime
      if (!isNew && !isUpdated) return
      // New singles are always candidates; updated singles get a lower score so
      // badge-matched items win when both exist.
      diffMatches.push({ book, score: isNew ? 1 : 0, episodeMatches: 0 })
    })
    if (diffMatches.length) {
      matches.push(...diffMatches)
      diffMatches.forEach((match) => matchedIds.add(match.book.id))
    }
  }

  if (!matches.length) return []
  const byBestMatch = (left: typeof matches[number], right: typeof matches[number]) =>
    right.score - left.score || right.episodeMatches - left.episodeMatches || right.book.mtime - left.book.mtime
  const seriesMatches: typeof matches = []
  const seriesSeen = new Set<string>()
  matches
    .filter((match) => match.book.kind === 'series')
    .sort(byBestMatch)
    .forEach((match) => {
      if (seriesSeen.has(match.book.id)) return
      seriesSeen.add(match.book.id)
      seriesMatches.push(match)
    })
  // De-duplicate singles by shelfBookId in case badge + diff paths collide.
  const singleMatches: typeof matches = []
  const singleSeen = new Set<string>()
  matches
    .filter((match) => match.book.kind === 'single')
    .sort(byBestMatch)
    .forEach((match) => {
      if (singleSeen.has(match.book.id)) return
      singleSeen.add(match.book.id)
      singleMatches.push(match)
    })
  if (seriesMatches.length) {
    if (singleMatches.length) {
      return [...seriesMatches, ...singleMatches].sort(byBestMatch).map((match) => cgsSuccessTargetFromBook(match.book, backendUrl))
    }
    return seriesMatches.map((match) => cgsSuccessTargetFromBook(match.book, backendUrl))
  }
  if (singleMatches.length) return singleMatches.map((match) => cgsSuccessTargetFromBook(match.book, backendUrl))
  return []
}

function cgsResolveSuccessTarget(
  books: ShelfBook[],
  backendUrl: string,
  attachedBook: CgsAttachedBook | null,
  finishedBadges: CgsRunBadge[],
): RvAgentSuccessTarget | undefined {
  return cgsResolveSuccessTargets(books, backendUrl, attachedBook, finishedBadges)[0]
}

function cgsAttachedBookFromEventData(data: Record<string, unknown>): CgsAttachedBook | null {
  const attached = cgsObject(data.attached_book)
  if (!attached) return null
  const attachBookId = cgsString(attached.attach_book_id || attached.attachBookId).trim()
  const id = cgsString(attached.book_id || attached.bookId || attached.id || attachBookId).trim()
  const book = cgsString(attached.book).trim()
  const title = cgsString(attached.title).trim() || book
  const source = cgsString(attached.source).trim()
  if (!attachBookId && !id && !book && !title) return null
  const fallback = title || book || id || attachBookId
  return {
    attach_book_id: attachBookId || id,
    id: id || attachBookId || fallback,
    book: book || fallback,
    title: title || fallback,
    source: source || null,
  }
}

export function useAcquireWorkspaceController(deps: AcquireWorkspaceControllerDeps) {
  const cgsMcpStructuredErrorRef = useRef<CgsMcpErrorClass | null>(null)
  const cgsMcpWarnRef = useRef<RvAgentRepairState | null>(null)
  const cgsSitesWarmupRef = useRef<Promise<CgsConnectionState> | null>(null)

  function clearCgsSelections() {
    deps.setSelectedKeys([])
    deps.setSelectedEpisodeKeysByBook({})
  }

  function ensureCgsMcpSessionId(): string {
    if (deps.cgsSessionId) return deps.cgsSessionId
    const sessionId = createCgsMcpSessionId()
    deps.setCgsSessionId(sessionId)
    return sessionId
  }

  function startRvAgentNewSession() {
    if (deps.rvAgentRunning) return
    cgsMcpWarnRef.current = null
    deps.rvAgentFailedRef.current = false
    deps.rvAgentSubmittedRef.current = false
    deps.rvAgentLastRunRef.current = null
    deps.rvAgentLastSubmitBadgesRef.current = []
    deps.setCgsSessionId(createCgsMcpSessionId())
    deps.setRvAgentTimeline([])
    deps.setRvAgentRepair(null)
    deps.setRvAgentPrompt('')
    deps.setRvAgentHistoryOpen(false)
    deps.setRvAgentExpandedToolId(null)
  }

  function completeCgsGateFlight() {
    deps.setCgsGateFlight(null)
    deps.setCgsHeadGateFlight(null)
    deps.setCgsGatePhase('done')
    deps.setCgsGateLoadingMode(null)
  }

  function startCgsGateFlight(mode: CgsWorkspaceMode, nextConnection: CgsConnectionState) {
    const from = cgsGateFlightVisualRect((mode === 'mcp' ? deps.rvAgentGateRef : deps.cgsManualGateRef).current)
    const to = cgsGateFlightVisualRect(deps.cgsStatusDotRef.current)
    const inactiveMode: CgsWorkspaceMode = mode === 'mcp' ? 'manual' : 'mcp'
    const inactiveFrom = cgsGateFlightVisualRect((inactiveMode === 'mcp' ? deps.rvAgentGateRef : deps.cgsManualGateRef).current)
    const headTo = cgsGateFlightVisualRect(deps.cgsStatusHeadRef.current)
    if (!from || !to || prefersReducedMotion()) {
      if (nextConnection === 'online') deps.setCgsWorkspaceMode(mode)
      else deps.setCgsWorkspaceMode(null)
      completeCgsGateFlight()
      return
    }

    deps.setCgsGateFlight(buildCgsGateFlight(from, to, mode, nextConnection, 'rail'))
    if (nextConnection === 'online' && inactiveFrom && headTo) {
      deps.setCgsHeadGateFlight(buildCgsGateFlight(inactiveFrom, headTo, inactiveMode, nextConnection, 'head'))
    } else {
      deps.setCgsHeadGateFlight(null)
    }
    if (nextConnection === 'online') deps.setCgsWorkspaceMode(mode)
    else deps.setCgsWorkspaceMode(null)
    deps.setCgsGatePhase('flying')
    window.setTimeout(() => completeCgsGateFlight(), 760)
  }

  async function runCgsGateLoad(mode: CgsWorkspaceMode) {
    if (deps.busy === 'cgs-sites' || deps.busy === 'cgs-mcp' || deps.cgsGatePhase === 'loading' || deps.cgsGatePhase === 'flying') return
    deps.setCgsGateLoadingMode(mode)
    deps.setCgsGatePhase('loading')
    const nextConnection = mode === 'mcp' ? await probeCgsMcp() : await loadCgsSites()
    window.requestAnimationFrame(() => startCgsGateFlight(mode, nextConnection))
  }

  function finishCgsModeSwap(nextMode: CgsWorkspaceMode) {
    deps.setCgsWorkspaceMode(nextMode)
    deps.setCgsModeSwap(null)
  }

  function warmCgsSitesInBackground() {
    if (deps.sites.length || deps.busy === 'cgs-sites' || cgsSitesWarmupRef.current) return
    cgsSitesWarmupRef.current = loadCgsSites().finally(() => {
      cgsSitesWarmupRef.current = null
    })
  }

  function switchCgsWorkspaceMode(nextMode: CgsWorkspaceMode) {
    if (!deps.cgsWorkspaceMode || nextMode === deps.cgsWorkspaceMode || deps.cgsGateBusy || deps.cgsModeSwap || deps.busy === 'cgs-mcp') return

    if (nextMode === 'manual') warmCgsSitesInBackground()

    const head = deps.cgsStatusHeadRef.current?.getBoundingClientRect()
    const rail = deps.cgsStatusDotRef.current?.getBoundingClientRect()
    if (!head || !rail || prefersReducedMotion()) {
      finishCgsModeSwap(nextMode)
      return
    }
    deps.setCgsModeSwap({
      toMode: nextMode,
      headDx: rail.left - head.left,
      headDy: rail.top - head.top,
      railDx: head.left - rail.left,
      railDy: head.top - rail.top,
    })
    window.setTimeout(() => finishCgsModeSwap(nextMode), 360)
  }

  async function attachSearchBookInfo(searchInfo: CgsSearchBookInfo): Promise<CgsAttachedBook | null> {
    const existing = deps.cgsAttachedBookList.find((book) => book.id === searchInfo.id && book.attach_book_id)
    if (existing) {
      deps.setCgsAttachedBookList([existing])
      deps.setCgsPendingAttachBookId(null)
      return existing
    }
    const sessionId = ensureCgsMcpSessionId()
    const response = await apiPost<{ attach_book_id: string; title?: string; book?: string }>(
      deps.backendUrl,
      '/root/cgs/mcp/attach-book',
      {
        session_id: sessionId,
        id: searchInfo.id,
        title: searchInfo.title,
      },
      await deps.rootSecretHeaders(),
    )
    const attachedBook: CgsAttachedBook = {
      attach_book_id: response.attach_book_id,
      id: searchInfo.id,
      book: response.book || searchInfo.book,
      title: response.title || searchInfo.title || searchInfo.book,
      source: searchInfo.source,
      book_kind: cgsMcpSearchBookPreferenceKind(searchInfo),
      searchInfo,
    }
    deps.setCgsAttachedBookList([attachedBook])
    deps.setCgsPendingAttachBookId(null)
    return attachedBook
  }

  async function attachCurrentSearchBook(): Promise<CgsAttachedBook | null> {
    // RVUX001: only explicit pending attach events may create attachedBook state.
    if (!deps.cgsSearchBookInfo) return null
    return attachSearchBookInfo(deps.cgsSearchBookInfo)
  }

  async function syncPendingAttachedBook(): Promise<void> {
    // RVUX001: pending IDs come from explicit attach-or-replace entry actions.
    if (!deps.cgsSearchBookInfo || !deps.cgsPendingAttachBookId) return
    if (deps.cgsSearchBookInfo.id !== deps.cgsPendingAttachBookId) return
    if (deps.cgsAttachedBookList.some((book) => book.id === deps.cgsPendingAttachBookId && book.attach_book_id)) {
      deps.setCgsPendingAttachBookId(null)
      return
    }
    try {
      await attachCurrentSearchBook()
    } catch (error) {
      const message = error instanceof Error ? error.message : '当前书附加失败'
      deps.setRvAgentRepair(rvAgentRepairFromClass('cgs_runtime_failed', message))
      deps.show('warn', message)
    }
  }

  function invalidateAttachedBookState() {
    // RVUX001: invalid/remove paths clear state without scheduling implicit recovery.
    deps.setCgsAttachedBookList([])
    deps.setCgsPendingAttachBookId(null)
  }

  function selectAttachedBook(book: CgsAttachedBook) {
    if (!book.searchInfo) return
    deps.setCgsSearchBookInfo(book.searchInfo)
    const nextCandidate = book.searchInfo.candidates.find((candidate) => candidate.value === deps.keyword) || book.searchInfo.candidates[0]
    if (nextCandidate) deps.setKeyword(nextCandidate.value)
  }

  async function resolveAttachedBooksForPrompt(): Promise<CgsAttachedBook[] | null> {
    // RVUX001: prompt send consumes pinned state; it must not attach or resurrect it.
    if (!deps.cgsAttachedBookList.length) return []
    if (deps.cgsAttachedBookList.every((book) => book.attach_book_id.trim())) return deps.cgsAttachedBookList
    invalidateAttachedBookState()
    deps.setRvAgentRepair(rvAgentRepairFromClass('attach_book_invalid', '附加书籍列表缺少有效 attach_book_id，请重新附加。'))
    deps.show('warn', '附加书籍已失效，请重新附加')
    return null
  }

  async function detachAttachedBook(attachBookId?: string) {
    // RVUX001: mcp-attached-book-remove is the explicit remove transition.
    const target = attachBookId
      ? deps.cgsAttachedBookList.find((book) => book.attach_book_id === attachBookId || book.id === attachBookId)
      : deps.cgsAttachedBook
    if (!target) return
    try {
      await apiPost(
        deps.backendUrl,
        '/root/cgs/mcp/detach-book',
        { session_id: ensureCgsMcpSessionId(), attach_book_id: target.attach_book_id },
        await deps.rootSecretHeaders(),
      )
    } catch {
      // Best effort; local state still clears so the user can re-attach.
    }
    const remaining = deps.cgsAttachedBookList.filter((book) => book.attach_book_id !== target.attach_book_id && book.id !== target.id)
    deps.setCgsAttachedBookList(remaining)
    if (deps.cgsPendingAttachBookId === target.id) deps.setCgsPendingAttachBookId(null)
    const currentSearchInfoId = deps.cgsSearchBookInfo?.id || ''
    const currentStillAttached = currentSearchInfoId
      ? remaining.some((book) => book.id === currentSearchInfoId)
      : false
    if (!currentStillAttached) {
      const nextSearchInfo = remaining[0]?.searchInfo || null
      deps.setCgsSearchBookInfo(nextSearchInfo)
      const nextCandidate = nextSearchInfo?.candidates[0]
      if (nextCandidate) deps.setKeyword(nextCandidate.value)
    }
  }

  function startCgsSubmitDrag(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    const origin = clampCgsSubmitPosition(deps.cgsSubmitPosition)
    deps.cgsSubmitDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      lastPosition: origin,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveCgsSubmitDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = deps.cgsSubmitDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const next = clampCgsSubmitPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    })
    drag.lastPosition = next
    deps.setCgsSubmitPosition(next)
  }

  function finishCgsSubmitDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = deps.cgsSubmitDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    deps.cgsSubmitDragRef.current = null
    deps.setCgsSubmitPosition(saveCgsSubmitPosition(drag.lastPosition))
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  async function loadCgsConfig(silent = false): Promise<CgsConfig | null> {
    deps.setCgsConfigBusy('load')
    try {
      const response = await apiGet<CgsConfig>(deps.backendUrl, '/root/cgs/conf')
      const next = normalizeCgsConfig(response)
      deps.setCgsConfig(next)
      deps.setCgsConfigDraft(cgsDraftFromConfig(next))
      deps.setCgsConnection('online')
      return next
    } catch (error) {
      deps.setCgsConnection('unreachable')
      if (!silent) deps.show('error', error instanceof Error ? error.message : 'CGS 配置读取失败')
      return null
    } finally {
      deps.setCgsConfigBusy('')
    }
  }

  async function updateCgsConfig(): Promise<boolean> {
    const svPath = deps.cgsConfigDraft.sv_path.trim()
    if (!svPath) {
      deps.show('warn', 'CGS 储存目录不能为空')
      return false
    }
    deps.setCgsConfigBusy('save')
    try {
      const response = await apiPost<CgsConfig>(
        deps.backendUrl,
        '/root/cgs/conf',
        {
          downloaded_handle: deps.cgsConfigDraft.downloaded_handle || '-',
          proxies: cgsProxiesFromText(deps.cgsConfigDraft.proxies_text),
          sv_path: svPath,
        },
        await deps.rootSecretHeaders(),
      )
      const next = normalizeCgsConfig(response)
      deps.setCgsConfig(next)
      deps.setCgsConfigDraft(cgsDraftFromConfig(next))
      deps.setCgsConnection('online')
      return true
    } catch (error) {
      deps.show('error', cgsRootActionErrorMessage(error, 'CGS 配置更新失败', deps.hasRootSecret()))
      return false
    } finally {
      deps.setCgsConfigBusy('')
    }
  }

  function syncCgsSavePathFromBookshelf() {
    const nextPath = deps.cgsBookshelfPath.trim()
    if (!nextPath) return
    deps.setCgsConfigDraft((draft) => ({ ...draft, sv_path: nextPath }))
  }

  async function loadCgsSites(): Promise<CgsConnectionState> {
    deps.setBusy('cgs-sites')
    try {
      const response = await apiGet<{ sites: CgsSite[] }>(deps.backendUrl, '/root/cgs/sites')
      deps.setSites(response.sites || [])
      deps.setCgsConnection('online')
      const first = response.sites?.[0]
      const firstIndex = first?.site_index ?? first?.index
      if (firstIndex !== undefined) deps.setSelectedSite(String(firstIndex))
      void loadCgsConfig(true)
      deps.show('ok', '站点已加载')
      return 'online'
    } catch (error) {
      deps.setCgsConnection('unreachable')
      deps.show('error', error instanceof Error ? error.message : '来源不可用')
      return 'unreachable'
    } finally {
      deps.setBusy('')
    }
  }

  async function probeCgsMcp(): Promise<CgsConnectionState> {
    deps.setBusy('cgs-mcp')
    try {
      await apiGet<{ available?: boolean; status?: string; tools?: string[] }>(deps.backendUrl, '/root/cgs/mcp/status')
      deps.setCgsConnection('online')
      deps.show('ok', 'RV Agent 已连接')
      return 'online'
    } catch (error) {
      deps.setCgsConnection('unreachable')
      deps.show('error', error instanceof Error ? error.message : 'RV Agent 不可用')
      return 'unreachable'
    } finally {
      deps.setBusy('')
    }
  }

  function saveRvAgentLlmConfig() {
    const next = saveCgsMcpLlmConfig(deps.cgsMcpLlmDraft)
    deps.setCgsMcpLlmConfig(next)
  }

  function removeRvAgentHistoryPrompt(prompt: string) {
    deps.setRvAgentPromptHistory((history) => removeStoredCgsMcpPromptHistory(prompt, history))
  }

  function updateCgsMcpRunProgress(row: Extract<RvAgentTimelineItem, { type: 'progress' }>) {
    deps.setRvAgentTimeline((rows) => {
      const index = rows.findIndex((item) => item.type === 'progress')
      if (index < 0) {
        const failed = row.status === 'failed'
        const lifecycle = cgsMergeRunBadgeLifecycle(null, row.badges, row.finishedBadges || [], row.completed, failed)
        return [...rows, { ...row, badges: lifecycle.running, finishedBadges: lifecycle.finished }]
      }
      const existing = rows[index] as Extract<RvAgentTimelineItem, { type: 'progress' }>
      const failed = row.status === 'failed'
      const lifecycle = cgsMergeRunBadgeLifecycle(existing, row.badges, row.finishedBadges || [], row.completed, failed)
      const next = rows.filter((item, itemIndex) => item.type !== 'progress' || itemIndex === index)
      const nextIndex = next.findIndex((item) => item.type === 'progress')
      next[nextIndex] = { ...row, id: existing.id, badges: lifecycle.running, finishedBadges: lifecycle.finished }
      return next
    })
  }

  function clearCgsMcpRunProgress() {
    deps.setRvAgentTimeline((rows) => rows.filter((item) => item.type !== 'progress'))
  }

  function cgsMcpFinalSummaryForCompletion(
    summary: CgsMcpFinalSummary | null,
    finishedBadges: CgsRunBadge[],
    fallbackSummary: string,
  ): CgsMcpFinalSummary | undefined {
    if (!summary && !finishedBadges.length) return undefined
    const nextBadges = cgsUniqueFinishedRunBadges(finishedBadges)
    if (!summary) {
      return {
        schema_version: 1,
        status: 'completed',
        title: '下载完成',
        headline: fallbackSummary || '下载完成',
        summary: fallbackSummary || '下载完成',
        blocks: nextBadges.length ? [{ type: 'badges' as const, badges: nextBadges }] : [],
        finished_badges: nextBadges,
        warnings: [],
      }
    }
    const nonBadgeBlocks = summary.blocks.filter((block) => block.type !== 'badges')
    const blocks: CgsMcpFinalSummary['blocks'] = nextBadges.length ? [...nonBadgeBlocks, { type: 'badges' as const, badges: nextBadges }] : nonBadgeBlocks
    return {
      ...summary,
      status: 'completed',
      title: summary.title || '下载完成',
      headline: summary.headline || fallbackSummary || '下载完成',
      summary: summary.summary || fallbackSummary || '下载完成',
      blocks,
      finished_badges: nextBadges,
    }
  }

  async function pollCgsDownloadProgressAfterMcp(
    finalSummary = '完成',
    finalMarkdown = finalSummary,
    finalResultSummary: CgsMcpFinalSummary | null = null,
  ) {
    deps.setRvAgentLibrarySyncing(true)
    const seedBadges: CgsRunBadge[] = deps.rvAgentLastSubmitBadgesRef.current || []
    const progressId = nextTimelineId('mcp-progress')
    const seedRow: Extract<RvAgentTimelineItem, { type: 'progress' }> = {
      id: progressId,
      type: 'progress',
      percent: 0,
      status: 'submitted',
      summary: seedBadges.length ? '下载已提交' : '正在提交下载',
      badges: cgsUniqueRunBadges(seedBadges),
      completed: false,
      finishedBadges: [],
    }
    updateCgsMcpRunProgress(seedRow)
    let lastStatus: Record<string, unknown> | null = null
    let lastEvents: Record<string, unknown> | null = null
    let finalStatus: Record<string, unknown> | null = null
    try {
      for (let index = 0; index < CGS_STATUS_POLL_LIMIT; index += 1) {
        const tickStart = Date.now()
        let status: Record<string, unknown> | null = null
        let eventsPayload: Record<string, unknown> | null = null
        try {
          status = await apiGet<Record<string, unknown>>(deps.backendUrl, '/root/cgs/status')
          deps.setCgsStatus(status)
          deps.setCgsConnection('online')
        } catch (error) {
          if (deps.rvAgentAbortRef.current?.signal.aborted) break
          const message = error instanceof Error ? error.message : 'CGS 状态读取失败'
          deps.show('warn', message)
        }
        try {
          eventsPayload = await apiGet<Record<string, unknown>>(deps.backendUrl, '/root/cgs/events')
        } catch {
          eventsPayload = null
        }
        lastStatus = status
        lastEvents = eventsPayload
        if (status) {
          const statusKey = getCgsStatusKey(status)
          const percent = cgsStatusPercent(status) ?? (CGS_STATUS_TERMINAL.has(statusKey) ? 100 : 0)
          const completed = statusKey === 'completed' || percent >= 100
          const failed = statusKey === 'failed'
          const badges = cgsMcpBadgesFromStatusPayload(status, eventsPayload, seedRow.badges)
          const summary = cgsMcpBadgesFromStatusPayloadSummary(status, eventsPayload) || (failed ? '下载失败' : completed ? '下载完成' : '下载进行中')
          const explicitFinishedBadges = rvAgentFinishedBadgesFromStatusPayload(status, eventsPayload)
          const nextRow: Extract<RvAgentTimelineItem, { type: 'progress' }> = {
            ...seedRow,
            percent,
            status: statusKey,
            summary,
            badges: cgsUniqueRunBadges([...seedRow.badges, ...badges]),
            completed,
            finishedBadges: explicitFinishedBadges,
          }
          updateCgsMcpRunProgress(nextRow)
          deps.setCgsSubmitStatusInfoText(formatCgsSubmitStatusInfo(status, eventsPayload))
          if (completed || failed) {
            finalStatus = status
            break
          }
        }
        const elapsed = Date.now() - tickStart
        const waitMs = Math.max(CGS_STATUS_POLL_INTERVAL_MS - elapsed, 0)
        if (waitMs > 0) await sleep(waitMs)
      }
      const terminalKey = getCgsStatusKey(finalStatus || lastStatus)
      const isFailed = terminalKey === 'failed'
      if (isFailed) {
        const message = cgsObject(finalStatus)?.message || cgsObject(finalStatus?.job)?.error || '下载失败'
        deps.rvAgentFailedRef.current = true
        deps.show('error', typeof message === 'string' ? message : '下载失败')
        deps.setRvAgentRepair(rvAgentRepairFromClass('cgs_runtime_failed', typeof message === 'string' ? message : '下载失败'))
        deps.setCgsSubmitStatusInfoText(formatCgsSubmitStatusInfo(finalStatus, lastEvents))
        return
      }
      const finalBadges = cgsMcpBadgesFromStatusPayload(finalStatus, lastEvents, seedRow.badges)
      const terminalFinishedBadges = rvAgentFinishedBadgesFromStatusPayload(finalStatus, lastEvents)
      const completionRow: Extract<RvAgentTimelineItem, { type: 'progress' }> = {
        ...seedRow,
        percent: 100,
        status: 'completed',
        summary: '下载完成',
        badges: cgsUniqueRunBadges([...seedRow.badges, ...finalBadges]),
        completed: true,
        finishedBadges: terminalFinishedBadges,
      }
      updateCgsMcpRunProgress(completionRow)
      let preSyncBooks: ShelfBook[] | undefined
      try {
        preSyncBooks = await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false, false)
      } catch {
        preSyncBooks = undefined
      }
      const refreshedBooks = await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false, true)
      const deterministicFinishedBadges = cgsUniqueFinishedRunBadges([...(completionRow.finishedBadges || []), ...finalBadges])
      const scopedSeedBadges = cgsScopeSeedBadgesForCompletion(seedRow.badges, deterministicFinishedBadges, deps.cgsAttachedBook)
      const resolvedFinishedBadges = cgsUniqueFinishedRunBadges([...deterministicFinishedBadges, ...scopedSeedBadges])
      const successTargets = cgsResolveSuccessTargets(
        refreshedBooks,
        deps.backendUrl,
        deps.cgsAttachedBook,
        resolvedFinishedBadges,
        preSyncBooks,
      )
      deps.setRvAgentPreferenceState((state) => cgsMcpLearnPreferencesFromSuccessTargets(state, refreshedBooks, successTargets))
      const successTarget = successTargets[0]
      deps.setRvAgentTimeline((rows) => [
        ...rows,
        {
          id: nextTimelineId('mcp-final'),
          type: 'final',
          success: true,
          summary: finalSummary || '书库已刷新',
          markdown: finalMarkdown || finalSummary || '书库已刷新',
          tooltipTitle: '运行结果',
          badges: resolvedFinishedBadges,
          resultSummary: cgsMcpFinalSummaryForCompletion(finalResultSummary, resolvedFinishedBadges, finalSummary || '书库已刷新'),
          successCardEligible: true,
          cardTone: 'success',
          successTarget,
          successTargets,
        },
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : '书库同步失败'
      deps.show('error', message)
      deps.setRvAgentRepair(rvAgentRepairFromClass('cgs_runtime_failed', message))
    } finally {
      deps.setRvAgentLibrarySyncing(false)
    }
  }

  async function finalizeCgsMcpCompletedDownload(
    finalSummary = '完成',
    finalMarkdown = finalSummary,
    finalResultSummary: CgsMcpFinalSummary | null = null,
    attachedBook: CgsAttachedBook | null = deps.cgsAttachedBook,
  ) {
    deps.setRvAgentLibrarySyncing(true)
    const seedBadges: CgsRunBadge[] = deps.rvAgentLastSubmitBadgesRef.current || []
    const resolvedFinishedBadges = cgsUniqueFinishedRunBadges(cgsScopeSeedBadgesForCompletion(seedBadges, [], attachedBook))
    try {
      let preSyncBooks: ShelfBook[] | undefined
      try {
        preSyncBooks = await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false, false)
      } catch {
        preSyncBooks = undefined
      }
      const refreshedBooks = await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false, true)
      const successTargets = cgsResolveSuccessTargets(
        refreshedBooks,
        deps.backendUrl,
        attachedBook,
        resolvedFinishedBadges,
        preSyncBooks,
      )
      deps.setRvAgentPreferenceState((state) => cgsMcpLearnPreferencesFromSuccessTargets(state, refreshedBooks, successTargets))
      const successTarget = successTargets[0]
      deps.setRvAgentTimeline((rows) => [
        ...rows,
        {
          id: nextTimelineId('mcp-final'),
          type: 'final',
          success: true,
          summary: finalSummary || '书库已刷新',
          markdown: finalMarkdown || finalSummary || '书库已刷新',
          tooltipTitle: '运行结果',
          badges: resolvedFinishedBadges,
          resultSummary: cgsMcpFinalSummaryForCompletion(finalResultSummary, resolvedFinishedBadges, finalSummary || '书库已刷新'),
          successCardEligible: true,
          cardTone: 'success',
          successTarget,
          successTargets,
        },
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : '书库同步失败'
      deps.show('error', message)
      deps.setRvAgentRepair(rvAgentRepairFromClass('cgs_runtime_failed', message))
    } finally {
      deps.setRvAgentLibrarySyncing(false)
    }
  }

  async function finalizeCgsMcpBookCompleted(data: Record<string, unknown>) {
    const resultSummary = cgsMcpFinalSummaryFromData(data)
    const outcome = rvAgentOutcomeFromData(data)
    const explicitMonitorSummary = cgsMcpDataObject(data, 'monitor_summary')
    const monitorSummary = Object.keys(explicitMonitorSummary).length
      ? explicitMonitorSummary
      : cgsMcpDataObject(data, 'monitor_result')
    const monitorStatus = cgsMcpDataText(monitorSummary, 'terminalStatus')
    const summaryStatus = resultSummary?.status || ''
    const hasCompletionEvidence = monitorStatus === 'completed'
      || rvAgentFinishedBadgesFromData(data, []).length > 0
      || (monitorSummary ? rvAgentFinishedBadgesFromData(monitorSummary, []).length > 0 : false)
    const legacySuccess = data.success !== false
      && summaryStatus !== 'partial'
      && !cgsMcpFailureStatus(monitorStatus)
      && hasCompletionEvidence
    const success = outcome ? outcome.result !== 'failed' : legacySuccess
    const changed = outcome ? outcome.result === 'changed' : legacySuccess
    const reportedSummary = cgsMcpDataText(data, 'summary')
    const outcomeSummary = outcome ? rvAgentOutcomeAssistantText(outcome) : ''
    const summary = outcomeSummary || (success
      ? reportedSummary || resultSummary?.summary || '本书处理完成'
      : reportedSummary && reportedSummary !== '完成' ? reportedSummary : resultSummary?.summary || '本书处理失败')
    const markdown = cgsMcpFinalMarkdownFromData(data, summary)
    const attachedBook = cgsAttachedBookFromEventData(data) || deps.cgsAttachedBook
    const seedBadges: CgsRunBadge[] = deps.rvAgentLastSubmitBadgesRef.current || []
    const eventFinishedBadges = cgsAttachBookTitleToEpisodeBadges(rvAgentFinishedBadgesFromData(data, []), attachedBook)
    const monitorFinishedBadges = eventFinishedBadges.length
      ? []
      : monitorSummary ? cgsAttachBookTitleToEpisodeBadges(rvAgentFinishedBadgesFromData(monitorSummary, []), attachedBook) : []
    const deterministicFinishedBadges = cgsUniqueFinishedRunBadges([
      ...monitorFinishedBadges,
      ...eventFinishedBadges,
    ])
    const scopedSeedBadges = changed ? cgsScopeSeedBadgesForCompletion(seedBadges, deterministicFinishedBadges, attachedBook) : []
    const resolvedFinishedBadges = cgsUniqueFinishedRunBadges([
      ...deterministicFinishedBadges,
      ...scopedSeedBadges,
    ])
    const finalId = nextTimelineId('mcp-final')
    const completedSummary = cgsMcpFinalSummaryForCompletion(resultSummary, resolvedFinishedBadges, summary)

    deps.rvAgentSubmittedRef.current = false
    deps.rvAgentLastSubmitBadgesRef.current = []
    clearCgsMcpRunProgress()
    deps.setRvAgentTimeline((rows) => [
      ...rows,
      {
        id: finalId,
        type: 'final',
        success,
        summary,
        markdown,
        tooltipTitle: completedSummary?.title || resultSummary?.title || '运行结果',
        badges: resolvedFinishedBadges,
        resultSummary: completedSummary || resultSummary || undefined,
        outcome: outcome || undefined,
        successCardEligible: false,
        cardTone: outcome ? outcome.result === 'failed' ? 'warn' : outcome.result === 'changed' ? 'success' : undefined : success ? 'success' : 'warn',
      },
    ])
    if (!success) {
      deps.rvAgentFailedRef.current = true
      if (!cgsMcpStructuredErrorRef.current) {
        deps.setRvAgentRepair(rvAgentRepairFromClass('cgs_runtime_failed', summary))
      }
      return
    }
    if (!changed || (outcome && rvAgentOutcomeUsesAssistantRoute(outcome))) return

    deps.setRvAgentLibrarySyncing(true)
    try {
      let preSyncBooks: ShelfBook[] | undefined
      try {
        preSyncBooks = await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false, false)
      } catch {
        preSyncBooks = undefined
      }
      const refreshedBooks = await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false, true)
      const successTargets = cgsResolveSuccessTargets(
        refreshedBooks,
        deps.backendUrl,
        attachedBook,
        resolvedFinishedBadges,
        preSyncBooks,
      )
      deps.setRvAgentPreferenceState((state) => cgsMcpLearnPreferencesFromSuccessTargets(state, refreshedBooks, successTargets))
      deps.setRvAgentTimeline((rows) => rows.map((item) => {
        if (item.type !== 'final' || item.id !== finalId) return item
        return {
          ...item,
          successCardEligible: successTargets.length > 0,
          successTarget: successTargets[0],
          successTargets,
        }
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : '书库同步失败'
      deps.show('error', message)
      deps.setRvAgentRepair(rvAgentRepairFromClass('cgs_runtime_failed', message))
    } finally {
      deps.setRvAgentLibrarySyncing(false)
    }
  }

  function appendCgsMcpAggregateFinal(data: Record<string, unknown>) {
    const resultSummary = cgsMcpFinalSummaryFromData(data)
    const success = data.success !== false && !deps.rvAgentFailedRef.current
    const reportedSummary = cgsMcpDataText(data, 'summary')
    const summary = success
      ? reportedSummary || resultSummary?.summary || '完成'
      : reportedSummary && reportedSummary !== '完成' ? reportedSummary : resultSummary?.summary || '失败'
    deps.rvAgentSubmittedRef.current = false
    deps.rvAgentLastSubmitBadgesRef.current = []
    clearCgsMcpRunProgress()
    deps.setRvAgentTimeline((rows) => [
      ...rows,
      {
        id: nextTimelineId('mcp-final'),
        type: 'final',
        success,
        summary,
        markdown: cgsMcpFinalMarkdownFromData(data, summary),
        tooltipTitle: resultSummary?.title || '运行结果',
        badges: [],
        resultSummary: resultSummary || undefined,
        successCardEligible: false,
      },
    ])
    if (!success) {
      deps.rvAgentFailedRef.current = true
      if (!cgsMcpStructuredErrorRef.current) {
        deps.setRvAgentRepair(rvAgentRepairFromClass('cgs_runtime_failed', summary))
      }
    }
  }

  function cgsMcpBadgesFromStatusPayloadSummary(
    status: Record<string, unknown> | null,
    eventsPayload: Record<string, unknown> | null,
  ): string {
    if (!status) return ''
    const job = cgsObject(status.job)
    const stage = cgsString(job?.stage || status.stage).trim()
    if (stage) return stage
    const events = Array.isArray(eventsPayload?.events) ? eventsPayload?.events : []
    const logs = Array.isArray(eventsPayload?.logs) ? eventsPayload?.logs : []
    const recent = [...events, ...logs].slice(-1)[0]
    const row = cgsObject(recent)
    if (row) {
      const message = cgsString(row.message || row.detail || row.stage || row.name).trim()
      if (message) return message
    }
    return ''
  }

  function bridgeCgsMcpSearchPreview(args: Record<string, unknown>, result: Record<string, unknown>) {
    const payload = cgsMcpSearchPreviewPayload(args, result)
    if (!payload) return
    deps.setCgsStatus(null)
    deps.setCgsSubmitStatusInfoOpen(false)
    deps.setCgsSubmitStatusInfoText('')
    deps.cgsStatusToastKeyRef.current = ''
    deps.setCgsBooks(payload.books)
    deps.setCgsSessionId(payload.sessionId)
    deps.setCgsCurrentPage(payload.page)
    if (payload.selectedSite) deps.setSelectedSite(payload.selectedSite)
    if (payload.keyword) deps.setKeyword(payload.keyword)
    clearCgsSelections()
    deps.setEpisodesByBook({})
    deps.setEpisodeLoadByBook({})
    deps.setChapterPanelBookKey('')
    deps.setCgsConnection('online')
    deps.setCgsWorkspaceMode('manual')
    deps.show('ok', '已转入 acquire 预览')
  }

  function applyCgsMcpEvent(item: CgsMcpSseEvent, previewMode = false) {
    if (item.event === 'assistant_delta') {
      const text = cgsMcpDataText(item.data, 'text')
      if (text) deps.setRvAgentTimeline((rows) => appendMcpAssistantDelta(rows, text))
      return
    }
    const previewPayload = cgsMcpPreviewBridgeData(item, previewMode)
    if (previewPayload) {
      bridgeCgsMcpSearchPreview({}, previewPayload)
      return
    }
    if (item.event === 'tool_step') {
      const name = cgsMcpDataText(item.data, 'name') || 'tool'
      const result = cgsMcpDataObject(item.data, 'result')
      const args = cgsMcpDataObject(item.data, 'arguments') || {}
      const tone = cgsMcpToolTone(result)
      if (tone === 'error') deps.rvAgentFailedRef.current = true
      if (tone === 'warn') {
        const detail = cgsMcpToolSummary(result)
        cgsMcpWarnRef.current = rvAgentRepairFromClass('mcp_transport_unavailable', detail)
      }
      if (name === 'cgs_submit_books') {
        deps.rvAgentSubmittedRef.current = true
        deps.rvAgentLastSubmitBadgesRef.current = cgsMcpBadgesFromSubmitPayload(args, result || {})
      }
      deps.setRvAgentTimeline((rows) => [
        ...rows,
        {
          id: nextTimelineId('mcp-tool'),
          type: 'tool',
          name,
          arguments: args,
          result,
        },
      ])
      return
    }
    if (item.event === 'cgs_progress') {
      const status = cgsMcpDataText(item.data, 'status')
      if (cgsMcpFailureStatus(status)) deps.rvAgentFailedRef.current = true
      const progress = cgsMcpProgressFromData(item.data)
      // Route every progress write through updateCgsMcpRunProgress so progress
      // stays a session-level singleton even when SSE appends mid-stream.
      if (progress?.type === 'progress') updateCgsMcpRunProgress(progress)
      deps.setCgsStatus((state) => ({ ...(state || {}), progress: { percent: item.data.percent }, status: item.data.status || 'running' }))
      return
    }
    if (item.event === 'cgs_book_completed') {
      void finalizeCgsMcpBookCompleted(item.data)
      return
    }
    if (item.event === 'final') {
      const terminal = item.data.terminal !== false
      if (terminal) deps.setRvAgentRunning(false)
      if (item.data.attached_book_list_final === true) {
        appendCgsMcpAggregateFinal(item.data)
        return
      }
      if (!terminal) {
        deps.rvAgentSubmittedRef.current = false
        deps.rvAgentLastSubmitBadgesRef.current = []
        return
      }
      const resultSummary = cgsMcpFinalSummaryFromData(item.data)
      const monitorResult = cgsMcpDataObject(item.data, 'monitor_result')
      const backendMonitorCompleted = cgsMcpDataText(monitorResult, 'terminalStatus') === 'completed'
      const success = item.data.success !== false && !deps.rvAgentFailedRef.current
      const reportedSummary = cgsMcpDataText(item.data, 'summary')
      const summary = success
        ? reportedSummary || resultSummary?.summary || '完成'
        : reportedSummary && reportedSummary !== '完成' ? reportedSummary : resultSummary?.summary || '失败'
      const markdown = cgsMcpFinalMarkdownFromData(item.data, summary)
      if (success && cgsMcpWarnRef.current) {
        deps.setRvAgentRepair(cgsMcpWarnRef.current)
        deps.setRvAgentTimeline((rows) => [
          ...rows,
          {
            id: nextTimelineId('mcp-final'),
            type: 'final',
            success: true,
            summary,
            markdown,
            tooltipTitle: resultSummary?.title || '运行结果',
            badges: [],
            resultSummary: resultSummary || undefined,
            successCardEligible: false,
            cardTone: 'warn',
          },
        ])
      } else if (success && backendMonitorCompleted) {
        void finalizeCgsMcpCompletedDownload(summary, markdown, resultSummary)
      } else if (success && deps.rvAgentSubmittedRef.current) {
        void pollCgsDownloadProgressAfterMcp(summary, markdown, resultSummary)
      } else if (success) {
        deps.setRvAgentTimeline((rows) => [
          ...rows,
          {
            id: nextTimelineId('mcp-final'),
            type: 'final',
            success: true,
            summary,
            markdown,
            tooltipTitle: resultSummary?.title || '运行结果',
            badges: [],
            resultSummary: resultSummary || undefined,
            successCardEligible: false,
            cardTone: 'llm_interrupted',
          },
        ])
      } else if (!success) {
        deps.rvAgentFailedRef.current = true
        if (!cgsMcpStructuredErrorRef.current) {
          deps.setRvAgentRepair(rvAgentRepairFromClass('cgs_runtime_failed', summary))
        }
      }
      return
    }
    if (item.event === 'error') {
      const errorClass = cgsMcpErrorClassFromData(item.data)
      cgsMcpStructuredErrorRef.current = errorClass
      deps.rvAgentFailedRef.current = true
      if (errorClass === 'attach_book_invalid') invalidateAttachedBookState()
      deps.setRvAgentRepair(rvAgentRepairFromErrorEvent(item.data))
      deps.setRvAgentRunning(false)
    }
  }

  async function runCgsMcpPrompt(
    prompt: string,
    attachedBookList: CgsAttachedBook[],
    sessionIdOverride?: string,
  ) {
    const preferenceBookKinds = cgsMcpEffectivePreferenceBookKinds(attachedBookList)
    const previewMode = cgsMcpDoujinshiPreviewEnabled(deps.rvAgentPreferenceState, preferenceBookKinds)
    const abort = new AbortController()
    deps.rvAgentAbortRef.current = abort
    cgsMcpStructuredErrorRef.current = null
    cgsMcpWarnRef.current = null
    deps.rvAgentSubmittedRef.current = false
    deps.rvAgentFailedRef.current = false
    deps.rvAgentLastSubmitBadgesRef.current = []
    deps.cgsStatusToastKeyRef.current = ''
    deps.setCgsStatus(null)
    deps.setCgsWorkspaceMode('mcp')
    deps.setRvAgentRunning(true)
    deps.setRvAgentRepair(null)
    deps.setRvAgentHistoryOpen(false)
    deps.setRvAgentExpandedToolId(null)
    deps.setRvAgentTimeline((rows) => [...rows, { id: nextTimelineId('mcp-user'), type: 'user', text: prompt }])
    const sessionId = sessionIdOverride || ensureCgsMcpSessionId()
    const payload: CgsMcpChatPayload = {
      prompt: cgsMcpTransportPrompt(prompt, previewMode),
      llm: deps.cgsMcpLlmConfig,
      preview_mode: previewMode,
      session_id: sessionId,
    }
    const preferenceContext = cgsMcpPreferencePromptContext(deps.rvAgentPreferenceState, preferenceBookKinds)
    if (preferenceContext) payload.preference_context = preferenceContext
    const attachBookIds = attachedBookList.map((book) => book.attach_book_id.trim()).filter(Boolean)
    if (attachBookIds.length) {
      payload.attach_book_id = attachBookIds[0]
      payload.attach_book_ids = attachBookIds
    }
    try {
      const response = await fetch(buildUrl(deps.backendUrl, '/root/cgs/mcp/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...await deps.rootSecretHeaders(),
        },
        body: JSON.stringify(payload),
        signal: abort.signal,
      })
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
      await readCgsMcpSse(response, (event) => applyCgsMcpEvent(event, previewMode))
      deps.setCgsConnection('online')
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        deps.rvAgentFailedRef.current = true
        deps.setRvAgentRepair(rvAgentRepairFromClass('user_aborted', '已停止'))
      } else {
        deps.setCgsConnection('unreachable')
        const message = error instanceof Error ? error.message : 'RV Agent 对话失败'
        deps.rvAgentFailedRef.current = true
        deps.setRvAgentRepair(rvAgentRepairFromClass('mcp_transport_unavailable', message))
      }
    } finally {
      if (deps.rvAgentAbortRef.current === abort) deps.rvAgentAbortRef.current = null
      deps.setRvAgentRunning(false)
    }
  }

  async function sendRvAgentPrompt() {
    const prompt = deps.rvAgentPrompt.trim()
    if (!prompt || deps.rvAgentRunning) return
    if (!cgsMcpConfigured(deps.cgsMcpLlmConfig)) {
      deps.setRvAgentRepair(rvAgentRepairFromClass('llm_config_missing', ''))
      return
    }
    deps.setRvAgentRepair(null)
    const visibleAttachedBookList = deps.cgsAttachedBookList
    const attachedBookList = await resolveAttachedBooksForPrompt()
    if (visibleAttachedBookList.length && !attachedBookList) return
    deps.rvAgentLastRunRef.current = { prompt, attachedBookList: attachedBookList || [] }
    deps.setRvAgentPromptHistory((history) => saveCgsMcpPromptHistory(prompt, history))
    deps.setRvAgentPrompt('')
    await runCgsMcpPrompt(prompt, attachedBookList || [])
  }

  async function retryRvAgentRepair() {
    if (deps.rvAgentRunning) return
    const repair = deps.rvAgentRepair
    if (!repair || !repair.canRetry) return
    deps.setRvAgentRepair(null)
    if (repair.errorClass === 'llm_config_missing') {
      await sendRvAgentPrompt()
      return
    }
    const last = deps.rvAgentLastRunRef.current
    if (!last) {
      await sendRvAgentPrompt()
      return
    }
    if (repair.errorClass === 'mcp_transport_unavailable') {
      const connection = await probeCgsMcp()
      if (connection !== 'online') {
        deps.setRvAgentRepair(rvAgentRepairFromClass('mcp_transport_unavailable', 'MCP 仍不可达，请检查 CGS Server 连接'))
        return
      }
    }
    const attachedBookList = await resolveAttachedBooksForPrompt()
    if (!attachedBookList) return
    const retrySessionId = createCgsMcpSessionId()
    deps.setCgsSessionId(retrySessionId)
    deps.rvAgentLastRunRef.current = { prompt: last.prompt, attachedBookList }
    await runCgsMcpPrompt(last.prompt, attachedBookList, retrySessionId)
  }

  function dismissRvAgentRepair() {
    deps.setRvAgentRepair(null)
  }

  function stopRvAgentPrompt() {
    deps.rvAgentAbortRef.current?.abort()
  }

  function handleRvAgentPromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || deps.rvAgentComposerRef.current) return
    event.preventDefault()
    void sendRvAgentPrompt()
  }

  async function loadBookEpisodes(bookKey: string, force = false) {
    if (!deps.cgsSessionId || !bookKey) return
    if (!force && deps.episodesByBook[bookKey]?.length) {
      deps.setEpisodeLoadByBook((state) => ({ ...state, [bookKey]: { status: 'ready' } }))
      return
    }
    deps.setEpisodeLoadByBook((state) => ({ ...state, [bookKey]: { status: 'loading' } }))
    try {
      const response = await apiPost<{ book_key: string; episodes: CgsBookEpisode[] }>(
        deps.backendUrl,
        '/root/cgs/book-episodes',
        { session_id: deps.cgsSessionId, book_key: bookKey },
      )
      deps.setEpisodesByBook((state) => ({ ...state, [response.book_key]: response.episodes || [] }))
      deps.setEpisodeLoadByBook((state) => ({ ...state, [response.book_key]: { status: 'ready' } }))
      deps.setCgsConnection('online')
    } catch (error) {
      const message = error instanceof Error ? error.message : '章节读取失败'
      deps.setEpisodeLoadByBook((state) => ({ ...state, [bookKey]: { status: 'error', message } }))
      deps.show('error', message)
    }
  }

  function openChapterPanel(bookKey: string) {
    if (!bookKey) return
    deps.setChapterPanelBookKey(bookKey)
    void loadBookEpisodes(bookKey)
  }

  function closeChapterPanel() {
    deps.setChapterPanelBookKey('')
  }

  function selectAllBookEpisodes(bookKey: string) {
    deps.setSelectedEpisodeKeysByBook((state) =>
      cgsSetBookEpisodeKeys(state, bookKey, (deps.episodesByBook[bookKey] || []).map((episode) => episode.episode_key)),
    )
  }

  function selectFirstBookEpisodes(bookKey: string, count: number) {
    deps.setSelectedEpisodeKeysByBook((state) =>
      cgsSetBookEpisodeKeys(state, bookKey, cgsFirstEpisodeKeys(deps.episodesByBook[bookKey] || [], count)),
    )
  }

  function selectLatestBookEpisodes(bookKey: string, count: number) {
    deps.setSelectedEpisodeKeysByBook((state) =>
      cgsSetBookEpisodeKeys(state, bookKey, cgsLatestEpisodeKeys(deps.episodesByBook[bookKey] || [], count)),
    )
  }

  function clearBookEpisodes(bookKey: string) {
    deps.setSelectedEpisodeKeysByBook((state) => cgsSetBookEpisodeKeys(state, bookKey, []))
  }

  function toggleEpisodeKey(bookKey: string, episodeKey: string, checked: boolean) {
    deps.setSelectedEpisodeKeysByBook((state) => cgsToggleEpisodeKey(state, bookKey, episodeKey, checked))
  }

  async function searchCgs() {
    if (!deps.selectedSite || !deps.keyword.trim()) return
    deps.setBusy('cgs-search')
    deps.setCgsStatus(null)
    deps.setCgsSubmitStatusInfoOpen(false)
    deps.setCgsSubmitStatusInfoText('')
    deps.cgsStatusToastKeyRef.current = ''
    try {
      await apiPost<Record<string, unknown>>(deps.backendUrl, '/root/cgs/work/reset', {})
      deps.setCgsBooks([])
      deps.setCgsSessionId('')
      clearCgsSelections()
      deps.setEpisodesByBook({})
      deps.setEpisodeLoadByBook({})
      deps.setChapterPanelBookKey('')
      deps.setCgsStatus(null)
      deps.setCgsSubmitStatusInfoOpen(false)
      deps.setCgsSubmitStatusInfoText('')
      deps.cgsStatusToastKeyRef.current = ''
      const response = await apiPost<{ session_id?: string; page?: number; books: CgsBook[] }>(deps.backendUrl, '/root/cgs/search', {
        site: Number(deps.selectedSite),
        keyword: deps.keyword.trim(),
        page: 1,
      })
      deps.setCgsBooks(response.books || [])
      deps.setCgsSessionId(response.session_id || '')
      deps.setCgsCurrentPage(Number(response.page) || 1)
      deps.setCgsConnection('online')
      deps.show('ok', '搜索完成')
    } catch (error) {
      const message = cgsWorkResetErrorMessage(error, error instanceof Error ? error.message : '搜索失败')
      const resetBlocked = cgsWorkResetJobRunning(error)
      deps.setCgsConnection(resetBlocked ? 'online' : 'unreachable')
      deps.show(resetBlocked ? 'warn' : 'error', message)
    } finally {
      deps.setBusy('')
    }
  }

  async function turnCgsPage(page: number) {
    const targetPage = Math.max(1, Math.floor(page))
    if (!targetPage || !deps.selectedSite || !deps.keyword.trim() || !deps.cgsSessionId || deps.busy === 'cgs-page-turn') return
    deps.setBusy('cgs-page-turn')
    deps.setCgsStatus(null)
    deps.setCgsSubmitStatusInfoOpen(false)
    deps.setCgsSubmitStatusInfoText('')
    deps.cgsStatusToastKeyRef.current = ''
    try {
      const payload: {
        site: number
        keyword: string
        page: number
        session_id: string
        submit_book_keys?: string[]
      } = {
        site: Number(deps.selectedSite),
        keyword: deps.keyword.trim(),
        page: targetPage,
        session_id: deps.cgsSessionId,
      }
      if (deps.selectedKeys.length) payload.submit_book_keys = deps.selectedKeys
      const response = await apiPost<{ session_id?: string; page?: number; books: CgsBook[] }>(
        deps.backendUrl,
        '/root/cgs/search',
        payload,
        await deps.rootSecretHeaders(),
      )
      const nextPage = Number(response.page) || targetPage
      deps.setCgsBooks(response.books || [])
      deps.setCgsSessionId(response.session_id || deps.cgsSessionId)
      deps.setCgsCurrentPage(nextPage)
      deps.setCgsConnection('online')
      clearCgsSelections()
      deps.setEpisodesByBook({})
      deps.setEpisodeLoadByBook({})
      deps.setChapterPanelBookKey('')
      deps.show('ok', `已切换到第 ${nextPage} 页`)
    } catch (error) {
      deps.setCgsConnection('unreachable')
      deps.show('error', error instanceof Error ? error.message : '翻页失败')
    } finally {
      deps.setBusy('')
    }
  }

  async function submitCgs() {
    const episodeSelections = cgsEpisodeSelectionsPayload(deps.selectedEpisodeKeysByBook)
    const selectionCount = cgsSubmitSelectionCount(deps.selectedKeys, deps.selectedEpisodeKeysByBook)
    if (!selectionCount || !deps.cgsSessionId) return
    deps.setBusy('cgs-submit')
    deps.cgsStatusToastKeyRef.current = ''
    try {
      const response = await apiPost<Record<string, unknown>>(deps.backendUrl, '/root/cgs/submit-books', {
        session_id: deps.cgsSessionId,
        book_keys: deps.selectedKeys,
        episode_selections: episodeSelections,
      }, await deps.rootSecretHeaders())
      deps.setCgsStatus(response)
      deps.setCgsSubmitStatusInfoText(formatCgsSubmitStatusInfo(response))
      deps.setCgsConnection('online')
      clearCgsSelections()
      deps.setChapterPanelBookKey('')
      deps.show('ok', '已提交')
      const finalStatus = await pollCgsStatusUntilTerminal()
      deps.setCgsSubmitStatusInfoText(formatCgsSubmitStatusInfo(finalStatus, await readCgsEventsForSubmitStatusInfo()))
      if (getCgsStatusKey(finalStatus) === 'completed') {
        try {
          await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false, true)
        } catch (error) {
          deps.show('error', error instanceof Error ? error.message : '书库同步失败')
        }
      }
    } catch (error) {
      deps.setCgsConnection('unreachable')
      const message = cgsSubmitErrorMessage(error, deps.hasRootSecret())
      deps.setCgsSubmitStatusInfoText(formatCgsSubmitStatusInfo(deps.cgsStatus, null, message))
      deps.show('error', message)
    } finally {
      deps.setBusy('')
    }
  }

  function openCgsSubmitStatusInfo() {
    deps.setCgsSubmitStatusInfoOpen(true)
    deps.setCgsSubmitStatusInfoText(deps.cgsSubmitStatusInfoText || formatCgsSubmitStatusInfo(deps.cgsStatus))
  }

  function closeCgsSubmitStatusInfo() {
    deps.setCgsSubmitStatusInfoOpen(false)
  }

  async function repairCgsMissingPages() {
    if (!deps.cgsStatus || deps.busy === 'cgs-submit' || deps.busy === 'cgs-repair') return
    deps.setBusy('cgs-repair')
    deps.cgsStatusToastKeyRef.current = ''
    try {
      const jobId = cgsJobId(deps.cgsStatus)
      const response = await apiPost<Record<string, unknown>>(
        deps.backendUrl,
        '/root/cgs/repair-missing-pages',
        jobId ? { job_id: jobId } : {},
        await deps.rootSecretHeaders(),
      )
      deps.setCgsStatus(response)
      deps.setCgsSubmitStatusInfoText(formatCgsSubmitStatusInfo(response))
      deps.setCgsConnection('online')
      deps.show('ok', '补漏已提交')
      const finalStatus = await pollCgsStatusUntilTerminal()
      deps.setCgsSubmitStatusInfoText(formatCgsSubmitStatusInfo(finalStatus, await readCgsEventsForSubmitStatusInfo()))
      if (getCgsStatusKey(finalStatus) === 'completed') {
        try {
          await deps.refreshLibrary(deps.backendUrl, deps.sort, false, false, true)
        } catch (error) {
          deps.show('error', error instanceof Error ? error.message : '书库同步失败')
        }
      }
    } catch (error) {
      const message = cgsRootActionErrorMessage(error, 'CGS 补漏失败', deps.hasRootSecret())
      deps.setCgsSubmitStatusInfoText(formatCgsSubmitStatusInfo(deps.cgsStatus, null, message))
      deps.show(message.includes('409') || message.includes('job_running') ? 'warn' : 'error', message)
    } finally {
      deps.setBusy('')
    }
  }

  async function pollCgsStatusUntilTerminal(): Promise<Record<string, unknown> | null> {
    let latest: Record<string, unknown> | null = null
    for (let index = 0; index < CGS_STATUS_POLL_LIMIT; index += 1) {
      const status = await readCgsStatus()
      latest = status
      const statusKey = getCgsStatusKey(status)
      if (CGS_STATUS_TERMINAL.has(statusKey)) return status
      await sleep(CGS_STATUS_POLL_INTERVAL_MS)
    }
    return latest
  }

  async function refreshCgsStatus() {
    try {
      const status = await readCgsStatus()
      deps.setCgsSubmitStatusInfoText(formatCgsSubmitStatusInfo(status))
    } catch (error) {
      deps.setCgsConnection('unreachable')
      deps.show('error', error instanceof Error ? error.message : '状态读取失败')
    }
  }

  async function readCgsStatus(): Promise<Record<string, unknown>> {
    const status = await apiGet<Record<string, unknown>>(deps.backendUrl, '/root/cgs/status')
    deps.setCgsStatus(status)
    deps.setCgsConnection('online')
    deps.showCgsStatusToast(status)
    return status
  }

  async function readCgsEventsForSubmitStatusInfo(): Promise<Record<string, unknown> | null> {
    try {
      return await apiGet<Record<string, unknown>>(deps.backendUrl, '/root/cgs/events')
    } catch (error) {
      return {
        events: [],
        logs: [{ type: 'error', message: error instanceof Error ? error.message : 'CGS 事件读取失败' }],
      }
    }
  }

  useEffect(() => {
    if (
      deps.cgsWorkspaceMode !== 'mcp'
      || !deps.cgsPendingAttachBookId
      || deps.cgsSearchBookInfo?.id !== deps.cgsPendingAttachBookId
    ) {
      return
    }
    void syncPendingAttachedBook()
  }, [
    deps.cgsAttachedBook,
    deps.cgsPendingAttachBookId,
    deps.cgsSearchBookInfo,
    deps.cgsWorkspaceMode,
  ])

  return {
    completeCgsGateFlight,
    clearBookEpisodes,
    closeCgsSubmitStatusInfo,
    closeChapterPanel,
    finishCgsSubmitDrag,
    handleRvAgentPromptKeyDown,
    loadCgsConfig,
    loadCgsSites,
    moveCgsSubmitDrag,
    openCgsSubmitStatusInfo,
    openChapterPanel,
    probeCgsMcp,
    refreshCgsStatus,
    repairCgsMissingPages,
    retryBookEpisodes: (bookKey: string) => loadBookEpisodes(bookKey, true),
    runCgsGateLoad,
    removeRvAgentHistoryPrompt,
    saveRvAgentLlmConfig,
    searchCgs,
    selectAllBookEpisodes,
    selectFirstBookEpisodes,
    selectLatestBookEpisodes,
    turnCgsPage,
    dismissRvAgentRepair,
    detachAttachedBook,
    retryRvAgentRepair,
    sendRvAgentPrompt,
    startRvAgentNewSession,
    startCgsSubmitDrag,
    stopRvAgentPrompt,
    submitCgs,
    switchCgsWorkspaceMode,
    syncCgsSavePathFromBookshelf,
    toggleEpisodeKey,
    updateCgsConfig,
  }
}

export function useMobileAcquireControllerModel(appState: AppState, deps: MobileAcquireControllerDeps) {
  const {
    backendUrl,
    busy,
    cgsConfigDraft,
    cgsGatePhase,
    cgsAttachedBook,
    cgsAttachedBookList,
    cgsMcpLlmConfig,
    cgsMcpLlmDraft,
    rvAgentLibrarySyncing,
    rvAgentPrompt,
    rvAgentPreferenceState,
    rvAgentRepair,
    rvAgentRunning,
    cgsModeSwap,
    cgsPendingAttachBookId,
    cgsSearchBookInfo,
    cgsSessionId,
    cgsCurrentPage,
    cgsStatus,
    cgsSubmitStatusInfoText,
    cgsSubmitPosition,
    cgsWorkspaceMode,
    episodesByBook,
    keyword,
    selectedEpisodeKeysByBook,
    selectedKeys,
    selectedSite,
    sort,
    cgsManualGateRef,
    rvAgentAbortRef,
    rvAgentComposerRef,
    rvAgentFailedRef,
    rvAgentLastRunRef,
    rvAgentGateRef,
    rvAgentSubmittedRef,
    rvAgentLastSubmitBadgesRef,
    cgsStatusDotRef,
    cgsStatusHeadRef,
    cgsSubmitDragRef,
    setChapterPanelBookKey,
    setBusy,
    setCgsBooks,
    setCgsAttachedBook,
    setCgsAttachedBookList,
    setCgsConfig,
    setCgsConfigBusy,
    setCgsConfigDraft,
    setCgsConnection,
    setCgsGateFlight,
    setCgsGateLoadingMode,
    setCgsGatePhase,
    setCgsHeadGateFlight,
    setCgsSubmitStatusInfoOpen,
    setCgsSubmitStatusInfoText,
    setRvAgentExpandedToolId,
    setRvAgentHistoryOpen,
    setRvAgentLibrarySyncing,
    setCgsMcpLlmConfig,
    setRvAgentPrompt,
    setRvAgentPreferenceState,
    setRvAgentPromptHistory,
    setRvAgentRepair,
    setRvAgentRunning,
    setRvAgentTimeline,
    setCgsModeSwap,
    setCgsPendingAttachBookId,
    setCgsSearchBookInfo,
    setCgsSessionId,
    setCgsCurrentPage,
    setCgsStatus,
    setCgsSubmitPosition,
    setCgsWorkspaceMode,
    setEpisodeLoadByBook,
    setEpisodesByBook,
    setKeyword,
    setSelectedEpisodeKeysByBook,
    setSelectedKeys,
    setSelectedSite,
    setSites,
  } = appState

  return useAcquireWorkspaceController({
    backendUrl,
    busy,
    cgsBookshelfPath: deps.cgsBookshelfPath,
    cgsConfigDraft,
    cgsGateBusy: deps.cgsGateBusy,
    cgsGatePhase,
    cgsAttachedBook,
    cgsAttachedBookList,
    cgsMcpLlmConfig,
    cgsMcpLlmDraft,
    rvAgentLibrarySyncing,
    rvAgentPrompt,
    rvAgentPreferenceState,
    rvAgentRepair,
    rvAgentRunning,
    cgsModeSwap,
    cgsPendingAttachBookId,
    cgsSearchBookInfo,
    cgsSessionId,
    cgsCurrentPage,
    cgsStatus,
    cgsSubmitStatusInfoText,
    cgsSubmitPosition,
    cgsWorkspaceMode,
    episodesByBook,
    hasRootSecret,
    keyword,
    refreshLibrary: deps.refreshLibrary,
    rootSecretHeaders,
    selectedEpisodeKeysByBook,
    selectedKeys,
    selectedSite,
    sites: appState.sites,
    show: deps.show,
    showCgsStatusToast: deps.showCgsStatusToast,
    sort,
    cgsManualGateRef,
    rvAgentAbortRef,
    rvAgentComposerRef,
    rvAgentFailedRef,
    rvAgentLastRunRef,
    rvAgentGateRef,
    rvAgentSubmittedRef,
    rvAgentLastSubmitBadgesRef,
    cgsStatusDotRef,
    cgsStatusHeadRef,
    cgsStatusToastKeyRef: deps.cgsStatusToastKeyRef,
    cgsSubmitDragRef,
    setChapterPanelBookKey,
    setBusy,
    setCgsBooks,
    setCgsAttachedBook,
    setCgsAttachedBookList,
    setCgsConfig,
    setCgsConfigBusy,
    setCgsConfigDraft,
    setCgsConnection,
    setCgsGateFlight,
    setCgsGateLoadingMode,
    setCgsGatePhase,
    setCgsHeadGateFlight,
    setCgsSubmitStatusInfoOpen,
    setCgsSubmitStatusInfoText,
    setRvAgentExpandedToolId,
    setRvAgentHistoryOpen,
    setRvAgentLibrarySyncing,
    setCgsMcpLlmConfig,
    setRvAgentPrompt,
    setRvAgentPreferenceState,
    setRvAgentPromptHistory,
    setRvAgentRepair,
    setRvAgentRunning,
    setRvAgentTimeline,
    setCgsModeSwap,
    setCgsPendingAttachBookId,
    setCgsSearchBookInfo,
    setCgsSessionId,
    setCgsCurrentPage,
    setCgsStatus,
    setCgsSubmitPosition,
    setCgsWorkspaceMode,
    setEpisodeLoadByBook,
    setEpisodesByBook,
    setKeyword,
    setSelectedEpisodeKeysByBook,
    setSelectedKeys,
    setSelectedSite,
    setSites,
  })
}
