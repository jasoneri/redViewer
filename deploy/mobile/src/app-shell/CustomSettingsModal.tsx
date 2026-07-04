import { X } from 'lucide-react'
import { CustomIcon } from '../icons/CustomIcon'
import { NativeSelectMenu } from '../shared/NativeDropdownMenu'

type CustomSettingsModalProps = {
  open: boolean
  onClose: () => void
  selectedSkin: string
  availableSkins: string[]
  onSkinChange: (skinId: string) => void
  onRestoreSettings: () => void
}

export function CustomSettingsModal({
  open,
  onClose,
  selectedSkin,
  availableSkins,
  onSkinChange,
  onRestoreSettings,
}: CustomSettingsModalProps) {
  if (!open) return null

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="locks-modal" role="dialog" aria-modal="true" aria-labelledby="custom-settings-modal-title">
        <div className="modal-header">
          <h2 id="custom-settings-modal-title">自定义设置</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <label className="cgs-conf-field">
            <div className="cgs-conf-btn-group cgs-conf-prefixed-group">
              <button type="button" className="cgs-conf-text-btn" disabled>皮肤</button>
              <NativeSelectMenu
                id="skin-select"
                value={selectedSkin}
                onValueChange={onSkinChange}
                options={availableSkins.map((skinId) => ({ value: skinId, label: skinId }))}
                menuClassName="modal-dropdown-menu"
              />
            </div>
          </label>

          <div className="drawer-action-grid">
            <button type="button" className="drawer-action-card" onClick={onRestoreSettings}>
              <CustomIcon name="reset" size={18} />
              <span>还原设置</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
