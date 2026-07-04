import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { CheckCheck, Eraser, LoaderCircle, Move, Save, Trash2 } from 'lucide-react'
import { CustomIcon } from '../icons/CustomIcon'
import type { ShelfWorkspaceActions, ShelfWorkspaceView } from './LibraryWorkspace'
import { MULTI_CHECK_PRIMARY_BATCH_ACTIONS, type MultiCheckBatchAction } from './libraryCore'

function selectedBatteryBadgeStyle(selectedCount: number, totalCount: number): CSSProperties {
  const ratio = totalCount > 0 ? Math.min(selectedCount / totalCount, 1) : 0
  const color = ratio >= 0.8 ? '#00c853' : ratio >= 0.4 ? 'var(--warning-text)' : 'var(--accent)'
  return {
    '--cgs-submit-badge-fill': `${Math.round(ratio * 100)}%`,
    '--cgs-submit-badge-color': color,
  } as CSSProperties
}

export function MultiCheckFloat({
  shelfView,
  shelfActions,
}: {
  shelfView: ShelfWorkspaceView
  shelfActions: ShelfWorkspaceActions
}) {
  const [badgePop, setBadgePop] = useState(false)

  useEffect(() => {
    setBadgePop(false)
    const frame = window.requestAnimationFrame(() => setBadgePop(true))
    return () => window.cancelAnimationFrame(frame)
  }, [shelfView.multiCheckedIds.length])

  if (!shelfView.multiCheckMode) return null

  const count = shelfView.multiCheckedIds.length
  const empty = count === 0
  const running = shelfView.busy === 'multi-check'
  const cacheDisabled = empty || running || shelfView.connection !== 'online'
  const handleDisabled = empty || running
  const delIsHard = shelfView.deleteHardMode
  const primaryActions = MULTI_CHECK_PRIMARY_BATCH_ACTIONS.map((action) => {
    if (action === 'cacheAdd') {
      return {
        key: 'cache',
        action,
        className: 'multi-check-cache',
        disabled: cacheDisabled,
        ariaLabel: `缓存选中 ${count} 项`,
        content: running ? <LoaderCircle className="spin" size={16} /> : <CustomIcon name="cacheAdd" size={16} className="cache-add-icon" />,
      }
    }
    if (action === 'attachAdd') {
      return {
        key: 'attach',
        action,
        className: 'multi-check-attach',
        disabled: cacheDisabled,
        ariaLabel: `附加选中 ${count} 项到 RV Agent`,
        content: <CustomIcon name="detailSearch" size={16} />,
      }
    }
    if (action === 'save') {
      return {
        key: 'save',
        action,
        className: 'handle-btn handle-saveBtn',
        disabled: handleDisabled,
        ariaLabel: `保留选中 ${count} 项`,
        content: <Save size={16} />,
      }
    }
    return {
      key: 'delete',
      action,
      className: `handle-btn ${delIsHard ? 'handle-delBtn' : 'handle-removeBtn'}`,
      disabled: handleDisabled,
      ariaLabel: `${delIsHard ? '彻底删除' : '移至回收'}选中 ${count} 项`,
      content: <Trash2 size={16} />,
    }
  }) satisfies Array<{
    key: string
    action: MultiCheckBatchAction
    className: string
    disabled: boolean
    ariaLabel: string
    content: ReactNode
  }>
  const floatStyle = {
    left: shelfView.multiCheckFloatPosition.x,
    top: shelfView.multiCheckFloatPosition.y,
    '--cgs-submit-action-count': primaryActions.length,
  } as CSSProperties
  const badgeStyle = selectedBatteryBadgeStyle(count, shelfView.pagedShelf.length)

  return (
    <div
      className="cgs-submit-float multi-check-float"
      style={floatStyle}
    >
      <div className="btn-group multi-check-actions" role="group" aria-label="批量操作">
        {primaryActions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={action.className}
            onClick={() => void shelfActions.runMultiCheckBatch(action.action)}
            disabled={action.disabled}
            aria-label={action.ariaLabel}
          >
            {action.content}
          </button>
        ))}
      </div>
      <span
        className={`cgs-submit-badge cgs-submit-battery-badge${badgePop ? ' is-pop' : ''}`}
        style={badgeStyle}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform') setBadgePop(false)
        }}
        aria-label={`已选 ${count} 项`}
      >
        <span className="cgs-submit-badge-text">{count}</span>
      </span>
      <div className="btn-group cgs-submit-tools" role="group" aria-label="多选工具">
        <button
          type="button"
          className="icon-only"
          onClick={() => shelfActions.selectAllCurrentPage(shelfView.pagedShelf.map((book) => book.id))}
          disabled={running || !shelfView.pagedShelf.length}
          aria-label="全选当前页"
        >
          <CheckCheck size={14} />
        </button>
        <button
          type="button"
          className="clearBtn icon-only"
          onClick={shelfActions.clearMultiCheck}
          disabled={empty}
          aria-label="清除选中"
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
        >
          <CustomIcon name="menuExit" size={14} />
        </button>
      </div>
    </div>
  )
}
