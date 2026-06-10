import { FolderOpen, LoaderCircle, PlugZap, RefreshCw, Search, Tags, UserSearch, X } from 'lucide-react'
import { Tag } from 'antd'
import { Cover } from '../../shared/Cover'
import type { CgsBook } from '../../mobileStore'
import { AcquireFlowSteps, CgsGateLayer } from '../acquireUi'
import type {
  AcquireWorkspaceRefs,
  CgsSearchCandidate,
  CgsServerDrawerActions,
  CgsServerDrawerView,
  CgsServerPanelActions,
  CgsServerPanelSelectors,
  CgsServerPanelView,
} from '../acquireTypes'

function CgsSearchControls({
  serverView,
  serverActions,
}: {
  serverView: CgsServerPanelView
  serverActions: Pick<CgsServerPanelActions, 'search' | 'selectSearchCandidate' | 'setKeyword' | 'setSelectedSite'>
}) {
  return (
    <>
      {serverView.searchBookInfo && serverView.searchCandidates.length > 0 && (
        <CgsSearchSource
          bookTitle={serverView.searchBookInfo.book}
          candidates={serverView.searchCandidates}
          keyword={serverView.keyword}
          onSelect={serverActions.selectSearchCandidate}
        />
      )}

      <div className="acquire-search-row btn-group">
        <select
          className="acquire-site-select"
          value={serverView.selectedSite}
          onChange={(event) => serverActions.setSelectedSite(event.target.value)}
          aria-label="选择站点"
        >
          <option value="">选择站点</option>
          {serverView.sites.map((site) => {
            const index = site.site_index ?? site.index
            return (
              <option value={index} key={String(index)}>
                {site.spider_name || site.name || index}
              </option>
            )
          })}
        </select>
        <label className="search-field acquire-search-field">
          <input
            value={serverView.keyword}
            onChange={(event) => serverActions.setKeyword(event.target.value)}
            placeholder="关键词或分享文本"
          />
        </label>
        <button
          className="acquire-search-button icon-only"
          type="button"
          onClick={() => void serverActions.search()}
          disabled={serverView.busy === 'cgs-search' || !serverView.selectedSite || !serverView.keyword.trim()}
          aria-label="搜索"
          title="搜索"
        >
          {serverView.busy === 'cgs-search' ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
        </button>
      </div>
    </>
  )
}

function CgsSearchSource({
  bookTitle,
  candidates,
  keyword,
  onSelect,
}: {
  bookTitle: string
  candidates: CgsSearchCandidate[]
  keyword: string
  onSelect: (candidate: CgsSearchCandidate) => void
}) {
  return (
    <div className="cgs-search-source" aria-label={`${bookTitle} 快捷搜索`}>
      <div className="cgs-search-source-title">
        <UserSearch size={15} />
        <span title={bookTitle}>{bookTitle}</span>
      </div>
      <div className="cgs-search-candidates" aria-label="搜索输入候选">
        {candidates.map((candidate) => (
          <button
            type="button"
            key={candidate.key}
            className={keyword === candidate.value ? 'active' : ''}
            onClick={() => onSelect(candidate)}
            title={candidate.value}
            aria-pressed={keyword === candidate.value}
          >
            <Tags size={14} />
            <span>{candidate.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CgsResultList({
  serverView,
  serverSelectors,
  serverActions,
}: {
  serverView: CgsServerPanelView
  serverSelectors: CgsServerPanelSelectors
  serverActions: Pick<CgsServerPanelActions, 'openTagPanel' | 'toggleBookKey'>
}) {
  return (
    <div className="cgs-results">
      {serverView.books.map((book) => (
        <CgsResultCard
          key={book.book_key || JSON.stringify(book)}
          book={book}
          serverView={serverView}
          serverSelectors={serverSelectors}
          serverActions={serverActions}
        />
      ))}
    </div>
  )
}

function CgsResultCard({
  book,
  serverView,
  serverSelectors,
  serverActions,
}: {
  book: CgsBook
  serverView: CgsServerPanelView
  serverSelectors: CgsServerPanelSelectors
  serverActions: Pick<CgsServerPanelActions, 'openTagPanel' | 'toggleBookKey'>
}) {
  const key = book.book_key || ''
  const checked = serverView.selectedKeys.includes(key)
  const title = serverSelectors.bookTitle(book)
  const coverSrc = serverSelectors.coverUrl(serverView.backendUrl, book)
  const coverOverlayTags = serverSelectors.coverOverlayTags(book)
  const tags = serverSelectors.tags(book)
  const cgsTagPanelKey = `cgs:${key || title}`
  const isCgsTagPanelOpen = serverView.doujinTagPanel?.bookId === cgsTagPanelKey && serverView.doujinTagPanel.mode === 'preview'

  return (
    <article className={`cgs-result-card ${checked ? 'selected' : ''} ${book.supported === false ? 'unavailable' : ''}`}>
      <label className="cgs-card-poster">
        <Cover src={coverSrc} title={title} badge={null} overlayTags={coverOverlayTags} />
        <input
          className="cgs-card-check"
          type="checkbox"
          checked={checked}
          disabled={!key || book.supported === false}
          aria-label={`选择 ${title}`}
          onChange={(event) => serverActions.toggleBookKey(key, event.target.checked)}
        />
      </label>
      <div className="cgs-card-body">
        <div className="cgs-card-head">
          <strong title={title}>{title}</strong>
        </div>
        {tags.length > 0 && (
          <button
            className={`cgs-tag-row doujin-tag-row ${isCgsTagPanelOpen ? 'is-open' : ''}`}
            type="button"
            onClick={() => serverActions.openTagPanel(cgsTagPanelKey, title, tags)}
            aria-haspopup="dialog"
            aria-expanded={isCgsTagPanelOpen}
            aria-controls="doujin-tag-sheet"
            aria-label={`${title} 标签`}
            title={tags.join(' / ')}
          >
            <span className="doujin-tag-row-label">
              <Tags size={14} />
            </span>
            <span className="doujin-tag-row-preview" aria-hidden="true">
              {tags.map((tag) => <Tag key={`${cgsTagPanelKey}-${tag}`}>{tag}</Tag>)}
            </span>
          </button>
        )}
      </div>
    </article>
  )
}

function CgsPreviewTagSheet({
  serverView,
  serverActions,
}: {
  serverView: CgsServerPanelView
  serverActions: Pick<CgsServerPanelActions, 'closeDoujinTagPanel' | 'selectDoujinTag'>
}) {
  if (serverView.doujinTagPanel?.mode !== 'preview') return null

  return (
    <>
      <button className="tool-scrim doujin-tag-scrim" onClick={serverActions.closeDoujinTagPanel} aria-label="关闭标签面板" />
      <section
        id="doujin-tag-sheet"
        className="doujin-tag-sheet is-preview"
        role="dialog"
        aria-modal="true"
        aria-label={`${serverView.doujinTagPanel.bookTitle} 标签面板`}
      >
        <div className="doujin-tag-sheet-grid" aria-label={`${serverView.doujinTagPanel.bookTitle} 标签列表`}>
          {serverView.doujinTagPanel.tags.map((tag) => (
            <button
              type="button"
              key={tag}
              className={`doujin-tag-option ${serverView.doujinTagPanel?.selectedTag === tag ? 'active' : ''}`}
              onClick={() => serverActions.selectDoujinTag(tag)}
              aria-pressed={serverView.doujinTagPanel?.selectedTag === tag}
              title={tag}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="doujin-tag-btn-group is-preview">
          <button
            type="button"
            className="doujin-tag-close-btn ghost"
            onClick={serverActions.closeDoujinTagPanel}
            aria-label="关闭标签面板"
            title="关闭"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </section>
    </>
  )
}

export function CgsServerPanel({
  serverView,
  serverSelectors,
  serverActions,
  acquireRefs,
}: {
  serverView: CgsServerPanelView
  serverSelectors: CgsServerPanelSelectors
  serverActions: CgsServerPanelActions
  acquireRefs: Pick<AcquireWorkspaceRefs, 'manualGate'>
}) {
  return (
    <div
      className={`acquire-content acquire-mode-panel ${serverView.active ? 'is-active' : ''} ${serverView.hidden ? 'is-hidden' : ''} ${serverView.disabled ? 'set-disable-ani is-disabled' : ''}`}
      aria-disabled={serverView.disabled}
      hidden={serverView.hidden}
    >
      <div className="section-bar acquire-section-bar">
        <div>
          <h2>CGS remote</h2>
        </div>
      </div>

      <AcquireFlowSteps label="获取流程" steps={serverView.steps} />
      <CgsSearchControls serverView={serverView} serverActions={serverActions} />
      <CgsResultList serverView={serverView} serverSelectors={serverSelectors} serverActions={serverActions} />
      <CgsPreviewTagSheet serverView={serverView} serverActions={serverActions} />

      {serverView.showGate && (
        <CgsGateLayer
          busy={serverView.busy}
          gateButtonRef={acquireRefs.manualGate}
          gateLoadingMode={serverView.gateLoadingMode}
          gatePhase={serverView.gatePhase}
          icon={<PlugZap className="cgs-gate-icon" size={118} />}
          label="站点"
          mode="manual"
          onRunGateLoad={serverActions.runGateLoad}
        />
      )}
    </div>
  )
}

export function CgsServerDrawerSettings({
  drawerView,
  drawerActions,
}: {
  drawerView: CgsServerDrawerView
  drawerActions: CgsServerDrawerActions
}) {
  return (
    <section className="drawer-card cgs-conf-drawer-card cgs-server-drawer-card">
      <div className="drawer-card-header">
        <div className="drawer-card-title">
          <PlugZap size={17} />
          <strong>CGS 配置</strong>
        </div>
      </div>
      <div className="drawer-card-body">
        <label className="cgs-conf-field">
          <div className="cgs-conf-btn-group cgs-conf-prefixed-group">
            <button type="button" className="cgs-conf-text-btn" disabled>后处理</button>
            <select
              value={drawerView.draft.downloaded_handle}
              onChange={(event) => drawerActions.setDraft((draft) => ({ ...draft, downloaded_handle: event.target.value }))}
              disabled={drawerView.loading}
              aria-label="后处理"
            >
              {drawerView.downloadedHandleOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </label>
        <label className="cgs-conf-field">
          <div className="cgs-conf-btn-group cgs-conf-prefixed-group">
            <button type="button" className="cgs-conf-text-btn" disabled>代理</button>
            <input
              value={drawerView.draft.proxies_text}
              onChange={(event) => drawerActions.setDraft((draft) => ({ ...draft, proxies_text: event.target.value }))}
              placeholder="127.0.0.1:10809"
              disabled={drawerView.loading}
              aria-label="代理"
            />
          </div>
        </label>
        <label className="cgs-conf-field">
          <div className="cgs-conf-btn-group cgs-conf-save-path-group">
            <span className="cgs-conf-icon-prefix" aria-hidden="true">
              <FolderOpen size={17} />
            </span>
            <input
              value={drawerView.draft.sv_path}
              onChange={(event) => drawerActions.setDraft((draft) => ({ ...draft, sv_path: event.target.value }))}
              placeholder="D:/Comic"
              disabled={drawerView.loading}
              aria-label="CGS储存目录"
            />
            <button
              type="button"
              className="icon-only cgs-conf-icon-btn cgs-conf-sync-btn"
              onClick={drawerActions.syncSavePathFromBookshelf}
              disabled={drawerView.loading || !drawerView.bookshelfPath}
              aria-label="同步书架目录到 CGS 储存目录"
              title="同步书架目录"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </label>
        <div className="drawer-action-grid cgs-conf-actions" aria-label="CGS 配置操作">
          <button
            type="button"
            className="drawer-action-card"
            onClick={() => void drawerActions.saveConfig()}
            disabled={drawerView.busy === 'save'}
          >
            {drawerView.busy === 'save' ? <LoaderCircle className="spin" size={18} /> : <PlugZap size={18} />}
            <span>保存 CGS</span>
          </button>
        </div>
      </div>
    </section>
  )
}
