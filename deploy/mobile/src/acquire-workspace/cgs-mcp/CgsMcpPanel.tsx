import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, CircleHelp, History, LoaderCircle, Save, Send, Square } from 'lucide-react'
import { CustomIcon } from '../../icons/CustomIcon'
import { ProgressMeter } from '../../shared/Cover'
import { AcquireFlowSteps, CgsGateLayer } from '../acquireUi'
import type {
  AcquireWorkspaceRefs,
  CgsMcpDrawerActions,
  CgsMcpDrawerView,
  CgsMcpPanelActions,
  CgsMcpPanelSelectors,
  CgsMcpPanelView,
} from '../acquireTypes'

function CgsMcpTimeline({
  mcpView,
  mcpSelectors,
  mcpActions,
  acquireRefs,
}: {
  mcpView: CgsMcpPanelView
  mcpSelectors: CgsMcpPanelSelectors
  mcpActions: Pick<CgsMcpPanelActions, 'setExpandedToolId'>
  acquireRefs: Pick<AcquireWorkspaceRefs, 'mcpScroll'>
}) {
  return (
    <div className="mcp-chat-scroll" ref={acquireRefs.mcpScroll} aria-live="polite">
      {mcpView.timeline.length === 0 && !mcpView.running && (
        <div className="mcp-empty">
        </div>
      )}
      {mcpView.timeline.map((item) => {
        if (item.type === 'user') {
          return <div key={item.id} className="mcp-msg user">{item.text}</div>
        }
        if (item.type === 'assistant') {
          return <div key={item.id} className="mcp-msg assistant">{item.text}</div>
        }
        if (item.type === 'tool') {
          const tone = mcpSelectors.toolTone(item.result)
          const summary = mcpSelectors.toolSummary(item.result)
          const expanded = mcpView.expandedToolId === item.id
          const detailBlocks = mcpSelectors.toolDetailBlocks(item)

          return (
            <div key={item.id} className="mcp-tool-entry">
              <div className={`status-line mcp-tool-line ${tone} ${expanded ? 'is-expanded' : ''}`}>
                <span className="status-icon"><CustomIcon name="mcp" size={14} /></span>
                <div className="mcp-tool-body">
                  <span>{item.name}</span>
                  <strong title={summary}>{summary}</strong>
                </div>
                <button
                  type="button"
                  className="icon-only mcp-tool-expand"
                  onClick={() => mcpActions.setExpandedToolId((current) => current === item.id ? null : item.id)}
                  aria-label={expanded ? `收起 ${item.name} 结果` : `展开 ${item.name} 结果`}
                  aria-expanded={expanded}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              {expanded && (
                <div className="mcp-tool-details" role="region" aria-label={`${item.name} 结果详情`}>
                  {detailBlocks.map((block, index) => block.kind === 'code' ? (
                    <pre key={`${item.id}-detail-${index}`}><code>{block.language ? `\`\`\`${block.language}\n${block.text}\n\`\`\`` : `\`\`\`\n${block.text}\n\`\`\``}</code></pre>
                  ) : (
                    <p key={`${item.id}-detail-${index}`}>{block.text}</p>
                  ))}
                </div>
              )}
            </div>
          )
        }
        if (item.type === 'progress') {
          return (
            <div key={item.id} className="mcp-progress-line">
              <div>
                <strong>{item.status}</strong>
                <span>{item.summary}</span>
              </div>
              {item.percent !== null && <ProgressMeter value={item.percent} />}
            </div>
          )
        }
        if (item.type === 'final') {
          return (
            <div key={item.id} className={`mcp-final ${item.success ? 'ok' : 'error'}`}>
              <strong>{item.success ? '完成' : '失败'}</strong>
              <span>{item.summary}</span>
            </div>
          )
        }
        return <div key={item.id} className="mcp-msg assistant" />
      })}
      {mcpView.running && (
        <span className="loading-dots mcp-typing" aria-label="MCP 正在响应">
          <i /><i /><i />
        </span>
      )}
    </div>
  )
}

