import { useState, useEffect, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Bot, Check, CheckCheck, Eraser, LoaderCircle, Minus, Move, Plus, PlugZap, WifiOff } from 'lucide-react'
import { CustomIcon } from '../icons/CustomIcon'
import type {
  AcquireWorkspaceActions,
  AcquireWorkspaceView,
  CgsGateFlight as CgsGateFlightState,
  CgsGatePhase,
  CgsStep,
  CgsWorkspaceMode,
} from './acquireTypes'

export function AcquireFlowSteps({ label, steps }: { label: string; steps: CgsStep[] }) {
  return (
    <div className="flow-strip flow-steps" aria-label={label}>
      {steps.map((step, index) => {
        const content = (
          <>
            <div className="flow-step-icon" aria-hidden="true">
              {step.loading ? <LoaderCircle className="spin" size={15} /> : step.icon}
            </div>
            <span>{step.title}</span>
          </>
        )
        return (
          <div className={`flow-step ${step.state} ${step.className || ''} ${step.expanded ? 'is-expanded' : ''}`} key={step.key} aria-label={step.ariaLabel}>
            {step.onClick ? (
              <button
                type="button"
                className="flow-step-action"
                onClick={step.onClick}
                disabled={step.disabled}
                aria-expanded={step.expanded}
              >
                {content}
              </button>
            ) : content}
            {step.flyout}
            {index < steps.length - 1 && <i className="flow-step-line" aria-hidden="true" />}
          </div>
        )
      })}
    </div>
  )
}

export function CgsGateLayer({
  buttonClassName = '',
  busy,
  gateButtonRef,
  gateLoadingMode,
  gatePhase,
  icon,
  label,
  mode,
  onRunGateLoad,
}: {
  buttonClassName?: string
  busy: string
  gateButtonRef: RefObject<HTMLButtonElement | null>
  gateLoadingMode: CgsWorkspaceMode | null
  gatePhase: CgsGatePhase
  icon: ReactNode
  label: string
  mode: CgsWorkspaceMode
  onRunGateLoad: (mode: CgsWorkspaceMode) => Promise<void> | void
}) {
  return (
    <div className={`cgs-gate-layer ${mode === 'mcp' ? 'rv-agent-gate-layer' : ''}`} aria-live="polite">
      <button
        ref={gateButtonRef}
        type="button"
        className={`cgs-gate-button ${buttonClassName} ${gatePhase === 'loading' && gateLoadingMode === mode ? 'is-loading' : ''}`}
        onClick={() => void onRunGateLoad(mode)}
        disabled={gatePhase === 'loading' || busy === 'cgs-sites'}
        aria-label={label}
      >
        {icon}
      </button>
    </div>
  )
}

export function CgsGateFlight({
  flight,
  onComplete,
}: {
  flight: CgsGateFlightState
  onComplete?: () => void
}) {
  return (
    <div
      className={`cgs-gate-flight ${flight.connection === 'unreachable' ? 'error' : 'ok'} target-${flight.target}`}
      style={{
        '--flight-left': `${flight.left}px`,
        '--flight-top': `${flight.top}px`,
        '--flight-width': `${flight.width}px`,
        '--flight-height': `${flight.height}px`,
        '--flight-dx': `${flight.dx}px`,
        '--flight-dy': `${flight.dy}px`,
        '--flight-scale-x': String(flight.scaleX),
        '--flight-scale-y': String(flight.scaleY),
      } as CSSProperties}
      onAnimationEnd={onComplete}
      aria-hidden="true"
    >
      {flight.connection === 'unreachable'
        ? <WifiOff className="cgs-gate-icon" size={118} />
        : flight.mode === 'mcp'
          ? <Bot className="cgs-gate-icon" size={118} />
          : <PlugZap className="cgs-gate-icon" size={118} />}
    </div>
  )
}

function selectedBatteryBadgeStyle(selectedCount: number, totalCount: number): CSSProperties {
  const ratio = totalCount > 0 ? Math.min(selectedCount / totalCount, 1) : 0
  const color = ratio >= 0.8 ? '#00c853' : ratio >= 0.4 ? 'var(--warning-text)' : 'var(--accent)'
  return {
    '--cgs-submit-badge-fill': `${Math.round(ratio * 100)}%`,
    '--cgs-submit-badge-color': color,
  } as CSSProperties
}

