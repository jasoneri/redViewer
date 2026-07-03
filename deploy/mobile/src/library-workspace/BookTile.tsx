import { LoaderCircle, Save, Tags, Trash2 } from 'lucide-react'
import { Tag } from 'antd'
import { CustomIcon } from '../icons/CustomIcon'
import { Cover } from '../shared/Cover'
import type { ShelfBook } from '../mobileStore'
import type { ShelfWorkspaceActions, ShelfWorkspaceSelectors, ShelfWorkspaceView } from './LibraryWorkspace'

export function BookTile({
  book,
  shelfView,
  shelfSelectors,
  shelfActions,
}: {
  book: ShelfBook
  shelfView: ShelfWorkspaceView
  shelfSelectors: ShelfWorkspaceSelectors
  shelfActions: ShelfWorkspaceActions
}) {
  const bookProgress = shelfSelectors.latestBookProgress(book)
  const isSingle = book.kind === 'single'
  const multiCheck = shelfView.multiCheckMode && shelfView.supportsMultiCheck
  const showCoverOps = shelfView.activeSourceIsOffline || isSingle || shelfView.isDoujinMode || multiCheck
  const bookMeta = shelfSelectors.ensureMeta(book.meta)
  const coverMetaTags = !shelfView.activeSourceIsOffline && shelfView.isDoujinMode
    ? shelfSelectors.doujinCoverOverlayTags(bookMeta)
    : shelfSelectors.mangaCoverOverlayTags(book, bookMeta)
  const rowTags = shelfSelectors.visibleDoujinTags(book)
  const isDoujinTagPanelOpen = shelfView.doujinTagPanel?.bookId === book.id
  const hasReadProgress = Boolean(bookProgress)
  // RVUX0001: manga tile-copy summary is for read progress; chapter count belongs to cover bottom-left.
  const showMangaProgressSummary = !shelfView.activeSourceIsOffline && !shelfView.isDoujinMode && hasReadProgress
  const summaryText = shelfSelectors.bookSummary(book)
  const cachedCount = shelfSelectors.bookCachedCount(book)
  const coverSrc = shelfSelectors.coverSrc(book)
  const cardOpen = () => shelfActions.openShelfBook(book, shelfView.activeShelfSource)
  const isChecked = multiCheck && shelfView.multiCheckedIds.includes(book.id)

  return (
    <article className={`book-tile ${cachedCount ? 'is-cached' : ''} ${bookProgress ? 'has-progress' : ''} ${book.kind}-card ${isChecked ? 'is-checked' : ''}`}>
      <div className={`poster-card ${showCoverOps ? 'has-dogEaredCover' : ''} ${multiCheck ? 'is-multi-check' : ''}`}>
        <button
          className="cover-button"
          onClick={multiCheck ? () => shelfActions.toggleMultiCheckId(book.id) : cardOpen}
          aria-label={multiCheck ? `选择 ${book.book}` : `打开 ${book.book}`}
        >
          <Cover src={coverSrc} title={book.book} badge={null} overlayTags={coverMetaTags} />
        </button>
        {showCoverOps && (
          <div
            className={`cover-ops ${multiCheck ? 'multi-check' : shelfView.openOpsId === book.id ? 'ops-open' : ''}`}
            role={multiCheck ? 'group' : 'menu'}
            aria-label={`${book.book} ${multiCheck ? '选择' : '操作菜单'}`}
          >
            <button
              className={`dogEaredCover ${cachedCount ? 'is-cached' : ''} ${multiCheck ? 'mc-check' : ''} ${isChecked ? 'is-checked' : ''}`}
              aria-label={multiCheck ? `选择 ${book.book}` : `${book.book} dogEaredCover 操作`}
              role={multiCheck ? 'checkbox' : undefined}
              aria-checked={multiCheck ? isChecked : undefined}
              aria-haspopup={multiCheck ? undefined : 'menu'}
              aria-expanded={multiCheck ? undefined : shelfView.openOpsId === book.id}
              onClick={multiCheck ? () => shelfActions.toggleMultiCheckId(book.id) : () => shelfActions.toggleOps(book.id)}
            >
              <span className="dogEaredCoverGroup" aria-hidden="true">
                <span className="dogEaredCoverMiddle" />
                <span className="dogEaredCoverTop" />
                {multiCheck
                  ? <span className="mc-cbx" />
                  : <img className="dogEaredCoverSee" src="./assets/see.png" alt="" draggable={false} />}
              </span>
            </button>
            {!multiCheck && !shelfView.activeSourceIsOffline && (
              <button
                className="op-action op-addCache"
                onClick={() => {
                  shelfActions.closeOps()
                  if (book.kind === 'series') void shelfActions.cacheSeries(book)
                  else void shelfActions.cacheItem(book)
                }}
                disabled={shelfView.connection !== 'online' || !!shelfView.busy}
                aria-label={`${cachedCount ? '更新缓存' : '缓存至离线看'} ${book.book}`}
              >
                {shelfView.busy === `cache:${book.id}` || shelfView.busy === `series:${book.id}`
                  ? <LoaderCircle className="spin" size={15} />
                  : <CustomIcon name="cacheAdd" size={15} className="cache-add-icon" />}
              </button>
            )}
            {!multiCheck && (
              <button
                className={`op-action op-del handle-btn ${shelfView.activeSourceIsOffline || !shelfView.deleteHardMode ? 'handle-removeBtn' : 'handle-delBtn'} ${shelfView.deleteHardMode ? 'is-hard' : ''}`}
                onClick={() => {
                  shelfActions.closeOps()
                  if (shelfView.activeSourceIsOffline) void shelfActions.removeCachedBook(book)
                  else void shelfActions.handleBookAction(book, shelfView.deleteHardMode ? 'del' : 'remove')
                }}
                disabled={!!shelfView.busy}
                aria-label={`${shelfView.activeSourceIsOffline ? '删除缓存' : shelfView.deleteHardMode ? '彻底删除' : '移至回收'} ${book.book}`}
              >
                <Trash2 size={15} />
              </button>
            )}
            {!multiCheck && !shelfView.activeSourceIsOffline && (
              <button
                className="op-action op-save handle-btn handle-saveBtn"
                onClick={() => {
                  shelfActions.closeOps()
                  void shelfActions.handleBookAction(book, 'save')
                }}
                disabled={!!shelfView.busy}
                aria-label={`保留 ${book.book}`}
              >
                <Save size={15} />
              </button>
            )}
            {!multiCheck && !shelfView.activeSourceIsOffline && shelfView.isDoujinMode && (
              <button
                className="op-action op-search"
                onClick={() => {
                  shelfActions.closeOps()
                  shelfActions.openCgsSearchFromBook(book)
                }}
                disabled={!!shelfView.busy}
                aria-label={`CGS 搜索 ${book.book}`}
              >
                <CustomIcon name="detailSearch" size={15} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="tile-copy">
        <button className="link-title" onClick={cardOpen}>
          {book.book}
        </button>
        {shelfView.activeSourceIsOffline || shelfView.isDoujinMode ? (
          <div className="doujin-tag-slot">
            {bookMeta.tags.length > 0 && (
              <button
                className={`doujin-tag-row ${isDoujinTagPanelOpen ? 'is-open' : ''}`}
                type="button"
                onClick={() => shelfActions.openDoujinTagPanel(book)}
                aria-haspopup="dialog"
                aria-expanded={isDoujinTagPanelOpen}
                aria-controls="doujin-tag-sheet"
                aria-label={`${book.book} 标签`}
              >
                <span className="doujin-tag-row-label">
                  <Tags size={14} />
                </span>
                <span className="doujin-tag-row-preview" aria-hidden="true">
                  {rowTags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
                </span>
              </button>
            )}
          </div>
        ) : showMangaProgressSummary ? (
          <span>{summaryText}</span>
        ) : null}
        {shelfSelectors.showShelfSummary(book) && hasReadProgress && <span>{summaryText}</span>}
      </div>
    </article>
  )
}