function CgsMcpComposer({
  mcpView,
  mcpActions,
}: {
  mcpView: CgsMcpPanelView
  mcpActions: Pick<
    CgsMcpPanelActions,
    | 'endPromptComposition'
    | 'handlePromptKeyDown'
    | 'setHistoryOpen'
    | 'setPrompt'
    | 'startPromptComposition'
    | 'togglePromptRun'
    | 'useHistoryPrompt'
  >
}) {
  return (
    <div className="mcp-composer">
      {mcpView.historyOpen && (
        <div className="mcp-history-panel" role="listbox" aria-label="历史 MCP 指令">
          {mcpView.promptHistory.length ? mcpView.promptHistory.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="mcp-history-item"
              onClick={() => mcpActions.useHistoryPrompt(prompt)}
              aria-label={`使用历史指令：${prompt}`}
            >
              {prompt}
            </button>
          )) : <span className="mcp-history-empty">暂无历史指令</span>}
        </div>
      )}
      <div className="mcp-input-row">
        <textarea
          value={mcpView.prompt}
          onChange={(event) => mcpActions.setPrompt(event.target.value)}
          onCompositionStart={mcpActions.startPromptComposition}
          onCompositionEnd={mcpActions.endPromptComposition}
          onKeyDown={mcpActions.handlePromptKeyDown}
          placeholder="帮我用某站下载某漫画最新两话"
          rows={1}
          aria-label="MCP 自然语言指令"
        />
        <button
          type="button"
          className="icon-only mcp-history-btn"
          onClick={() => mcpActions.setHistoryOpen((open) => !open)}
          aria-label="历史指令"
          aria-expanded={mcpView.historyOpen}
        >
          <History size={17} />
        </button>
        <button
          type="button"
          className="icon-only mcp-send-btn"
          onClick={() => void mcpActions.togglePromptRun()}
          disabled={!mcpView.running && !mcpView.canSend}
          aria-label={mcpView.running ? '停止' : '发送'}
        >
          {mcpView.running ? <Square size={17} /> : <Send size={17} />}
        </button>
      </div>
    </div>
  )
}

export function CgsMcpPanel({
  mcpView,
  mcpSelectors,
  mcpActions,
  acquireRefs,
}: {
  mcpView: CgsMcpPanelView
  mcpSelectors: CgsMcpPanelSelectors
  mcpActions: CgsMcpPanelActions
  acquireRefs: Pick<AcquireWorkspaceRefs, 'mcpGate' | 'mcpScroll'>
}) {
  return (
    <div
      className={`mcp-content acquire-mode-panel ${mcpView.active ? 'is-active' : ''} ${mcpView.hidden ? 'is-hidden' : ''} ${mcpView.disabled ? 'set-disable-ani is-disabled' : ''}`}
      aria-disabled={mcpView.disabled}
      hidden={mcpView.hidden}
    >
      <div className="section-bar acquire-section-bar">
        <div>
          <h2>CGS mcp</h2>
        </div>
      </div>

      <AcquireFlowSteps label="MCP 获取流程" steps={mcpView.steps} />

      <div className="mcp-chat-panel">
        <CgsMcpTimeline mcpView={mcpView} mcpSelectors={mcpSelectors} mcpActions={mcpActions} acquireRefs={{ mcpScroll: acquireRefs.mcpScroll }} />
        <CgsMcpComposer mcpView={mcpView} mcpActions={mcpActions} />
      </div>

      {mcpView.showGate && (
        <CgsGateLayer
          buttonClassName="cgs-mcp-gate-button"
          busy={mcpView.busy}
          gateButtonRef={acquireRefs.mcpGate}
          gateLoadingMode={mcpView.gateLoadingMode}
          gatePhase={mcpView.gatePhase}
          icon={<CustomIcon name="mcp" className="cgs-gate-icon" size={118} />}
          label="MCP"
          mode="mcp"
          onRunGateLoad={mcpActions.runGateLoad}
        />
      )}
    </div>
  )
}

