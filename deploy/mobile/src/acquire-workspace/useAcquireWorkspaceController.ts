import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, MutableRefObject, PointerEvent, RefObject, SetStateAction } from 'react'
import {
  appendCgsMcpFinalFailure,
  appendMcpAssistantDelta,
  buildCgsGateFlight,
  cgsDraftFromConfig,
  cgsMcpConfigured,
  cgsMcpDataObject,
  cgsMcpDataText,
  cgsMcpFailureStatus,
  cgsMcpProgressFromData,
  cgsMcpToolTone,
  cgsProxiesFromText,
  cgsRootActionErrorMessage,
  cgsSubmitErrorMessage,
  clampCgsSubmitPosition,
  nextTimelineId,
  normalizeCgsConfig,
  prefersReducedMotion,
  readCgsMcpSse,
  saveCgsMcpLlmConfig,
  saveCgsMcpPromptHistory,
  saveCgsSubmitPosition,
} from './acquireCore'
import type {
  CgsConfigDraft,
  CgsConnectionState,
  CgsGateFlight,
  CgsGatePhase,
  CgsMcpLlmConfig,
  CgsMcpSseEvent,
  CgsMcpTimelineItem,
  CgsModeSwap,
  CgsSubmitDragState,
  CgsSubmitPosition,
  CgsWorkspaceMode,
} from './acquireTypes'
import type { SortMode } from '../library-workspace/libraryCore'
import type { AppState } from '../app-shell/useAppState'
import { hasRootSecret, rootSecretHeaders } from '../app-shell/useAppShellController'
import {
  type CgsBook,
  type CgsConfig,
  type CgsSite,
  apiGet,
  apiPost,
  buildUrl,
} from '../mobileStore'

type ShowToast = (tone: 'ok' | 'warn' | 'error', text: string) => void
type ShowCgsStatusToast = (status: Record<string, unknown> | null) => void

type MobileAcquireControllerDeps = {
  cgsBookshelfPath: string
  cgsGateBusy: boolean
  cgsStatusToastKeyRef: MutableRefObject<string>
  refreshLibrary: (url?: string, nextSort?: SortMode, resetPage?: boolean, showLoading?: boolean) => Promise<void>
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
  cgsMcpPrompt: string
  cgsMcpRunning: boolean
  cgsModeSwap: CgsModeSwap | null
  cgsSessionId: string
  cgsSubmitPosition: CgsSubmitPosition
  cgsWorkspaceMode: CgsWorkspaceMode | null
  hasRootSecret: () => boolean
  keyword: string
  refreshLibrary: (url?: string, nextSort?: SortMode, resetPage?: boolean, showLoading?: boolean) => Promise<void>
  rootSecretHeaders: () => Promise<Record<string, string>>
  selectedKeys: string[]
  selectedSite: string
  show: ShowToast
  showCgsStatusToast: (status: Record<string, unknown> | null) => void
  sort: SortMode
  cgsManualGateRef: RefObject<HTMLButtonElement | null>
  cgsMcpAbortRef: MutableRefObject<AbortController | null>
  cgsMcpComposerRef: MutableRefObject<boolean>
  cgsMcpFailedRef: MutableRefObject<boolean>
  cgsMcpGateRef: RefObject<HTMLButtonElement | null>
  cgsMcpSubmittedRef: MutableRefObject<boolean>
  cgsStatusDotRef: RefObject<HTMLSpanElement | null>
  cgsStatusHeadRef: RefObject<HTMLButtonElement | null>
  cgsStatusToastKeyRef: MutableRefObject<string>
  cgsSubmitDragRef: MutableRefObject<CgsSubmitDragState | null>
  setBusy: Dispatch<SetStateAction<string>>
  setCgsBooks: Dispatch<SetStateAction<CgsBook[]>>
  setCgsConfig: Dispatch<SetStateAction<CgsConfig | null>>
  setCgsConfigBusy: Dispatch<SetStateAction<string>>
  setCgsConfigDraft: Dispatch<SetStateAction<CgsConfigDraft>>
  setCgsConnection: Dispatch<SetStateAction<CgsConnectionState>>
  setCgsGateFlight: Dispatch<SetStateAction<CgsGateFlight | null>>
  setCgsGateLoadingMode: Dispatch<SetStateAction<CgsWorkspaceMode | null>>
  setCgsGatePhase: Dispatch<SetStateAction<CgsGatePhase>>
  setCgsHeadGateFlight: Dispatch<SetStateAction<CgsGateFlight | null>>
  setCgsMcpExpandedToolId: Dispatch<SetStateAction<string | null>>
  setCgsMcpHistoryOpen: Dispatch<SetStateAction<boolean>>
  setCgsMcpLlmConfig: Dispatch<SetStateAction<CgsMcpLlmConfig>>
  setCgsMcpPrompt: Dispatch<SetStateAction<string>>
  setCgsMcpPromptHistory: Dispatch<SetStateAction<string[]>>
  setCgsMcpRunning: Dispatch<SetStateAction<boolean>>
  setCgsMcpTimeline: Dispatch<SetStateAction<CgsMcpTimelineItem[]>>
  setCgsModeSwap: Dispatch<SetStateAction<CgsModeSwap | null>>
  setCgsSessionId: Dispatch<SetStateAction<string>>
  setCgsStatus: Dispatch<SetStateAction<Record<string, unknown> | null>>
  setCgsSubmitPosition: Dispatch<SetStateAction<CgsSubmitPosition>>
  setCgsWorkspaceMode: Dispatch<SetStateAction<CgsWorkspaceMode | null>>
  setSelectedKeys: Dispatch<SetStateAction<string[]>>
  setSelectedSite: Dispatch<SetStateAction<string>>
  setSites: Dispatch<SetStateAction<CgsSite[]>>
}

