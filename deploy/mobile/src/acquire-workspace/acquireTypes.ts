import type { KeyboardEvent as ReactKeyboardEvent, PointerEventHandler, ReactNode, RefObject } from 'react'
import type { CgsBook, CgsBookEpisode, CgsConfig, CgsSite } from '../mobileStore'
import type { CoverOverlayTag } from '../shared/Cover'

export type CgsConnectionState = 'unknown' | 'online' | 'unreachable'
export type CgsGatePhase = 'idle' | 'loading' | 'flying' | 'done'
export type CgsStepState = 'done' | 'current' | 'pending' | 'error'
export type CgsWorkspaceMode = 'manual' | 'mcp'
export type CgsGateFlightTarget = 'rail' | 'head'
export type CgsGateFlight = {
  left: number
  top: number
  width: number
  height: number
  dx: number
  dy: number
  scaleX: number
  scaleY: number
  connection: CgsConnectionState
  mode: CgsWorkspaceMode
  target: CgsGateFlightTarget
}
export type CgsModeSwap = {
  toMode: CgsWorkspaceMode
  headDx: number
  headDy: number
  railDx: number
  railDy: number
}
export type CgsSubmitPosition = {
  x: number
  y: number
}
export type CgsSubmitDragState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  lastPosition: CgsSubmitPosition
}
export type CgsStep = {
  key: string
  title: string
  state: CgsStepState
  icon: ReactNode
  loading?: boolean
  ariaLabel?: string
  className?: string
  disabled?: boolean
  expanded?: boolean
  flyout?: ReactNode
  onClick?: () => void
}
export type DoujinTagPanel = {
  bookId: string
  bookTitle: string
  tags: string[]
  selectedTag: string
  mode?: 'filter' | 'preview'
}
export type RvAgentPreferenceBookKind = 'doujinshi' | 'manga'
export type CgsSearchCandidate = {
  key: string
  label: string
  value: string
}
export type CgsSearchBookInfo = {
  id: string
  book: string
  title: string
  artist: string | null
  source: string | null
  tags: string[]
  // Structured book-type metadata (R4). Mirrors backend BookContext; preferred
  // over filename heuristics for distinguishing doujinshi from manga.
  btype: string | null
  category: string | null
  type: string | null
  book_kind?: RvAgentPreferenceBookKind | 'unknown'
  local_library_kind?: 'single' | 'series'
  select_mode?: 'book' | 'chapters' | string
  candidates: CgsSearchCandidate[]
}
export type CgsAttachedBook = {
  attach_book_id: string
  id: string
  book: string
  title: string
  source: string | null
  book_kind?: RvAgentPreferenceBookKind | 'unknown'
  searchInfo?: CgsSearchBookInfo
}
export type CgsAttachedBookList = CgsAttachedBook[]
export type CgsEpisodeLoadStatus = 'idle' | 'loading' | 'ready' | 'error'
export type CgsEpisodeLoadState = {
  status: CgsEpisodeLoadStatus
  code?: string
  message?: string
}
export type CgsEpisodeSelectionPayload = {
  book_key: string
  episode_keys: string[]
}
export type CgsConfigDraft = {
  downloaded_handle: string
  proxies_text: string
  sv_path: string
}
export type CgsMcpLlmConfig = {
  base_url: string
  api_key: string
  model: string
}
export type CgsMcpPreferenceScope = {
  panel: 'cgs-mcp'
  book_kind?: 'doujinshi' | 'manga' | 'unknown'
  site?: string | null
  language?: string | null
}
export type CgsMcpPreferenceSource = 'manual' | 'learned'
export type CgsMcpPreferenceMode = 'neutral' | 'match' | 'exclude'
export type CgsMcpPreferenceItem = {
  text: string
  mode: CgsMcpPreferenceMode
  source: CgsMcpPreferenceSource
  hit_count: number
  scope: CgsMcpPreferenceScope
  created_at: string
  updated_at: string
  last_used_at?: string | null
}
export type CgsMcpPreferenceSettings = {
  auto_activate_threshold: number
  per_conversation_learn_cap: number
  preview_switch: boolean
}
export type CgsMcpPreferenceState = {
  schema_version: 1
  preferences: CgsMcpPreferenceItem[]
  settings: CgsMcpPreferenceSettings
}
export type CgsMcpPreferencePromptItem = {
  text: string
  source: CgsMcpPreferenceSource
  hit_count: number
  scope: CgsMcpPreferenceScope
}
export type CgsMcpPreferencePromptContext = {
  schema_version: 1
  match_preferences: CgsMcpPreferencePromptItem[]
  exclude_preferences: CgsMcpPreferencePromptItem[]
  settings: CgsMcpPreferenceSettings
}
export type CgsLocalLibraryEpisode = {
  book: string
  ep: string
  title: string | null
}
export type CgsLocalLibraryBook = {
  kind: 'single' | 'series'
  book: string
  title: string | null
  episode_count: number
  episodes: CgsLocalLibraryEpisode[]
}
// Book context attached to an MCP chat turn (legacy/compat path).
export type CgsBookContext = {
  book: string
  title: string | null
  artist: string | null
  source: string | null
  tags: string[]
  btype: string | null
  category: string | null
  type: string | null
  local_library?: CgsLocalLibraryBook | null
}
// RVUX001: MCP chat reads attachedBook state by id; it never carries book_context.
// MCP chat request payload (R0.5 closure). attachedBook is an explicit pinned
// state; mobile references it only by attach_book_id and never sends book_context.
export type CgsMcpChatPayload = {
  prompt: string
  llm: CgsMcpLlmConfig
  preview_mode?: boolean
  session_id?: string
  attach_book_id?: string
  attach_book_ids?: string[]
  preference_context?: CgsMcpPreferencePromptContext
}
export type CgsMcpDetailBlock = {
  kind: 'text' | 'code'
  text: string
  language?: string
}
export type CgsMcpFinalSummaryRow = {
  label: string
  value: string
  tone?: 'default' | 'ok' | 'warn' | 'error'
}
export type CgsMcpFinalSummaryBlock =
  | { type: 'text'; text: string }
  | { type: 'rows'; rows: CgsMcpFinalSummaryRow[] }
  | { type: 'badges'; badges: CgsRunBadge[] }
