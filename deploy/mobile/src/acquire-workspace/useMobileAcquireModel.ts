import type { MutableRefObject } from 'react'
import type { ToastTone } from '../app-shell/useMobileAppModel'
import type { AppState } from '../app-shell/useAppState'
import type { useMobileShelfModel } from '../library-workspace/useMobileShelfModel'
import type { SortMode } from '../library-workspace/libraryCore'
import { useAcquireWorkspaceViewModel } from './useAcquireWorkspaceViewModel'
import { useMobileAcquireControllerModel } from './useAcquireWorkspaceController'

type ShowToast = (tone: ToastTone, text: string) => void
type ShowCgsStatusToast = (status: Record<string, unknown> | null) => void
type ShelfModel = ReturnType<typeof useMobileShelfModel>

type MobileAcquireModelDeps = {
  cgsStatusToastKeyRef: MutableRefObject<string>
  closeDoujinTagPanel: ShelfModel['closeDoujinTagPanel']
  openCgsTagPanel: ShelfModel['openCgsTagPanel']
  refreshLibrary: (url?: string, nextSort?: SortMode, resetPage?: boolean, showLoading?: boolean) => Promise<void>
  selectCgsSearchCandidate: ShelfModel['selectCgsSearchCandidate']
  selectDoujinTag: ShelfModel['selectDoujinTag']
  show: ShowToast
  showCgsStatusToast: ShowCgsStatusToast
}

export function useMobileAcquireModel(appState: AppState, deps: MobileAcquireModelDeps) {
  const {
    backendUrl,
    busy,
    cgsBooks,
    cgsConfig,
    cgsConfigBusy,
    cgsConfigDraft,
    cgsConnection,
    cgsGateFlight,
    cgsGateLoadingMode,
    cgsGatePhase,
    cgsHeadGateFlight,
    chapterPanelBookKey,
    cgsManualGateRef,
    cgsMcpComposerRef,
    cgsMcpExpandedToolId,
    cgsMcpGateRef,
    cgsMcpHistoryOpen,
    cgsMcpLlmDraft,
    cgsMcpModelHelpOpen,
    cgsMcpPrompt,
    cgsMcpPromptHistory,
    cgsMcpRunning,
    cgsMcpScrollRef,
    cgsMcpTimeline,
    cgsModeSwap,
    cgsSearchBookInfo,
    cgsSessionId,
    cgsStatus,
    cgsSubmitPosition,
    cgsWorkspaceMode,
    comicConfig,
    comicPathDraft,
    doujinTagPanel,
    episodeLoadByBook,
    episodesByBook,
    keyword,
    selectedEpisodeKeysByBook,
    selectedKeys,
    selectedSite,
    sites,
    view,
    setCgsConfigDraft,
    setCgsMcpExpandedToolId,
    setCgsMcpHistoryOpen,
    setCgsMcpLlmDraft,
    setCgsMcpModelHelpOpen,
    setCgsMcpPrompt,
    setKeyword,
    setSelectedEpisodeKeysByBook,
    setSelectedKeys,
    setSelectedSite,
  } = appState

  const cgsGateBusy = cgsGatePhase === 'loading' || cgsGatePhase === 'flying'
  const cgsModeSwapBusy = Boolean(cgsModeSwap)
  const cgsBookshelfPath = comicPathDraft || comicConfig?.path || ''

  const {
    clearBookEpisodes,
    closeChapterPanel,
    completeCgsGateFlight,
    finishCgsSubmitDrag,
    handleCgsMcpPromptKeyDown,
    moveCgsSubmitDrag,
    openChapterPanel,
    retryBookEpisodes,
    runCgsGateLoad,
    saveMcpLlmConfig,
    searchCgs,
    selectAllBookEpisodes,
    selectFirstBookEpisodes,
    selectLatestBookEpisodes,
    sendCgsMcpPrompt,
    startCgsSubmitDrag,
    stopCgsMcpPrompt,
    submitCgs,
    switchCgsWorkspaceMode,
    syncCgsSavePathFromBookshelf,
    toggleEpisodeKey,
    updateCgsConfig,
  } = useMobileAcquireControllerModel(appState, {
    cgsBookshelfPath,
    cgsGateBusy,
    cgsStatusToastKeyRef: deps.cgsStatusToastKeyRef,
    refreshLibrary: deps.refreshLibrary,
    show: deps.show,
    showCgsStatusToast: deps.showCgsStatusToast,
  })

  const acquireWorkspace = useAcquireWorkspaceViewModel({
    backendUrl,
    bookshelfPath: cgsBookshelfPath,
    busy,
    cgsBooks,
    cgsConfig,
    cgsConfigBusy,
    cgsConfigDraft,
    cgsConnection,
    cgsGateBusy,
    cgsGateFlight,
    cgsGateLoadingMode,
    cgsGatePhase,
    cgsHeadGateFlight,
    chapterPanelBookKey,
    cgsMcpExpandedToolId,
    cgsMcpHistoryOpen,
    cgsMcpLlmDraft,
    cgsMcpModelHelpOpen,
    cgsMcpPrompt,
    cgsMcpPromptHistory,
    cgsMcpRunning,
    cgsMcpTimeline,
    cgsModeSwapBusy,
    cgsSearchBookInfo,
    cgsSessionId,
    cgsStatus,
    cgsSubmitPosition,
    cgsWorkspaceMode,
    doujinTagPanel,
    episodeLoadByBook,
    episodesByBook,
    keyword,
    selectedEpisodeKeysByBook,
    selectedKeys,
    selectedSite,
    sites,
    view,
    cgsManualGateRef,
    cgsMcpComposerRef,
    cgsMcpGateRef,
    cgsMcpScrollRef,
    clearBookEpisodes,
    clearSelection: () => {
      setSelectedKeys([])
      setSelectedEpisodeKeysByBook({})
    },
    closeChapterPanel,
    closeDoujinTagPanel: deps.closeDoujinTagPanel,
    completeCgsGateFlight,
    finishCgsSubmitDrag,
    handleCgsMcpPromptKeyDown,
    moveCgsSubmitDrag,
    openChapterPanel,
    openCgsTagPanel: deps.openCgsTagPanel,
    retryBookEpisodes,
    runCgsGateLoad,
    saveMcpLlmConfig,
    searchCgs,
    selectAllBookEpisodes,
    selectCgsSearchCandidate: deps.selectCgsSearchCandidate,
    selectDoujinTag: deps.selectDoujinTag,
    selectFirstBookEpisodes,
    selectLatestBookEpisodes,
    sendCgsMcpPrompt,
    startCgsSubmitDrag,
    stopCgsMcpPrompt,
    submitCgs,
    syncCgsSavePathFromBookshelf,
    updateCgsConfig,
    setCgsConfigDraft,
    setCgsMcpExpandedToolId,
    setCgsMcpHistoryOpen,
    setCgsMcpLlmDraft,
    setCgsMcpModelHelpOpen,
    setCgsMcpPrompt,
    setKeyword,
    setSelectedKeys,
    setSelectedSite,
    toggleEpisodeKey,
  })

  return {
    acquireWorkspace,
    cgsGateBusy,
    switchCgsWorkspaceMode,
  }
}
