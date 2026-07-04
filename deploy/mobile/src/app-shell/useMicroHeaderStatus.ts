import { Activity, Bot, Check, Download, FolderOpen, Grid2X2, LoaderCircle, PlugZap, WifiOff } from 'lucide-react'
import { createElement, Fragment, type CSSProperties, type RefObject } from 'react'
import { CustomIcon } from '../icons/CustomIcon'
import type { ConnectionState } from '../mobileStore'
import type { CgsConnectionState, CgsGateFlight, CgsGatePhase, CgsModeSwap, CgsWorkspaceMode } from '../acquire-workspace/acquireTypes'

type View = 'library' | 'downloads' | 'reader' | 'acquire'
type StatusTone = 'ok' | 'warn' | 'error' | 'neutral'

type MicroHeaderStatusDeps = {
  booksPathLabel: string
  booksPathValue: string
  busy: string
  cachedComplete: number
  cachedLength: number
  cachedPages: number
  cgsConnection: CgsConnectionState
  cgsGateBusy: boolean
  cgsGatePhase: CgsGatePhase
  cgsHeadGateFlight: CgsGateFlight | null
  cgsInactiveMode: CgsWorkspaceMode | null
  cgsModeSwap: CgsModeSwap | null
  cgsModeSwapBusy: boolean
  cgsWorkspaceMode: CgsWorkspaceMode | null
  comicMode: 'doujin' | 'manga'
  comicModeLabel: string
  connection: ConnectionState
  libraryTotal: number
  pathConfigured: boolean
  view: View
  cgsStatusDotRef: RefObject<HTMLSpanElement | null>
  cgsStatusHeadRef: RefObject<HTMLButtonElement | null>
  switchCgsWorkspaceMode: (mode: CgsWorkspaceMode) => void
}

function connectionTone(connection: ConnectionState): StatusTone {
  if (connection === 'online') return 'ok'
  if (connection === 'backend_unreachable') return 'error'
  if (connection === 'offline_cache_only') return 'warn'
  return 'neutral'
}

