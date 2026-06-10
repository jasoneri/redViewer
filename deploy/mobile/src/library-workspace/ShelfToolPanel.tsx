import { Eraser, Filter, FolderOpen, Search, SlidersHorizontal, Tags, X } from 'lucide-react'
import type { SortMode } from './libraryCore'
import type { ShelfWorkspaceActions, ShelfWorkspaceView } from './LibraryWorkspace'

export function ShelfToolPanel({
  shelfView,
  shelfActions,
}: {
  shelfView: ShelfWorkspaceView
  shelfActions: ShelfWorkspaceActions
}) {
  return (
    <>
      <button className="tool-scrim" onClick={shelfActions.closeToolPanel} aria-label="关闭工具面板" />
      <section className={`tool-panel floating-tool-panel ${shelfView.activeToolPanel === 'filter' ? 'filter-panel' : 'sort-panel'}`} aria-label={shelfView.activeToolPanel === 'filter' ? '筛选' : '排序'}>
        {shelfView.activeToolPanel === 'filter' && (
          <div className="tool-panel-head">
            <div className="filter-head-left">
              <div className="btn-group filter-head-actions" aria-label="筛选动作">
                <button className={shelfView.seriesOnly ? 'active' : ''} onClick={shelfActions.toggleSeriesOnly} aria-pressed={shelfView.seriesOnly} title="只显示系列">
                  <FolderOpen size={15} />
                  筛系列
                  <svg className="filter-click-cue" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
                    <g transform="translate(28 0) scale(-1 1)">
                      <path className="cursor-frame" d="M0 0h28v28H0z" />
                      <path className="cursor-body" d="M6 3.604c0-1.346 1.56-2.09 2.607-1.243l16.88 13.669c1.018.824.435 2.47-.875 2.47h-9.377a2.25 2.25 0 0 0-1.749.835l-4.962 6.134C7.682 26.51 6 25.915 6 24.576z" />
                    </g>
                  </svg>
                </button>
              </div>
            </div>
            <button className="icon-only" onClick={shelfActions.closeToolPanel} aria-label="关闭">
              <X size={16} />
            </button>
          </div>
        )}
        {shelfView.activeToolPanel === 'filter' ? (
          <>
            <label className="search-field filter-input-field">
              <Search size={17} />
              <input
                value={shelfView.filterDraft}
                onChange={(event) => shelfActions.setFilterDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') shelfActions.applyFilterDraft()
                }}
                placeholder="大小写不敏感：书名 / 作者 / 标签 / 章节"
                autoFocus
              />
              <span className="filter-input-actions">
                <button className="icon-only primary-action filter-apply-button" onClick={shelfActions.applyFilterDraft} aria-label="确认筛选" title="确认筛选">
                  <Filter size={16} />
                </button>
                {shelfView.filterDraft && (
                  <button className="icon-only filter-clear-button" onClick={shelfActions.clearFilter} aria-label="清空筛选" title="清空筛选并显示原始列表">
                    <Eraser className="clear-icon" size={16} />
                  </button>
                )}
              </span>
            </label>
            <div className="chip-row" aria-label="快捷筛选">
              {shelfView.quickFilterKeywords.map((keyword) => (
                <button className={shelfView.query === keyword ? 'active' : ''} key={keyword} onClick={() => shelfActions.selectFilterKeyword(keyword)}>
                  <Tags size={15} />
                  {keyword}
                </button>
              ))}
            </div>
            <div className="filter-section-title filter-board-count" aria-label="匹配数量">
              <small>{shelfView.filterBoardKeywords.length}</small>
            </div>
            {shelfView.filterBoardKeywords.length > 0 ? (
              <div className="filter-keyword-board" aria-label="筛选关键词面板">
                {shelfView.filterBoardKeywords.map((keyword) => (
                  <button
                    className={shelfView.query === keyword ? 'active' : ''}
                    key={keyword}
                    onClick={() => shelfActions.selectFilterKeyword(keyword)}
                    title={keyword}
                    aria-pressed={shelfView.query === keyword}
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            ) : (
              <p className="filter-empty-hint">没有匹配的关键词，可直接确认当前输入。</p>
            )}
          </>
        ) : (
          <div className="sort-panel-grid">
            {Object.entries(shelfView.sortLabels).map(([value, label]) => (
              <button className={shelfView.sort === value ? 'active' : ''} key={value} onClick={() => void shelfActions.changeSort(value as SortMode)}>
                <SlidersHorizontal size={16} />
                {label}
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
