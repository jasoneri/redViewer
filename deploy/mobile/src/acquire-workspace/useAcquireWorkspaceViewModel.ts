import { createElement, useMemo, type Dispatch, type MouseEvent as ReactMouseEvent, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import { CustomIcon } from '../icons/CustomIcon'
import type { CgsBook, CgsBookEpisode, CgsConfig, CgsSite } from '../mobileStore'
import {
  cgsBookSelectMode,
  cgsBookTitle,
  cgsCoverOverlayTags,
  cgsCoverUrl,
  cgsMcpAddManualPreferenceItem,
  cgsMcpDeletePreferenceItem,
  cgsMcpSetPreferenceSetting,
  cgsMcpToolDetailBlocks,
  cgsMcpToolSummary,
  cgsMcpToolTone,
  cgsMcpTogglePreferenceItem,
  cgsMcpWorseTone,
  cgsNormalizeFinishedRunBadges,
  cgsSubmitSelectionCount,
  cgsTags,
  getCgsStatusKey,
} from './acquireCore'
import type { AcquireDrawerSettingsProps, AcquireWorkspaceProps } from './AcquireWorkspace'
import type {
  CgsAttachedBook,
  CgsConfigDraft,
  CgsConnectionState,
  CgsEpisodeLoadState,
  CgsGateFlight,
  CgsGatePhase,
  CgsMcpLlmConfig,
  CgsMcpPreferenceState,
  RvAgentRepairState,
  RvAgentSuccessTarget,
  RvAgentTimelineItem,
  RvAgentToolTone,
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
  cgsAttachedBook: CgsAttachedBook | null
  cgsAttachedBookList: CgsAttachedBook[]
  rvAgentExpandedToolId: string | null
  rvAgentHistoryOpen: boolean
  rvAgentLibrarySyncing: boolean
  cgsMcpLlmDraft: CgsMcpLlmConfig
  rvAgentModelHelpOpen: boolean
  rvAgentPreferenceOpen: boolean
  rvAgentPreferenceState: CgsMcpPreferenceState
  rvAgentPrompt: string
  rvAgentPromptHistory: string[]
  rvAgentRepair: RvAgentRepairState | null
  rvAgentRunning: boolean
  rvAgentTimeline: RvAgentTimelineItem[]
  cgsModeSwapBusy: boolean
  cgsSearchBookInfo: CgsSearchBookInfo | null
  cgsSessionId: string
  cgsCurrentPage: number
  cgsStatus: Record<string, unknown> | null
  cgsSubmitStatusInfoOpen: boolean
  cgsSubmitStatusInfoText: string
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
  toastWarnIconSrc: string
  toastSuccessIconSrc: string
  view: View
  cgsManualGateRef: RefObject<HTMLButtonElement | null>
  rvAgentComposerRef: MutableRefObject<boolean>
  rvAgentGateRef: RefObject<HTMLButtonElement | null>
  rvAgentScrollRef: RefObject<HTMLDivElement | null>
  clearBookEpisodes: (bookKey: string) => void
  clearSelection: () => void
  closeCgsSubmitStatusInfo: () => void
  closeChapterPanel: () => void
  closeDoujinTagPanel: () => void
  closeSettingsDrawer: () => void
  completeCgsGateFlight: () => void
  finishCgsSubmitDrag: AcquireWorkspaceProps['acquireActions']['finishSubmitDrag']
  handleRvAgentPromptKeyDown: AcquireWorkspaceProps['rvAgentActions']['handlePromptKeyDown']
  moveCgsSubmitDrag: AcquireWorkspaceProps['acquireActions']['moveSubmitDrag']
  openCgsSubmitStatusInfo: () => void
  openCgsTagPanel: (bookId: string, bookTitle: string, tags: string[]) => void
  openSuccessTarget: (target: RvAgentSuccessTarget) => Promise<void> | void
  openChapterPanel: (bookKey: string) => void
  removeRvAgentHistoryPrompt: (prompt: string) => void
  repairCgsMissingPages: () => Promise<void> | void
  retryBookEpisodes: (bookKey: string) => Promise<void> | void
  runCgsGateLoad: (mode: CgsWorkspaceMode) => Promise<void> | void
  saveRvAgentLlmConfig: () => void
  searchCgs: () => Promise<void> | void
  selectAllBookEpisodes: (bookKey: string) => void
  selectCgsSearchCandidate: (candidate: NonNullable<CgsSearchBookInfo['candidates']>[number]) => void
  selectDoujinTag: (tag: string) => void
  selectFirstBookEpisodes: (bookKey: string, count: number) => void
  selectLatestBookEpisodes: (bookKey: string, count: number) => void
  dismissRvAgentRepair: () => void
  detachAttachedBook: (attachBookId?: string) => Promise<void> | void
  retryRvAgentRepair: () => Promise<void> | void
  openRvAgentLlmConfig: () => void
  sendRvAgentPrompt: () => Promise<void> | void
  startRvAgentNewSession: () => void
  startCgsSubmitDrag: AcquireWorkspaceProps['acquireActions']['startSubmitDrag']
  stopRvAgentPrompt: () => void
  submitCgs: () => Promise<void> | void
  turnCgsPage: (page: number) => Promise<void> | void
  syncCgsSavePathFromBookshelf: () => void
  updateCgsConfig: () => Promise<boolean> | boolean
  setCgsConfigDraft: Dispatch<SetStateAction<CgsConfigDraft>>
  setRvAgentExpandedToolId: Dispatch<SetStateAction<string | null>>
  setRvAgentHistoryOpen: Dispatch<SetStateAction<boolean>>
  setCgsMcpLlmDraft: Dispatch<SetStateAction<CgsMcpLlmConfig>>
  setRvAgentModelHelpOpen: Dispatch<SetStateAction<boolean>>
  setRvAgentPreferenceOpen: Dispatch<SetStateAction<boolean>>
  setRvAgentPreferenceState: Dispatch<SetStateAction<CgsMcpPreferenceState>>
  setRvAgentPrompt: Dispatch<SetStateAction<string>>
  setCgsSearchBookInfo: Dispatch<SetStateAction<CgsSearchBookInfo | null>>
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
  const showRvAgentGate = gateCanRender && (initialGateMode || (!cgsConnectionOnline && deps.cgsWorkspaceMode === 'mcp') || (deps.cgsGatePhase === 'loading' && deps.cgsGateLoadingMode === 'mcp'))
  const manualContentHidden = deps.cgsWorkspaceMode === 'mcp'
  const mcpContentHidden = deps.cgsWorkspaceMode === 'manual'
  const cgsSubmitCount = cgsSubmitSelectionCount(deps.selectedKeys, deps.selectedEpisodeKeysByBook)
  const cgsPageTurnLoading = deps.busy === 'cgs-page-turn'
  const cgsSubmitDisabled = !cgsSubmitCount || !deps.cgsSessionId || deps.busy === 'cgs-submit' || cgsPageTurnLoading
  const cgsPageTurnDisabled = !deps.cgsSessionId || deps.busy === 'cgs-search' || deps.busy === 'cgs-submit' || cgsPageTurnLoading
  const showCgsFloatingSubmit = deps.view === 'acquire' && cgsConnectionOnline && deps.cgsWorkspaceMode === 'manual'
  const rvAgentCanSend = Boolean(deps.rvAgentPrompt.trim() && !deps.rvAgentRunning)
  const cgsDownloadedHandleOptions = deps.cgsConfig?.downloaded_handle_options?.length ? deps.cgsConfig.downloaded_handle_options : ['-', '.cbz']
  const cgsConfigLoading = deps.cgsConfigBusy === 'load'
  const cgsInactiveMode: CgsWorkspaceMode | null = deps.cgsWorkspaceMode === 'manual' ? 'mcp' : deps.cgsWorkspaceMode === 'mcp' ? 'manual' : null
  const cgsRepairBusy = deps.busy === 'cgs-repair'
  const cgsSubmitStatusInfoText = deps.cgsSubmitStatusInfoText || 'status: 未提交'
  const cgsSubmitStatusInfoFlyout = deps.cgsSubmitStatusInfoOpen
    ? createElement(
      'div',
      { className: 'cgs-submit-jump-flyout cgs-submit-status-info-flyout tail-top-right', role: 'tooltip' },
      createElement(
        'div',
        { className: 'cgs-submit-status-info-polygon-wrap', 'aria-hidden': true },
        createElement(
          'svg',
          { className: 'cgs-submit-status-info-polygon', fill: 'none', viewBox: '0 0 12 8' },
          createElement('path', { className: 'cgs-submit-status-info-polygon-fill', d: 'M0 8L6 0L12 8Z' }),
          createElement('path', { className: 'cgs-submit-status-info-polygon-stroke', d: 'M0.75 7.5L6 1L11.25 7.5' }),
        ),
      ),
      createElement(
        'div',
        { className: 'cgs-submit-status-info-panel' },
        createElement('textarea', { readOnly: true, value: cgsSubmitStatusInfoText, 'aria-label': 'CGS 入库状态信息' }),
        createElement(
          'div',
          { className: 'cgs-submit-status-info-actions' },
          createElement(
            'button',
            {
              type: 'button',
              className: 'icon-only repairBtn',
              disabled: cgsRepairBusy || deps.busy === 'cgs-submit' || !deps.cgsStatus,
              onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
                event.stopPropagation()
                void deps.repairCgsMissingPages()
              },
              'aria-label': '补漏',
              title: '补漏',
            },
            cgsRepairBusy
              ? createElement(LoaderCircle, { className: 'spin', size: 14 })
              : createElement(CustomIcon, { name: 'repair', size: 14 }),
          ),
          createElement(
            'button',
            {
              type: 'button',
              className: 'icon-only closeBtn',
              onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
                event.stopPropagation()
                deps.closeCgsSubmitStatusInfo()
              },
              'aria-label': '关闭',
              title: '关闭',
            },
            createElement(X, { size: 14 }),
          ),
        ),
      ),
    )
    : null

  const cgsSteps: CgsStep[] = [
    { key: 'site', title: '站点', state: deps.sites.length ? 'done' : 'current', icon: createElement(CustomIcon, { name: 'cgsSite', size: 15 }) },
    { key: 'search', title: '搜索', state: deps.cgsBooks.length ? 'done' : deps.sites.length ? 'current' : 'pending', icon: createElement(Search, { size: 15 }) },
    { key: 'submit', title: '提交', state: deps.cgsStatus ? 'done' : deps.cgsBooks.length ? 'current' : 'pending', icon: createElement(CustomIcon, { name: 'cgsSubmit', size: 15 }) },
    {
      key: 'library',
      title: '入库',
      state: cgsDone ? 'done' : deps.cgsStatus ? 'current' : 'pending',
      icon: createElement(CustomIcon, { name: 'cgsLibrary', size: 15 }),
      loading: cgsImportLoading,
      ariaLabel: cgsImportLoading ? '入库中' : 'CGS 入库状态',
      className: 'showSubmitStatusInfo',
      disabled: !deps.cgsStatus,
      expanded: deps.cgsSubmitStatusInfoOpen,
      flyout: cgsSubmitStatusInfoFlyout,
      onClick: deps.cgsStatus ? deps.openCgsSubmitStatusInfo : undefined,
    },
  ]

  const cgsMcpRunTimeline = useMemo(() => {
    const lastUserIndex = deps.rvAgentTimeline.reduce((lastIndex, item, index) => item.type === 'user' ? index : lastIndex, -1)
    return lastUserIndex >= 0 ? deps.rvAgentTimeline.slice(lastUserIndex) : deps.rvAgentTimeline
  }, [deps.rvAgentTimeline])

  const rvAgentRunProgress = useMemo(() => {
    const progressRows = cgsMcpRunTimeline.filter((item): item is Extract<RvAgentTimelineItem, { type: 'progress' }> => item.type === 'progress')
    const progress = [...progressRows].reverse().find((item) => item.badges.length || item.finishedBadges?.length || item.percent !== null)
    if (!progress) return null
    const finishedBadges = cgsNormalizeFinishedRunBadges(progressRows.flatMap((item) => item.finishedBadges?.length ? item.finishedBadges : item.completed ? item.badges : []))
    return {
      badges: progress.badges,
      finishedBadges,
      percent: progress.percent ?? 0,
      completed: progress.completed,
    }
  }, [cgsMcpRunTimeline])

  const cgsMcpFinalFinishedBadges = useMemo(() => {
    const badges = cgsMcpRunTimeline.flatMap((item) =>
      item.type === 'final' && item.success && item.cardTone === 'success'
        ? item.badges || []
        : [],
    )
    return cgsNormalizeFinishedRunBadges(badges)
  }, [cgsMcpRunTimeline])
  const rvAgentFinishedBadges = cgsNormalizeFinishedRunBadges([
    ...cgsMcpFinalFinishedBadges,
    ...(rvAgentRunProgress?.finishedBadges || []),
  ])
  const rvAgentStatusDetails = deps.cgsSubmitStatusInfoText || (deps.cgsStatus ? `status: ${cgsStatusKey}` : 'status: 未提交')

  const cgsMcpToolTones = useMemo(() => {
    const tones = new Map<string, RvAgentToolTone>()
    cgsMcpRunTimeline.forEach((item) => {
      if (item.type !== 'tool') return
      tones.set(item.name, cgsMcpWorseTone(tones.get(item.name), cgsMcpToolTone(item.result)))
    })
    return tones
  }, [cgsMcpRunTimeline])

  const cgsMcpFinal = [...cgsMcpRunTimeline].reverse().find((item): item is Extract<RvAgentTimelineItem, { type: 'final' }> => item.type === 'final')
  const cgsMcpToolErrored = Array.from(cgsMcpToolTones.values()).some((tone) => tone === 'error')
  const cgsMcpFailed = cgsMcpToolErrored || Boolean(cgsMcpFinal && !cgsMcpFinal.success)
  const cgsMcpSiteTone = cgsMcpToolTones.get('cgs_list_sites')
  const cgsMcpSearchTone = cgsMcpToolTones.get('cgs_search_books')
  const cgsMcpSubmitTone = cgsMcpToolTones.get('cgs_submit_books')
  const cgsMcpMappedStepErrored = cgsMcpSiteTone === 'error' || cgsMcpSearchTone === 'error' || cgsMcpSubmitTone === 'error'
  const cgsMcpSiteDone = Boolean(cgsMcpSiteTone && cgsMcpSiteTone !== 'error')
  const cgsMcpSearchDone = Boolean(cgsMcpSearchTone && cgsMcpSearchTone !== 'error')
  const cgsMcpSubmitDone = Boolean(cgsMcpSubmitTone && cgsMcpSubmitTone !== 'error')
  const rvAgentSteps: CgsStep[] = [
    { key: 'site', title: '站点', state: cgsMcpSiteTone === 'error' ? 'error' : cgsMcpSiteDone ? 'done' : deps.rvAgentRunning ? 'current' : 'pending', icon: createElement(CustomIcon, { name: 'cgsSite', size: 15 }) },
    { key: 'search', title: '搜索', state: cgsMcpSearchTone === 'error' ? 'error' : cgsMcpSiteTone === 'error' ? 'pending' : cgsMcpSearchDone ? 'done' : cgsMcpSiteDone ? 'current' : 'pending', icon: createElement(Search, { size: 15 }) },
    { key: 'submit', title: '提交', state: cgsMcpSubmitTone === 'error' ? 'error' : cgsMcpSiteTone === 'error' || cgsMcpSearchTone === 'error' ? 'pending' : cgsMcpSubmitDone ? 'done' : cgsMcpSearchDone ? 'current' : 'pending', icon: createElement(CustomIcon, { name: 'cgsSubmit', size: 15 }) },
    {
      key: 'library',
      title: '入库',
      state: deps.rvAgentLibrarySyncing ? 'current' : cgsMcpFinal?.success && !cgsMcpToolErrored ? 'done' : cgsMcpFailed && !cgsMcpMappedStepErrored ? 'error' : cgsMcpSubmitDone ? 'current' : 'pending',
      icon: createElement(CustomIcon, { name: 'cgsLibrary', size: 15 }),
      loading: deps.rvAgentLibrarySyncing,
      ariaLabel: deps.rvAgentLibrarySyncing ? '同步书库中' : undefined,
    },
  ]

  const workspaceProps: AcquireWorkspaceProps = {
    acquireView: {
      clearDisabled: cgsSubmitCount === 0 || deps.busy === 'cgs-submit',
      currentPage: deps.cgsCurrentPage,
      flights: [deps.cgsGateFlight, deps.cgsHeadGateFlight].filter((flight): flight is CgsGateFlight => Boolean(flight)),
      locked: acquireGateLocked,
      mode: deps.cgsWorkspaceMode,
      pageTurnDisabled: cgsPageTurnDisabled,
      pageTurnLoading: cgsPageTurnLoading,
      resultCount: deps.cgsBooks.length,
      selectedCount: cgsSubmitCount,
      showFloatingSubmit: showCgsFloatingSubmit,
      submitDisabled: cgsSubmitDisabled,
      submitPosition: deps.cgsSubmitPosition,
    },
    serverView: {
      active: deps.cgsWorkspaceMode === 'manual',
      activeAttachedBookId: deps.cgsSearchBookInfo?.id && deps.cgsAttachedBookList.some((book) => book.id === deps.cgsSearchBookInfo?.id)
        ? deps.cgsSearchBookInfo.id
        : deps.cgsAttachedBook?.id || '',
      attachedBookList: deps.cgsAttachedBookList,
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
      selectAttachedBook: (book) => {
        if (!book.searchInfo) return
        deps.setCgsSearchBookInfo(book.searchInfo)
        const nextCandidate = book.searchInfo.candidates[0]
        if (nextCandidate) deps.setKeyword(nextCandidate.value)
      },
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
    rvAgentView: {
      active: deps.cgsWorkspaceMode === 'mcp',
      attachedBook: deps.cgsAttachedBook,
      attachedBookList: deps.cgsAttachedBookList,
      busy: deps.busy,
      canSend: rvAgentCanSend,
      disabled: false,
      expandedToolId: deps.rvAgentExpandedToolId,
      gateLoadingMode: deps.cgsGateLoadingMode,
      gatePhase: deps.cgsGatePhase,
      hidden: mcpContentHidden,
      historyOpen: deps.rvAgentHistoryOpen,
      prompt: deps.rvAgentPrompt,
      promptHistory: deps.rvAgentPromptHistory,
      repair: deps.rvAgentRepair,
      running: deps.rvAgentRunning,
      runProgress: rvAgentRunProgress,
      showGate: showRvAgentGate,
      statusZone: {
        hasFinished: rvAgentFinishedBadges.length > 0,
        detailsText: rvAgentStatusDetails,
        finishedBadges: rvAgentFinishedBadges,
      },
      steps: rvAgentSteps,
      timeline: deps.rvAgentTimeline,
      toastWarnIconSrc: deps.toastWarnIconSrc,
      toastSuccessIconSrc: deps.toastSuccessIconSrc,
    },
    rvAgentSelectors: {
      toolDetailBlocks: cgsMcpToolDetailBlocks,
      toolSummary: cgsMcpToolSummary,
      toolTone: cgsMcpToolTone,
    },
    rvAgentActions: {
      detachBook: deps.detachAttachedBook,
      dismissRepair: deps.dismissRvAgentRepair,
      endPromptComposition: () => { deps.rvAgentComposerRef.current = false },
      handlePromptKeyDown: deps.handleRvAgentPromptKeyDown,
      openSuccessTarget: deps.openSuccessTarget,
      openRepairSettings: deps.openRvAgentLlmConfig,
      removeHistoryPrompt: deps.removeRvAgentHistoryPrompt,
      retryRepair: deps.retryRvAgentRepair,
      runGateLoad: deps.runCgsGateLoad,
      startNewSession: deps.startRvAgentNewSession,
      setExpandedToolId: deps.setRvAgentExpandedToolId,
      setHistoryOpen: deps.setRvAgentHistoryOpen,
      setPrompt: deps.setRvAgentPrompt,
      startPromptComposition: () => { deps.rvAgentComposerRef.current = true },
      togglePromptRun: () => deps.rvAgentRunning ? deps.stopRvAgentPrompt() : deps.sendRvAgentPrompt(),
      useHistoryPrompt: (prompt) => {
        deps.setRvAgentPrompt(prompt)
        deps.setRvAgentHistoryOpen(false)
      },
    },
    acquireActions: {
      clearSelection: deps.clearSelection,
      completeGateFlight: deps.completeCgsGateFlight,
      finishSubmitDrag: deps.finishCgsSubmitDrag,
      jumpPage: deps.turnCgsPage,
      moveSubmitDrag: deps.moveCgsSubmitDrag,
      nextPage: () => deps.turnCgsPage(deps.cgsCurrentPage + 1),
      selectAllCurrentPage: () => deps.setSelectedKeys(deps.cgsBooks.map((book) => book.book_key || '').filter(Boolean)),
      startSubmitDrag: deps.startCgsSubmitDrag,
      submit: deps.submitCgs,
    },
    acquireRefs: {
      manualGate: deps.cgsManualGateRef,
      rvAgentGate: deps.rvAgentGateRef,
      rvAgentScroll: deps.rvAgentScrollRef,
    },
    rvAgentDrawerView: {
      draft: deps.cgsMcpLlmDraft,
      modelHelpOpen: deps.rvAgentModelHelpOpen,
      preferenceOpen: deps.rvAgentPreferenceOpen,
      preferenceState: deps.rvAgentPreferenceState,
    },
    rvAgentDrawerActions: {
      addPreferenceItem: (text, scope) => deps.setRvAgentPreferenceState((state) => cgsMcpAddManualPreferenceItem(state, text, scope)),
      closePreferences: () => deps.setRvAgentPreferenceOpen(false),
      deletePreferenceItem: (text, scope) => deps.setRvAgentPreferenceState((state) => cgsMcpDeletePreferenceItem(state, text, scope)),
      openPreferences: () => {
        deps.setRvAgentPreferenceOpen(true)
        deps.closeSettingsDrawer()
      },
      saveConfig: deps.saveRvAgentLlmConfig,
      setDraft: deps.setCgsMcpLlmDraft,
      setPreferenceSetting: (key, value) => deps.setRvAgentPreferenceState((state) => cgsMcpSetPreferenceSetting(state, key, value)),
      toggleModelHelp: () => deps.setRvAgentModelHelpOpen((open) => !open),
      togglePreferenceItem: (text, scope) => deps.setRvAgentPreferenceState((state) => cgsMcpTogglePreferenceItem(state, text, scope)),
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
    rvAgentDrawerView: {
      draft: deps.cgsMcpLlmDraft,
      modelHelpOpen: deps.rvAgentModelHelpOpen,
      preferenceOpen: deps.rvAgentPreferenceOpen,
      preferenceState: deps.rvAgentPreferenceState,
    },
    rvAgentDrawerActions: {
      addPreferenceItem: (text, scope) => deps.setRvAgentPreferenceState((state) => cgsMcpAddManualPreferenceItem(state, text, scope)),
      closePreferences: () => deps.setRvAgentPreferenceOpen(false),
      deletePreferenceItem: (text, scope) => deps.setRvAgentPreferenceState((state) => cgsMcpDeletePreferenceItem(state, text, scope)),
      openPreferences: () => {
        deps.setRvAgentPreferenceOpen(true)
        deps.closeSettingsDrawer()
      },
      saveConfig: deps.saveRvAgentLlmConfig,
      setDraft: deps.setCgsMcpLlmDraft,
      setPreferenceSetting: (key, value) => deps.setRvAgentPreferenceState((state) => cgsMcpSetPreferenceSetting(state, key, value)),
      toggleModelHelp: () => deps.setRvAgentModelHelpOpen((open) => !open),
      togglePreferenceItem: (text, scope) => deps.setRvAgentPreferenceState((state) => cgsMcpTogglePreferenceItem(state, text, scope)),
    },
  }

  return {
    cgsInactiveMode,
    cgsModeSwapBusy: deps.cgsModeSwapBusy,
    drawerSettingsProps,
    workspaceProps,
  }
}