export function useMicroHeaderStatus(deps: MicroHeaderStatusDeps) {
  function renderConnectionStatusDot() {
    return createElement(
      'span',
      { className: `status-dot ${connectionTone(deps.connection)}`, 'aria-label': '连接状态' },
      deps.connection === 'online' ? createElement(Activity, { size: 13 }) : createElement(CustomIcon, { name: 'wireError', size: 13 }),
    )
  }

  function renderComicModeStatusDot() {
    return createElement(
      'span',
      { className: `status-dot comic-mode ${deps.comicMode}`, 'aria-label': deps.comicModeLabel },
      createElement(CustomIcon, { name: 'doujin', size: 13 }),
    )
  }

  function renderCgsConnectionStatusDot() {
    const failed = deps.cgsConnection === 'unreachable'
    const tone = failed ? 'error' : deps.cgsConnection === 'online' ? 'ok' : 'neutral'
    const loading = deps.cgsGatePhase === 'loading'
    const activeMode = deps.cgsWorkspaceMode || 'manual'
    const title = deps.cgsConnection === 'unknown'
      ? '请点击中央入口检测 CGS 服务'
      : failed ? 'CGS 服务不可用，请点击中央入口重新检测' : 'CGS 服务可用'
    // RVLAY002: rail is passive status chrome; switching lives in micro-status-head.
    return createElement(
      'span',
      {
        ref: deps.cgsStatusDotRef,
        className: `status-dot cgs-server ${tone} ${deps.cgsGatePhase === 'flying' ? 'is-flight-target' : ''} ${deps.cgsModeSwap ? 'is-swap-rail' : ''}`,
        style: deps.cgsModeSwap ? { '--swap-dx': `${deps.cgsModeSwap.railDx}px`, '--swap-dy': `${deps.cgsModeSwap.railDy}px` } as CSSProperties : undefined,
        'aria-label': loading ? '正在检测 CGS 服务' : title,
      },
      loading
        ? createElement(LoaderCircle, { className: 'spin', size: 16 })
        : failed ? createElement(WifiOff, { size: 16 }) : activeMode === 'mcp' ? createElement(Bot, { size: 16 }) : createElement(PlugZap, { size: 16 }),
    )
  }

  function renderCgsModeHeadStatusDot() {
    if (deps.view !== 'acquire') return null
    const inactiveMode = deps.cgsInactiveMode
    const hidden = !inactiveMode || deps.cgsConnection !== 'online'
    const label = inactiveMode === 'manual' ? '切换到 CGS 手动获取' : '切换到 RV Agent 对话获取'
    // RVLAY002: keep the primary mode switch icon-only; transferBtn mirrors this action.
    return createElement(
      'button',
      {
        ref: deps.cgsStatusHeadRef,
        type: 'button',
        className: `icon-only status-dot cgs-mode-head neutral ${hidden ? 'is-empty' : ''} ${deps.cgsHeadGateFlight ? 'is-flight-target' : ''} ${deps.cgsModeSwap ? 'is-swap-head' : ''}`,
        style: deps.cgsModeSwap ? { '--swap-dx': `${deps.cgsModeSwap.headDx}px`, '--swap-dy': `${deps.cgsModeSwap.headDy}px` } as CSSProperties : undefined,
        'aria-label': hidden ? undefined : label,
        'aria-hidden': hidden,
        tabIndex: hidden ? -1 : 0,
        disabled: hidden || deps.cgsModeSwapBusy || deps.cgsGateBusy,
        onClick: () => {
          if (inactiveMode) deps.switchCgsWorkspaceMode(inactiveMode)
        },
      },
      inactiveMode === 'manual' ? createElement(PlugZap, { size: 16 }) : createElement(Bot, { size: 16 }),
    )
  }

  function renderCgsModeTransferButton() {
    if (deps.view !== 'acquire') return null
    const inactiveMode = deps.cgsInactiveMode
    const hidden = !inactiveMode || deps.cgsConnection !== 'online'
    const label = inactiveMode === 'manual' ? '切换到 CGS 手动获取' : '切换到 RV Agent 对话获取'
    const blocked = deps.cgsModeSwapBusy || deps.cgsGateBusy || deps.busy === 'cgs-mcp'
    // RVUX004: mobile-only controls use aria/tap state, not native title tooltips.
    return createElement(
      'button',
      {
        type: 'button',
        className: `transferBtn cgs-mode-transfer ${hidden ? 'is-empty' : ''} ${blocked ? 'is-disabled' : ''}`,
        'aria-label': hidden ? undefined : label,
        'aria-hidden': hidden,
        'aria-disabled': hidden || blocked,
        tabIndex: hidden ? -1 : 0,
        disabled: hidden,
        onClick: () => {
          if (inactiveMode && !blocked) deps.switchCgsWorkspaceMode(inactiveMode)
        },
      },
      createElement(
        'svg',
        {
          className: 'cgs-mode-transfer-icon',
          width: 26,
          height: 16,
          viewBox: '0 0 32 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        createElement('path', { className: 'wave-chevron', d: 'm4 18 6-6-6-6' }),
        createElement('path', { className: 'wave-chevron', d: 'm12 18 6-6-6-6' }),
        createElement('path', { className: 'wave-chevron', d: 'm20 18 6-6-6-6' }),
      ),
    )
  }

  function renderCgsModeHeadControls() {
    if (deps.view !== 'acquire') return null
    return createElement(
      Fragment,
      null,
      renderCgsModeHeadStatusDot(),
      renderCgsModeTransferButton(),
    )
  }

  function renderMicroStatusRail() {
    if (deps.view === 'downloads') {
      return createElement(
        Fragment,
        null,
        createElement('span', { className: 'status-dot', 'aria-label': '完整缓存' }, createElement(Check, { size: 13 }), createElement('strong', null, `${deps.cachedComplete}/${deps.cachedLength}`)),
        createElement('span', { className: 'status-dot', 'aria-label': '缓存条目' }, createElement(Download, { size: 13 }), createElement('strong', null, deps.cachedLength)),
        createElement('span', { className: 'status-dot', 'aria-label': '缓存页数' }, createElement(Grid2X2, { size: 13 }), createElement('strong', null, deps.cachedPages)),
      )
    }

    if (deps.view === 'library') {
      return createElement(
        Fragment,
        null,
        renderConnectionStatusDot(),
        renderComicModeStatusDot(),
        createElement(
          'span',
          { className: `status-dot path-value ${deps.pathConfigured ? 'ok' : 'warn'}`, 'aria-label': `书库路径：${deps.booksPathValue || '未配置'}` },
          createElement(FolderOpen, { size: 13 }),
          createElement('strong', null, deps.booksPathLabel),
        ),
        createElement('span', { className: 'status-dot', 'aria-label': '书架数量' }, createElement(Grid2X2, { size: 13 }), createElement('strong', null, deps.libraryTotal)),
      )
    }

    if (deps.view === 'acquire') return renderCgsConnectionStatusDot()
    return renderConnectionStatusDot()
  }

  return {
    head: renderCgsModeHeadControls(),
    rail: renderMicroStatusRail(),
  }
}
