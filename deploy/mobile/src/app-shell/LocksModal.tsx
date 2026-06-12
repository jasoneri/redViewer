import { X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { buildUrl } from '../mobileStore'
import { rootSecretHeaders } from './useAppShellController'

type LocksState = {
  config_path: boolean
  book_handle: boolean
  switch_doujin: boolean
  force_rescan: boolean
}

type LocksModalProps = {
  open: boolean
  onClose: () => void
  onLocksUpdate: (locks: LocksState) => void
  backendUrl: string
}

type LocksPayload = Partial<LocksState> & { locks?: Partial<LocksState> }

const lockKeys = ['config_path', 'book_handle', 'switch_doujin', 'force_rescan'] as const

const defaultLocks: LocksState = {
  config_path: false,
  book_handle: false,
  switch_doujin: false,
  force_rescan: false,
}

const lockLabels: Record<keyof LocksState, string> = {
  config_path: '锁定路径配置',
  book_handle: '锁定书籍操作',
  switch_doujin: '锁定切换同人志',
  force_rescan: '锁定强制重载',
}

function normalizeLocksPayload(payload: LocksPayload): LocksState {
  const source: Partial<LocksState> = payload.locks ?? payload
  return lockKeys.reduce<LocksState>((next, key) => {
    next[key] = Boolean(source[key])
    return next
  }, { ...defaultLocks })
}

export function LocksModal({ open, onClose, onLocksUpdate, backendUrl }: LocksModalProps) {
  const [locks, setLocks] = useState<LocksState>(defaultLocks)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)

  const readOnlyMode = lockKeys.every((key) => locks[key])

  useEffect(() => {
    if (!open) return
    const loadLocks = async () => {
      setLoading(true)
      try {
        const headers = await rootSecretHeaders()
        const response = await fetch(buildUrl(backendUrl, '/root/locks'), { headers })
        if (response.ok) {
          const data = await response.json() as LocksPayload
          setLocks(normalizeLocksPayload(data))
        }
      } catch (error) {
        console.error('Failed to load locks:', error)
      } finally {
        setLoading(false)
      }
    }
    void loadLocks()
  }, [open, backendUrl])

  const toggleReadOnlyMode = async () => {
    const nextValue = !readOnlyMode
    const nextLocks: LocksState = {
      config_path: nextValue,
      book_handle: nextValue,
      switch_doujin: nextValue,
      force_rescan: nextValue,
    }
    await updateLocks(nextLocks)
  }

  const toggleSingleLock = async (key: keyof LocksState) => {
    await updateLocks({ [key]: !locks[key] })
  }

  const updateLocks = async (updates: Partial<LocksState>) => {
    setUpdating(true)
    try {
      const headers = await rootSecretHeaders()
      const response = await fetch(buildUrl(backendUrl, '/root/locks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(updates),
      })
      if (response.ok) {
        const data = await response.json() as LocksPayload
        const nextLocks = normalizeLocksPayload(data)
        setLocks(nextLocks)
        onLocksUpdate(nextLocks)
      }
    } catch (error) {
      console.error('Failed to update locks:', error)
    } finally {
      setUpdating(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="locks-modal" role="dialog" aria-modal="true" aria-labelledby="locks-modal-title">
        <div className="modal-header">
          <h2 id="locks-modal-title">管理操作锁</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <p className="modal-loading">加载中...</p>
          ) : (
            <>
              <div className="lock-item lock-item-primary">
                <div className="lock-label">
                  <strong>纯阅读模式</strong>
                  <span>一键开启所有锁</span>
                </div>
                <label className="lock-switch">
                  <input type="checkbox" checked={readOnlyMode} onChange={toggleReadOnlyMode} disabled={updating} />
                  <span className="lock-switch-slider" />
                </label>
              </div>
              <div className="lock-divider">
                <span>独立锁控制</span>
              </div>
              {lockKeys.map((key) => (
                <div key={key} className="lock-item">
                  <span className="lock-label">{lockLabels[key]}</span>
                  <label className="lock-switch">
                    <input type="checkbox" checked={locks[key]} onChange={() => void toggleSingleLock(key)} disabled={updating} />
                    <span className="lock-switch-slider" />
                  </label>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}
