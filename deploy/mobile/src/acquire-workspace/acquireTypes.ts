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
}
export type DoujinTagPanel = {
  bookId: string
  bookTitle: string
  tags: string[]
  selectedTag: string
  mode?: 'filter' | 'preview'
}
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
  candidates: CgsSearchCandidate[]
}
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
export type CgsMcpDetailBlock = {
  kind: 'text' | 'code'
  text: string
  language?: string
}
export type CgsMcpTimelineItem =
  | { id: string; type: 'user' | 'assistant'; text: string }
  | { id: string; type: 'tool'; name: string; arguments: Record<string, unknown>; result: Record<string, unknown> }
  | { id: string; type: 'progress'; percent: number | null; status: string; summary: string }
  | { id: string; type: 'final'; success: boolean; summary: string }
export type CgsMcpSseEvent = {
  event: string
  data: Record<string, unknown>
}

export type CgsServerPanelView = {
  active: boolean
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

export type CgsMcpToolTone = 'ok' | 'warn' | 'error'

export type CgsMcpPanelView = {
  active: boolean
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
  running: boolean
  showGate: boolean
  steps: CgsStep[]
  timeline: CgsMcpTimelineItem[]
}

export type CgsMcpPanelSelectors = {
  toolDetailBlocks: (item: Extract<CgsMcpTimelineItem, { type: 'tool' }>) => CgsMcpDetailBlock[]
  toolSummary: (result: Record<string, unknown>) => string
  toolTone: (result: Record<string, unknown>) => CgsMcpToolTone
}

export type CgsMcpPanelActions = {
  endPromptComposition: () => void
  handlePromptKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  runGateLoad: (mode: CgsWorkspaceMode) => Promise<void> | void
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

export type CgsMcpDrawerView = {
  draft: CgsMcpLlmConfig
  modelHelpOpen: boolean
}

export type CgsMcpDrawerActions = {
  saveConfig: () => void
  setDraft: (updater: (draft: CgsMcpLlmConfig) => CgsMcpLlmConfig) => void
  toggleModelHelp: () => void
}

export type AcquireWorkspaceView = {
  clearDisabled: boolean
  flights: CgsGateFlight[]
  locked: boolean
  mode: CgsWorkspaceMode | null
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
  moveSubmitDrag: PointerEventHandler<HTMLButtonElement>
  startSubmitDrag: PointerEventHandler<HTMLButtonElement>
  submit: () => Promise<void> | void
}

export type AcquireWorkspaceRefs = {
  manualGate: RefObject<HTMLButtonElement | null>
  mcpGate: RefObject<HTMLButtonElement | null>
  mcpScroll: RefObject<HTMLDivElement | null>
}