export function CgsMcpDrawerSettings({
  drawerView,
  drawerActions,
}: {
  drawerView: CgsMcpDrawerView
  drawerActions: CgsMcpDrawerActions
}) {
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'check' | 'fading'>('idle')
  const saveFeedbackTimers = useRef<number[]>([])
  const clearSaveFeedbackTimers = () => {
    saveFeedbackTimers.current.forEach((timer) => window.clearTimeout(timer))
    saveFeedbackTimers.current = []
  }
  const showSaveCompleteFeedback = () => {
    clearSaveFeedbackTimers()
    setSaveFeedback('check')
    saveFeedbackTimers.current = [
      window.setTimeout(() => setSaveFeedback('fading'), 1500),
      window.setTimeout(() => setSaveFeedback('idle'), 1800),
    ]
  }
  const saveConfig = () => {
    clearSaveFeedbackTimers()
    setSaveFeedback('idle')
    setSaveBusy(true)
    saveFeedbackTimers.current = [window.setTimeout(() => {
      drawerActions.saveConfig()
      setSaveBusy(false)
      showSaveCompleteFeedback()
    }, 160)]
  }

  useEffect(() => () => clearSaveFeedbackTimers(), [])

  const saveIcon = saveBusy
    ? <LoaderCircle className="spin" size={18} />
    : saveFeedback === 'idle'
      ? <Save size={18} />
      : <Check className={`cgs-save-check${saveFeedback === 'fading' ? ' is-fading' : ''}`} size={18} />

  return (
    <section className="drawer-card cgs-conf-drawer-card cgs-mcp-drawer-card">
      <div className="drawer-card-header">
        <div className="drawer-card-title">
          <CustomIcon name="mcp" size={17} />
          <strong>LLM {'>'} MCP 配置</strong>
          <button
            type="button"
            className="icon-only cgs-conf-header-save"
            onClick={saveConfig}
            disabled={saveBusy}
            aria-label="保存 MCP"
            title="保存 MCP"
          >
            {saveIcon}
          </button>
        </div>
      </div>
      <div className="drawer-card-body">
        <label className="cgs-conf-field">
          <div className="cgs-conf-btn-group cgs-conf-prefixed-group">
            <button type="button" className="cgs-conf-text-btn" disabled>baseurl</button>
            <input
              value={drawerView.draft.base_url}
              onChange={(event) => drawerActions.setDraft((draft) => ({ ...draft, base_url: event.target.value }))}
              placeholder="https://example.com"
              aria-label="LLM base URL"
            />
          </div>
        </label>
        <label className="cgs-conf-field">
          <div className="cgs-conf-btn-group cgs-conf-prefixed-group">
            <button type="button" className="cgs-conf-text-btn" disabled>API Key</button>
            <input
              value={drawerView.draft.api_key}
              onChange={(event) => drawerActions.setDraft((draft) => ({ ...draft, api_key: event.target.value }))}
              type="password"
              autoComplete="current-password"
              placeholder="sk-..."
              aria-label="LLM API key"
            />
          </div>
        </label>
        <label className={`cgs-conf-field secret-field ${drawerView.modelHelpOpen ? 'help-open' : ''}`} aria-label="LLM model">
          <div className="cgs-conf-btn-group cgs-conf-help-group">
            <button type="button" className="cgs-conf-text-btn" disabled>Model</button>
            <input
              value={drawerView.draft.model}
              onChange={(event) => drawerActions.setDraft((draft) => ({ ...draft, model: event.target.value }))}
              placeholder="gpt-5.4-mini"
              aria-label="LLM model"
              aria-describedby={drawerView.modelHelpOpen ? 'cgs-mcp-model-teachtip' : undefined}
            />
            <button
              type="button"
              className="icon-only cgs-conf-icon-btn cgs-conf-teach-btn"
              onClick={drawerActions.toggleModelHelp}
              aria-label="查看 Model 支持说明"
              aria-expanded={drawerView.modelHelpOpen}
              aria-controls="cgs-mcp-model-teachtip"
              title="Model 支持说明"
            >
              <CircleHelp size={16} />
            </button>
          </div>
          {drawerView.modelHelpOpen && (
            <div id="cgs-mcp-model-teachtip" className="secret-help-popover tail-top-right" role="note" aria-label="Model 支持说明">
              <strong>Model 支持说明</strong>
              <span>只支持 openai-chat 模型</span>
            </div>
          )}
        </label>
      </div>
    </section>
  )
}
