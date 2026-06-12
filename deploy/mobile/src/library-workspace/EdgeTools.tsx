import { Filter, LoaderCircle, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { MouseEventHandler, PointerEventHandler } from 'react'
import { CustomIcon } from '../icons/CustomIcon'

export const edgeActions = ['filter', 'sort', 'refresh', 'delete-mode', 'doujin'] as const
export type EdgeAction = typeof edgeActions[number]

export function isEdgeAction(value: string | undefined): value is EdgeAction {
  return Boolean(value && edgeActions.includes(value as EdgeAction))
}

export function EdgeTools({
  open,
  logoSrc,
  tipAction,
  busy,
  comicMode,
  deleteHardMode,
  showDoujinAction,
  onAction,
  onStripPointerDown,
  onStripPointerMove,
  onStripPointerUp,
  onStripPointerCancel,
}: {
  open: boolean
  logoSrc: string
  tipAction: EdgeAction | null
  busy: string
  comicMode: string
  deleteHardMode: boolean
  showDoujinAction: boolean
  onAction: (action: EdgeAction) => void
  onStripPointerDown: PointerEventHandler<HTMLButtonElement>
  onStripPointerMove: PointerEventHandler<HTMLButtonElement>
  onStripPointerUp: PointerEventHandler<HTMLButtonElement>
  onStripPointerCancel: PointerEventHandler<HTMLButtonElement>
}) {
  const iconSize = 20.4
  const actionButtonClass = (action: EdgeAction): string => ['menu-card', tipAction === action ? 'tip-active' : '']
    .filter(Boolean)
    .join(' ')
  const runAction: MouseEventHandler<HTMLButtonElement> = (event) => {
    const action = event.currentTarget.dataset.edgeAction
    if (isEdgeAction(action)) onAction(action)
  }

  return (
    <div className={`edge-tools ${open ? 'open' : ''}`}>
      <button
        className="edge-strip"
        onPointerDown={onStripPointerDown}
        onPointerMove={onStripPointerMove}
        onPointerUp={onStripPointerUp}
        onPointerCancel={onStripPointerCancel}
        aria-label="书架工具"
      >
        <img className="edge-img" src={logoSrc} alt="" />
      </button>
      <div className="edge-menu" aria-hidden={!open}>
        <button
          className={actionButtonClass('refresh')}
          data-edge-action="refresh"
          onClick={runAction}
          disabled={busy === 'library'}
        >
          {busy === 'library' ? <LoaderCircle className="spin" size={iconSize} /> : <RefreshCw size={iconSize} />}
          <span className="span-tip">刷新</span>
        </button>
        {showDoujinAction && (
          <button
            className={actionButtonClass('doujin')}
            data-edge-action="doujin"
            onClick={runAction}
            disabled={busy === 'switch-ero'}
          >
            {busy === 'switch-ero' ? <LoaderCircle className="spin" size={iconSize} /> : <CustomIcon name="doujin" className={`doujin-mode-icon ${comicMode}`} size={iconSize} />}
            <span className="span-tip">切换同人</span>
          </button>
        )}
        <button
          className={actionButtonClass('delete-mode')}
          data-edge-action="delete-mode"
          onClick={runAction}
        >
          <Trash2 className={`delete-mode-icon ${deleteHardMode ? 'delete' : 'remove'}`} size={iconSize} />
          <span className="span-tip">删除模式</span>
        </button>
        <button
          className={actionButtonClass('sort')}
          data-edge-action="sort"
          onClick={runAction}
        >
          <SlidersHorizontal size={iconSize} />
          <span className="span-tip">排序</span>
        </button>
        <button
          className={actionButtonClass('filter')}
          data-edge-action="filter"
          onClick={runAction}
        >
          <Filter size={iconSize} />
          <span className="span-tip">筛选</span>
        </button>
      </div>
    </div>
  )
}
