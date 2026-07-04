import { useEffect, useState } from 'react'
import { BookOpen, FolderOpen, LoaderCircle, PlugZap, RefreshCw, Search, Tags, UserRound, X } from 'lucide-react'
import { Tag } from 'antd'
import { CustomIcon } from '../../icons/CustomIcon'
import { Cover } from '../../shared/Cover'
import { ConfDrawerSaveButton, useConfDrawerSaveFeedback } from '../../shared/confDrawerSaveFeedback'
import { InputHistoryMenu, NativeSelectMenu } from '../../shared/NativeDropdownMenu'
import type { CgsBook, CgsBookEpisode } from '../../mobileStore'
import { CUSTOM_SETTINGS_RESTORED_EVENT } from '../../app-shell/customSettingsStorage'
import { AttachedBookSelect } from '../AttachedBookSelect'
import { AcquireFlowSteps, CgsGateLayer } from '../acquireUi'
import type {
  AcquireWorkspaceRefs,
  CgsAttachedBook,
  CgsSearchCandidate,
  CgsServerDrawerActions,
  CgsServerDrawerView,
  CgsServerPanelActions,
  CgsServerPanelSelectors,
  CgsServerPanelView,
} from '../acquireTypes'

const CGS_PROXY_HISTORY_KEY = 'redviewer:cgs-proxy-history'
const CGS_PROXY_HISTORY_LIMIT = 8

function normalizeCgsProxyHistoryValue(value: string): string {
  return value.trim()
}

function dedupeCgsProxyHistory(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = normalizeCgsProxyHistoryValue(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= CGS_PROXY_HISTORY_LIMIT) break
  }
  return result
}

function readCgsProxyHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CGS_PROXY_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? dedupeCgsProxyHistory(parsed.filter((item): item is string => typeof item === 'string')) : []
  } catch {
    return []
  }
}

function saveCgsProxyHistory(value: string, currentHistory: string[]): string[] {
  const normalized = normalizeCgsProxyHistoryValue(value)
  if (!normalized) return currentHistory
  const nextHistory = dedupeCgsProxyHistory([normalized, ...currentHistory])
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CGS_PROXY_HISTORY_KEY, JSON.stringify(nextHistory))
    } catch {
      // Ignore storage quota or privacy-mode failures; the input still works.
    }
  }
  return nextHistory
}

