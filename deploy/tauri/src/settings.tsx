import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Loader2, Save, Undo2 } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { Divider } from '@mui/material';

export type DesktopLocksState = {
  config_path: boolean;
  book_handle: boolean;
  switch_doujin: boolean;
  force_rescan: boolean;
};

export type DesktopLocksUpdate = Partial<DesktopLocksState>;

export type DesktopAdminState = {
  has_secret: boolean;
  locks: DesktopLocksState;
};

export type LockKey = keyof DesktopLocksState;
export type SecretSavePhase = 'idle' | 'loading' | 'success';

const LOCK_ROWS: Array<{ key: LockKey; label: string }> = [
  { key: 'config_path', label: '锁定路径配置' },
  { key: 'book_handle', label: '锁定书籍操作' },
  { key: 'switch_doujin', label: '锁定切换同人志' },
  { key: 'force_rescan', label: '锁定强制重载' },
];

const EMPTY_LOCKS: DesktopLocksState = {
  config_path: false,
  book_handle: false,
  switch_doujin: false,
  force_rescan: false,
};

type SettingsViewProps = {
  state: DesktopAdminState | null;
  busy: string | null;
  secretSavePhase: SecretSavePhase;
  onBack: () => void;
  onSecretEdit: () => void;
  onSaveSecret: (secret: string) => Promise<boolean>;
  onToggleLock: (key: LockKey, value: boolean) => Promise<void>;
  onToggleReadOnly: (value: boolean) => Promise<void>;
};

function RockerSwitch({
  id,
  checked,
  disabled,
  label,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="rocker rocker-small"
      htmlFor={id}
      aria-label={label}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      <span className="switch-left">YES</span>
      <span className="switch-right">NO</span>
    </label>
  );
}

export default function SettingsView({
  state,
  busy,
  secretSavePhase,
  onBack,
  onSecretEdit,
  onSaveSecret,
  onToggleLock,
  onToggleReadOnly,
}: SettingsViewProps) {
  const [secret, setSecret] = useState('');
  const locks = state?.locks ?? EMPTY_LOCKS;
  const readOnlyMode = useMemo(
    () => LOCK_ROWS.every((row) => locks[row.key]),
    [locks],
  );
  const controlsDisabled = busy !== null;

  const handleSecretSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await onSaveSecret(secret);
    if (saved) setSecret('');
  };

  return (
    <section className="settings-view" aria-label="Secret 与锁控制">
      <Tabs.Root defaultValue="secret-lock" className="tabs-root">
        <header className="nav-headers">
          <Tabs.List className="tabs-list" aria-label="设置导航">
            <Tabs.Trigger className="tabs-trigger" value="secret-lock">
              Secret & Lock
            </Tabs.Trigger>
          </Tabs.List>
          <button
            type="button"
            className="transparentButton-icon-only"
            onClick={onBack}
            aria-label="返回主界面"
          >
            <Undo2 size={18} aria-hidden="true" />
          </button>
        </header>
        
        <Tabs.Content value="secret-lock" className="tabs-content">
          <div className="settings-content">
            <form className="secret-panel" onSubmit={handleSecretSubmit}>
              <h2>Secret</h2>
              <div className="secret-input-group">
                <input
                  value={secret}
                  onChange={(event) => {
                    setSecret(event.currentTarget.value);
                    onSecretEdit();
                  }}
                  placeholder="New Secret"
                  aria-label="New Secret"
                  disabled={busy === 'secret'}
                  type="password"
                  required
                />
                <button
                  type="submit"
                  className="save-icon-only"
                  data-phase={secretSavePhase}
                  disabled={busy === 'secret'}
                  aria-label={secretSavePhase === 'loading' ? '正在保存 secret' : secretSavePhase === 'success' ? 'secret 已保存' : '保存新 secret'}
                >
                  <Save className="save-feedback-icon save-origin-icon" size={17} aria-hidden="true" />
                  <Loader2 className="save-feedback-icon save-loader-icon" size={17} aria-hidden="true" />
                  <Check className="save-feedback-icon save-check-icon" size={18} aria-hidden="true" />
                </button>
              </div>
            </form>

            <div className="lock-panel" aria-label="锁控制">
              <div className="lock-row read-only-row">
                <span>纯阅读模式</span>
                <RockerSwitch
                  id="desktop-read-only-mode"
                  label="纯阅读模式"
                  checked={readOnlyMode}
                  disabled={controlsDisabled}
                  onChange={onToggleReadOnly}
                />
              </div>
              <Divider 
                className="lock-divider" 
                textAlign="left"
                sx={{
                  marginBlock: '10px 9px',
                  '&::before, &::after': {
                    borderColor: 'rgba(255, 255, 255, 0.8)',
                  },
                  '.MuiDivider-wrapper': {
                    paddingLeft: 0,
                    paddingRight: '12px',
                    fontFamily: '"ZCOOL KuaiLe", sans-serif',
                    fontSize: '14px',
                    color: 'white',
                    textShadow: '0 2px 7px rgba(0, 0, 0, 0.45)',
                  }
                }}
              >
                单独锁
              </Divider>
              <div className="lock-list">
                {LOCK_ROWS.map((row) => (
                  <div className="lock-row" key={row.key}>
                    <span>{row.label}</span>
                    <RockerSwitch
                      id={`desktop-lock-${row.key}`}
                      label={row.label}
                      checked={locks[row.key]}
                      disabled={controlsDisabled}
                      onChange={(checked) => onToggleLock(row.key, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}