export type CgsMcpFinalSummary = {
  schema_version: 1
  status: 'completed' | 'partial' | 'failed'
  title: string
  headline: string
  summary: string
  blocks: CgsMcpFinalSummaryBlock[]
  finished_badges: CgsRunBadge[]
  warnings: string[]
}
export type RvAgentOutcomeResult =
  | 'changed'
  | 'satisfied'
  | 'waiting_user'
  | 'blocked'
  | 'skipped'
  | 'cancelled'
  | 'failed'
export type RvAgentOutcomeReason =
  | 'downloaded'
  | 'already_downloaded'
  | 'already_latest'
  | 'not_published'
  | 'remote_missing'
  | 'ambiguous_selection'
  | 'preference_skipped'
  | 'preview_only'
  | 'user_cancelled'
  | 'external_unavailable'
  | 'runtime_error'
export type RvAgentOutcome = {
  schema_version: 1
  result: RvAgentOutcomeResult
  reason: RvAgentOutcomeReason
  subject: {
    attach_book_id?: string
    book_id?: string
    book_title?: string
    source?: string
    episode_key?: string
    episode_label?: string
  }
  evidence: Array<{
    kind: 'local_library' | 'remote_catalog' | 'monitor' | 'tool_result' | 'user_choice' | 'policy'
    label: string
    value: string
  }>
  assistant_message: {
    title: string
    body: string
  }
}
export type RvAgentSuccessTarget = {
  kind: 'detail' | 'reader'
  shelfBookId: string
  itemId?: string
  title: string
  actionLabel: string
  coverSrc: string
  overlayTags: CoverOverlayTag[]
}
export type RvAgentTimelineItem =
  | { id: string; type: 'user' | 'assistant'; text: string }
  | { id: string; type: 'tool'; name: string; arguments: Record<string, unknown>; result: Record<string, unknown> }
  | { id: string; type: 'progress'; percent: number | null; status: string; summary: string; badges: CgsRunBadge[]; completed: boolean; finishedBadges?: CgsRunBadge[] }
  | { id: string; type: 'final'; success: boolean; summary: string; markdown?: string; tooltipTitle?: string; badges?: CgsRunBadge[]; resultSummary?: CgsMcpFinalSummary; outcome?: RvAgentOutcome; successCardEligible?: boolean; cardTone?: 'success' | 'warn' | 'llm_interrupted'; successTarget?: RvAgentSuccessTarget; successTargets?: RvAgentSuccessTarget[] }
  | { id: string; type: 'decision'; title: string; message: string; options: CgsMcpDecisionOption[]; preferredOptionId?: string; resolvedOptionId?: string }
  | { id: string; type: 'confirmation'; title: string; message: string; confirmLabel: string; cancelLabel: string; resolved?: 'confirm' | 'cancel' }