function CgsSearchControls({
  serverView,
  serverActions,
}: {
  serverView: CgsServerPanelView
  serverActions: Pick<CgsServerPanelActions, 'search' | 'selectAttachedBook' | 'selectSearchCandidate' | 'setKeyword' | 'setSelectedSite'>
}) {
  const sitesLoading = serverView.busy === 'cgs-sites' && !serverView.sites.length

  return (
    <>
      {serverView.searchBookInfo && serverView.searchCandidates.length > 0 && (
        <CgsSearchSource
          bookTitle={serverView.searchBookInfo.book}
          source={serverView.searchBookInfo.source}
          attachedBookList={serverView.attachedBookList}
          activeAttachedBookId={serverView.activeAttachedBookId}
          candidates={serverView.searchCandidates}
          keyword={serverView.keyword}
          onSelectAttachedBook={serverActions.selectAttachedBook}
          onSelect={serverActions.selectSearchCandidate}
        />
      )}

      <div className="acquire-search-row btn-group">
        <NativeSelectMenu
          className="acquire-site-select"
          value={serverView.selectedSite}
          onValueChange={serverActions.setSelectedSite}
          aria-label="选择站点"
          disabled={sitesLoading}
          options={[
            { value: '', label: sitesLoading ? '站点加载中...' : '选择站点', disabled: sitesLoading },
            ...serverView.sites.map((site) => {
              const index = site.site_index ?? site.index
              return { value: String(index), label: site.spider_name || site.name || String(index) }
            }),
          ]}
          menuClassName="acquire-site-select-dropdown"
        />
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
          disabled={sitesLoading || serverView.busy === 'cgs-search' || !serverView.selectedSite || !serverView.keyword.trim()}
          aria-label="搜索"
        >
          {serverView.busy === 'cgs-search' ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
        </button>
      </div>
    </>
  )
}

function renderCgsSearchCandidateIcon(candidate: CgsSearchCandidate) {
  if (candidate.key === 'title') return <BookOpen size={14} />
  if (candidate.key === 'artist') return <UserRound size={14} />
  return <Tags size={14} />
}

function CgsSearchSource({
  bookTitle,
  source,
  attachedBookList,
  activeAttachedBookId,
  candidates,
  keyword,
  onSelectAttachedBook,
  onSelect,
}: {
  bookTitle: string
  source: string | null
  attachedBookList: CgsAttachedBook[]
  activeAttachedBookId: string
  candidates: CgsSearchCandidate[]
  keyword: string
  onSelectAttachedBook: (book: CgsAttachedBook) => void
  onSelect: (candidate: CgsSearchCandidate) => void
}) {
  const hasAttachedBookOptions = attachedBookList.length > 0

  return (
    <div className="cgs-search-source" aria-label={`${bookTitle} 快捷搜索`}>
      {hasAttachedBookOptions ? (
        <AttachedBookSelect
          books={attachedBookList}
          mode="single"
          selectedIds={[activeAttachedBookId]}
          onSelect={onSelectAttachedBook}
          ariaLabel="附加书籍搜索目标"
          className="cgs-search-source-title-select"
          triggerClassName="cgs-search-source-title"
        />
      ) : (
        <div className="cgs-search-source-title">
          <CustomIcon name="detailSearch" size={15} />
          <span className="cgs-search-source-name">{bookTitle}</span>
          {source && <span className="cgs-search-source-badge" aria-label={`源站：${source}`}>{source}</span>}
        </div>
      )}
      <div className="cgs-search-candidates" aria-label="搜索输入候选">
        {candidates.map((candidate) => (
          <button
            type="button"
            key={candidate.key}
            className={keyword === candidate.value ? 'active' : ''}
            onClick={() => onSelect(candidate)}
            aria-pressed={keyword === candidate.value}
            aria-label={candidate.value}
          >
            {renderCgsSearchCandidateIcon(candidate)}
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
  serverActions: Pick<CgsServerPanelActions, 'openChapterPanel' | 'openTagPanel' | 'toggleBookKey'>
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
  serverActions: Pick<CgsServerPanelActions, 'openChapterPanel' | 'openTagPanel' | 'toggleBookKey'>
}) {
  const key = book.book_key || ''
  const selectMode = serverSelectors.selectMode(book)
  const chapterSelectedCount = key ? serverView.selectedEpisodeKeysByBook[key]?.length || 0 : 0
  const checked = selectMode === 'book' && serverView.selectedKeys.includes(key)
  const title = serverSelectors.bookTitle(book)
  const coverSrc = serverSelectors.coverUrl(serverView.backendUrl, book)
  const coverOverlayTags = serverSelectors.coverOverlayTags(book)
  const tags = serverSelectors.tags(book)
  const cgsTagPanelKey = `cgs:${key || title}`
  const isCgsTagPanelOpen = serverView.doujinTagPanel?.bookId === cgsTagPanelKey && serverView.doujinTagPanel.mode === 'preview'

  return (
    <article className={`cgs-result-card ${book.supported === false ? 'unavailable' : ''}`}>
      {selectMode === 'chapters' ? (
        <button
          className="cgs-card-poster cgs-card-poster-button"
          type="button"
          disabled={!key || book.supported === false}
          onClick={() => serverActions.openChapterPanel(key)}
          aria-label={`${title} 章节`}
          aria-haspopup="dialog"
          aria-expanded={serverView.chapterPanelBookKey === key}
          aria-controls="cgs-chapter-sheet"
        >
          <Cover src={coverSrc} title={title} badge={null} overlayTags={coverOverlayTags} />
          <span className={`cgs-card-chapter-badge ${chapterSelectedCount > 0 ? 'has-selection' : ''}`} aria-hidden="true">
            <BookOpen size={14} />
            {chapterSelectedCount > 0 && <span>{chapterSelectedCount}</span>}
          </span>
        </button>
      ) : (
        <label className={`cgs-card-poster ${checked ? 'is-checked' : ''}`}>
          <Cover src={coverSrc} title={title} badge={null} overlayTags={coverOverlayTags} />
          <input
            className="cgs-card-check"
            type="checkbox"
            checked={checked}
            disabled={!key || book.supported === false}
            aria-label={`选择 ${title}`}
            onChange={(event) => serverActions.toggleBookKey(key, event.target.checked)}
          />
          <span className="mc-cbx" aria-hidden="true" />
        </label>
      )}
      <div className="cgs-card-body">
        <div className="cgs-card-head">
          <strong>{title}</strong>
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

function CgsChapterSheet({
  serverView,
  serverSelectors,
  serverActions,
}: {
  serverView: CgsServerPanelView
  serverSelectors: CgsServerPanelSelectors
  serverActions: Pick<
    CgsServerPanelActions,
    | 'clearBookEpisodes'
    | 'closeChapterPanel'
    | 'retryBookEpisodes'
    | 'selectAllBookEpisodes'
    | 'selectFirstBookEpisodes'
    | 'selectLatestBookEpisodes'
    | 'toggleEpisodeKey'
  >
}) {
  const bookKey = serverView.chapterPanelBookKey
  const book = serverView.books.find((row) => row.book_key === bookKey)
  if (!bookKey || !book) return null

  const title = serverSelectors.bookTitle(book)
  const episodes = serverView.episodesByBook[bookKey] || []
  const loadState = serverView.episodeLoadByBook[bookKey]?.status || 'idle'
  const errorMessage = serverView.episodeLoadByBook[bookKey]?.message || '章节读取失败'
  const selectedKeys = serverView.selectedEpisodeKeysByBook[bookKey] || []
  const selectedSet = new Set(selectedKeys)
  const loading = loadState === 'loading'
  const canSelect = episodes.length > 0 && !loading

  return (
    <>
      <button className="tool-scrim doujin-tag-scrim cgs-chapter-scrim" onClick={serverActions.closeChapterPanel} aria-label="关闭章节面板" />
      <section
        id="cgs-chapter-sheet"
        className="doujin-tag-sheet cgs-chapter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 章节面板`}
      >
        <div className="cgs-chapter-sheet-head">
          <strong>{title}</strong>
          <span>{selectedKeys.length}/{episodes.length}</span>
        </div>
        <div className="cgs-chapter-actions" aria-label="章节选择操作">
          <button type="button" onClick={() => serverActions.selectLatestBookEpisodes(bookKey, 1)} disabled={!canSelect}>最新</button>
          <button type="button" onClick={() => serverActions.selectFirstBookEpisodes(bookKey, 1)} disabled={!canSelect}>首话</button>
          <button type="button" onClick={() => serverActions.selectAllBookEpisodes(bookKey)} disabled={!canSelect}>全部</button>
          <button type="button" onClick={() => serverActions.clearBookEpisodes(bookKey)} disabled={!selectedKeys.length}>清空</button>
          <button
            type="button"
            className="icon-only"
            onClick={() => void serverActions.retryBookEpisodes(bookKey)}
            disabled={loading}
            aria-label="刷新章节"
          >
            {loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
          </button>
        </div>
        {loading && <div className="cgs-chapter-state"><LoaderCircle className="spin" size={16} /><span>读取中</span></div>}
        {loadState === 'error' && (
          <div className="cgs-chapter-state error">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => void serverActions.retryBookEpisodes(bookKey)}>重试</button>
          </div>
        )}
        {!loading && loadState !== 'error' && episodes.length === 0 && <div className="cgs-chapter-state"><span>暂无章节</span></div>}
        {episodes.length > 0 && (
          <div className="cgs-chapter-list" aria-label={`${title} 章节列表`}>
            {episodes.map((episode) => (
              <CgsChapterOption
                key={episode.episode_key}
                bookKey={bookKey}
                episode={episode}
                checked={selectedSet.has(episode.episode_key)}
                disabled={loading}
                onToggle={serverActions.toggleEpisodeKey}
              />
            ))}
          </div>
        )}
        <div className="doujin-tag-btn-group is-preview">
          <button
            type="button"
            className="doujin-tag-close-btn ghost"
            onClick={serverActions.closeChapterPanel}
            aria-label="关闭章节面板"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </section>
    </>
  )
}

function CgsChapterOption({
  bookKey,
  episode,
  checked,
  disabled,
  onToggle,
}: {
  bookKey: string
  episode: CgsBookEpisode
  checked: boolean
  disabled: boolean
  onToggle: (bookKey: string, episodeKey: string, checked: boolean) => void
}) {
  const idxText = episode.idx === null || episode.idx === undefined ? '-' : String(episode.idx)
  const name = episode.name || idxText

  return (
    <label className={`cgs-chapter-option ${checked ? 'active' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onToggle(bookKey, episode.episode_key, event.target.checked)}
        aria-label={`选择 ${name}`}
      />
      <span className="cgs-chapter-index" aria-label={`序号 ${idxText}`}>{idxText}</span>
      <span className="cgs-chapter-name">{name}</span>
      {episode.downloaded && <span className="cgs-chapter-downloaded">已下载</span>}
    </label>
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
            >
              <span>{tag}</span>
            </button>
          ))}
        </div>
        <div className="doujin-tag-btn-group is-preview">
          <button
            type="button"
            className="doujin-tag-close-btn ghost"
            onClick={serverActions.closeDoujinTagPanel}
            aria-label="关闭标签面板"
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
      <CgsChapterSheet serverView={serverView} serverSelectors={serverSelectors} serverActions={serverActions} />

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
  const [proxyHistory, setProxyHistory] = useState(readCgsProxyHistory)
  const saveFeedback = useConfDrawerSaveFeedback()
  useEffect(() => {
    const resetProxyHistory = () => setProxyHistory([])
    window.addEventListener(CUSTOM_SETTINGS_RESTORED_EVENT, resetProxyHistory)
    return () => window.removeEventListener(CUSTOM_SETTINGS_RESTORED_EVENT, resetProxyHistory)
  }, [])
  const commitProxyHistory = (value: string = drawerView.draft.proxies_text) => {
    setProxyHistory((currentHistory) => saveCgsProxyHistory(value, currentHistory))
  }
  const saveConfig = async () => {
    await saveFeedback.runWithFeedback(async () => {
      commitProxyHistory()
      return drawerActions.saveConfig()
    }, { shouldShowComplete: Boolean })
  }

  return (
    <section className="drawer-card cgs-conf-drawer-card cgs-server-drawer-card">
      <div className="drawer-card-header">
        <div className="drawer-card-title">
          <PlugZap size={17} />
          <strong>CGS 配置</strong>
          <ConfDrawerSaveButton
            className="icon-only cgs-conf-header-save"
            onClick={() => void saveConfig()}
            disabled={drawerView.busy === 'save'}
            aria-label="保存 CGS"
            busy={drawerView.busy === 'save' || saveFeedback.busy}
            feedback={saveFeedback.feedback}
          />
        </div>
      </div>
      <div className="drawer-card-body">
        <label className="drawer-config-field cgs-conf-field">
          <div className="cgs-conf-btn-group cgs-conf-prefixed-group">
            <button type="button" className="cgs-conf-text-btn" disabled>后处理</button>
            <NativeSelectMenu
              value={drawerView.draft.downloaded_handle}
              onValueChange={(value) => drawerActions.setDraft((draft) => ({ ...draft, downloaded_handle: value }))}
              disabled={drawerView.loading}
              aria-label="后处理"
              options={drawerView.downloadedHandleOptions.map((option) => ({ value: option, label: option }))}
              menuClassName="cgs-conf-select-dropdown"
            />
          </div>
        </label>
        <label className="drawer-config-field cgs-conf-field">
          <div className="cgs-conf-btn-group cgs-conf-prefixed-group">
            <button type="button" className="cgs-conf-text-btn" disabled>代理</button>
            <InputHistoryMenu
              value={drawerView.draft.proxies_text}
              suggestions={proxyHistory}
              onValueChange={(value) => drawerActions.setDraft((draft) => ({ ...draft, proxies_text: value }))}
              placeholder="127.0.0.1:10809"
              disabled={drawerView.loading}
              aria-label="代理"
              menuClassName="cgs-conf-input-history-dropdown"
            />
          </div>
        </label>
        <label className="drawer-config-field cgs-conf-field">
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
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </label>
      </div>
    </section>
  )
}
