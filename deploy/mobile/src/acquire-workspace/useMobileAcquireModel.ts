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
    keyword,
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
    setSelectedKeys,
    setSelectedSite,
  } = appState

  const cgsGateBusy = cgsGatePhase === 'loading' || cgsGatePhase === 'flying'
  const cgsModeSwapBusy = Boolean(cgsModeSwap)
  const cgsBookshelfPath = comicPathDraft || comicConfig?.path || ''

  const {
    completeCgsGateFlight,
    finishCgsSubmitDrag,
    handleCgsMcpPromptKeyDown,
    moveCgsSubmitDrag,
    runCgsGateLoad,
    saveMcpLlmConfig,
    searchCgs,
    sendCgsMcpPrompt,
    startCgsSubmitDrag,
    stopCgsMcpPrompt,
    submitCgs,
    switchCgsWorkspaceMode,
    syncCgsSavePathFromBookshelf,
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
    keyword,
    selectedKeys,
    selectedSite,
    sites,
    view,
    cgsManualGateRef,
    cgsMcpComposerRef,
    cgsMcpGateRef,
    cgsMcpScrollRef,
    clearSelection: () => setSelectedKeys([]),
    closeDoujinTagPanel: deps.closeDoujinTagPanel,
    completeCgsGateFlight,
    finishCgsSubmitDrag,
    handleCgsMcpPromptKeyDown,
    moveCgsSubmitDrag,
    openCgsTagPanel: deps.openCgsTagPanel,
    runCgsGateLoad,
    saveMcpLlmConfig,
    searchCgs,
    selectCgsSearchCandidate: deps.selectCgsSearchCandidate,
    selectDoujinTag: deps.selectDoujinTag,
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
  })

  return {
    acquireWorkspace,
    cgsGateBusy,
    switchCgsWorkspaceMode,
  }
}
