import { TreeSelect, type TreeSelectProps } from 'antd'
import { CircleHelp, CornerDownLeft, FolderOpen, Globe2, Grid2X2, LoaderCircle, Radar, Search, Settings, X } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { CustomIcon } from '../icons/CustomIcon'
import { StatusBadgeIcon } from '../shared/Cover'
import { InputHistoryMenu } from '../shared/NativeDropdownMenu'

export type DrawerView = 'library' | 'downloads' | 'reader' | 'acquire'
export type DrawerTabView = 'library' | 'downloads' | 'acquire'

export type FilesystemNode = {
  title: string
  value: string
  key: string
  isLeaf?: boolean
  children?: FilesystemNode[]
}

export type FilesystemSelectValue = {
  value: string
  label: string
}

export type FilesystemLoadData = NonNullable<TreeSelectProps<FilesystemSelectValue, FilesystemNode>['loadData']>
export type FilesystemExpandedKeys = Parameters<NonNullable<TreeSelectProps<FilesystemSelectValue, FilesystemNode>['onTreeExpand']>>[0]

export type LibraryDrawerView = {
  appAuthor: string
  appVersion: string
  authorAvatarSrc: string
  settingsBottomGifSrc: string
  backendAvailable: boolean
  backendDraft: string
  backendInputRef: RefObject<HTMLInputElement | null>
  backendScanning: boolean
  backendStatusKnown: boolean
  backendStatusText: string
  backendUrlHistory: string[]
  booksPathActive: string
  booksPathCurrent: string
  comicPathDraft: string
  currentLanguageLabel: string
  filesystemBusy: boolean
  filesystemExpandedKeys: string[]
  filesystemTree: FilesystemNode[]
  pathBusy: string
  pathConfigured: boolean
  pathStatusText: string
  rootSecretConfigured: boolean
  rootSecretDraft: string
  rootSecretHelpOpen: boolean
}

export type DownloadsDrawerView = {
  cacheSummaryHint: string
  cacheSummaryText: string
  storageBusy: string
}

export type LibraryDrawerLinks = {
  changelog: string
  docs: string
  faq: string
  issues: string
  releases: string
}

export type LeftDrawerActions = {
  changeFilesystemExpandedKeys: (keys: FilesystemExpandedKeys) => void
  cleanupInvalidCache: () => Promise<void> | void
  clearBackendDraft: () => void
  discoverBackend: () => Promise<void> | void
  handleBooksPathChange: (path: string) => Promise<void> | void
  moveBackendCaretToEnd: () => void
  openCustomSettingsFromBackground: () => void
  openExternalLink: (url: string, label: string) => Promise<void> | void
  refreshFilesystem: (path?: string) => Promise<void> | void
  saveBackend: () => Promise<void> | void
  saveComicPath: () => Promise<void> | void
  saveRootSecret: () => Promise<void> | void
  setBackendDraft: (value: string) => void
  setRootSecretDraft: (value: string) => void
  toggleRootSecretHelp: () => void
  loadFilesystemNode: FilesystemLoadData
}

export type LeftDrawerProps = {
  open: boolean
  activeView: DrawerView
  onClose: () => void
  onOpenTab: (view: DrawerTabView) => void
  libraryView: LibraryDrawerView
  downloadsView: DownloadsDrawerView
  links: LibraryDrawerLinks
  actions: LeftDrawerActions
  acquireSettings: ReactNode
}

