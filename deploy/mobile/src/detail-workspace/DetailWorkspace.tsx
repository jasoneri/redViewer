import { Image, Tag } from 'antd'
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Download, LoaderCircle, Trash2, UserSearch } from 'lucide-react'
import { CustomIcon } from '../icons/CustomIcon'
import { renderCoverOverlayTag, type CoverOverlayTag } from '../shared/Cover'
import type { CachedItem, ConnectionState, LibraryItem, LibraryMeta, Progress, ShelfBook } from '../mobileStore'
import { EpisodePanel } from './EpisodePanel'

type ShelfSource = 'library' | 'downloads'
type MaybePromise = void | Promise<void>

export type DetailView = {
  busy: string
  cacheProgressValue: string
  cachedBookAvailable: boolean
  connection: ConnectionState
  deleteHardMode: boolean
  detailSourceIsOffline: boolean
  episodePageCount: number
  episodePageSafe: number
  episodePageSize: number
  infoTiles: Array<{ label: string; value: string }>
  kindOverlayTags: CoverOverlayTag[]
  meta: LibraryMeta
  nextSeriesBook: ShelfBook | null
  offlineLine: string
  openOpsId: string
  pagedEpisodes: LibraryItem[]
  previousSeriesBook: ShelfBook | null
  selectedBook: ShelfBook
  selectedSeriesValue: string
  selectedShelfSource: ShelfSource
  seriesBooks: ShelfBook[]
  summary: string | null
}

export type DetailSelectors = {
  cachedEpisode: (episode: LibraryItem) => CachedItem | undefined
  detailCoverSrc: (book: ShelfBook) => string
  episodeCoverOverlayTags: (pageCount: number | null) => CoverOverlayTag[]
  episodeCoverSrc: (episode: LibraryItem) => string
  episodePageCount: (episode: LibraryItem, cachedEpisode?: CachedItem) => number | null
  episodeProgress: (episode: LibraryItem) => Progress | undefined
  progressMeterValue: (progress: Progress, pageCount?: number) => number
}

export type DetailActions = {
  backToShelf: () => void
  cacheItem: (item: LibraryItem) => MaybePromise
  cacheSeries: (book: ShelfBook) => MaybePromise
  changeEpisodePage: (page: number) => void
  closeOps: () => void
  handleDetailBookAction: (item: LibraryItem, handle: 'save' | 'remove' | 'del') => MaybePromise
  openCgsSearchFromBook: (book: ShelfBook) => void
  openNextDetailSeries: () => void
  openPreviousDetailSeries: () => void
  openSourceItem: (item: LibraryItem, source: ShelfSource) => MaybePromise
  removeCached: (item: CachedItem) => MaybePromise
  removeCachedBook: (book: ShelfBook) => MaybePromise
  selectDetailSeries: (bookId: string) => void
  toggleDeleteMode: () => void
  toggleOps: (itemId: string) => void
}

export type DetailWorkspaceProps = {
  detailView: DetailView
  detailSelectors: DetailSelectors
  detailActions: DetailActions
}

function DetailToolbar({
  detailView,
  detailActions,
}: {
  detailView: DetailView
  detailActions: DetailActions
}) {
  const { selectedBook } = detailView

  return (
    <div className="detail-toolbar-row btn-group" aria-label="系列导航与模式">
      <button className="detail-toolbar-button tone-info" type="button" onClick={detailActions.backToShelf} aria-label="返回书架">
        <ArrowLeft size={17} />
      </button>
      <button
        className={`detail-toolbar-button tone-delete ${detailView.deleteHardMode ? 'is-hard' : 'is-soft'}`}
        type="button"
        onClick={detailActions.toggleDeleteMode}
        aria-label={`删除模式：${detailView.deleteHardMode ? '彻底删除' : '扔回收站'}`}
      >
        <Trash2 size={16} />
      </button>
      <button
        className="detail-toolbar-button tone-primary"
        type="button"
        onClick={detailActions.openPreviousDetailSeries}
        disabled={!detailView.previousSeriesBook}
        aria-label="上一系列"
      >
        <ChevronLeft size={17} />
      </button>
      <label className="detail-series-picker" title={selectedBook.book}>
        <CustomIcon name="bookList" className="detail-series-picker-icon" size={17} />
        <select
          className="detail-series-select"
          value={detailView.selectedSeriesValue}
          onChange={(event) => detailActions.selectDetailSeries(event.target.value)}
          disabled={!detailView.seriesBooks.length}
          aria-label={`选择系列：${selectedBook.book}`}
        >
          {selectedBook.kind !== 'series' && <option value={selectedBook.id}>{selectedBook.book}</option>}
          {detailView.seriesBooks.map((book) => (
            <option key={book.id} value={book.id}>{book.book}</option>
          ))}
        </select>
      </label>
      <button
        className="detail-toolbar-button tone-primary"
        type="button"
        onClick={detailActions.openNextDetailSeries}
        disabled={!detailView.nextSeriesBook}
        aria-label="下一系列"
      >
        <ChevronRight size={17} />
      </button>
    </div>
  )
}

