import type { CSSProperties } from 'react'
import { CheckCheck, Eraser, LoaderCircle, Move, Save, Trash2 } from 'lucide-react'
import { CustomIcon } from '../icons/CustomIcon'
import type { ShelfWorkspaceActions, ShelfWorkspaceView } from './LibraryWorkspace'

export function MultiCheckFloat({
  shelfView,
  shelfActions,
}: {
  shelfView: ShelfWorkspaceView
  shelfActions: ShelfWorkspaceActions
}) {
  if (!shelfView.multiCheckMode) return null

  const count = shelfView.multiCheckedIds.length
  const empty = count === 0
  const running = shelfView.busy === 'multi-check'
  const cacheDisabled = empty || running || shelfView.connection !== 'online'
  const handleDisabled = empty || running
  const delIsHard = shelfView.deleteHardMode

  return (
    <div
      className="cgs-submit-float multi-check-float"
      style={{ left: shelfView.multiCheckFloatPosition.x, top: shelfView.multiCheckFloatPosition.y } as CSSProperties}
    >
      <div className="btn-group multi-check-actions" role="group" aria-label="批量操作">
        <button
          type="button"
          className="multi-check-cache"
          onClick={() => void shelfActions.runMultiCheckBatch('cacheAdd')}
          disabled={cacheDisabled}
          aria-label={`缓存选中 ${count} 项`}
          title="缓存至离线看"
        >
          {running ? <LoaderCircle className="spin" size={16} /> : <CustomIcon name="cacheAdd" size={16} className="cache-add-icon" />}
        </button>
        <button
          type="button"
          className="handle-btn handle-saveBtn"
          onClick={() => void shelfActions.runMultiCheckBatch('save')}
          disabled={handleDisabled}
          aria-label={`保留选中 ${count} 项`}
          title="移至保留"
        >
          <Save size={16} />
        </button>
        <button
          type="button"
          className={`handle-btn ${delIsHard ? 'handle-delBtn' : 'handle-removeBtn'}`}
          onClick={() => void shelfActions.runMultiCheckBatch('del')}
          disabled={handleDisabled}
          aria-label={`${delIsHard ? '彻底删除' : '移至回收'}选中 ${count} 项`}
          title={delIsHard ? '彻底删除' : '移至回收'}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <span className="cgs-submit-badge">{count}</span>
      <div className="btn-group cgs-submit-tools" role="group" aria-label="多选工具">
        <button
          type="button"
          className="icon-only"
          onClick={() => shelfActions.selectAllCurrentPage(shelfView.pagedShelf.map((book) => book.id))}
          disabled={running || !shelfView.pagedShelf.length}
          aria-label="全选当前页"
          title="全选当前页"
        >
          <CheckCheck size={14} />
        </button>
        <button
          type="button"
          className="clearBtn icon-only"
          onClick={shelfActions.clearMultiCheck}
          disabled={empty}
          aria-label="清除选中"
          title="清除选中"
        >
          <Eraser size={14} />
        </button>
        <button
          type="button"
          className="cgs-submit-drag"
          aria-label="拖动多选浮标"
          onPointerDown={shelfActions.startMultiCheckDrag}
          onPointerMove={shelfActions.moveMultiCheckDrag}
          onPointerUp={shelfActions.finishMultiCheckDrag}
          onPointerCancel={shelfActions.finishMultiCheckDrag}
        >
          <Move size={14} />
        </button>
        <button
          type="button"
          className="icon-only"
          onClick={shelfActions.exitMultiCheck}
          aria-label="退出多选"
          title="退出多选"
        >
          <CustomIcon name="menuExit" size={14} />
        </button>
      </div>
    </div>
  )
}