export function LeftDrawer({
  open,
  activeView,
  onClose,
  onOpenTab,
  libraryView,
  downloadsView,
  links,
  actions,
  acquireSettings,
}: LeftDrawerProps) {
  return (
    <>
      <button
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-label="关闭菜单"
        tabIndex={open ? 0 : -1}
      />
      <aside className={`left-drawer ${open ? 'open' : ''}`} aria-label="应用菜单" aria-hidden={!open}>
        <nav className="drawer-nav">
          <button className={activeView === 'library' ? 'active' : ''} onClick={() => onOpenTab('library')}>
            <Grid2X2 size={18} />
            <span>书架</span>
          </button>
          <button className={activeView === 'downloads' ? 'active' : ''} onClick={() => onOpenTab('downloads')}>
            <CustomIcon name="offline" size={18} />
            <span>离线</span>
          </button>
          <button className={activeView === 'acquire' ? 'active' : ''} onClick={() => onOpenTab('acquire')}>
            <Search size={18} />
            <span>CGS</span>
          </button>
        </nav>
        <div className="drawer-settings">
          {activeView === 'library' && (
            <LibraryDrawerCards drawerView={libraryView} links={links} actions={actions} />
          )}
          {activeView === 'downloads' && (
            <DownloadsDrawerCard drawerView={downloadsView} actions={actions} />
          )}
          {activeView === 'acquire' && acquireSettings}
        </div>
        {libraryView.settingsBottomGifSrc && (
          <img 
            className="settings-bottom-bg" 
            src={libraryView.settingsBottomGifSrc} 
            alt="" 
            aria-hidden="true"
            onClick={actions.openCustomSettingsFromBackground}
          />
        )}
      </aside>
    </>
  )
}