function DetailHero({
  detailView,
  detailSelectors,
  detailActions,
}: {
  detailView: DetailView
  detailSelectors: DetailSelectors
  detailActions: DetailActions
}) {
  const { selectedBook } = detailView

  return (
    <section className="detail-hero" aria-label="作品详情">
      <div className="detail-cover-stack">
        <div className="detail-cover-frame">
          <Image
            src={detailSelectors.detailCoverSrc(selectedBook)}
            alt={selectedBook.book}
            fallback="/empty.png"
            preview={false}
          />
          <div className="cover-overlay-stack top-right" aria-hidden="true">
            {detailView.kindOverlayTags.map(renderCoverOverlayTag)}
          </div>
        </div>
        <p className="detail-offline-line">{detailView.offlineLine}</p>
      </div>
      <div id="info-block" className="detail-info-block">
        <div id="info" className="detail-info-content">
          <div className="detail-heading-row">
            <div className="detail-heading-copy">
              <h2 className="detail-title">{selectedBook.book}</h2>
              {detailView.summary && <p className="detail-summary">{detailView.summary}</p>}
            </div>
            {selectedBook.kind === 'series' && !detailView.detailSourceIsOffline && (
              <div className="btn-group detail-heading-actions" aria-label={`${selectedBook.book} 详情操作`}>
                <button
                  className="compact-button icon-only detail-cgs-search-button"
                  type="button"
                  onClick={() => detailActions.openCgsSearchFromBook(selectedBook)}
                  disabled={!!detailView.busy}
                  aria-label={`CGS 搜索 ${selectedBook.book}`}
                  title="CGS 搜索"
                >
                  <UserSearch size={16} />
                </button>
                <button
                  className="compact-button icon-only detail-cache-button"
                  type="button"
                  onClick={() => void detailActions.cacheSeries(selectedBook)}
                  disabled={detailView.connection !== 'online' || !!detailView.busy}
                  aria-label={`缓存全集 ${selectedBook.book}`}
                  title="缓存全集"
                >
                  {detailView.busy === `series:${selectedBook.id}` ? <LoaderCircle className="spin" size={16} /> : <CustomIcon name="cacheAdd" size={16} className="cache-add-icon" />}
                </button>
              </div>
            )}
          </div>
          <section id="tags" className="detail-info-meta" aria-label="作品信息">
            {detailView.infoTiles.map((item) => (
              <div className="tag-container field-name detail-info-field" key={`${selectedBook.id}-${item.label}`}>
                <span className="detail-info-label">{item.label}:</span>
                <span className="tags detail-info-values">
                  <Tag>{item.value}</Tag>
                </span>
              </div>
            ))}
            {detailView.meta.tags.length > 0 && (
              <div className="tag-container field-name detail-info-field">
                <span className="detail-info-label">标签:</span>
                <span className="tags detail-info-values">
                  {detailView.meta.tags.map((tag) => (
                    <Tag key={`detail-${selectedBook.id}-${tag}`}>{tag}</Tag>
                  ))}
                </span>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}

function SingleBookActions({
  detailView,
  detailActions,
}: {
  detailView: DetailView
  detailActions: DetailActions
}) {
  const { selectedBook } = detailView

  return (
    <div className="overview-actions">
      <button className="primary-wide" onClick={() => void detailActions.openSourceItem(selectedBook, detailView.selectedShelfSource)}>
        <BookOpen size={17} />
        {detailView.detailSourceIsOffline || detailView.cachedBookAvailable ? '阅读缓存' : '在线阅读'}
      </button>
      <button
        className={`ghost ${detailView.detailSourceIsOffline ? 'danger' : ''}`}
        onClick={() => detailView.detailSourceIsOffline ? void detailActions.removeCachedBook(selectedBook) : void detailActions.cacheItem(selectedBook)}
        disabled={!detailView.detailSourceIsOffline && (detailView.connection !== 'online' || !!detailView.busy)}
      >
        {detailView.busy === `cache:${selectedBook.id}` ? <LoaderCircle className="spin" size={17} /> : detailView.detailSourceIsOffline ? <Trash2 size={17} /> : <Download size={17} />}
        {detailView.detailSourceIsOffline ? '删除缓存' : detailView.cacheProgressValue}
      </button>
    </div>
  )
}

export function DetailWorkspace({
  detailView,
  detailSelectors,
  detailActions,
}: DetailWorkspaceProps) {
  const { selectedBook } = detailView

  return (
    <section className="detail-workspace">
      <DetailToolbar detailView={detailView} detailActions={detailActions} />
      <DetailHero detailView={detailView} detailSelectors={detailSelectors} detailActions={detailActions} />

      {selectedBook.kind === 'single' ? (
        <SingleBookActions detailView={detailView} detailActions={detailActions} />
      ) : (
        <EpisodePanel detailView={detailView} detailSelectors={detailSelectors} detailActions={detailActions} />
      )}
    </section>
  )
}
