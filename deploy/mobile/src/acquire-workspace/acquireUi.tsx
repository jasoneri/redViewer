import type { CSSProperties, ReactNode, RefObject } from 'react'
import { Eraser, Move, PlugZap, WifiOff } from 'lucide-react'
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
      {steps.map((step, index) => (
        <div className={`flow-step ${step.state}`} key={step.key}>
          <div className="flow-step-icon" aria-hidden="true">
            {step.icon}
          </div>
          <span>{step.title}</span>
          {index < steps.length - 1 && <i className="flow-step-line" aria-hidden="true" />}
        </div>
      ))}
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
    <div className={`cgs-gate-layer ${mode === 'mcp' ? 'cgs-mcp-gate-layer' : ''}`} aria-live="polite">
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
          ? <CustomIcon name="mcp" className="cgs-gate-icon" size={118} />
          : <PlugZap className="cgs-gate-icon" size={118} />}
    </div>
  )
}

export function CgsSubmitFloat({
  acquireView,
  acquireActions,
}: {
  acquireView: AcquireWorkspaceView
  acquireActions: AcquireWorkspaceActions
}) {
  if (!acquireView.showFloatingSubmit) return null

  return (
    <div className="cgs-submit-float" style={{ left: acquireView.submitPosition.x, top: acquireView.submitPosition.y } as CSSProperties}>
      <button
        className="cgs-submit-main handle-btn handle-saveBtn"
        type="button"
        onClick={() => void acquireActions.submit()}
        disabled={acquireView.submitDisabled}
        aria-label={`提交选中 ${acquireView.selectedCount} 项`}
      >
        <CustomIcon name="cgsSubmit" className="cgs-submit-icon" size={24} />
        <span className="cgs-submit-badge">{acquireView.selectedCount || acquireView.resultCount}</span>
      </button>
      <div className="btn-group cgs-submit-tools" role="group" aria-label="提交浮标工具">
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
        <button
          className="clearBtn cgs-submit-clear icon-only"
          type="button"
          onClick={acquireActions.clearSelection}
          disabled={acquireView.clearDisabled}
          aria-label="清除所有选中"
          title="清除所有选中"
        >
          <Eraser size={14} />
        </button>
      </div>
    </div>
  )
}