export function useAcquireWorkspaceController(deps: AcquireWorkspaceControllerDeps) {
  function completeCgsGateFlight() {
    deps.setCgsGateFlight(null)
    deps.setCgsHeadGateFlight(null)
    deps.setCgsGatePhase('done')
    deps.setCgsGateLoadingMode(null)
  }

  function startCgsGateFlight(mode: CgsWorkspaceMode, nextConnection: CgsConnectionState) {
    const from = (mode === 'mcp' ? deps.cgsMcpGateRef : deps.cgsManualGateRef).current?.getBoundingClientRect()
    const to = deps.cgsStatusDotRef.current?.getBoundingClientRect()
    const inactiveMode: CgsWorkspaceMode = mode === 'mcp' ? 'manual' : 'mcp'
    const inactiveFrom = (inactiveMode === 'mcp' ? deps.cgsMcpGateRef : deps.cgsManualGateRef).current?.getBoundingClientRect()
    const headTo = deps.cgsStatusHeadRef.current?.getBoundingClientRect()
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

  function switchCgsWorkspaceMode(nextMode: CgsWorkspaceMode) {
    if (!deps.cgsWorkspaceMode || nextMode === deps.cgsWorkspaceMode || deps.cgsGateBusy || deps.cgsModeSwap) return
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

  async function updateCgsConfig() {
    const svPath = deps.cgsConfigDraft.sv_path.trim()
    if (!svPath) {
      deps.show('warn', 'CGS 储存目录不能为空')
      return
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
      deps.show('ok', 'CGS 配置已更新')
    } catch (error) {
      deps.show('error', cgsRootActionErrorMessage(error, 'CGS 配置更新失败', deps.hasRootSecret()))
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
      deps.show('ok', 'MCP 已连接')
      return 'online'
    } catch (error) {
      deps.setCgsConnection('unreachable')
      deps.show('error', error instanceof Error ? error.message : 'MCP 不可用')
      return 'unreachable'
    } finally {
      deps.setBusy('')
    }
  }

  function saveMcpLlmConfig() {
    const next = saveCgsMcpLlmConfig(deps.cgsMcpLlmDraft)
    deps.setCgsMcpLlmConfig(next)
    deps.show('ok', 'LLM 配置已保存')
  }

  function applyCgsMcpEvent(item: CgsMcpSseEvent) {
    if (item.event === 'assistant_delta') {
      const text = cgsMcpDataText(item.data, 'text')
      if (text) deps.setCgsMcpTimeline((rows) => appendMcpAssistantDelta(rows, text))
      return
    }
    if (item.event === 'tool_step') {
      const name = cgsMcpDataText(item.data, 'name') || 'tool'
      const result = cgsMcpDataObject(item.data, 'result')
      if (cgsMcpToolTone(result) === 'error') deps.cgsMcpFailedRef.current = true
      if (name === 'cgs_submit_books') deps.cgsMcpSubmittedRef.current = true
      deps.setCgsMcpTimeline((rows) => [
        ...rows,
        {
          id: nextTimelineId('mcp-tool'),
          type: 'tool',
          name,
          arguments: cgsMcpDataObject(item.data, 'arguments'),
          result,
        },
      ])
      return
    }
    if (item.event === 'cgs_progress') {
      const status = cgsMcpDataText(item.data, 'status')
      if (cgsMcpFailureStatus(status)) deps.cgsMcpFailedRef.current = true
      deps.setCgsMcpTimeline((rows) => [...rows, cgsMcpProgressFromData(item.data)])
      deps.setCgsStatus((state) => ({ ...(state || {}), progress: { percent: item.data.percent }, status: item.data.status || 'running' }))
      return
    }
    if (item.event === 'final') {
      const success = item.data.success !== false && !deps.cgsMcpFailedRef.current
      const reportedSummary = cgsMcpDataText(item.data, 'summary')
      const summary = success ? reportedSummary || '完成' : reportedSummary && reportedSummary !== '完成' ? reportedSummary : '失败'
      deps.setCgsMcpTimeline((rows) => [...rows, { id: nextTimelineId('mcp-final'), type: 'final', success, summary }])
      deps.setCgsMcpRunning(false)
      if (success && deps.cgsMcpSubmittedRef.current) void deps.refreshLibrary(deps.backendUrl, deps.sort, false, false)
      return
    }
    if (item.event === 'error') {
      const message = cgsMcpDataText(item.data, 'message') || 'MCP 对话失败'
      deps.cgsMcpFailedRef.current = true
      deps.setCgsMcpTimeline((rows) => appendCgsMcpFinalFailure(rows, message))
      deps.setCgsMcpRunning(false)
      deps.show('error', message)
    }
  }

  async function sendCgsMcpPrompt() {
    const prompt = deps.cgsMcpPrompt.trim()
    if (!prompt || deps.cgsMcpRunning) return
    if (!cgsMcpConfigured(deps.cgsMcpLlmConfig)) {
      deps.show('warn', 'LLM 配置检测异常，请在左侧抽屉的 CGS MCP / LLM 配置中调整 baseurl、API Key、Model 并保存')
      return
    }
    const abort = new AbortController()
    deps.cgsMcpAbortRef.current = abort
    deps.cgsMcpSubmittedRef.current = false
    deps.cgsMcpFailedRef.current = false
    deps.setCgsWorkspaceMode('mcp')
    deps.setCgsMcpRunning(true)
    deps.setCgsMcpHistoryOpen(false)
    deps.setCgsMcpExpandedToolId(null)
    deps.setCgsMcpPromptHistory((history) => saveCgsMcpPromptHistory(prompt, history))
    deps.setCgsMcpPrompt('')
    deps.setCgsMcpTimeline((rows) => [...rows, { id: nextTimelineId('mcp-user'), type: 'user', text: prompt }])
    try {
      const response = await fetch(buildUrl(deps.backendUrl, '/root/cgs/mcp/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...await deps.rootSecretHeaders(),
        },
        body: JSON.stringify({ prompt, llm: deps.cgsMcpLlmConfig }),
        signal: abort.signal,
      })
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
      await readCgsMcpSse(response, applyCgsMcpEvent)
      deps.setCgsConnection('online')
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        deps.cgsMcpFailedRef.current = true
        deps.setCgsMcpTimeline((rows) => appendCgsMcpFinalFailure(rows, '已停止'))
      } else {
        deps.setCgsConnection('unreachable')
        const message = error instanceof Error ? error.message : 'MCP 对话失败'
        deps.cgsMcpFailedRef.current = true
        deps.setCgsMcpTimeline((rows) => appendCgsMcpFinalFailure(rows, message))
        deps.show('error', message)
      }
    } finally {
      if (deps.cgsMcpAbortRef.current === abort) deps.cgsMcpAbortRef.current = null
      deps.setCgsMcpRunning(false)
    }
  }

  function stopCgsMcpPrompt() {
    deps.cgsMcpAbortRef.current?.abort()
  }

  function handleCgsMcpPromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || deps.cgsMcpComposerRef.current) return
    event.preventDefault()
    void sendCgsMcpPrompt()
  }

  async function searchCgs() {
    if (!deps.selectedSite || !deps.keyword.trim()) return
    deps.setBusy('cgs-search')
    try {
      const response = await apiPost<{ session_id?: string; books: CgsBook[] }>(deps.backendUrl, '/root/cgs/search', {
        site: Number(deps.selectedSite),
        keyword: deps.keyword.trim(),
        page: 1,
      })
      deps.setCgsBooks(response.books || [])
      deps.setCgsSessionId(response.session_id || '')
      deps.setSelectedKeys([])
      deps.setCgsStatus(null)
      deps.cgsStatusToastKeyRef.current = ''
      deps.setCgsConnection('online')
      deps.show('ok', '搜索完成')
    } catch (error) {
      deps.setCgsConnection('unreachable')
      deps.show('error', error instanceof Error ? error.message : '搜索失败')
    } finally {
      deps.setBusy('')
    }
  }

  async function submitCgs() {
    if (!deps.selectedKeys.length || !deps.cgsSessionId) return
    deps.setBusy('cgs-submit')
    deps.cgsStatusToastKeyRef.current = ''
    try {
      const response = await apiPost<Record<string, unknown>>(deps.backendUrl, '/root/cgs/submit-books', {
        session_id: deps.cgsSessionId,
        book_keys: deps.selectedKeys,
      }, await deps.rootSecretHeaders())
      deps.setCgsStatus(response)
      deps.setCgsConnection('online')
      deps.show('ok', '已提交')
      await refreshCgsStatus()
    } catch (error) {
      deps.setCgsConnection('unreachable')
      deps.show('error', cgsSubmitErrorMessage(error, deps.hasRootSecret()))
    } finally {
      deps.setBusy('')
    }
  }

  async function refreshCgsStatus() {
    try {
      const status = await apiGet<Record<string, unknown>>(deps.backendUrl, '/root/cgs/status')
      deps.setCgsStatus(status)
      deps.setCgsConnection('online')
      deps.showCgsStatusToast(status)
    } catch (error) {
      deps.setCgsConnection('unreachable')
      deps.show('error', error instanceof Error ? error.message : '状态读取失败')
    }
  }

  return {
    completeCgsGateFlight,
    finishCgsSubmitDrag,
    handleCgsMcpPromptKeyDown,
    loadCgsConfig,
    loadCgsSites,
    moveCgsSubmitDrag,
    probeCgsMcp,
    refreshCgsStatus,
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
  }
}

