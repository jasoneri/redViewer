import { RvAgentDrawerSettings, RvAgentPanel, RvAgentPreferenceSheet } from './rv-agent/RvAgentPanel'
import { CgsServerDrawerSettings, CgsServerPanel } from './cgs-server/CgsServerPanel'
import { CgsGateFlight, CgsSubmitFloat } from './acquireUi'
import type {
  AcquireWorkspaceActions,
  AcquireWorkspaceRefs,
  AcquireWorkspaceView,
  RvAgentDrawerActions,
  RvAgentDrawerView,
  RvAgentPanelActions,
  RvAgentPanelSelectors,
  RvAgentPanelView,
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
  rvAgentView: RvAgentPanelView
  rvAgentSelectors: RvAgentPanelSelectors
  rvAgentActions: RvAgentPanelActions
  rvAgentDrawerView: RvAgentDrawerView
  rvAgentDrawerActions: RvAgentDrawerActions
  acquireActions: AcquireWorkspaceActions
  acquireRefs: AcquireWorkspaceRefs
}

export type AcquireDrawerSettingsProps = {
  serverDrawerView: CgsServerDrawerView
  serverDrawerActions: CgsServerDrawerActions
  rvAgentDrawerView: RvAgentDrawerView
  rvAgentDrawerActions: RvAgentDrawerActions
}

export function AcquireWorkspace({
  acquireView,
  serverView,
  serverSelectors,
  serverActions,
  rvAgentView,
  rvAgentSelectors,
  rvAgentActions,
  rvAgentDrawerView,
  rvAgentDrawerActions,
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

      <RvAgentPanel
        rvAgentView={rvAgentView}
        rvAgentSelectors={rvAgentSelectors}
        rvAgentActions={rvAgentActions}
        acquireRefs={{ rvAgentGate: acquireRefs.rvAgentGate, rvAgentScroll: acquireRefs.rvAgentScroll }}
      />

      {acquireView.flights.map((flight) => (
        <CgsGateFlight
          key={flight.target}
          flight={flight}
          onComplete={flight.target === 'rail' ? acquireActions.completeGateFlight : undefined}
        />
      ))}

      <CgsSubmitFloat acquireView={acquireView} acquireActions={acquireActions} />

      {rvAgentDrawerView.preferenceOpen && <RvAgentPreferenceSheet drawerView={rvAgentDrawerView} drawerActions={rvAgentDrawerActions} />}
    </section>
  )
}

export function AcquireDrawerSettings({
  serverDrawerView,
  serverDrawerActions,
  rvAgentDrawerView,
  rvAgentDrawerActions,
}: AcquireDrawerSettingsProps) {
  return (
    <>
      <CgsServerDrawerSettings drawerView={serverDrawerView} drawerActions={serverDrawerActions} />
      <RvAgentDrawerSettings drawerView={rvAgentDrawerView} drawerActions={rvAgentDrawerActions} />
    </>
  )
}
