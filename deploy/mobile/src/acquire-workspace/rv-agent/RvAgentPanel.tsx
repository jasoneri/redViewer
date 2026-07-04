import { useEffect, useRef, useState } from 'react'
import { Activity, Bot, Check, ChevronDown, ChevronRight, CircleHelp, CodeXml, FunnelPlus, FunnelX, History, LoaderCircle, Plus, RotateCw, Send, Settings2, Square, Trash2, Wrench, X } from 'lucide-react'
import { InputHistoryMenu } from '../../shared/NativeDropdownMenu'
import { ConfDrawerSaveButton, useConfDrawerSaveFeedback } from '../../shared/confDrawerSaveFeedback'
import { Cover } from '../../shared/Cover'
import { CUSTOM_SETTINGS_RESTORED_EVENT } from '../../app-shell/customSettingsStorage'
import { AttachedBookSelect } from '../AttachedBookSelect'
import { AcquireFlowSteps, CgsGateLayer } from '../acquireUi'
import { cgsMcpVisiblePreferenceItems } from '../acquireCore'
import type {
  AcquireWorkspaceRefs,
  RvAgentDrawerActions,
  RvAgentDrawerView,
  RvAgentPanelActions,
  RvAgentPanelSelectors,
  RvAgentPanelView,
  RvAgentPreferenceBookKind,
  RvAgentRepairState,
  RvAgentSuccessTarget,
  CgsRunBadge,
  RvAgentTimelineItem,
} from '../acquireTypes'

const TOOL_DETAIL_ROW_LIMIT = 120
const TOOL_DETAIL_DEPTH_LIMIT = 5

const CGS_MCP_BASEURL_HISTORY_KEY = 'redviewer:cgs-mcp-baseurl-history'
const CGS_MCP_MODEL_HISTORY_KEY = 'redviewer:cgs-mcp-model-history'
const CGS_MCP_HISTORY_LIMIT = 8

function normalizeCgsMcpHistoryValue(value: string): string {
  return value.trim()
}

function dedupeCgsMcpHistory(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = normalizeCgsMcpHistoryValue(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= CGS_MCP_HISTORY_LIMIT) break
  }
  return result
}

function readCgsMcpHistory(storageKey: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? dedupeCgsMcpHistory(parsed.filter((item): item is string => typeof item === 'string')) : []
  } catch {
    return []
  }
}

function saveCgsMcpHistory(value: string, currentHistory: string[], storageKey: string): string[] {
  const normalized = normalizeCgsMcpHistoryValue(value)
  if (!normalized) return currentHistory
  const nextHistory = dedupeCgsMcpHistory([normalized, ...currentHistory])
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextHistory))
    } catch {
      // Ignore storage quota or privacy-mode failures; the input still works.
    }
  }
  return nextHistory
}

function readCgsMcpBaseUrlHistory(): string[] {
  return readCgsMcpHistory(CGS_MCP_BASEURL_HISTORY_KEY)
}

function saveCgsMcpBaseUrlHistory(value: string, currentHistory: string[]): string[] {
  return saveCgsMcpHistory(value, currentHistory, CGS_MCP_BASEURL_HISTORY_KEY)
}

function readCgsMcpModelHistory(): string[] {
  return readCgsMcpHistory(CGS_MCP_MODEL_HISTORY_KEY)
}

function saveCgsMcpModelHistory(value: string, currentHistory: string[]): string[] {
  return saveCgsMcpHistory(value, currentHistory, CGS_MCP_MODEL_HISTORY_KEY)
}

type ToolDetailBlock = ReturnType<RvAgentPanelSelectors['toolDetailBlocks']>[number]
type ToolDetailRow = { key: string; value: string }

function RvAgentPreferenceThresholdInput({
  title,
  value,
  onChange,
  min = 1,
  disabled = false,
}: {
  title: string
  value: number
  onChange: (value: number) => void
  min?: number
  disabled?: boolean
}) {
  return (
    <label className="rvAgentPreferenceThresholdInput">
      <span className="rvAgentPreferenceThresholdTitle">{title}</span>
      <span className="rvAgentPreferenceThresholdBox">
        <input
          type="number"
          min={min}
          max={9}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={title}
        />
      </span>
    </label>
  )
}

