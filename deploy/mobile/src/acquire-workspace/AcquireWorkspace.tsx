import { CgsMcpDrawerSettings, CgsMcpPanel } from './cgs-mcp/CgsMcpPanel'
import { CgsServerDrawerSettings, CgsServerPanel } from './cgs-server/CgsServerPanel'
import { CgsGateFlight, CgsSubmitFloat } from './acquireUi'
import type {
  AcquireWorkspaceActions,
  AcquireWorkspaceRefs,
  AcquireWorkspaceView,
  CgsMcpDrawerActions,
  CgsMcpDrawerView,
  CgsMcpPanelActions,
  CgsMcpPanelSelectors,
  CgsMcpPanelView,
  CgsServerDrawerActions,
  CgsServerDrawerView,
  CgsServerPanelActions,
  CgsServerPanelSelectors,
  CgsServerPanelView,
} from './acquireTypes'

export type AcquireWorkspaceProps = {
  acquireView: AcquireWorkspaceView
  serverView: CgsServerPanelView
  serverSelectors: CgsServerPanelSelectors
  serverActions: CgsServerPanelActions
  mcpView: CgsMcpPanelView
  mcpSelectors: CgsMcpPanelSelectors
  mcpActions: CgsMcpPanelActions
  acquireActions: AcquireWorkspaceActions
  acquireRefs: AcquireWorkspaceRefs
}

export type AcquireDrawerSettingsProps = {
  serverDrawerView: CgsServerDrawerView
  serverDrawerActions: CgsServerDrawerActions
  mcpDrawerView: CgsMcpDrawerView
  mcpDrawerActions: CgsMcpDrawerActions
}

export function AcquireWorkspace({
  acquireView,
  serverView,
  serverSelectors,
  serverActions,
  mcpView,
  mcpSelectors,
  mcpActions,
  acquireActions,
  acquireRefs,
}: AcquireWorkspaceProps) {
  return (
    <section className={`acquire-workspace ${acquireView.locked ? 'gate-locked' : ''} mode-${acquireView.mode || 'unset'}`}>
      <CgsServerPanel
        serverView={serverView}
        serverSelectors={serverSelectors}
        serverActions={serverActions}
        acquireRefs={{ manualGate: acquireRefs.manualGate }}
      />

      <CgsMcpPanel
        mcpView={mcpView}
        mcpSelectors={mcpSelectors}
        mcpActions={mcpActions}
        acquireRefs={{ mcpGate: acquireRefs.mcpGate, mcpScroll: acquireRefs.mcpScroll }}
      />

      {acquireView.flights.map((flight) => (
        <CgsGateFlight
          key={flight.target}
          flight={flight}
          onComplete={flight.target === 'rail' ? acquireActions.completeGateFlight : undefined}
        />
      ))}

      <CgsSubmitFloat acquireView={acquireView} acquireActions={acquireActions} />
    </section>
  )
}

export function AcquireDrawerSettings({
  serverDrawerView,
  serverDrawerActions,
  mcpDrawerView,
  mcpDrawerActions,
}: AcquireDrawerSettingsProps) {
  return (
    <>
      <CgsServerDrawerSettings drawerView={serverDrawerView} drawerActions={serverDrawerActions} />
      <CgsMcpDrawerSettings drawerView={mcpDrawerView} drawerActions={mcpDrawerActions} />
    </>
  )
}