export type CgsMcpSseEvent = {
  event: string
  data: Record<string, unknown>
}

export type CgsMcpDecisionOption = {
  id: string
  label: string
  description?: string
}

export type CgsMcpErrorClass =
  | 'llm_config_missing'
  | 'llm_provider_rejected'
  | 'llm_model_access_denied'
  | 'llm_protocol_invalid'
  | 'mcp_transport_unavailable'
  | 'attach_book_invalid'
  | 'cgs_runtime_failed'
  | 'user_aborted'
export type CgsMcpLlmField = 'base_url' | 'api_key' | 'model'
export type RvAgentRepairState = {
  errorClass: CgsMcpErrorClass
  title: string
  message: string
  fields: CgsMcpLlmField[]
  raw: string
  canRetry: boolean
}

export type CgsRunBadge = {
  type: 'book' | 'ep'
  text: string
  id?: string
  bookKey?: string
  bookTitle?: string
  episodeKey?: string
  state?: 'running' | 'finished' | 'failed'
}

export type RvAgentStatusZoneView = {
  hasFinished: boolean
  detailsText: string
  finishedBadges: CgsRunBadge[]
}

export type RvAgentRunProgressView = {
  badges: CgsRunBadge[]
  finishedBadges: CgsRunBadge[]
  percent: number
  completed: boolean
}

export type CgsServerPanelView = {
  active: boolean
  activeAttachedBookId: string
  attachedBookList: CgsAttachedBook[]
  backendUrl: string
  books: CgsBook[]
  busy: string
  chapterPanelBookKey: string
  disabled: boolean
  doujinTagPanel: DoujinTagPanel | null
  episodeLoadByBook: Record<string, CgsEpisodeLoadState>
  episodesByBook: Record<string, CgsBookEpisode[]>
  gateLoadingMode: CgsWorkspaceMode | null
  gatePhase: CgsGatePhase
  hidden: boolean
  keyword: string
  searchBookInfo: CgsSearchBookInfo | null
  searchCandidates: CgsSearchCandidate[]
  selectedEpisodeKeysByBook: Record<string, string[]>
  selectedKeys: string[]
  selectedSite: string
  showGate: boolean
  sites: CgsSite[]
  steps: CgsStep[]
}

export type CgsServerPanelSelectors = {
  bookTitle: (book: CgsBook) => string
  coverOverlayTags: (book: CgsBook) => CoverOverlayTag[]
  coverUrl: (backendUrl: string, book: CgsBook) => string
  selectMode: (book: CgsBook) => 'book' | 'chapters'
  tags: (book: CgsBook) => string[]
}

export type CgsServerPanelActions = {
  clearBookEpisodes: (bookKey: string) => void
  closeDoujinTagPanel: () => void
  closeChapterPanel: () => void
  openTagPanel: (bookId: string, bookTitle: string, tags: string[]) => void
  openChapterPanel: (bookKey: string) => void
  retryBookEpisodes: (bookKey: string) => Promise<void> | void
  runGateLoad: (mode: CgsWorkspaceMode) => Promise<void> | void
  search: () => Promise<void> | void
  selectAttachedBook: (book: CgsAttachedBook) => void
  selectAllBookEpisodes: (bookKey: string) => void
  selectDoujinTag: (tag: string) => void
  selectFirstBookEpisodes: (bookKey: string, count: number) => void
  selectLatestBookEpisodes: (bookKey: string, count: number) => void
  selectSearchCandidate: (candidate: CgsSearchCandidate) => void
  setKeyword: (value: string) => void
  setSelectedSite: (value: string) => void
  toggleBookKey: (key: string, checked: boolean) => void
  toggleEpisodeKey: (bookKey: string, episodeKey: string, checked: boolean) => void
}

export type RvAgentToolTone = 'ok' | 'warn' | 'error'

