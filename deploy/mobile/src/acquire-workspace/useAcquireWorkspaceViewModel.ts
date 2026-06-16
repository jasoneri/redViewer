import { createElement, useMemo, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import { Search } from 'lucide-react'
import { CustomIcon } from '../icons/CustomIcon'
import type { CgsBook, CgsBookEpisode, CgsConfig, CgsSite } from '../mobileStore'
import {
  cgsBookSelectMode,
  cgsBookTitle,
  cgsCoverOverlayTags,
  cgsCoverUrl,
  cgsMcpToolDetailBlocks,
  cgsMcpToolSummary,
  cgsMcpToolTone,
  cgsMcpWorseTone,
  cgsSubmitSelectionCount,
  cgsTags,
  getCgsStatusKey,
} from './acquireCore'
import type { AcquireDrawerSettingsProps, AcquireWorkspaceProps } from './AcquireWorkspace'
import type {
  CgsConfigDraft,
  CgsConnectionState,
  CgsEpisodeLoadState,
  CgsGateFlight,
  CgsGatePhase,
  CgsMcpLlmConfig,
  CgsMcpTimelineItem,
  CgsMcpToolTone,
  CgsSearchBookInfo,
  CgsStep,
  CgsSubmitPosition,
  CgsWorkspaceMode,
  DoujinTagPanel,
} from './acquireTypes'

type View = 'library' | 'downloads' | 'reader' | 'acquire'

type AcquireWorkspaceViewModelDeps = {
  backendUrl: string
  bookshelfPath: string
  busy: string
  cgsBooks: CgsBook[]
  cgsConfig: CgsConfig | null
  cgsConfigBusy: string
  cgsConfigDraft: CgsConfigDraft
  cgsConnection: CgsConnectionState
  cgsGateBusy: boolean
  cgsGateFlight: CgsGateFlight | null
  cgsGateLoadingMode: CgsWorkspaceMode | null
  cgsGatePhase: CgsGatePhase
  cgsHeadGateFlight: CgsGateFlight | null
  chapterPanelBookKey: string
  cgsMcpBookAttached: boolean
  cgsMcpExpandedToolId: string | null
  cgsMcpHistoryOpen: boolean
  cgsMcpLibrarySyncing: boolean
  cgsMcpLlmDraft: CgsMcpLlmConfig
  cgsMcpModelHelpOpen: boolean
  cgsMcpPrompt: string
  cgsMcpPromptHistory: string[]
  cgsMcpRunning: boolean
  cgsMcpTimeline: CgsMcpTimelineItem[]
  cgsModeSwapBusy: boolean
  cgsSearchBookInfo: CgsSearchBookInfo | null
  cgsSessionId: string
  cgsStatus: Record<string, unknown> | null
  cgsSubmitPosition: CgsSubmitPosition
  cgsWorkspaceMode: CgsWorkspaceMode | null
  doujinTagPanel: DoujinTagPanel | null
  episodeLoadByBook: Record<string, CgsEpisodeLoadState>
  episodesByBook: Record<string, CgsBookEpisode[]>
  keyword: string
  selectedEpisodeKeysByBook: Record<string, string[]>
  selectedKeys: string[]
  selectedSite: string
  sites: CgsSite[]
  view: View
  cgsManualGateRef: RefObject<HTMLButtonElement | null>
  cgsMcpComposerRef: MutableRefObject<boolean>
  cgsMcpGateRef: RefObject<HTMLButtonElement | null>
  cgsMcpScrollRef: RefObject<HTMLDivElement | null>
  clearBookEpisodes: (bookKey: string) => void
  clearSelection: () => void
  closeChapterPanel: () => void
  closeDoujinTagPanel: () => void
  completeCgsGateFlight: () => void
  finishCgsSubmitDrag: AcquireWorkspaceProps['acquireActions']['finishSubmitDrag']
  handleCgsMcpPromptKeyDown: AcquireWorkspaceProps['mcpActions']['handlePromptKeyDown']
  moveCgsSubmitDrag: AcquireWorkspaceProps['acquireActions']['moveSubmitDrag']
  openCgsTagPanel: (bookId: string, bookTitle: string, tags: string[]) => void
  openChapterPanel: (bookKey: string) => void
  retryBookEpisodes: (bookKey: string) => Promise<void> | void
  runCgsGateLoad: (mode: CgsWorkspaceMode) => Promise<void> | void
  saveMcpLlmConfig: () => void
  searchCgs: () => Promise<void> | void
  selectAllBookEpisodes: (bookKey: string) => void
  selectCgsSearchCandidate: (candidate: NonNullable<CgsSearchBookInfo['candidates']>[number]) => void
  selectDoujinTag: (tag: string) => void
  selectFirstBookEpisodes: (bookKey: string, count: number) => void
  selectLatestBookEpisodes: (bookKey: string, count: number) => void
  sendCgsMcpPrompt: () => Promise<void> | void
  startCgsSubmitDrag: AcquireWorkspaceProps['acquireActions']['startSubmitDrag']
  stopCgsMcpPrompt: () => void
  submitCgs: () => Promise<void> | void
  syncCgsSavePathFromBookshelf: () => void
  updateCgsConfig: () => Promise<boolean> | boolean
  setCgsConfigDraft: Dispatch<SetStateAction<CgsConfigDraft>>
  setCgsMcpBookAttached: Dispatch<SetStateAction<boolean>>
  setCgsMcpExpandedToolId: Dispatch<SetStateAction<string | null>>
  setCgsMcpHistoryOpen: Dispatch<SetStateAction<boolean>>
  setCgsMcpLlmDraft: Dispatch<SetStateAction<CgsMcpLlmConfig>>
  setCgsMcpModelHelpOpen: Dispatch<SetStateAction<boolean>>
  setCgsMcpPrompt: Dispatch<SetStateAction<string>>
  setKeyword: Dispatch<SetStateAction<string>>
  setSelectedKeys: Dispatch<SetStateAction<string[]>>
  setSelectedSite: Dispatch<SetStateAction<string>>
  toggleEpisodeKey: (bookKey: string, episodeKey: string, checked: boolean) => void
}

export function useAcquireWorkspaceViewModel(deps: AcquireWorkspaceViewModelDeps) {
  const cgsStatusKey = getCgsStatusKey(deps.cgsStatus)
  const cgsDone = cgsStatusKey === 'completed'
  const cgsImportLoading = deps.busy === 'cgs-submit' && Boolean(deps.cgsStatus) && !cgsDone && cgsStatusKey !== 'failed'
  const cgsSearchCandidates = deps.cgsSearchBookInfo?.candidates || []
  const cgsConnectionOnline = deps.cgsConnection === 'online'
  // RVUX001: selected CGS/MCP modes are exclusive; disconnect only re-gates the active panel.
  const acquireGateLocked = deps.view === 'acquire' && (!deps.cgsWorkspaceMode || !cgsConnectionOnline)
  const gateCanRender = deps.view === 'acquire' && deps.cgsGatePhase !== 'flying'
  const initialGateMode = !deps.cgsWorkspaceMode
  const showManualGate = gateCanRender && (initialGateMode || (!cgsConnectionOnline && deps.cgsWorkspaceMode === 'manual') || (deps.cgsGatePhase === 'loading' && deps.cgsGateLoadingMode === 'manual'))
  const showMcpGate = gateCanRender && (initialGateMode || (!cgsConnectionOnline && deps.cgsWorkspaceMode === 'mcp') || (deps.cgsGatePhase === 'loading' && deps.cgsGateLoadingMode === 'mcp'))
  const manualContentHidden = deps.cgsWorkspaceMode === 'mcp'
  const mcpContentHidden = deps.cgsWorkspaceMode === 'manual'
  const cgsSubmitCount = cgsSubmitSelectionCount(deps.selectedKeys, deps.selectedEpisodeKeysByBook)
  const cgsSubmitDisabled = !cgsSubmitCount || !deps.cgsSessionId || deps.busy === 'cgs-submit'
  const showCgsFloatingSubmit = deps.view === 'acquire' && cgsConnectionOnline && deps.cgsWorkspaceMode === 'manual'
  const cgsMcpCanSend = Boolean(deps.cgsMcpPrompt.trim() && !deps.cgsMcpRunning)
  const cgsDownloadedHandleOptions = deps.cgsConfig?.downloaded_handle_options?.length ? deps.cgsConfig.downloaded_handle_options : ['-', '.cbz']
  const cgsConfigLoading = deps.cgsConfigBusy === 'load'
  const cgsInactiveMode: CgsWorkspaceMode | null = deps.cgsWorkspaceMode === 'manual' ? 'mcp' : deps.cgsWorkspaceMode === 'mcp' ? 'manual' : null

  const cgsSteps: CgsStep[] = [
    { key: 'site', title: '站点', state: deps.sites.length ? 'done' : 'current', icon: createElement(CustomIcon, { name: 'cgsSite', size: 15 }) },
    { key: 'search', title: '搜索', state: deps.cgsBooks.length ? 'done' : deps.sites.length ? 'current' : 'pending', icon: createElement(Search, { size: 15 }) },
    { key: 'submit', title: '提交', state: deps.cgsStatus ? 'done' : deps.cgsBooks.length ? 'current' : 'pending', icon: createElement(CustomIcon, { name: 'cgsSubmit', size: 15 }) },
    { key: 'library', title: '入库', state: cgsDone ? 'done' : deps.cgsStatus ? 'current' : 'pending', icon: createElement(CustomIcon, { name: 'cgsLibrary', size: 15 }), loading: cgsImportLoading, ariaLabel: cgsImportLoading ? '入库中' : undefined },
  ]

  const cgsMcpRunTimeline = useMemo(() => {
    const lastUserIndex = deps.cgsMcpTimeline.reduce((lastIndex, item, index) => item.type === 'user' ? index : lastIndex, -1)
    return lastUserIndex >= 0 ? deps.cgsMcpTimeline.slice(lastUserIndex) : deps.cgsMcpTimeline
  }, [deps.cgsMcpTimeline])

  const cgsMcpToolTones = useMemo(() => {
    const tones = new Map<string, CgsMcpToolTone>()
    cgsMcpRunTimeline.forEach((item) => {
      if (item.type !== 'tool') return
      tones.set(item.name, cgsMcpWorseTone(tones.get(item.name), cgsMcpToolTone(item.result)))
    })
    return tones
  }, [cgsMcpRunTimeline])

  const cgsMcpFinal = [...cgsMcpRunTimeline].reverse().find((item): item is Extract<CgsMcpTimelineItem, { type: 'final' }> => item.type === 'final')
  const cgsMcpToolErrored = Array.from(cgsMcpToolTones.values()).some((tone) => tone === 'error')
  const cgsMcpFailed = cgsMcpToolErrored || Boolean(cgsMcpFinal && !cgsMcpFinal.success)
  const cgsMcpSiteTone = cgsMcpToolTones.get('cgs_list_sites')
  const cgsMcpSearchTone = cgsMcpToolTones.get('cgs_search_books')
  const cgsMcpSubmitTone = cgsMcpToolTones.get('cgs_submit_books')
  const cgsMcpMappedStepErrored = cgsMcpSiteTone === 'error' || cgsMcpSearchTone === 'error' || cgsMcpSubmitTone === 'error'
  const cgsMcpSiteDone = Boolean(cgsMcpSiteTone && cgsMcpSiteTone !== 'error')
  const cgsMcpSearchDone = Boolean(cgsMcpSearchTone && cgsMcpSearchTone !== 'error')
  const cgsMcpSubmitDone = Boolean(cgsMcpSubmitTone && cgsMcpSubmitTone !== 'error')
  const cgsMcpSteps: CgsStep[] = [
    { key: 'site', title: '站点', state: cgsMcpSiteTone === 'error' ? 'error' : cgsMcpSiteDone ? 'done' : deps.cgsMcpRunning ? 'current' : 'pending', icon: createElement(CustomIcon, { name: 'cgsSite', size: 15 }) },
    { key: 'search', title: '搜索', state: cgsMcpSearchTone === 'error' ? 'error' : cgsMcpSiteTone === 'error' ? 'pending' : cgsMcpSearchDone ? 'done' : cgsMcpSiteDone ? 'current' : 'pending', icon: createElement(Search, { size: 15 }) },
    { key: 'submit', title: '提交', state: cgsMcpSubmitTone === 'error' ? 'error' : cgsMcpSiteTone === 'error' || cgsMcpSearchTone === 'error' ? 'pending' : cgsMcpSubmitDone ? 'done' : cgsMcpSearchDone ? 'current' : 'pending', icon: createElement(CustomIcon, { name: 'cgsSubmit', size: 15 }) },
    {
      key: 'library',
      title: '入库',
      state: deps.cgsMcpLibrarySyncing ? 'current' : cgsMcpFinal?.success && !cgsMcpToolErrored ? 'done' : cgsMcpFailed && !cgsMcpMappedStepErrored ? 'error' : cgsMcpSubmitDone ? 'current' : 'pending',
      icon: createElement(CustomIcon, { name: 'cgsLibrary', size: 15 }),
      loading: deps.cgsMcpLibrarySyncing,
      ariaLabel: deps.cgsMcpLibrarySyncing ? '同步书库中' : undefined,
    },
  ]

  const workspaceProps: AcquireWorkspaceProps = {
    acquireView: {
      clearDisabled: cgsSubmitCount === 0 || deps.busy === 'cgs-submit',
      flights: [deps.cgsGateFlight, deps.cgsHeadGateFlight].filter((flight): flight is CgsGateFlight => Boolean(flight)),
      locked: acquireGateLocked,
      mode: deps.cgsWorkspaceMode,
      resultCount: deps.cgsBooks.length,
      selectedCount: cgsSubmitCount,
      showFloatingSubmit: showCgsFloatingSubmit,
      submitDisabled: cgsSubmitDisabled,
      submitPosition: deps.cgsSubmitPosition,
    },
    serverView: {
      active: deps.cgsWorkspaceMode === 'manual',
      backendUrl: deps.backendUrl,
      books: deps.cgsBooks,
      busy: deps.busy,
      chapterPanelBookKey: deps.chapterPanelBookKey,
      disabled: false,
      doujinTagPanel: deps.doujinTagPanel,
      episodeLoadByBook: deps.episodeLoadByBook,
      episodesByBook: deps.episodesByBook,
      gateLoadingMode: deps.cgsGateLoadingMode,
      gatePhase: deps.cgsGatePhase,
      hidden: manualContentHidden,
      keyword: deps.keyword,
      searchBookInfo: deps.cgsSearchBookInfo,
      searchCandidates: cgsSearchCandidates,
      selectedEpisodeKeysByBook: deps.selectedEpisodeKeysByBook,
      selectedKeys: deps.selectedKeys,
      selectedSite: deps.selectedSite,
      showGate: showManualGate,
      sites: deps.sites,
      steps: cgsSteps,
    },
    serverSelectors: {
      bookTitle: cgsBookTitle,
      coverOverlayTags: cgsCoverOverlayTags,
      coverUrl: cgsCoverUrl,
      selectMode: cgsBookSelectMode,
      tags: cgsTags,
    },
    serverActions: {
      clearBookEpisodes: deps.clearBookEpisodes,
      closeChapterPanel: deps.closeChapterPanel,
      closeDoujinTagPanel: deps.closeDoujinTagPanel,
      openChapterPanel: deps.openChapterPanel,
      openTagPanel: deps.openCgsTagPanel,
      retryBookEpisodes: deps.retryBookEpisodes,
      runGateLoad: deps.runCgsGateLoad,
      search: deps.searchCgs,
      selectAllBookEpisodes: deps.selectAllBookEpisodes,
      selectDoujinTag: deps.selectDoujinTag,
      selectFirstBookEpisodes: deps.selectFirstBookEpisodes,
      selectLatestBookEpisodes: deps.selectLatestBookEpisodes,
      selectSearchCandidate: deps.selectCgsSearchCandidate,
      setKeyword: deps.setKeyword,
      setSelectedSite: deps.setSelectedSite,
      toggleBookKey: (key, checked) => deps.setSelectedKeys((rows) => (checked ? [...rows, key] : rows.filter((row) => row !== key))),
      toggleEpisodeKey: deps.toggleEpisodeKey,
    },
    mcpView: {
      active: deps.cgsWorkspaceMode === 'mcp',
      bookAttached: Boolean(deps.cgsSearchBookInfo && deps.cgsMcpBookAttached),
      busy: deps.busy,
      canSend: cgsMcpCanSend,
      disabled: false,
      expandedToolId: deps.cgsMcpExpandedToolId,
      gateLoadingMode: deps.cgsGateLoadingMode,
      gatePhase: deps.cgsGatePhase,
      hidden: mcpContentHidden,
      historyOpen: deps.cgsMcpHistoryOpen,
      prompt: deps.cgsMcpPrompt,
      promptHistory: deps.cgsMcpPromptHistory,
      running: deps.cgsMcpRunning,
      searchBookInfo: deps.cgsSearchBookInfo,
      showGate: showMcpGate,
      steps: cgsMcpSteps,
      timeline: deps.cgsMcpTimeline,
    },
    mcpSelectors: {
      toolDetailBlocks: cgsMcpToolDetailBlocks,
      toolSummary: cgsMcpToolSummary,
      toolTone: cgsMcpToolTone,
    },
    mcpActions: {
      detachBook: () => deps.setCgsMcpBookAttached(false),
      endPromptComposition: () => { deps.cgsMcpComposerRef.current = false },
      handlePromptKeyDown: deps.handleCgsMcpPromptKeyDown,
      runGateLoad: deps.runCgsGateLoad,
      setExpandedToolId: deps.setCgsMcpExpandedToolId,
      setHistoryOpen: deps.setCgsMcpHistoryOpen,
      setPrompt: deps.setCgsMcpPrompt,
      startPromptComposition: () => { deps.cgsMcpComposerRef.current = true },
      togglePromptRun: () => deps.cgsMcpRunning ? deps.stopCgsMcpPrompt() : deps.sendCgsMcpPrompt(),
      useHistoryPrompt: (prompt) => {
        deps.setCgsMcpPrompt(prompt)
        deps.setCgsMcpHistoryOpen(false)
      },
    },
    acquireActions: {
      clearSelection: deps.clearSelection,
      completeGateFlight: deps.completeCgsGateFlight,
      finishSubmitDrag: deps.finishCgsSubmitDrag,
      moveSubmitDrag: deps.moveCgsSubmitDrag,
      startSubmitDrag: deps.startCgsSubmitDrag,
      submit: deps.submitCgs,
    },
    acquireRefs: {
      manualGate: deps.cgsManualGateRef,
      mcpGate: deps.cgsMcpGateRef,
      mcpScroll: deps.cgsMcpScrollRef,
    },
  }

  const drawerSettingsProps: AcquireDrawerSettingsProps = {
    serverDrawerView: {
      bookshelfPath: deps.bookshelfPath,
      busy: deps.cgsConfigBusy,
      config: deps.cgsConfig,
      draft: deps.cgsConfigDraft,
      downloadedHandleOptions: cgsDownloadedHandleOptions,
      loading: cgsConfigLoading,
    },
    serverDrawerActions: {
      saveConfig: deps.updateCgsConfig,
      setDraft: deps.setCgsConfigDraft,
      syncSavePathFromBookshelf: deps.syncCgsSavePathFromBookshelf,
    },
    mcpDrawerView: {
      draft: deps.cgsMcpLlmDraft,
      modelHelpOpen: deps.cgsMcpModelHelpOpen,
    },
    mcpDrawerActions: {
      saveConfig: deps.saveMcpLlmConfig,
      setDraft: deps.setCgsMcpLlmDraft,
      toggleModelHelp: () => deps.setCgsMcpModelHelpOpen((open) => !open),
    },
  }

  return {
    cgsInactiveMode,
    cgsModeSwapBusy: deps.cgsModeSwapBusy,
    drawerSettingsProps,
    workspaceProps,
  }
}