export function useMobileAcquireControllerModel(appState: AppState, deps: MobileAcquireControllerDeps) {
  const {
    backendUrl,
    busy,
    cgsConfigDraft,
    cgsGatePhase,
    cgsMcpLlmConfig,
    cgsMcpLlmDraft,
    cgsMcpPrompt,
    cgsMcpRunning,
    cgsModeSwap,
    cgsSessionId,
    cgsSubmitPosition,
    cgsWorkspaceMode,
    keyword,
    selectedKeys,
    selectedSite,
    sort,
    cgsManualGateRef,
    cgsMcpAbortRef,
    cgsMcpComposerRef,
    cgsMcpFailedRef,
    cgsMcpGateRef,
    cgsMcpSubmittedRef,
    cgsStatusDotRef,
    cgsStatusHeadRef,
    cgsSubmitDragRef,
    setBusy,
    setCgsBooks,
    setCgsConfig,
    setCgsConfigBusy,
    setCgsConfigDraft,
    setCgsConnection,
    setCgsGateFlight,
    setCgsGateLoadingMode,
    setCgsGatePhase,
    setCgsHeadGateFlight,
    setCgsMcpExpandedToolId,
    setCgsMcpHistoryOpen,
    setCgsMcpLlmConfig,
    setCgsMcpPrompt,
    setCgsMcpPromptHistory,
    setCgsMcpRunning,
    setCgsMcpTimeline,
    setCgsModeSwap,
    setCgsSessionId,
    setCgsStatus,
    setCgsSubmitPosition,
    setCgsWorkspaceMode,
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
    cgsMcpLlmConfig,
    cgsMcpLlmDraft,
    cgsMcpPrompt,
    cgsMcpRunning,
    cgsModeSwap,
    cgsSessionId,
    cgsSubmitPosition,
    cgsWorkspaceMode,
    hasRootSecret,
    keyword,
    refreshLibrary: deps.refreshLibrary,
    rootSecretHeaders,
    selectedKeys,
    selectedSite,
    show: deps.show,
    showCgsStatusToast: deps.showCgsStatusToast,
    sort,
    cgsManualGateRef,
    cgsMcpAbortRef,
    cgsMcpComposerRef,
    cgsMcpFailedRef,
    cgsMcpGateRef,
    cgsMcpSubmittedRef,
    cgsStatusDotRef,
    cgsStatusHeadRef,
    cgsStatusToastKeyRef: deps.cgsStatusToastKeyRef,
    cgsSubmitDragRef,
    setBusy,
    setCgsBooks,
    setCgsConfig,
    setCgsConfigBusy,
    setCgsConfigDraft,
    setCgsConnection,
    setCgsGateFlight,
    setCgsGateLoadingMode,
    setCgsGatePhase,
    setCgsHeadGateFlight,
    setCgsMcpExpandedToolId,
    setCgsMcpHistoryOpen,
    setCgsMcpLlmConfig,
    setCgsMcpPrompt,
    setCgsMcpPromptHistory,
    setCgsMcpRunning,
    setCgsMcpTimeline,
    setCgsModeSwap,
    setCgsSessionId,
    setCgsStatus,
    setCgsSubmitPosition,
    setCgsWorkspaceMode,
    setSelectedKeys,
    setSelectedSite,
    setSites,
  })
}
