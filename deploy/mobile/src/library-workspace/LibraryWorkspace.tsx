import { Filter, X } from 'lucide-react'
import type { PointerEventHandler, ReactNode, RefObject } from 'react'
import { ShelfPager, type CoverOverlayTag } from '../shared/Cover'
import type { ConnectionState, LibraryMeta, Progress, ShelfBook } from '../mobileStore'
import { BookTile } from './BookTile'
import { EdgeTools, type EdgeAction } from './EdgeTools'
import { MultiCheckFloat } from './MultiCheckFloat'
import { ShelfToolPanel } from './ShelfToolPanel'
import type { MultiCheckBatchAction } from './useLibraryReaderActions'

type ShelfSource = 'library' | 'downloads'
type SortMode = 'time_desc' | 'time_asc' | 'name_asc' | 'name_desc'
type ToolPanel = 'filter' | 'sort'
type MaybePromise = void | Promise<void>

export type DoujinTagPanel = {
  bookId: string
  bookTitle: string
  tags: string[]
  selectedTag: string
  mode?: 'filter' | 'preview'
}

export type ShelfWorkspaceView = {
  activeSourceIsOffline: boolean
  activeShelfSource: ShelfSource
  busy: string
  comicMode: string
  connection: ConnectionState
  deleteHardMode: boolean
  doujinTagPanel: DoujinTagPanel | null
  edgeLogoSrc: string
  edgeEffectSrc: string
  edgeEffectDuration: number
  filterBoardKeywords: string[]
  filterDraft: string
  filteredTotal: number
  isDoujinMode: boolean
  libraryPageSafe: number
  libraryPageSize: number
  multiCheckFloatPosition: { x: number; y: number }
  multiCheckMode: boolean
  multiCheckedIds: string[]
  openOpsId: string
  pagedShelf: ShelfBook[]
  query: string
  quickFilterKeywords: string[]
  seriesOnly: boolean
  sort: SortMode
  sortLabels: Record<SortMode, string>
  toolMenuOpen: boolean
  activeToolPanel: ToolPanel | null
  workspaceEmpty: ReactNode
}

export type ShelfWorkspaceSelectors = {
  bookCachedCount: (book: ShelfBook) => number
  bookSummary: (book: ShelfBook) => string
  coverSrc: (book: ShelfBook) => string
  doujinCoverOverlayTags: (meta: LibraryMeta) => CoverOverlayTag[]
  ensureMeta: (meta?: LibraryMeta | null) => LibraryMeta
  latestBookProgress: (book: ShelfBook) => Progress | undefined
  mangaCoverOverlayTags: (book: ShelfBook, meta: LibraryMeta) => CoverOverlayTag[]
  showShelfSummary: (book: ShelfBook) => boolean
  visibleDoujinTags: (book: ShelfBook) => string[]
}

export type ShelfWorkspaceActions = {
  applyDoujinTagFilter: () => void
  applyFilterDraft: () => void
  cacheItem: (book: ShelfBook) => MaybePromise
  cacheSeries: (book: ShelfBook) => MaybePromise
  changeLibraryPage: (page: number) => void
  changeSort: (sort: SortMode) => MaybePromise
  clearFilter: () => void
  closeDoujinTagPanel: () => void
  closeOps: () => void
  closeToolPanel: () => void
  handleBookAction: (book: ShelfBook, handle: 'save' | 'remove' | 'del') => MaybePromise
  openCgsSearchFromBook: (book: ShelfBook) => void
  openDoujinTagPanel: (book: ShelfBook) => void
  openEdgeMenu: () => void
  closeEdgeMenu: () => void
  openShelfBook: (book: ShelfBook, source: ShelfSource) => void
  removeCachedBook: (book: ShelfBook) => MaybePromise
  runEdgeAction: (action: EdgeAction) => void
  selectDoujinTag: (tag: string) => void
  selectFilterKeyword: (keyword: string) => void
  setFilterDraft: (value: string) => void
  clearMultiCheck: () => void
  exitMultiCheck: () => void
  runMultiCheckBatch: (action: MultiCheckBatchAction) => void | Promise<void>
  startMultiCheckDrag: PointerEventHandler<HTMLButtonElement>
  moveMultiCheckDrag: PointerEventHandler<HTMLButtonElement>
  finishMultiCheckDrag: PointerEventHandler<HTMLButtonElement>
  selectAllCurrentPage: (pageIds: string[]) => void
  toggleMultiCheckId: (id: string) => void
  toggleOps: (bookId: string) => void
  toggleSeriesOnly: () => void
}