export function RvAgentPreferenceSheet({
  drawerView,
  drawerActions,
}: {
  drawerView: RvAgentDrawerView
  drawerActions: RvAgentDrawerActions
}) {
  const [preferenceInput, setPreferenceInput] = useState('')
  const [activeKind, setActiveKind] = useState<RvAgentPreferenceBookKind>('doujinshi')
  const activeScope = { book_kind: activeKind } as const
  const visiblePreferences = cgsMcpVisiblePreferenceItems(drawerView.preferenceState, activeScope)
  const learningDisabled = drawerView.preferenceState.settings.auto_activate_threshold === 0
  const addPreference = () => {
    const nextText = preferenceInput.trim()
    if (!nextText) return
    drawerActions.addPreferenceItem(nextText, activeScope)
    setPreferenceInput('')
  }
  const tabs: Array<{ kind: RvAgentPreferenceBookKind; label: string }> = [
    { kind: 'doujinshi', label: 'Doujinshi' },
    { kind: 'manga', label: 'Manga' },
  ]

  // RVUX: RV Agent preference headers are row-local. Each rv-agent-preference-row owns
  // at most one local header/description block; do not merge future row copy
  // into another row's header.
  return (
    <>
      <button className="tool-scrim rv-agent-preference-scrim" onClick={drawerActions.closePreferences} aria-label="关闭 RV Agent 偏好配置面板" />
      <section
        id="rv-agent-preference-sheet"
        className={`rv-agent-preference-sheet is-${activeKind}`}
        role="dialog"
        aria-modal="true"
        aria-label="RV Agent 偏好配置面板"
      >
        <div className="rv-agent-preference-tabs" role="tablist" aria-label="偏好类型">
          {tabs.map((tab) => (
            <button
              key={tab.kind}
              id={`rv-agent-preference-tab-${tab.kind}`}
              type="button"
              role="tab"
              className={`rv-agent-preference-tab${activeKind === tab.kind ? ' is-active' : ''}`}
              aria-selected={activeKind === tab.kind}
              aria-controls={`rv-agent-preference-panel-${tab.kind}`}
              tabIndex={activeKind === tab.kind ? 0 : -1}
              onClick={() => setActiveKind(tab.kind)}
            >
              {tab.label}
            </button>
          ))}
          <button type="button" className="closeBtn ghost" onClick={drawerActions.closePreferences} aria-label="关闭 RV Agent 偏好配置面板">
            <X size={15} />
          </button>
        </div>
        <div
          id={`rv-agent-preference-panel-${activeKind}`}
          className="rv-agent-preference-panel"
          role="tabpanel"
          aria-labelledby={`rv-agent-preference-tab-${activeKind}`}
        >
        <div className="preference-switch-list rv-agent-preference-row" aria-label="RV Agent 偏好开关列表">
          {activeKind === 'doujinshi' && (
            <label className="preferenceSwitchItem">
              <input
                className="preferenceSwitchInput"
                type="checkbox"
                checked={drawerView.preferenceState.settings.preview_switch}
                onChange={(event) => drawerActions.setPreferenceSetting('preview_switch', event.target.checked)}
                aria-label="Doujinshi 预览，开启后仅搜索结果，不自动提交下载"
              />
              <span className="preferenceSwitchLabel">预览</span>
              <span className="preferenceSwitchSlider" aria-hidden />
            </label>
          )}
        </div>
        <div className="rv-agent-fav-tag-row rv-agent-preference-row">
          <header className="rv-agent-preference-sheet-header">偏好管理：<span style={{ color: 'var(--accent)' }}>激活红</span> &gt; 匹配, <span style={{ color: 'var(--warning-text)' }}>激活黄</span> &gt; 排除，作为增强发给 LLM; 阈值 0 时取消学习</header>
          <div className="rv-agent-preference-condition-list" aria-label="RV Agent 偏好条件列表">
            {visiblePreferences.map((item) => (
              <div key={`${item.scope.panel}-${item.scope.book_kind || ''}-${item.text}`} className="rvAgentPreferenceItem">
                <button
                  type="button"
                  className={`rvAgentPreferenceConditionBtn mode-${item.mode} ${item.mode !== 'neutral' ? 'active' : ''}`}
                  onClick={() => drawerActions.togglePreferenceItem(item.text, activeScope)}
                  aria-pressed={item.mode === 'exclude' ? 'mixed' : item.mode === 'match'}
                  aria-label={`${item.text}${item.mode === 'match' ? ' 已匹配' : item.mode === 'exclude' ? ' 已排除' : ' 未启用'}`}
                >
                  <span>{item.text}</span>
                  {item.mode === 'match' && <FunnelPlus className="rvAgentPreferenceModeIcon" size={16} aria-hidden />}
                  {item.mode === 'exclude' && <FunnelX className="rvAgentPreferenceModeIcon" size={16} aria-hidden />}
                </button>
                <button
                  type="button"
                  className="rvAgentPreferenceDeleteBtn"
                  onClick={() => drawerActions.deletePreferenceItem(item.text, activeScope)}
                  aria-label={`删除 ${item.text}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {!visiblePreferences.length && <div className="rv-agent-preference-empty">还没有偏好条件</div>}
          </div>
          <div className="rv-agent-preference-actions">
            <div className="rv-agent-preference-thresholds">
              <RvAgentPreferenceThresholdInput
                title="激活阈值"
                min={0}
                value={drawerView.preferenceState.settings.auto_activate_threshold}
                onChange={(value) => drawerActions.setPreferenceSetting('auto_activate_threshold', value)}
              />
              <RvAgentPreferenceThresholdInput
                title="学习上限"
                value={drawerView.preferenceState.settings.per_conversation_learn_cap}
                disabled={learningDisabled}
                onChange={(value) => drawerActions.setPreferenceSetting('per_conversation_learn_cap', value)}
              />
            </div>
            <div className="rvAgentPreferenceAddField">
              <input
                className="rvAgentPreferenceInput"
                value={preferenceInput}
                onChange={(event) => setPreferenceInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addPreference()
                }}
                placeholder="偏好条件，如 大于20页"
                aria-label="新增 RV Agent 偏好条件"
              />
            <button type="button" className="rvAgentPreferenceAddBtn primary-action icon-only" onClick={addPreference} disabled={!preferenceInput.trim()} aria-label="新增 RV Agent 偏好条件">
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
        </div>
      </section>
    </>
  )
}

function isToolDetailRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseToolDetailJsonText(value: string): unknown {
  const text = value.trim()
  if (!text) return value
  try {
    return JSON.parse(text) as unknown
  } catch {
    return value
  }
}

function normalizeToolDetailValue(value: unknown): unknown {
  return typeof value === 'string' ? parseToolDetailJsonText(value) : value
}

function stringifyToolDetailValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'undefined') return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function appendToolDetailRows(value: unknown, key: string, rows: ToolDetailRow[], depth = 0): void {
  if (rows.length >= TOOL_DETAIL_ROW_LIMIT) return
  const normalized = normalizeToolDetailValue(value)
  if (Array.isArray(normalized)) {
    if (!normalized.length) {
      rows.push({ key: key || 'value', value: '[]' })
      return
    }
    if (depth >= TOOL_DETAIL_DEPTH_LIMIT) {
      rows.push({ key: key || 'value', value: stringifyToolDetailValue(normalized) })
      return
    }
    normalized.forEach((item, index) => appendToolDetailRows(item, key ? `${key}[${index}]` : `[${index}]`, rows, depth + 1))
    return
  }
  if (isToolDetailRecord(normalized)) {
    const entries = Object.entries(normalized)
    if (!entries.length) {
      rows.push({ key: key || 'value', value: '{}' })
      return
    }
    if (depth >= TOOL_DETAIL_DEPTH_LIMIT) {
      rows.push({ key: key || 'value', value: stringifyToolDetailValue(normalized) })
      return
    }
    entries.forEach(([entryKey, entryValue]) => appendToolDetailRows(entryValue, key ? `${key}.${entryKey}` : entryKey, rows, depth + 1))
    return
  }
  rows.push({ key: key || 'value', value: stringifyToolDetailValue(normalized) })
}

function collectToolDetailRows(value: unknown): ToolDetailRow[] {
  const rows: ToolDetailRow[] = []
  appendToolDetailRows(value, '', rows)
  return rows.length > TOOL_DETAIL_ROW_LIMIT ? rows.slice(0, TOOL_DETAIL_ROW_LIMIT) : rows
}

function ToolDetailValue({ value }: { value: unknown }) {
  const normalized = normalizeToolDetailValue(value)
  if (typeof normalized === 'string') return <pre className="rv-agent-tool-use-detail-text">{normalized}</pre>
  const rows = collectToolDetailRows(normalized)
  return (
    <div className="rv-agent-tool-use-detail-grid">
      {rows.map((row, index) => (
        <div key={`${row.key}-${index}`} className="rv-agent-tool-use-detail-row">
          <span className="rv-agent-tool-use-detail-key">{row.key}</span>
          <span className="rv-agent-tool-use-detail-value">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function ToolDetailBlockView({ block }: { block: ToolDetailBlock }) {
  return <ToolDetailValue value={block.text} />
}

function ToolUseItem({
  item,
  rvAgentSelectors,
}: {
  item: Extract<RvAgentTimelineItem, { type: 'tool' }>
  rvAgentSelectors: RvAgentPanelSelectors
}) {
  const [expanded, setExpanded] = useState(false)
  const reqText = JSON.stringify(item.arguments, null, 2)
  const respText = JSON.stringify(item.result, null, 2)
  const responseBlocks = rvAgentSelectors.toolDetailBlocks(item)
  const visibleResponseBlocks: ToolDetailBlock[] = responseBlocks.length ? responseBlocks : [{ kind: 'code', text: respText }]

  return (
    <div className="rv-agent-tool-use">
      <button
        type="button"
        className="rv-agent-tool-use-btn"
        onClick={() => setExpanded(!expanded)}
        aria-label={expanded ? `收起 ${item.name}` : `展开 ${item.name}`}
        aria-expanded={expanded}
      >
        <Wrench size={14} className="rv-agent-tool-use-ico" />
        <span className="rv-agent-tool-use-name">{item.name}</span>
        <ChevronRight size={14} className={`rv-agent-tool-use-chevron${expanded ? ' is-expanded' : ''}`} />
      </button>
      {expanded && (
        <div className="rv-agent-tool-use-details" role="region" aria-label={`${item.name} 详情`}>
          <div className="rv-agent-tool-use-detail-block">
            <span className="rv-agent-tool-use-detail-label">req:</span>
            <ToolDetailValue value={item.arguments ?? reqText} />
          </div>
          <div className="rv-agent-tool-use-detail-block">
            <span className="rv-agent-tool-use-detail-label">resp:</span>
            {visibleResponseBlocks.map((block, index) => (
              <ToolDetailBlockView key={`${block.kind}-${index}`} block={block} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RvAgentInfoCardIcon({
  src,
  tone,
}: {
  src: string
  tone: 'success' | 'warn'
}) {
  if (src) return <img src={src} alt="" className="rv-agent-info-card-icon" aria-hidden="true" />
  return (
    <span className={`rv-agent-info-card-icon-fallback is-${tone}`} aria-hidden="true">
      {tone === 'success' ? <Check size={26} /> : <CircleHelp size={26} />}
    </span>
  )
}

function RvAgentBadgeScroller({
  badges,
  finishedMode = false,
}: {
  badges: CgsRunBadge[]
  finishedMode?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const hasEp = badges.some((badge) => badge.type === 'ep')
  const visibleBadges = !finishedMode && hasEp ? badges.filter((badge) => badge.type === 'ep') : badges

  useEffect(() => {
    const checkOverflow = () => {
      if (!containerRef.current || !contentRef.current) return
      setIsOverflowing(contentRef.current.scrollWidth > containerRef.current.clientWidth)
    }
    const timeout = window.setTimeout(checkOverflow, 50)
    window.addEventListener('resize', checkOverflow)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('resize', checkOverflow)
    }
  }, [visibleBadges])

  const runBadgeLabel = (badge: CgsRunBadge) => badge.type === 'ep' && badge.bookTitle
    ? `${badge.bookTitle}:${badge.text}`
    : badge.text

  const renderBadges = (keyPrefix: string) => visibleBadges.map((badge, index) => (
    <div key={`${keyPrefix}-${badge.type}-${badge.bookTitle || ''}-${badge.text}-${index}`} className={`rv-agent-run-badge${finishedMode ? ' is-finished' : ''}`} aria-label={runBadgeLabel(badge)}>
      {badge.type === 'ep' && badge.bookTitle ? (
        <>
          <span className="rv-agent-run-badge-bookname">{badge.bookTitle}</span>
          {`:${badge.text}`}
        </>
      ) : badge.text}
    </div>
  ))

  return (
    <div className={`rv-agent-run-badge-scroller${finishedMode ? ' is-finished' : ''}`} ref={containerRef}>
      <div ref={contentRef} className={`rv-agent-run-badge-scroller-content${isOverflowing ? ' is-marquee' : ''}`}>
        {renderBadges('main')}
        {isOverflowing && renderBadges('dup')}
      </div>
    </div>
  )
}

function RvAgentSuccessCard({
  item,
  rvAgentActions,
  toastSuccessIconSrc,
  overlay = false,
}: {
  item: Extract<RvAgentTimelineItem, { type: 'final' }>
  rvAgentActions: Pick<RvAgentPanelActions, 'openSuccessTarget'>
  toastSuccessIconSrc: string
  overlay?: boolean
}) {
  const [showTip, setShowTip] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [polygonOffset, setPolygonOffset] = useState(0)

  useEffect(() => {
    if (!showTip || !buttonRef.current || !cardRef.current) return
    const btnRect = buttonRef.current.getBoundingClientRect()
    const cardRect = cardRef.current.getBoundingClientRect()
    setPolygonOffset(cardRect.right - btnRect.left - btnRect.width / 2)
  }, [showTip])

  const successTargets = item.successTargets?.length
    ? item.successTargets
    : item.successTarget
      ? [item.successTarget]
      : []
  const primarySuccessTarget = successTargets[0]
  const canOpen = Boolean(primarySuccessTarget)

  return (
    <div className={overlay ? 'rv-agent-info-card-overlay rv-agent-success-card-overlay' : 'rv-agent-success-card-row'} role={overlay ? 'status' : undefined} aria-atomic={overlay ? true : undefined}>
      <div ref={cardRef} className="rv-agent-info-card rv-agent-success-card">
        {showTip && (
          <div className="rv-agent-info-tooltip">
            {successTargets.length ? (
              <div className="rv-agent-success-destination-scroll">
                {successTargets.map((successTarget) => (
                  <button
                    key={`${successTarget.kind}-${successTarget.shelfBookId}-${successTarget.itemId || successTarget.title}`}
                    type="button"
                    className="rv-agent-success-destination-card"
                    onClick={() => void rvAgentActions.openSuccessTarget(successTarget)}
                    aria-label={`${successTarget.actionLabel} ${successTarget.title}`}
                  >
                    <div className="rv-agent-success-destination-cover">
                      <Cover
                        src={successTarget.coverSrc}
                        title={successTarget.title}
                        badge={null}
                        overlayTags={successTarget.overlayTags}
                      />
                    </div>
                    <strong className="rv-agent-success-destination-title">{successTarget.title}</strong>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="rv-agent-info-tooltip-polygon-wrap">
              <svg className="rv-agent-info-tooltip-polygon" style={{ right: `${polygonOffset - 6}px` }} fill="none" viewBox="0 0 12 8">
                <path d="M6 8L0 0H12L6 8Z" fill="#333333" />
              </svg>
            </div>
          </div>
        )}
        <div className="rv-agent-info-card-content">
          <div className="rv-agent-info-card-header">
            <RvAgentInfoCardIcon src={toastSuccessIconSrc} tone="success" />
            <span className="rv-agent-info-card-heading">运行成功</span>
            {/* RVLAY003: success btnGroup 同样固定三按钮（Settings / RotateCw / CodeXml），
                与 figma-design SuccessCard 的 InfoIcon1/2/3 三按钮对齐；
                不得缩成单按钮。成功语义下无需改 LLM 配置，故 Settings 恒为 disabled
                （与 warn 卡可点开配置不同）；「开始阅读/进入详情」是
                rv-agent-success-destination-card 的职责，此处不抢。RotateCw 同样 disabled。 */}
            <div className="rv-agent-info-card-controls is-success">
              <button
                type="button"
                className="rv-agent-info-card-control-btn"
                aria-label="配置"
                disabled
              >
                <Settings2 size={14} />
              </button>
              <button
                type="button"
                className="rv-agent-info-card-control-btn"
                aria-label="重试"
                disabled
              >
                <RotateCw size={14} />
              </button>
              <button
                ref={buttonRef}
                type="button"
                className={`rv-agent-info-card-control-btn${showTip ? ' is-active' : ''}`}
                onClick={() => setShowTip(!showTip)}
                aria-label="运行结果"
                disabled={!canOpen}
              >
                <CodeXml size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function rvAgentSuccessTargetKey(target: RvAgentSuccessTarget): string {
  return `${target.kind}:${target.shelfBookId}:${target.itemId || target.title}`
}

function rvAgentFinalSuccessTargets(item: Extract<RvAgentTimelineItem, { type: 'final' }>): RvAgentSuccessTarget[] {
  return item.successTargets?.length
    ? item.successTargets
    : item.successTarget
      ? [item.successTarget]
      : []
}

function rvAgentAggregateSuccessFinal(
  rows: RvAgentTimelineItem[],
): Extract<RvAgentTimelineItem, { type: 'final' }> | undefined {
  const successRows = rows.filter((item): item is Extract<RvAgentTimelineItem, { type: 'final' }> =>
    item.type === 'final' && item.success && item.successCardEligible === true && item.cardTone !== 'warn',
  )
  const base = successRows[successRows.length - 1]
  if (!base) return undefined
  const seen = new Set<string>()
  const successTargets: RvAgentSuccessTarget[] = []
  for (const row of successRows) {
    for (const target of rvAgentFinalSuccessTargets(row)) {
      const key = rvAgentSuccessTargetKey(target)
      if (seen.has(key)) continue
      seen.add(key)
      successTargets.push(target)
    }
  }
  return {
    ...base,
    successTarget: successTargets[0],
    successTargets,
  }
}

function CgsMcpTimeline({
  rvAgentView,
  rvAgentSelectors,
  acquireRefs,
}: {
  rvAgentView: RvAgentPanelView
  rvAgentSelectors: RvAgentPanelSelectors
  acquireRefs: Pick<AcquireWorkspaceRefs, 'rvAgentScroll'>
}) {
  // Group consecutive tool items
  // Progress is a session-level singleton: collapse all progress items to the
  // latest one, and never render it inline within grouped items.
  const groupedItems: Array<{ type: 'single'; item: typeof rvAgentView.timeline[number] } | { type: 'tool-group'; items: Array<Extract<typeof rvAgentView.timeline[number], { type: 'tool' }>> }> = []
  let currentToolGroup: Array<Extract<typeof rvAgentView.timeline[number], { type: 'tool' }>> = []
  // Track the canonical progress item separately so we only ever render one.
  let progressItem: Extract<typeof rvAgentView.timeline[number], { type: 'progress' }> | null = null

  for (const item of rvAgentView.timeline) {
    if (item.type === 'progress') {
      // Keep only the latest progress item across the whole session.
      progressItem = item
      continue
    }
    if (item.type === 'tool') {
      currentToolGroup.push(item)
    } else {
      if (currentToolGroup.length > 0) {
        if (currentToolGroup.length === 1) {
          groupedItems.push({ type: 'single', item: currentToolGroup[0] })
        } else {
          groupedItems.push({ type: 'tool-group', items: currentToolGroup })
        }
        currentToolGroup = []
      }
      groupedItems.push({ type: 'single', item })
    }
  }

  if (currentToolGroup.length > 0) {
    if (currentToolGroup.length === 1) {
      groupedItems.push({ type: 'single', item: currentToolGroup[0] })
    } else {
      groupedItems.push({ type: 'tool-group', items: currentToolGroup })
    }
  }

  // Render the singleton progress bubble when it is meaningful: either still
  // running, or a completed run while the session remains active.
  const visibleProgress = progressItem && (!progressItem.completed || rvAgentView.running) ? progressItem : null

  const finalClarification = (item: Extract<RvAgentTimelineItem, { type: 'final' }>) => {
    if (item.outcome && item.outcome.result !== 'changed' && item.outcome.result !== 'failed') {
      const title = item.outcome.assistant_message.title.trim() || '处理结果'
      const message = item.outcome.assistant_message.body.trim() || item.summary.trim()
      return message ? { title, message } : null
    }
    const summary = item.resultSummary
    const isInquiry = summary?.status === 'partial' || item.cardTone === 'llm_interrupted'
    if (!isInquiry) return null
    const blockText = summary?.blocks.find((block) => block.type === 'text')?.text || ''
    const message = (summary?.headline || summary?.summary || blockText || item.markdown || item.summary || '').trim()
    if (!message) return null
    const title = summary?.title && summary.title !== '已提交下载' ? summary.title : '需要确认'
    return { title, message }
  }

  return (
    <div className={`rv-agent-chat-scroll${rvAgentView.historyOpen ? ' is-history-open' : ''}`} ref={acquireRefs.rvAgentScroll} aria-live="polite">
      <div className="rv-agent-chat-scroll-inner">
        {rvAgentView.timeline.length === 0 && !rvAgentView.running && (
          <div className="rv-agent-empty"></div>
        )}
        {groupedItems.map((group, groupIndex) => {
          if (group.type === 'tool-group') {
            return (
              <div key={`tool-group-${groupIndex}`} className="rv-agent-tool-group">
                {group.items.map((item) => (
                  <ToolUseItem key={item.id} item={item} rvAgentSelectors={rvAgentSelectors} />
                ))}
              </div>
            )
          }

          const item = group.item
          if (item.type === 'user') {
            return <div key={item.id} className="rv-agent-msg user">{item.text}</div>
          }
          if (item.type === 'assistant') {
            return <div key={item.id} className="rv-agent-msg assistant">{item.text}</div>
          }
          if (item.type === 'tool') {
            return <ToolUseItem key={item.id} item={item} rvAgentSelectors={rvAgentSelectors} />
          }
          if (item.type === 'progress') {
            // Progress is rendered as a singleton below; never inline.
            return null
          }
          if (item.type === 'final') {
            const clarification = finalClarification(item)
            if (clarification) {
              return (
                <div key={item.id} className="rv-agent-msg assistant">
                  <strong>{clarification.title}</strong>
                  <span>{clarification.message}</span>
                </div>
              )
            }
            return null
          }
          if (item.type === 'decision') {
            return (
              <div key={item.id} className="rv-agent-decision-card">
                <strong>{item.title}</strong>
                <span>{item.message}</span>
                <div className="rv-agent-decision-options">
                  {item.options.map((option) => (
                    <button key={option.id} type="button" className={option.id === item.preferredOptionId ? 'is-preferred' : ''} disabled={Boolean(item.resolvedOptionId)}>
                      <span>{option.label}</span>
                      {option.description && <small>{option.description}</small>}
                    </button>
                  ))}
                </div>
              </div>
            )
          }
          if (item.type === 'confirmation') {
            return (
              <div key={item.id} className="rv-agent-decision-card">
                <strong>{item.title}</strong>
                <span>{item.message}</span>
                <div className="rv-agent-decision-options is-confirmation">
                  <button type="button" disabled={Boolean(item.resolved)}>{item.confirmLabel}</button>
                  <button type="button" disabled={Boolean(item.resolved)}>{item.cancelLabel}</button>
                </div>
              </div>
            )
          }
          return <div key={item.id} className="rv-agent-msg assistant" />
        })}
        {visibleProgress && (
          <RvAgentProgressLineRun key={visibleProgress.id} badges={visibleProgress.badges} progress={visibleProgress.percent ?? 0} completed={visibleProgress.completed} />
        )}
        {rvAgentView.running && (
          <span className="loading-dots rv-agent-typing" aria-label="RV Agent 正在响应">
            <i /><i /><i />
          </span>
        )}
      </div>
    </div>
  )
}

function FinIco() {
  return (
    <svg className="rv-agent-status-zone-fin-ico" fill="none" viewBox="0 0 12.95 9.96171" width="14" height="10">
      <path d="M11.5752 7.71191C11.8071 7.71197 12.0293 7.80391 12.1934 7.96777C12.3575 8.13187 12.4502 8.35485 12.4502 8.58691C12.4501 8.8189 12.3574 9.04103 12.1934 9.20508C12.0293 9.36913 11.8072 9.46186 11.5752 9.46191H6.3252C6.09314 9.46191 5.87015 9.36917 5.70606 9.20508C5.56256 9.06145 5.47391 8.87316 5.45411 8.67285L5.4502 8.58691L5.45411 8.5C5.47404 8.29977 5.56253 8.11131 5.70606 7.96777C5.87015 7.80368 6.09314 7.71191 6.3252 7.71191H11.5752ZM8.95215 0.515625C9.06701 0.493688 9.18547 0.495058 9.29981 0.519531C9.38566 0.537932 9.46863 0.568544 9.54493 0.611328L9.61914 0.658203L9.6875 0.711914C9.73178 0.750027 9.77181 0.792712 9.80762 0.838867L9.8584 0.910156L9.90039 0.986328C9.93929 1.06475 9.96645 1.14862 9.98047 1.23535C9.99913 1.35087 9.99458 1.46934 9.9668 1.58301C9.94015 1.69191 9.89155 1.79378 9.82618 1.88477L9.82715 1.88574L8.74219 3.43457C8.90214 3.29161 9.10954 3.21191 9.3252 3.21191H11.5752C11.8071 3.21197 12.0293 3.30391 12.1934 3.46777C12.3575 3.63187 12.4502 3.85485 12.4502 4.08691C12.4501 4.31891 12.3574 4.54103 12.1934 4.70508C12.0293 4.86913 11.8072 4.96186 11.5752 4.96191H9.3252C9.09314 4.96191 8.87015 4.86917 8.70606 4.70508C8.56256 4.56145 8.47391 4.37316 8.45411 4.17285L8.4502 4.08691L8.45411 4C8.46222 3.91851 8.48181 3.83899 8.51172 3.76367L4.792 9.07812C4.72489 9.17419 4.63928 9.25605 4.54004 9.31836C4.44076 9.38064 4.32959 9.42276 4.21387 9.44141C4.09806 9.46003 3.97913 9.4548 3.86524 9.42676C3.75141 9.39871 3.64466 9.34756 3.55079 9.27734H3.54981L0.849613 7.25195C0.664205 7.11272 0.541586 6.90533 0.508793 6.67578C0.476074 6.44618 0.535682 6.2129 0.674809 6.02734L0.730473 5.96094C0.866497 5.81268 1.05008 5.7153 1.25098 5.68652L1.33789 5.67773C1.53886 5.6692 1.73806 5.73079 1.90039 5.85254H1.89942L3.87696 7.33398L8.39356 0.881836V0.882812C8.45682 0.789869 8.5373 0.709941 8.63086 0.647461C8.72807 0.582576 8.83736 0.537605 8.95215 0.515625ZM11.5752 5.46191C11.8071 5.46197 12.0293 5.55391 12.1934 5.71777C12.3575 5.88187 12.4502 6.10485 12.4502 6.33691C12.4501 6.5689 12.3574 6.79103 12.1934 6.95508C12.0293 7.11913 11.8072 7.21186 11.5752 7.21191H7.8252C7.59314 7.21191 7.37015 7.11917 7.20606 6.95508C7.06256 6.81145 6.97391 6.62316 6.95411 6.42285L6.9502 6.33691L6.95411 6.25C6.97404 6.04977 7.06253 5.86131 7.20606 5.71777C7.37015 5.55368 7.59314 5.46191 7.8252 5.46191H11.5752Z" fill="currentColor" stroke="white" />
    </svg>
  )
}

function RunIco() {
  return (
    <svg className="rv-agent-run-ico" fill="none" viewBox="0 0 10 12.75" width="14" height="14">
      <path d="M9.5 12.25H7.5V8.96387L7.24219 8.71875L6.9375 10.0605L6.83008 10.5361L6.35156 10.4404L2.85156 9.74023L2.36133 9.64258L2.45996 9.15234L2.66016 8.15234L2.75781 7.66016L3.25 7.75977L5.20605 8.1582L5.38672 7.25H1.5C1.23478 7.25 0.980505 7.14457 0.792969 6.95703C0.605432 6.76949 0.5 6.51522 0.5 6.25C0.5 5.98478 0.605432 5.73051 0.792969 5.54297C0.980505 5.35543 1.23478 5.25 1.5 5.25H2C1.73478 5.25 1.4805 5.14457 1.29297 4.95703C1.10543 4.76949 1 4.51522 1 4.25C1 3.98478 1.10543 3.73051 1.29297 3.54297C1.4805 3.35543 1.73478 3.25 2 3.25H2.5C2.23478 3.25 1.9805 3.14457 1.79297 2.95703C1.60543 2.7695 1.5 2.51522 1.5 2.25C1.5 1.98478 1.60543 1.7305 1.79297 1.54297C1.98051 1.35543 2.23478 1.25 2.5 1.25H5.5V3.25H4V4.06836L4.30566 3.93945L6.90527 2.83984L6.98535 2.80469C6.83342 2.56589 6.75 2.28748 6.75 2C6.75 1.60218 6.90815 1.22076 7.18945 0.939453C7.47076 0.658149 7.85218 0.5 8.25 0.5C8.64782 0.5 9.02924 0.658149 9.31055 0.939453C9.59185 1.22076 9.75 1.60218 9.75 2C9.75 2.39782 9.59185 2.77924 9.31055 3.06055C9.14552 3.22558 8.94559 3.34676 8.72852 3.41992C8.74331 3.44168 8.75879 3.46288 8.77246 3.48535H8.77441L9.27441 4.28516L9.2793 4.29395C9.63811 4.89596 10.2917 5.26183 10.9912 5.25L11.5 5.24121V7.25H11C10.4077 7.25 9.82242 7.12296 9.2832 6.87793C9.03055 6.76309 8.79093 6.62274 8.56738 6.46094L8.49414 6.82715L9.34473 7.6377L9.5 7.78613V12.25Z" fill="currentColor" />
    </svg>
  )
}

function RvAgentProgressLineRun({
  badges,
  progress = 0,
  completed = false,
}: {
  badges: CgsRunBadge[]
  progress?: number
  completed?: boolean
}) {
  return (
    <div className="rv-agent-progress-line-run">
      <div className="rv-agent-progress-line-run-header">
        <RunIco />
        <RvAgentBadgeScroller badges={badges} />
      </div>
      <div className="rv-agent-progress-line-run-bar">
        <div className={`rv-agent-progress-line-run-fill${completed ? ' is-complete' : ''}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

function RvAgentStatusZone({
  rvAgentView,
}: {
  rvAgentView: RvAgentPanelView
}) {
  const [expanded, setExpanded] = useState(false)
  const { hasFinished, finishedBadges, detailsText } = rvAgentView.statusZone

  return (
    <div className="rv-agent-status-zone">
      {expanded && (
        <div
          className="rv-agent-status-zone-scrim"
          onClick={() => setExpanded(false)}
        />
      )}
      <div className={`rv-agent-status-zone-card${expanded ? ' is-expanded' : ''}`}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="rv-agent-status-zone-header"
          aria-expanded={expanded}
          aria-label={expanded ? '收起状态' : '展开状态'}
        >
          <div className="rv-agent-status-zone-header-content">
            {hasFinished ? (
              <div className="rv-agent-status-zone-finished">
                <FinIco />
                <RvAgentBadgeScroller badges={finishedBadges} finishedMode />
              </div>
            ) : (
              <div className="rv-agent-status-zone-default">
                <Activity size={14} className="rv-agent-status-zone-status-ico" />
                <span>状态</span>
              </div>
            )}
          </div>
          <ChevronDown size={14} className={`rv-agent-status-zone-chevron${expanded ? ' is-expanded' : ''}`} />
        </button>

        {expanded && (
          <div className="rv-agent-status-zone-details">
            <div className="rv-agent-status-zone-details-box">
              <pre className="rv-agent-status-zone-details-text">
                {detailsText}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CgsMcpAttachedBookList({
  rvAgentView,
  rvAgentActions,
}: {
  rvAgentView: RvAgentPanelView
  rvAgentActions: Pick<RvAgentPanelActions, 'detachBook'>
}) {
  const books = rvAgentView.attachedBookList.length ? rvAgentView.attachedBookList : rvAgentView.attachedBook ? [rvAgentView.attachedBook] : []
  if (!books.length) return null

  return (
    <AttachedBookSelect
      books={books}
      mode="multi"
      selectedIds={books.map((book) => book.attach_book_id || book.id)}
      onSelect={() => undefined}
      onRemove={rvAgentActions.detachBook}
      ariaLabel="已附加书籍"
      className="cgs-search-source rv-agent-attached-books"
      showSelectedOptionStyle={false}
    />
  )
}

function CgsMcpComposer({
  rvAgentView,
  rvAgentActions,
}: {
  rvAgentView: RvAgentPanelView
  rvAgentActions: Pick<
    RvAgentPanelActions,
    | 'endPromptComposition'
    | 'handlePromptKeyDown'
    | 'removeHistoryPrompt'
    | 'setHistoryOpen'
    | 'setPrompt'
    | 'startNewSession'
    | 'startPromptComposition'
    | 'togglePromptRun'
    | 'useHistoryPrompt'
  >
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  // RVLAY003: Composer 实际高度通过 --rv-agent-composer-height 反馈给 .rv-agent-chat-panel，
  // 用于锁定 InfoCard 浮层底部贴在 composer 上沿 14px。不要将 overlay bottom 改回固定 88px。
  useEffect(() => {
    const node = composerRef.current
    const panel = node?.closest('.rv-agent-chat-panel') as HTMLElement | null
    if (!node || !panel) return
    const updateComposerHeight = () => {
      panel.style.setProperty('--rv-agent-composer-height', `${node.getBoundingClientRect().height}px`)
    }
    updateComposerHeight()
    const observer = new ResizeObserver(updateComposerHeight)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`
  }, [rvAgentView.prompt])
  return (
    <div className="rv-agent-composer" ref={composerRef}>
      {rvAgentView.historyOpen && (
        <div className="rv-agent-history-panel" role="listbox" aria-label="历史 RV Agent 指令">
          {rvAgentView.promptHistory.length ? rvAgentView.promptHistory.map((prompt) => (
            <div key={prompt} className="rv-agent-history-item">
              <button
                type="button"
                className="rv-agent-history-item-main"
                onClick={() => rvAgentActions.useHistoryPrompt(prompt)}
                aria-label={`使用历史指令：${prompt}`}
              >
                {prompt}
              </button>
              <button
                type="button"
                className="icon-only rv-agent-history-item-delBtn"
                onClick={(event) => {
                  event.stopPropagation()
                  rvAgentActions.removeHistoryPrompt(prompt)
                }}
                aria-label={`删除历史指令：${prompt}`}
              >
                <X size={14} />
              </button>
            </div>
          )) : <span className="rv-agent-history-empty">暂无历史指令</span>}
        </div>
      )}
      <div className="rv-agent-input-row">
        <textarea
          ref={textareaRef}
          value={rvAgentView.prompt}
          onChange={(event) => rvAgentActions.setPrompt(event.target.value)}
          onCompositionStart={rvAgentActions.startPromptComposition}
          onCompositionEnd={rvAgentActions.endPromptComposition}
          onKeyDown={rvAgentActions.handlePromptKeyDown}
          placeholder="帮我用某站下载某漫画最新两话"
          rows={1}
          aria-label="RV Agent 自然语言指令"
        />
        <button
          type="button"
          className="icon-only rv-agent-new-session-btn"
          onClick={rvAgentActions.startNewSession}
          disabled={rvAgentView.running}
          aria-label="新会话"
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          className="icon-only rv-agent-history-btn"
          onClick={() => rvAgentActions.setHistoryOpen((open) => !open)}
          aria-label="历史指令"
          aria-expanded={rvAgentView.historyOpen}
        >
          <History size={17} />
        </button>
        <button
          type="button"
          className="icon-only rv-agent-send-btn"
          onClick={() => void rvAgentActions.togglePromptRun()}
          disabled={!rvAgentView.running && !rvAgentView.canSend}
          aria-label={rvAgentView.running ? '停止' : '发送'}
        >
          {rvAgentView.running ? <Square size={17} /> : <Send size={17} />}
        </button>
      </div>
    </div>
  )
}

function RvAgentWarnCard({
  warning,
  toastWarnIconSrc,
  onOpenSettings,
  onRetry,
}: {
  warning: RvAgentRepairState
  toastWarnIconSrc: string
  onOpenSettings: () => void
  onRetry: () => void
}) {
  const [showTip, setShowTip] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [polygonOffset, setPolygonOffset] = useState(0)

  useEffect(() => {
    if (showTip && buttonRef.current && cardRef.current) {
      const btnRect = buttonRef.current.getBoundingClientRect()
      const cardRect = cardRef.current.getBoundingClientRect()
      const offset = cardRect.right - btnRect.left - btnRect.width / 2
      setPolygonOffset(offset)
    }
  }, [showTip])

  return (
    <div className="rv-agent-info-card-overlay" role="alert" aria-atomic="true">
      <div 
        ref={cardRef}
        className="rv-agent-info-card"
        style={{ 
          backgroundColor: '#b47125',
          minHeight: '60px'
        }}
      >
        {showTip && (
          <div className="rv-agent-info-tooltip">
            <div className="rv-agent-info-tooltip-shell">
              <p className="rv-agent-info-tooltip-label">报错信息</p>
              {warning.message && <p className="rv-agent-info-tooltip-message">{warning.message}</p>}
              {warning.raw && <p className="rv-agent-info-tooltip-raw">{warning.raw}</p>}
            </div>
            <div className="rv-agent-info-tooltip-polygon-wrap">
              <svg 
                className="rv-agent-info-tooltip-polygon" 
                style={{ right: `${polygonOffset - 6}px` }} 
                fill="none" 
                viewBox="0 0 12 8"
              >
                <path d="M6 8L0 0H12L6 8Z" fill="#333333" />
              </svg>
            </div>
          </div>
        )}
        
        <div className="rv-agent-info-card-content">
          <div className="rv-agent-info-card-header">
            <RvAgentInfoCardIcon src={toastWarnIconSrc} tone="warn" />
            <span className="rv-agent-info-card-heading">{warning.title}</span>
            {/* RVLAY003: btnGroup 固定三个按钮：Settings / Retry / CodeXml。
                Retry 通过 disabled={!repair.canRetry} 灰显，不得通过条件渲染隐藏；
                Settings/CodeXml 始终启用。任何状态（含 cgs_runtime_failed）下控件宽度不得塌缩成单按钮。 */}
            <div className="rv-agent-info-card-controls">
              <button 
                type="button"
                className="rv-agent-info-card-control-btn"
                onClick={onOpenSettings}
                aria-label="配置"
              >
                <Settings2 size={14} />
              </button>
              <button 
                type="button"
                className="rv-agent-info-card-control-btn"
                onClick={onRetry}
                disabled={!warning.canRetry}
                aria-label="重试"
              >
                <RotateCw size={14} />
              </button>
              <button 
                ref={buttonRef}
                type="button"
                className={`rv-agent-info-card-control-btn${showTip ? ' is-active' : ''}`}
                onClick={() => setShowTip(!showTip)}
                aria-label="详情"
              >
                <CodeXml size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function RvAgentPanel({
  rvAgentView,
  rvAgentSelectors,
  rvAgentActions,
  acquireRefs,
}: {
  rvAgentView: RvAgentPanelView
  rvAgentSelectors: RvAgentPanelSelectors
  rvAgentActions: RvAgentPanelActions
  acquireRefs: Pick<AcquireWorkspaceRefs, 'rvAgentGate' | 'rvAgentScroll'>
}) {
  const currentRunTimeline = (() => {
    const lastUserIndex = rvAgentView.timeline.reduce((lastIndex, item, index) => item.type === 'user' ? index : lastIndex, -1)
    return lastUserIndex >= 0 ? rvAgentView.timeline.slice(lastUserIndex) : rvAgentView.timeline
  })()
  const warnFinal = rvAgentView.statusZone.hasFinished
    ? [...currentRunTimeline].reverse().find((item): item is Extract<RvAgentTimelineItem, { type: 'final' }> => item.type === 'final' && item.cardTone === 'warn')
    : undefined
  const successFinal = rvAgentView.statusZone.hasFinished
    ? rvAgentAggregateSuccessFinal(currentRunTimeline)
    : undefined

  return (
    <div
      className={`rv-agent-content acquire-mode-panel ${rvAgentView.active ? 'is-active' : ''} ${rvAgentView.hidden ? 'is-hidden' : ''} ${rvAgentView.disabled ? 'set-disable-ani is-disabled' : ''}`}
      aria-disabled={rvAgentView.disabled}
      hidden={rvAgentView.hidden}
    >
      <div className="section-bar acquire-section-bar">
        <div>
          <h2>RV Agent</h2>
        </div>
      </div>

        <AcquireFlowSteps label="RV Agent 获取流程" steps={rvAgentView.steps} />

      <div className="rv-agent-chat-panel">
        <div className="rv-agent-chat-top">
          <CgsMcpAttachedBookList rvAgentView={rvAgentView} rvAgentActions={rvAgentActions} />
          {rvAgentView.timeline.length > 0 && (
            <div className="rv-agent-status-zone-slot">
              <RvAgentStatusZone rvAgentView={rvAgentView} />
            </div>
          )}
        </div>
        <CgsMcpTimeline rvAgentView={rvAgentView} rvAgentSelectors={rvAgentSelectors} acquireRefs={{ rvAgentScroll: acquireRefs.rvAgentScroll }} />
        {rvAgentView.repair || warnFinal ? (
          <RvAgentWarnCard
            warning={rvAgentView.repair || {
              errorClass: 'mcp_transport_unavailable',
              title: 'RV Agent 服务不可用',
              message: warnFinal?.summary || 'RV Agent 不可用',
              fields: [],
              raw: warnFinal?.markdown || warnFinal?.summary || '',
              canRetry: true,
            }}
            toastWarnIconSrc={rvAgentView.toastWarnIconSrc}
            onOpenSettings={rvAgentActions.openRepairSettings}
            onRetry={() => void rvAgentActions.retryRepair()}
          />
        ) : successFinal ? (
          <RvAgentSuccessCard item={successFinal} rvAgentActions={rvAgentActions} toastSuccessIconSrc={rvAgentView.toastSuccessIconSrc} overlay />
        ) : null}
        <CgsMcpComposer rvAgentView={rvAgentView} rvAgentActions={rvAgentActions} />
      </div>

      {rvAgentView.showGate && (
        <CgsGateLayer
          buttonClassName="rv-agent-gate-button"
          busy={rvAgentView.busy}
          gateButtonRef={acquireRefs.rvAgentGate}
          gateLoadingMode={rvAgentView.gateLoadingMode}
          gatePhase={rvAgentView.gatePhase}
          icon={<Bot className="cgs-gate-icon" size={118} />}
      label="RV Agent"
          mode="mcp"
          onRunGateLoad={rvAgentActions.runGateLoad}
        />
      )}
    </div>
  )
}

export function RvAgentDrawerSettings({
  drawerView,
  drawerActions,
}: {
  drawerView: RvAgentDrawerView
  drawerActions: RvAgentDrawerActions
}) {
  const saveFeedback = useConfDrawerSaveFeedback()
  const [baseUrlHistory, setBaseUrlHistory] = useState(readCgsMcpBaseUrlHistory)
  const [modelHistory, setModelHistory] = useState(readCgsMcpModelHistory)
  useEffect(() => {
    const resetLlmHistory = () => {
      setBaseUrlHistory([])
      setModelHistory([])
    }
    window.addEventListener(CUSTOM_SETTINGS_RESTORED_EVENT, resetLlmHistory)
    return () => window.removeEventListener(CUSTOM_SETTINGS_RESTORED_EVENT, resetLlmHistory)
  }, [])
  const commitBaseUrlHistory = (value: string = drawerView.draft.base_url) => {
    setBaseUrlHistory((currentHistory) => saveCgsMcpBaseUrlHistory(value, currentHistory))
  }
  const commitModelHistory = (value: string = drawerView.draft.model) => {
    setModelHistory((currentHistory) => saveCgsMcpModelHistory(value, currentHistory))
  }
  const saveConfig = () => {
    void saveFeedback.runWithFeedback(() => {
      commitBaseUrlHistory()
      commitModelHistory()
      drawerActions.saveConfig()
    }, { minimumBusyMs: 160 })
  }

  return (
    <>
      <section className="drawer-card cgs-conf-drawer-card rv-agent-drawer-card">
      <div className="drawer-card-header">
        <div className="drawer-card-title">
          <Bot size={17} />
          <strong>RV Agent 配置</strong>
          <button
            type="button"
            className="icon-only cgs-conf-header-preference"
            onClick={drawerActions.openPreferences}
            aria-label="打开 RV Agent 偏好配置面板"
            aria-expanded={drawerView.preferenceOpen}
            aria-controls="rv-agent-preference-sheet"
          >
            <Settings2 size={16} />
          </button>
          <ConfDrawerSaveButton
            className="icon-only cgs-conf-header-save"
            onClick={saveConfig}
            aria-label="保存 LLM 配置"
            busy={saveFeedback.busy}
            feedback={saveFeedback.feedback}
          />
        </div>
      </div>
      <div className="drawer-card-body">
        <label className="drawer-config-field cgs-conf-field">
          <div className="cgs-conf-btn-group cgs-conf-prefixed-group cgs-conf-clear-group">
            <button type="button" className="cgs-conf-text-btn" disabled>baseurl</button>
            <InputHistoryMenu
              value={drawerView.draft.base_url}
              suggestions={baseUrlHistory}
              onValueChange={(value) => drawerActions.setDraft((draft) => ({ ...draft, base_url: value }))}
              placeholder="https://example.com"
              aria-label="LLM base URL"
              menuClassName="cgs-conf-input-history-dropdown"
            />
            <button
              type="button"
              className="icon-only cgs-conf-icon-btn accept-clear"
              onClick={() => drawerActions.setDraft((draft) => ({ ...draft, base_url: '' }))}
              disabled={!drawerView.draft.base_url}
              aria-label="清空 LLM base URL"
            >
              <X size={16} />
            </button>
          </div>
        </label>
        <label className="drawer-config-field cgs-conf-field">
          <div className="cgs-conf-btn-group cgs-conf-prefixed-group cgs-conf-clear-group">
            <button type="button" className="cgs-conf-text-btn" disabled>API Key</button>
            <input
              value={drawerView.draft.api_key}
              onChange={(event) => drawerActions.setDraft((draft) => ({ ...draft, api_key: event.target.value }))}
              type="password"
              autoComplete="current-password"
              placeholder="sk-..."
              aria-label="LLM API key"
            />
            <button
              type="button"
              className="icon-only cgs-conf-icon-btn accept-clear"
              onClick={() => drawerActions.setDraft((draft) => ({ ...draft, api_key: '' }))}
              disabled={!drawerView.draft.api_key}
              aria-label="清空 LLM API Key"
            >
              <X size={16} />
            </button>
          </div>
        </label>
        <label className={`drawer-config-field cgs-conf-field secret-field ${drawerView.modelHelpOpen ? 'help-open' : ''}`} aria-label="LLM model">
          <div className="cgs-conf-btn-group cgs-conf-help-group">
            <button type="button" className="cgs-conf-text-btn" disabled>Model</button>
            <InputHistoryMenu
              value={drawerView.draft.model}
              suggestions={modelHistory}
              onValueChange={(value) => drawerActions.setDraft((draft) => ({ ...draft, model: value }))}
              placeholder="deepseek-ai/DeepSeek-V4-Pro"
              aria-label="LLM model"
              aria-describedby={drawerView.modelHelpOpen ? 'cgs-mcp-model-teachtip' : undefined}
              menuClassName="cgs-conf-input-history-dropdown"
            />
            <button
              type="button"
              className="icon-only cgs-conf-icon-btn cgs-conf-teach-btn"
              onClick={drawerActions.toggleModelHelp}
              aria-label="查看 Model 支持说明"
              aria-expanded={drawerView.modelHelpOpen}
              aria-controls="cgs-mcp-model-teachtip"
            >
              <CircleHelp size={16} />
            </button>
          </div>
          {drawerView.modelHelpOpen && (
            <div id="cgs-mcp-model-teachtip" className="secret-help-popover tail-top-right" role="note" aria-label="Model 支持说明">
              <span>支持 openai-chat 兼容接口</span>
              <span>可能有帮助：baseurl 尝试加 <code>/v1</code>; 最后不要带 <code>/</code></span>
            </div>
          )}
        </label>
      </div>
      </section>
    </>
  )
}