export type RvAgentPanelView = {
  active: boolean
  attachedBook: CgsAttachedBook | null
  attachedBookList: CgsAttachedBook[]
  busy: string
  canSend: boolean
  disabled: boolean
  expandedToolId: string | null
  gateLoadingMode: CgsWorkspaceMode | null
  gatePhase: CgsGatePhase
  hidden: boolean
  historyOpen: boolean
  prompt: string
  promptHistory: string[]
  repair: RvAgentRepairState | null
  running: boolean
  runProgress: RvAgentRunProgressView | null
  showGate: boolean
  statusZone: RvAgentStatusZoneView
  steps: CgsStep[]
  timeline: RvAgentTimelineItem[]
  toastWarnIconSrc: string
  toastSuccessIconSrc: string
}

export type RvAgentPanelSelectors = {
  toolDetailBlocks: (item: Extract<RvAgentTimelineItem, { type: 'tool' }>) => CgsMcpDetailBlock[]
  toolSummary: (result: Record<string, unknown>) => string
  toolTone: (result: Record<string, unknown>) => RvAgentToolTone
}

export type RvAgentPanelActions = {
  detachBook: (attachBookId?: string) => void
  dismissRepair: () => void
  endPromptComposition: () => void
  handlePromptKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  openSuccessTarget: (target: RvAgentSuccessTarget) => Promise<void> | void
  openRepairSettings: () => void
  removeHistoryPrompt: (prompt: string) => void
  retryRepair: () => Promise<void> | void
  runGateLoad: (mode: CgsWorkspaceMode) => Promise<void> | void
  startNewSession: () => void
  setExpandedToolId: (id: string | null | ((current: string | null) => string | null)) => void
  setHistoryOpen: (open: boolean | ((current: boolean) => boolean)) => void
  setPrompt: (value: string) => void
  startPromptComposition: () => void
  togglePromptRun: () => Promise<void> | void
  useHistoryPrompt: (prompt: string) => void
}

export type CgsServerDrawerView = {
  bookshelfPath: string
  busy: string
  config: CgsConfig | null
  draft: CgsConfigDraft
  downloadedHandleOptions: string[]
  loading: boolean
}

export type CgsServerDrawerActions = {
  saveConfig: () => Promise<boolean> | boolean
  setDraft: (updater: (draft: CgsConfigDraft) => CgsConfigDraft) => void
  syncSavePathFromBookshelf: () => void
}

export type RvAgentDrawerView = {
  draft: CgsMcpLlmConfig
  modelHelpOpen: boolean
  preferenceOpen: boolean
  preferenceState: CgsMcpPreferenceState
}

export type RvAgentDrawerActions = {
  addPreferenceItem: (text: string, scope?: Partial<CgsMcpPreferenceScope>) => void
  closePreferences: () => void
  deletePreferenceItem: (text: string, scope?: Partial<CgsMcpPreferenceScope>) => void
  openPreferences: () => void
  saveConfig: () => void
  setDraft: (updater: (draft: CgsMcpLlmConfig) => CgsMcpLlmConfig) => void
  setPreferenceSetting: <K extends keyof CgsMcpPreferenceSettings>(key: K, value: CgsMcpPreferenceSettings[K]) => void
  toggleModelHelp: () => void
  togglePreferenceItem: (text: string, scope?: Partial<CgsMcpPreferenceScope>) => void
}


export type AcquireWorkspaceView = {
  clearDisabled: boolean
  currentPage: number
  flights: CgsGateFlight[]
  locked: boolean
  mode: CgsWorkspaceMode | null
  pageTurnDisabled: boolean
  pageTurnLoading: boolean
  resultCount: number
  selectedCount: number
  showFloatingSubmit: boolean
  submitDisabled: boolean
  submitPosition: CgsSubmitPosition
}

export type AcquireWorkspaceActions = {
  clearSelection: () => void
  completeGateFlight: () => void
  finishSubmitDrag: PointerEventHandler<HTMLButtonElement>
  jumpPage: (page: number) => Promise<void> | void
  moveSubmitDrag: PointerEventHandler<HTMLButtonElement>
  nextPage: () => Promise<void> | void
  selectAllCurrentPage: () => void
  startSubmitDrag: PointerEventHandler<HTMLButtonElement>
  submit: () => Promise<void> | void
}

export type AcquireWorkspaceRefs = {
  manualGate: RefObject<HTMLButtonElement | null>
  rvAgentGate: RefObject<HTMLButtonElement | null>
  rvAgentScroll: RefObject<HTMLDivElement | null>
}