export type LibraryWorkspaceProps = {
  shelfView: ShelfWorkspaceView
  shelfSelectors: ShelfWorkspaceSelectors
  shelfActions: ShelfWorkspaceActions
  doujinTagLinkButtonRef: RefObject<HTMLButtonElement | null>
}

function DoujinTagSheet({
  doujinTagPanel,
  doujinTagLinkButtonRef,
  onApply,
  onClose,
  onSelect,
}: {
  doujinTagPanel: DoujinTagPanel
  doujinTagLinkButtonRef: RefObject<HTMLButtonElement | null>
  onApply: () => void
  onClose: () => void
  onSelect: (tag: string) => void
}) {
  return (
    <>
      <button className="tool-scrim doujin-tag-scrim" onClick={onClose} aria-label="关闭标签面板" />
      <section
        id="doujin-tag-sheet"
        className="doujin-tag-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${doujinTagPanel.bookTitle} 标签面板`}
      >
        <div className="doujin-tag-sheet-grid" aria-label={`${doujinTagPanel.bookTitle} 标签列表`}>
          {doujinTagPanel.tags.map((tag) => (
            <button
              type="button"
              key={tag}
              className={`doujin-tag-option ${doujinTagPanel.selectedTag === tag ? 'active' : ''}`}
              onClick={() => onSelect(tag)}
              aria-pressed={doujinTagPanel.selectedTag === tag}
              title={tag}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="doujin-tag-btn-group">
          <button
            ref={doujinTagLinkButtonRef}
            type="button"
            className="doujin-tag-link-btn primary-action"
            onClick={onApply}
            disabled={!doujinTagPanel.selectedTag}
          >
            <Filter size={15} />
            筛选
          </button>
          <button
            type="button"
            className="doujin-tag-close-btn ghost"
            onClick={onClose}
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

export function LibraryWorkspace({
  shelfView,
  shelfSelectors,
  shelfActions,
  doujinTagLinkButtonRef,
}: LibraryWorkspaceProps) {
  const workspaceClassName = `${shelfView.activeSourceIsOffline ? 'downloads-workspace' : 'library-workspace'} ${shelfView.workspaceEmpty ? 'is-empty' : ''}`

  return (
    <section className={workspaceClassName}>
      {shelfView.workspaceEmpty}

      {!shelfView.workspaceEmpty && (
        <>
          <ShelfPager
            current={shelfView.libraryPageSafe}
            total={shelfView.filteredTotal}
            pageSize={shelfView.libraryPageSize}
            onChange={shelfActions.changeLibraryPage}
            label="书架分页"
          />
          <div className="shelf-grid">
            {shelfView.pagedShelf.map((book) => (
              <BookTile
                key={book.id}
                book={book}
                shelfView={shelfView}
                shelfSelectors={shelfSelectors}
                shelfActions={shelfActions}
              />
            ))}
          </div>
          <ShelfPager
            current={shelfView.libraryPageSafe}
            total={shelfView.filteredTotal}
            pageSize={shelfView.libraryPageSize}
            onChange={shelfActions.changeLibraryPage}
            label="书架分页"
          />
        </>
      )}

      {shelfView.doujinTagPanel?.mode !== 'preview' && shelfView.doujinTagPanel && (
        <DoujinTagSheet
          doujinTagPanel={shelfView.doujinTagPanel}
          doujinTagLinkButtonRef={doujinTagLinkButtonRef}
          onApply={shelfActions.applyDoujinTagFilter}
          onClose={shelfActions.closeDoujinTagPanel}
          onSelect={shelfActions.selectDoujinTag}
        />
      )}

      <EdgeTools
        open={shelfView.toolMenuOpen}
        logoSrc={shelfView.edgeLogoSrc}
        effectSrc={shelfView.edgeEffectSrc}
        effectDuration={shelfView.edgeEffectDuration}
        busy={shelfView.busy}
        comicMode={shelfView.comicMode}
        deleteHardMode={shelfView.deleteHardMode}
        showDoujinAction={!shelfView.activeSourceIsOffline}
        showMultiCheckAction={shelfView.isDoujinMode && !shelfView.activeSourceIsOffline}
        multiCheckActive={shelfView.multiCheckMode}
        onAction={shelfActions.runEdgeAction}
        onOpenMenu={shelfActions.openEdgeMenu}
        onCloseMenu={shelfActions.closeEdgeMenu}
      />

      <MultiCheckFloat shelfView={shelfView} shelfActions={shelfActions} />

      {shelfView.activeToolPanel && (
        <ShelfToolPanel
          shelfView={shelfView}
          shelfActions={shelfActions}
        />
      )}
    </section>
  )
}
