import { LoaderCircle, Save, Tags, Trash2, UserSearch } from 'lucide-react'
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
  const showCoverOps = shelfView.activeSourceIsOffline || isSingle || shelfView.isDoujinMode
  const bookMeta = shelfSelectors.ensureMeta(book.meta)
  const coverMetaTags = !shelfView.activeSourceIsOffline && shelfView.isDoujinMode
    ? shelfSelectors.doujinCoverOverlayTags(bookMeta)
    : shelfSelectors.mangaCoverOverlayTags(book, bookMeta)
  const rowTags = shelfSelectors.visibleDoujinTags(book)
  const isDoujinTagPanelOpen = shelfView.doujinTagPanel?.bookId === book.id
  const hasReadProgress = Boolean(bookProgress)
  const summaryText = shelfSelectors.bookSummary(book)
  const cachedCount = shelfSelectors.bookCachedCount(book)
  const coverSrc = shelfSelectors.coverSrc(book)
  const cardOpen = () => shelfActions.openShelfBook(book, shelfView.activeShelfSource)

  return (
    <article className={`book-tile ${cachedCount ? 'is-cached' : ''} ${bookProgress ? 'has-progress' : ''} ${book.kind}-card`}>
      <div className={`poster-card ${showCoverOps ? 'has-dogEaredCover' : ''}`}>
        <button className="cover-button" onClick={cardOpen} aria-label={`打开 ${book.book}`}>
          <Cover src={coverSrc} title={book.book} badge={null} overlayTags={coverMetaTags} />
        </button>
        {showCoverOps && (
          <div className={`cover-ops ${shelfView.openOpsId === book.id ? 'ops-open' : ''}`} role="menu" aria-label={`${book.book} 操作菜单`}>
            <button
              className={`dogEaredCover ${cachedCount ? 'is-cached' : ''}`}
              aria-label={`${book.book} dogEaredCover 操作`}
              aria-haspopup="menu"
              aria-expanded={shelfView.openOpsId === book.id}
              onClick={() => shelfActions.toggleOps(book.id)}
            >
              <span className="dogEaredCoverGroup" aria-hidden="true">
                <span className="dogEaredCoverMiddle" />
                <span className="dogEaredCoverTop" />
                <img className="dogEaredCoverSee" src="./assets/see.png" alt="" draggable={false} />
              </span>
            </button>
            {!shelfView.activeSourceIsOffline && (
              <button
                className="op-action op-addCache"
                onClick={() => {
                  shelfActions.closeOps()
                  if (book.kind === 'series') void shelfActions.cacheSeries(book)
                  else void shelfActions.cacheItem(book)
                }}
                disabled={shelfView.connection !== 'online' || !!shelfView.busy}
                aria-label={`${cachedCount ? '更新缓存' : '缓存至离线看'} ${book.book}`}
                title={cachedCount ? '更新缓存' : '缓存至离线看'}
              >
                {shelfView.busy === `cache:${book.id}` || shelfView.busy === `series:${book.id}`
                  ? <LoaderCircle className="spin" size={15} />
                  : <CustomIcon name="cacheAdd" size={15} className="cache-add-icon" />}
              </button>
            )}
            <button
              className={`op-action op-del handle-btn ${shelfView.activeSourceIsOffline || !shelfView.deleteHardMode ? 'handle-removeBtn' : 'handle-delBtn'} ${shelfView.deleteHardMode ? 'is-hard' : ''}`}
              onClick={() => {
                shelfActions.closeOps()
                if (shelfView.activeSourceIsOffline) void shelfActions.removeCachedBook(book)
                else void shelfActions.handleBookAction(book, shelfView.deleteHardMode ? 'del' : 'remove')
              }}
              disabled={!!shelfView.busy}
              aria-label={`${shelfView.activeSourceIsOffline ? '删除缓存' : shelfView.deleteHardMode ? '彻底删除' : '移至回收'} ${book.book}`}
              title={shelfView.activeSourceIsOffline ? '删除缓存' : shelfView.deleteHardMode ? '彻底删除' : '移至回收'}
            >
              <Trash2 size={15} />
            </button>
            {!shelfView.activeSourceIsOffline && (
              <button
                className="op-action op-save handle-btn handle-saveBtn"
                onClick={() => {
                  shelfActions.closeOps()
                  void shelfActions.handleBookAction(book, 'save')
                }}
                disabled={!!shelfView.busy}
                aria-label={`保留 ${book.book}`}
                title="移至保留"
              >
                <Save size={15} />
              </button>
            )}
            {!shelfView.activeSourceIsOffline && shelfView.isDoujinMode && (
              <button
                className="op-action op-search"
                onClick={() => {
                  shelfActions.closeOps()
                  shelfActions.openCgsSearchFromBook(book)
                }}
                disabled={!!shelfView.busy}
                aria-label={`CGS 搜索 ${book.book}`}
                title="CGS 搜索"
              >
                <UserSearch size={15} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="tile-copy">
        <button className="link-title" onClick={cardOpen} title={book.book}>
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
                title={bookMeta.tags.join(' / ')}
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
        ) : !shelfView.isDoujinMode ? (
          <span>{summaryText}</span>
        ) : null}
        {shelfSelectors.showShelfSummary(book) && hasReadProgress && <span>{summaryText}</span>}
      </div>
    </article>
  )
}