function LibraryDrawerCards({
  drawerView,
  links,
  actions,
}: {
  drawerView: LibraryDrawerView
  links: LibraryDrawerLinks
  actions: LeftDrawerActions
}) {
  const backendIconOk = drawerView.backendStatusKnown && drawerView.backendAvailable
  const backendIconLabel = drawerView.backendScanning
    ? '正在搜索局域网服务地址'
    : drawerView.backendStatusKnown ? drawerView.backendStatusText : '搜索局域网服务地址'
  const backendIconClassName = [
    'accept-icon-lan',
    backendIconOk ? 'ok is-passive' : 'is-actionable',
    !drawerView.backendStatusKnown ? 'is-awaiting-scan' : '',
    drawerView.backendStatusKnown && !drawerView.backendAvailable ? 'is-error' : '',
    drawerView.backendScanning ? 'is-scanning' : '',
  ].filter(Boolean).join(' ')

  function RootSecretStatusIcon({ size = 16 }: { size?: number }) {
    return <CustomIcon name="key" size={size} />
  }

  return (
    <>
      <section className="drawer-card">
        <div className="drawer-card-header">
          <div className="drawer-card-title">
            <Settings size={17} />
            <strong>配置</strong>
          </div>
        </div>
        <div className="drawer-card-body">
          <label aria-label="api-url">
            <div className="accept-field accept-field-inline-clear">
              <StatusBadgeIcon
                Icon={drawerView.backendScanning ? LoaderCircle : Radar}
                ok={drawerView.backendAvailable}
                label={backendIconLabel}
                title={backendIconLabel}
                showBadge={drawerView.backendStatusKnown}
                disabled={drawerView.backendScanning || backendIconOk}
                onClick={() => void actions.discoverBackend()}
                className={backendIconClassName}
              />
              <InputHistoryMenu
                ref={drawerView.backendInputRef}
                value={drawerView.backendDraft}
                aria-label="api-url"
                inputMode="url"
                autoComplete="on"
                suggestions={drawerView.backendUrlHistory}
                onValueChange={actions.setBackendDraft}
                onFocus={actions.moveBackendCaretToEnd}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void actions.saveBackend()
                }}
              />
              <button className="accept-clear accept-clear-inline" onClick={actions.clearBackendDraft} disabled={!drawerView.backendDraft} aria-label="清空服务地址">
                <X size={16} />
              </button>
              <button className="accept-submit" onClick={() => void actions.saveBackend()} aria-label="保存并检测服务地址">
                <CornerDownLeft size={16} />
              </button>
            </div>
          </label>

          <label className={`secret-field ${drawerView.rootSecretHelpOpen ? 'help-open' : ''}`} aria-label="redviewer-root-secret">
            <div className="accept-field">
              <StatusBadgeIcon
                Icon={RootSecretStatusIcon}
                ok={drawerView.rootSecretConfigured}
                label={drawerView.rootSecretConfigured ? 'Root Secret 已配置' : 'Root Secret 未配置'}
                title={drawerView.rootSecretConfigured ? 'Root Secret 已配置' : 'Root Secret 未配置'}
              />
              <input
                value={drawerView.rootSecretDraft}
                type="password"
                autoComplete="current-password"
                placeholder="rv-backend-secret"
                onChange={(event) => actions.setRootSecretDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void actions.saveRootSecret()
                }}
              />
              <button
                type="button"
                className="accept-help"
                onClick={actions.toggleRootSecretHelp}
                aria-label="查看 rv-backend-secret 用途"
                aria-expanded={drawerView.rootSecretHelpOpen}
              >
                <CircleHelp size={16} />
              </button>
              <button className="accept-submit" onClick={() => void actions.saveRootSecret()} aria-label="保存 Root Secret">
                <CornerDownLeft size={16} />
              </button>
            </div>
            {drawerView.rootSecretHelpOpen && (
              <div className="secret-help-popover tail-top-right" role="note" aria-label="rv-backend-secret 用途">
                <strong>作用：cgs 交互凭证 与 管理操作锁</strong>
                <span>操作锁：卡片的 保存/删除 ; 切换同人志；路径配置等</span>
              </div>
            )}
          </label>

          <label aria-label="books_path">
            <div className="accept-field">
              <StatusBadgeIcon Icon={FolderOpen} ok={drawerView.pathConfigured} label={drawerView.pathStatusText} title={drawerView.pathStatusText} />
              <TreeSelect<FilesystemSelectValue, FilesystemNode>
                className="path-tree-select"
                value={drawerView.comicPathDraft ? { value: drawerView.comicPathDraft, label: drawerView.comicPathDraft } : undefined}
                aria-label="books_path"
                labelInValue
                treeData={drawerView.filesystemTree}
                treeNodeLabelProp="value"
                loadData={actions.loadFilesystemNode}
                classNames={{ popup: { root: 'path-tree-select-dropdown' } }}
                treeExpandedKeys={drawerView.filesystemExpandedKeys}
                onTreeExpand={actions.changeFilesystemExpandedKeys}
                onChange={(value) => {
                  void actions.handleBooksPathChange(value?.value || '')
                }}
                onOpenChange={(open) => {
                  if (!open) return
                  if (!drawerView.filesystemTree.length || drawerView.booksPathCurrent !== (drawerView.booksPathActive || '')) {
                    void actions.refreshFilesystem(drawerView.booksPathActive || undefined)
                  }
                }}
                showSearch
                treeNodeFilterProp="title"
                treeExpandAction="click"
                placeholder={drawerView.filesystemBusy ? '目录读取中' : '选择目录'}
                disabled={drawerView.pathBusy === 'save-path'}
                status={drawerView.pathConfigured ? undefined : 'warning'}
                styles={{
                  root: { color: 'var(--text)', WebkitTextFillColor: 'var(--text)' },
                  input: { color: 'var(--text)', WebkitTextFillColor: 'var(--text)' },
                  content: { color: 'var(--text)', WebkitTextFillColor: 'var(--text)' },
                  placeholder: { color: 'var(--text-placeholder)' },
                  popup: { root: { background: 'var(--surface-overlay)', color: 'var(--text)' } },
                }}
                popupMatchSelectWidth={false}
                listHeight={260}
                variant="borderless"
              />
              <button className="accept-submit" onClick={() => void actions.saveComicPath()} disabled={drawerView.pathBusy === 'save-path'} aria-label="保存书库路径">
                {drawerView.pathBusy === 'save-path' ? <LoaderCircle className="spin" size={16} /> : <CornerDownLeft size={16} />}
              </button>
            </div>
          </label>

          <div className="drawer-info-row">
            <span className="drawer-info-label">语言</span>
            <div className="drawer-language-placeholder" aria-label="language-placeholder">
              <Globe2 size={15} />
              <strong>{drawerView.currentLanguageLabel}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="drawer-card">
        <div className="drawer-card-header drawer-inline-meta-header">
          <div className="drawer-card-title">
            <CustomIcon name="updatePackage" size={17} />
            <strong>版本</strong>
          </div>
          <strong className="drawer-version-label">ver {drawerView.appVersion}</strong>
        </div>
        <div className="drawer-card-body">
          <div className="drawer-action-grid" aria-label="更新操作">
            <button type="button" className="drawer-action-card" onClick={() => void actions.openExternalLink(links.changelog, '更新日志')}>
              <CustomIcon name="changelog" size={18} />
              <span>更新日志</span>
            </button>
            <button type="button" className="drawer-action-card" onClick={() => void actions.openExternalLink(links.releases, '检查更新')}>
              <CustomIcon name="releaseCheck" size={18} />
              <span>检查更新</span>
            </button>
          </div>
        </div>
      </section>

      <section className="drawer-card">
        <div className="drawer-card-header drawer-inline-meta-header">
          <div className="drawer-card-title">
            <CustomIcon name="about" size={17} />
            <strong>关于</strong>
          </div>
          <span className="drawer-author">
            {drawerView.authorAvatarSrc ? (
              <img className="drawer-author-avatar" src={drawerView.authorAvatarSrc} alt={`${drawerView.appAuthor} GitHub avatar`} />
            ) : (
              <span className="drawer-author-avatar drawer-author-avatar-fallback" aria-hidden="true">
                {drawerView.appAuthor.charAt(0).toUpperCase()}
              </span>
            )}
            <strong>{drawerView.appAuthor}</strong>
          </span>
        </div>
        <div className="drawer-card-body">
          <div className="drawer-action-grid" aria-label="关于与反馈入口">
            <button type="button" className="drawer-action-card" onClick={() => void actions.openExternalLink(links.docs, '使用说明')}>
              <CustomIcon name="docs" size={18} />
              <span>使用说明</span>
            </button>
            <button type="button" className="drawer-action-card" onClick={() => void actions.openExternalLink(links.faq, '常见问题')}>
              <CustomIcon name="faq" size={18} />
              <span>常见问题</span>
            </button>
            <button type="button" className="drawer-action-card" onClick={() => void actions.openExternalLink(links.issues, '反馈入口')}>
              <CustomIcon name="feedback" size={18} />
              <span>反馈入口</span>
            </button>
          </div>
        </div>
      </section>
    </>
  )
}

function DownloadsDrawerCard({
  drawerView,
  actions,
}: {
  drawerView: DownloadsDrawerView
  actions: LeftDrawerActions
}) {
  return (
    <section className="drawer-card">
      <div className="drawer-card-header">
        <div className="drawer-card-title">
          <CustomIcon name="data" size={17} />
          <strong>存储 / 离线缓存管理</strong>
        </div>
      </div>
      <div className="drawer-card-body">
        <div className="drawer-info-row">
          <span className="drawer-info-label">缓存占用</span>
          <strong>{drawerView.cacheSummaryText}</strong>
        </div>
        <span className="drawer-link-note">{drawerView.cacheSummaryHint}</span>
        <div className="drawer-action-grid" aria-label="离线缓存操作">
          <button
            type="button"
            className="drawer-action-card"
            onClick={() => void actions.cleanupInvalidCache()}
            disabled={drawerView.storageBusy === 'cleanup-invalid-cache'}
          >
            {drawerView.storageBusy === 'cleanup-invalid-cache'
              ? <LoaderCircle className="spin" size={18} />
              : <CustomIcon name="cacheClean" size={18} />}
            <span>清理缓存</span>
          </button>
        </div>
      </div>
    </section>
  )
}
