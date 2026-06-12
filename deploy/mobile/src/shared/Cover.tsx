import { ConfigProvider, Pagination, Tag, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BookOpen } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'

export type CoverOverlayAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type CoverOverlayTone = 'artist' | 'episodes' | 'light' | 'pages'
export type CoverOverlayIcon = 'episodes'
export type CoverOverlayTag = {
  key: string
  text: string
  title: string
  anchor: CoverOverlayAnchor
  tone: CoverOverlayTone
  icon?: CoverOverlayIcon
}

export function Cover({
  src,
  title,
  badge,
  overlayTags = [],
  compact = false,
  stackIndex,
}: {
  src: string
  title: string
  badge: string | null
  overlayTags?: CoverOverlayTag[]
  compact?: boolean
  stackIndex?: number
}) {
  const topLeft = overlayTags.filter((tag) => tag.anchor === 'top-left')
  const topRight = overlayTags.filter((tag) => tag.anchor === 'top-right')
  const bottomLeft = overlayTags.filter((tag) => tag.anchor === 'bottom-left')
  const bottomRight = overlayTags.filter((tag) => tag.anchor === 'bottom-right')
  return (
    <div className={`cover ${compact ? 'compact' : ''} ${stackIndex !== undefined ? `stack-cover stack-${stackIndex}` : ''}`}>
      <BookOpen size={compact ? 22 : 34} />
      {src && <img src={src} alt={title} loading="lazy" decoding="async" draggable={false} onError={(event) => { event.currentTarget.hidden = true }} />}
      {topLeft.length > 0 && (
        <div className="cover-overlay-stack top-left demo-badge-group" aria-hidden="true">
          {topLeft.map(renderCoverOverlayTag)}
        </div>
      )}
      {topRight.length > 0 && (
        <div className="cover-overlay-stack top-right" aria-hidden="true">
          {topRight.map(renderCoverOverlayTag)}
        </div>
      )}
      {bottomLeft.length > 0 && (
        <div className="cover-overlay-stack bottom-left" aria-hidden="true">
          {bottomLeft.map(renderCoverOverlayTag)}
        </div>
      )}
      {bottomRight.length > 0 && (
        <div className="cover-overlay-stack bottom-right" aria-hidden="true">
          {bottomRight.map(renderCoverOverlayTag)}
        </div>
      )}
      {badge && <Tag className="cover-badge-tag">{badge}</Tag>}
    </div>
  )
}

export function renderCoverOverlayTag(tag: CoverOverlayTag) {
  return (
    <Tag key={tag.key} className={`cover-overlay-tag tone-${tag.tone}${tag.text ? '' : ' icon-only'}${tag.icon === 'episodes' ? ' eps-badge' : ''}`} title={tag.title} variant="filled">
      {tag.icon === 'episodes' && <BookOpen size={11} className="overlay-badge-icon" aria-hidden="true" />}
      {tag.text ? <span>{tag.text}</span> : null}
    </Tag>
  )
}

export function ProgressMeter({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(Math.round(value), 100))
  return (
    <div className={`progress-track${safe === 0 ? ' is-empty' : ''}`} aria-label={`进度 ${safe}%`}>
      {safe > 0 ? <div style={{ width: `${safe}%` }} /> : null}
    </div>
  )
}

export function EmptyState({ icon, title, action }: { icon?: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      {action}
    </div>
  )
}

export function StatusBadgeIcon({
  Icon,
  ok,
  label,
  title,
  showBadge = true,
  disabled = true,
  onClick,
  className = '',
}: {
  Icon: ComponentType<{ size?: number }>
  ok: boolean
  label: string
  title: string
  showBadge?: boolean
  disabled?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={`accept-icon accept-status-icon ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={title}
    >
      <Icon size={16} />
      {showBadge && <span className={`accept-status-badge ${ok ? 'ok' : 'error'}`} aria-hidden="true" />}
    </button>
  )
}

const SHELF_PAGER_THEME = {
  algorithm: theme.darkAlgorithm,
  token: { colorPrimary: '#d9b35f' },
}

export function ShelfPager({
  current,
  total,
  pageSize,
  onChange,
  label,
}: {
  current: number
  total: number
  pageSize: number
  onChange: (page: number) => void
  label: string
}) {
  return (
    <ConfigProvider theme={SHELF_PAGER_THEME} locale={zhCN}>
      <nav className="shelf-pager" aria-label={label}>
        <Pagination
          size="small"
          align="center"
          current={current}
          total={total}
          pageSize={pageSize}
          showSizeChanger={false}
          showQuickJumper
          showLessItems
          onChange={(page) => onChange(page)}
        />
      </nav>
    </ConfigProvider>
  )
}