export function CgsSubmitFloat({
  acquireView,
  acquireActions,
}: {
  acquireView: AcquireWorkspaceView
  acquireActions: AcquireWorkspaceActions
}) {
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpPage, setJumpPage] = useState(() => String(acquireView.currentPage || 1))
  const [submitBadgePop, setSubmitBadgePop] = useState(false)

  useEffect(() => {
    setSubmitBadgePop(false)
    const frame = window.requestAnimationFrame(() => setSubmitBadgePop(true))
    return () => window.cancelAnimationFrame(frame)
  }, [acquireView.selectedCount])

  if (!acquireView.showFloatingSubmit) return null

  const submitCountLabel = acquireView.selectedCount || 0
  const submitBadgeStyle = selectedBatteryBadgeStyle(submitCountLabel, acquireView.resultCount)
  const updateJumpPage = (nextPage: number) => setJumpPage(String(Math.max(1, Math.floor(nextPage))))
  const stepJumpPage = (delta: number) => updateJumpPage((Number.parseInt(jumpPage, 10) || acquireView.currentPage || 1) + delta)
  const acceptJumpPage = () => {
    const page = Math.max(1, Number.parseInt(jumpPage, 10) || acquireView.currentPage || 1)
    setJumpOpen(false)
    setJumpPage(String(page))
    void acquireActions.jumpPage(page)
  }
  const submitActions = [
    {
      key: 'submit',
      className: 'cgs-submit-action cgs-submit-action-submit handle-btn handle-saveBtn',
      onClick: () => void acquireActions.submit(),
      disabled: acquireView.submitDisabled,
      ariaLabel: `提交选中 ${acquireView.selectedCount} 项`,
      content: <CustomIcon name="cgsSubmit" className="cgs-submit-icon" size={22} />,
    },
    {
      key: 'next',
      className: 'cgs-submit-action cgs-submit-action-next',
      onClick: () => void acquireActions.nextPage(),
      disabled: acquireView.pageTurnDisabled,
      ariaLabel: `提交选中并切换到第 ${acquireView.currentPage + 1} 页`,
      content: acquireView.pageTurnLoading ? <LoaderCircle className="spin" size={20} /> : <CustomIcon name="cgsSubmitNext" size={22} />,
    },
    {
      key: 'jump',
      className: 'cgs-submit-action cgs-submit-action-jump',
      onClick: () => {
        setJumpPage(String(acquireView.currentPage || 1))
        setJumpOpen((open) => !open)
      },
      disabled: acquireView.pageTurnDisabled,
      ariaExpanded: jumpOpen,
      ariaLabel: `跳转页码，当前第 ${acquireView.currentPage} 页`,
      content: (
        <>
          <CustomIcon name="cgsSubmitJump" size={22} />
          <span className="cgs-submit-page">{acquireView.currentPage}</span>
        </>
      ),
    },
  ]
  const floatStyle = {
    left: `clamp(8px, ${acquireView.submitPosition.x}px, calc(100dvw - (var(--cgs-submit-action-width) * var(--cgs-submit-action-count)) - 20px))`,
    top: acquireView.submitPosition.y,
    '--cgs-submit-action-count': submitActions.length,
  } as CSSProperties

  return (
    <div className="cgs-submit-float cgs-acquire-submit-float" style={floatStyle}>
      <div className="btn-group cgs-submit-main" role="group" aria-label={`CGS 当前第 ${acquireView.currentPage} 页操作`}>
        {submitActions.map((action) => (
          <button
            key={action.key}
            className={action.className}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            aria-expanded={action.ariaExpanded}
            aria-label={action.ariaLabel}
          >
            {action.content}
          </button>
        ))}
      </div>
      <span
        className={`cgs-submit-badge cgs-submit-battery-badge${submitBadgePop ? ' is-pop' : ''}`}
        style={submitBadgeStyle}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform') setSubmitBadgePop(false)
        }}
        aria-label={`已选 ${submitCountLabel} 项`}
      >
        <span className="cgs-submit-badge-text">{submitCountLabel}</span>
      </span>
      {jumpOpen && (
        <div className="cgs-submit-jump-flyout tail-top-right" role="tooltip">
          <div className="btn-group cgs-submit-jump-field" role="group" aria-label="目标页码">
            <button
              type="button"
              className="icon-only cgs-submit-jump-step"
              onClick={() => stepJumpPage(-1)}
              disabled={acquireView.pageTurnDisabled || (Number.parseInt(jumpPage, 10) || acquireView.currentPage || 1) <= 1}
              aria-label="页码减一"
            >
              <Minus size={14} />
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={jumpPage}
              aria-label="输入目标页码"
              aria-valuemin={1}
              aria-valuenow={Number(jumpPage) || acquireView.currentPage || 1}
              onChange={(event) => setJumpPage(event.currentTarget.value.replace(/\D/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') acceptJumpPage()
                if (event.key === 'Escape') setJumpOpen(false)
              }}
            />
            <button
              type="button"
              className="icon-only cgs-submit-jump-step"
              onClick={() => stepJumpPage(1)}
              disabled={acquireView.pageTurnDisabled}
              aria-label="页码加一"
            >
              <Plus size={14} />
            </button>
            <button type="button" className="icon-only acceptBtn cgs-submit-jump-accept" onClick={acceptJumpPage} disabled={acquireView.pageTurnDisabled || !jumpPage} aria-label="跳转到输入页码">
              <Check size={14} />
            </button>
          </div>
        </div>
      )}
      <div className="btn-group cgs-submit-tools" role="group" aria-label="提交浮标工具">
        <button
          type="button"
          className="icon-only"
          onClick={acquireActions.selectAllCurrentPage}
          disabled={!acquireView.resultCount || acquireView.pageTurnLoading}
          aria-label="全选当前页"
        >
          <CheckCheck size={14} />
        </button>
        <button
          className="clearBtn cgs-submit-clear icon-only"
          type="button"
          onClick={acquireActions.clearSelection}
          disabled={acquireView.clearDisabled}
          aria-label="清除所有选中"
        >
          <Eraser size={14} />
        </button>
        <button
          className="cgs-submit-drag"
          type="button"
          aria-label="拖动提交按钮"
          onPointerDown={acquireActions.startSubmitDrag}
          onPointerMove={acquireActions.moveSubmitDrag}
          onPointerUp={acquireActions.finishSubmitDrag}
          onPointerCancel={acquireActions.finishSubmitDrag}
        >
          <Move size={14} />
        </button>
      </div>
    </div>
  )
}
