import { LoaderCircle, Save, Trash2 } from 'lucide-react'
import { CustomIcon } from '../icons/CustomIcon'
import { Cover } from '../shared/Cover'
import { ProgressMeter, ShelfPager } from '../shared/Cover'
import type { LibraryItem } from '../mobileStore'
import type { DetailActions, DetailSelectors, DetailView } from './DetailWorkspace'

export function EpisodePanel({
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
    <section className="episode-panel chapter-grid-panel" aria-label="章节">
      {detailView.episodePageCount > 1 && (
        <ShelfPager
          current={detailView.episodePageSafe}
          total={selectedBook.episodes.length}
          pageSize={detailView.episodePageSize}
          onChange={detailActions.changeEpisodePage}
          label="章节分页"
        />
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))',
        gap: 8,
      }}>
        {detailView.pagedEpisodes.map((episode) => (
          <EpisodeTile
            key={episode.id}
            episode={episode}
            detailView={detailView}
            detailSelectors={detailSelectors}
            detailActions={detailActions}
          />
        ))}
      </div>
      {detailView.episodePageCount > 1 && (
        <ShelfPager
          current={detailView.episodePageSafe}
          total={selectedBook.episodes.length}
          pageSize={detailView.episodePageSize}
          onChange={detailActions.changeEpisodePage}
          label="章节分页"
        />
      )}
    </section>
  )
}

function EpisodeTile({
  episode,
  detailView,
  detailSelectors,
  detailActions,
}: {
  episode: LibraryItem
  detailView: DetailView
  detailSelectors: DetailSelectors
  detailActions: DetailActions
}) {
  const episodeProgress = detailSelectors.episodeProgress(episode)
  const cachedEpisode = detailSelectors.cachedEpisode(episode)
  const episodePageCount = detailSelectors.episodePageCount(episode, cachedEpisode)
  const title = episode.ep || episode.title

  return (
    <article style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <div className="poster-card episode-poster-card has-dogEaredCover">
        <button className="cover-button" onClick={() => void detailActions.openSourceItem(episode, detailView.selectedShelfSource)} aria-label={`打开 ${title}`}>
          <Cover
            src={detailSelectors.episodeCoverSrc(episode)}
            title={title}
            badge={null}
            overlayTags={detailSelectors.episodeCoverOverlayTags(episodePageCount)}
          />
        </button>
        <div className={`cover-ops ${detailView.openOpsId === episode.id ? 'ops-open' : ''}`} role="menu" aria-label={`${title} 操作菜单`}>
          <button
            className={`dogEaredCover ${cachedEpisode ? 'is-cached' : ''}`}
            aria-label={`${title} dogEaredCover 操作`}
            aria-haspopup="menu"
            aria-expanded={detailView.openOpsId === episode.id}
            onClick={() => detailActions.toggleOps(episode.id)}
          >
            <span className="dogEaredCoverGroup" aria-hidden="true">
              <span className="dogEaredCoverMiddle" />
              <span className="dogEaredCoverTop" />
              <img className="dogEaredCoverSee" src="./assets/see.png" alt="" draggable={false} />
            </span>
          </button>
          {!detailView.detailSourceIsOffline && (
            <button
              className="op-action op-addCache"
              onClick={() => {
                detailActions.closeOps()
                void detailActions.cacheItem(episode)
              }}
              disabled={detailView.connection !== 'online' || !!detailView.busy}
              aria-label={`${cachedEpisode ? '更新缓存' : '缓存章节'} ${title}`}
              title={cachedEpisode ? '更新缓存' : '缓存章节'}
            >
              {detailView.busy === `cache:${episode.id}`
                ? <LoaderCircle className="spin" size={15} />
                : <CustomIcon name="cacheAdd" size={15} className="cache-add-icon" />}
            </button>
          )}
          <button
            className={`op-action op-del handle-btn ${detailView.detailSourceIsOffline || !detailView.deleteHardMode ? 'handle-removeBtn' : 'handle-delBtn'} ${detailView.deleteHardMode ? 'is-hard' : ''}`}
            onClick={() => {
              detailActions.closeOps()
              if (detailView.detailSourceIsOffline && cachedEpisode) void detailActions.removeCached(cachedEpisode)
              else void detailActions.handleDetailBookAction(episode, detailView.deleteHardMode ? 'del' : 'remove')
            }}
            disabled={detailView.detailSourceIsOffline ? !cachedEpisode || !!detailView.busy : !!detailView.busy}
            aria-label={`${detailView.detailSourceIsOffline ? '删除缓存' : detailView.deleteHardMode ? '彻底删除' : '移至回收'} ${title}`}
            title={detailView.detailSourceIsOffline ? '删除缓存' : detailView.deleteHardMode ? '彻底删除' : '移至回收'}
          >
            <Trash2 size={15} />
          </button>
          {!detailView.detailSourceIsOffline && (
            <button
              className="op-action op-save handle-btn handle-saveBtn"
              onClick={() => {
                detailActions.closeOps()
                void detailActions.handleDetailBookAction(episode, 'save')
              }}
              disabled={!!detailView.busy}
              aria-label={`保留 ${title}`}
              title="移至保留"
            >
              <Save size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="episode-card-copy">
        <div className="episode-card-title-row">
          <div className="episode-card-title-stack">
            <span className="episode-card-title" title={title}>
              {title}
            </span>
            <ProgressMeter value={episodeProgress ? detailSelectors.progressMeterValue(episodeProgress, episodePageCount ?? undefined) : 0} />
          </div>
        </div>
      </div>
    </article>
  )
}
