import { Settings } from 'lucide-react'
import type { ReaderIntervalTimeBounds, ReaderMode, ReaderSettings, ReaderToolbarPosition } from './readerCore'

type ReaderSettingsPanelProps = {
  readerAutoScrolling: boolean
  readerIntervalTimeBounds: ReaderIntervalTimeBounds
  readerMode: ReaderMode
  readerPageFlipDurationBounds: ReaderIntervalTimeBounds
  readerSettings: ReaderSettings
  changeReaderMode: (mode: ReaderMode) => void
  changeReaderPageFlipDuration: (value: number) => void
  changeReaderScrollDragStepPercent: (value: number) => void
  changeReaderScrollIntervalPixel: (value: number) => void
  changeReaderScrollIntervalTime: (value: number) => void
  changeReaderShowCenterNextPrev: (value: boolean) => void
  changeReaderToolbarPosition: (position: ReaderToolbarPosition) => void
  toggleReaderAutoScroll: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatReaderIntervalTime(value: number, mode: ReaderMode): string {
  if (mode !== 'page') return `${value} ms`
  const seconds = value / 1000
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)} s`
}

function formatReaderPageFlipDuration(value: number): string {
  const seconds = value / 1000
  return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(2).replace(/0$/, '')} s`
}

function ArrowsVerticalIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3">
        <path d="M17 15l0 -11.5M7 9l0 11.5" />
        <path d="M17 3l-4 4M17 3l4 4M7 21l-4 -4M7 21l4 -4" />
      </g>
    </svg>
  )
}

function ArrowsHorizontalIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8">
        <path d="M15 7h-11.5M9 17h11.5" />
        <path d="M3 7l4 4M3 7l4 -4M21 17l-4 4M21 17l-4 -4" />
      </g>
    </svg>
  )
}

function ToolBarTopIcon({ size = 18, rotated = false }: { size?: number; rotated?: boolean }) {
  return (
    <svg className={rotated ? 'reader-toolbar-icon-rotated' : undefined} width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        transform="scale(2.66667 2.66667)"
        d="M20.2127 12.0828C30.508 11.6222 43.4993 11.9781 54.1167 11.9753L67.2316 11.9738C71.6873 11.9739 78.0788 11.448 81.7119 14.3274C84.0666 16.207 85.5763 18.9465 85.9077 21.9411C86.1251 23.8778 85.2709 25.8009 83.1372 25.9746C79.5152 26.2254 80.4027 20.554 77.924 19.0407C75.338 17.4619 70.3177 18.0499 67.2385 18.0554L50.4826 18.0818L31.6596 18.0307C27.6555 18.018 22.9857 17.8823 19.0609 18.2905C14.6848 20.9936 16.043 27.3418 15.9877 31.9981C23.5085 32.0086 82.5778 31.3822 85.0521 32.5196C85.8955 33.7903 86.022 36.2845 86.0267 37.7869L86.0343 61.6367C86.0285 67.9323 87.2445 76.146 82.6618 80.7578C78.3622 85.0848 71.0975 84.0614 65.4793 84.0598L48.875 84.0418L30.6198 84.0632C20.9937 84.0737 9.86098 85.2345 10.0013 71.3083C10.0465 66.8206 9.69777 62.2222 10.2802 57.7614C10.5054 56.0365 12.3384 55.5218 13.9678 55.9235C17.8945 57.9389 15.3071 67.9461 15.9926 71.7099C16.5242 74.6288 15.9242 74.2229 17.3152 76.6021C18.9951 77.5343 20.0446 77.9523 21.9996 77.9667C33.4181 78.0504 44.8692 78.0144 56.2859 78.0115L68.2086 78.009C71.7234 78.0119 79.1 78.9994 79.7399 74.0774C80.2412 70.2204 80.0411 65.7958 80.0384 61.8457C80.0001 53.9461 80.0103 46.0464 80.0689 38.1469C74.6906 37.9523 68.6802 38.0695 63.2432 38.0685L33.3456 38.0826C28.1518 38.0867 21.0915 38.2845 16.0528 37.98C16.0213 41.4607 16.6368 46.9447 15.0656 50.0411C14.1151 51.9144 10.4467 51.1517 10.2451 48.7474C9.72506 42.5449 10.1167 36.1999 9.99725 29.9703C9.80674 21.1501 9.77198 13.7076 20.2127 12.0828Z"
      />
      <path
        fill="currentColor"
        transform="scale(2.66667 2.66667)"
        d="M42.4496 22.0743C47.1099 21.906 71.6225 21.4109 74.4926 22.4973C75.0346 22.7025 75.4687 23.1518 75.7042 23.6763C76.0476 24.4409 76.0915 25.2159 75.7916 25.9997C75.394 27.0389 74.6963 27.5361 73.7093 27.9675C69.3415 28.1715 43.8062 28.6165 41.3094 27.447C40.7996 27.2082 40.4248 26.7062 40.2389 26.1861C39.9454 25.365 39.9618 24.3819 40.3537 23.5947C40.8007 22.6965 41.5402 22.3719 42.4496 22.0743Z"
      />
      <path fill="currentColor" transform="scale(2.66667 2.66667)" d="M22.6004 22.1057C24.1962 21.8955 25.6612 23.016 25.876 24.6112C26.0909 26.2063 24.9747 27.6746 23.3801 27.8942C21.779 28.1147 20.3033 26.9927 20.0875 25.3909C19.8717 23.7892 20.998 22.3167 22.6004 22.1057Z" />
      <path fill="currentColor" transform="scale(2.66667 2.66667)" d="M32.6257 22.1073C34.2196 21.9079 35.675 23.0341 35.8819 24.6271C36.0888 26.2201 34.9694 27.6808 33.3774 27.8951C31.7748 28.1109 30.3023 26.9824 30.094 25.3788C29.8858 23.7753 31.0211 22.3081 32.6257 22.1073Z" />
    </svg>
  )
}

export function ReaderSettingsPanel({
  readerAutoScrolling,
  readerIntervalTimeBounds,
  readerMode,
  readerPageFlipDurationBounds,
  readerSettings,
  changeReaderMode,
  changeReaderPageFlipDuration,
  changeReaderScrollDragStepPercent,
  changeReaderScrollIntervalPixel,
  changeReaderScrollIntervalTime,
  changeReaderShowCenterNextPrev,
  changeReaderToolbarPosition,
  toggleReaderAutoScroll,
}: ReaderSettingsPanelProps) {
  const readerIntervalTimeValue = clamp(readerSettings.scrollIntervalTime, readerIntervalTimeBounds.min, readerIntervalTimeBounds.max)
  const autoReaderLabel = readerMode === 'page'
    ? readerAutoScrolling ? '停止翻页' : '自动翻页'
    : readerAutoScrolling ? '停止下滑' : '自动下滑'
  const autoSettingsParametersLabel = readerMode === 'page' ? '自动翻页参数' : '自动滚动参数'

  return (
    <div className="reader-settings-panel" role="dialog" aria-label="阅读设置">
      <div className="reader-settings-header">
        <div className="reader-settings-heading">
          <Settings className="reader-settings-heading-icon" size={18} aria-hidden="true" />
          <strong>阅读设置</strong>
        </div>
        <div className="reader-settings-logo-slot" aria-hidden="true" />
      </div>

      <div className="reader-settings-action-grid" aria-label="阅读工具栏与模式">
        <button className={`reader-settings-action-card ${readerSettings.toolbarPosition === 'top' ? 'active' : ''}`} onClick={() => changeReaderToolbarPosition('top')} aria-pressed={readerSettings.toolbarPosition === 'top'}>
          <ToolBarTopIcon size={20} />
          <span>置顶</span>
        </button>
        <button className={`reader-settings-action-card ${readerSettings.toolbarPosition === 'bottom' ? 'active' : ''}`} onClick={() => changeReaderToolbarPosition('bottom')} aria-pressed={readerSettings.toolbarPosition === 'bottom'}>
          <ToolBarTopIcon size={20} rotated />
          <span>置底</span>
        </button>
        <button className={`reader-settings-action-card ${readerMode === 'scroll' ? 'active' : ''}`} onClick={() => changeReaderMode('scroll')} aria-pressed={readerMode === 'scroll'}>
          <ArrowsVerticalIcon size={20} />
          <span>滚动</span>
        </button>
        <button className={`reader-settings-action-card ${readerMode === 'page' ? 'active' : ''}`} onClick={() => changeReaderMode('page')} aria-pressed={readerMode === 'page'}>
          <ArrowsHorizontalIcon size={20} />
          <span>翻页</span>
        </button>
      </div>

      <div className="reader-settings-toggle-row" aria-label="阅读辅助开关">
        <button className={`reader-settings-toggle ${readerSettings.showCenterNextPrev ? 'active' : ''}`} onClick={() => changeReaderShowCenterNextPrev(!readerSettings.showCenterNextPrev)} aria-pressed={readerSettings.showCenterNextPrev}>
          <span>中置翻页</span>
        </button>
        <button className={`reader-settings-toggle ${readerAutoScrolling ? 'active' : ''}`} onClick={toggleReaderAutoScroll} aria-pressed={readerAutoScrolling}>
          <span>{autoReaderLabel}</span>
        </button>
      </div>

      <div className="reader-settings-sliders" aria-label={autoSettingsParametersLabel}>
        <label className="reader-settings-slider">
          <span className="reader-settings-slider-header">
            <span>阅读延迟</span>
            <strong>{formatReaderIntervalTime(readerIntervalTimeValue, readerMode)}</strong>
          </span>
          <input
            type="range"
            min={readerIntervalTimeBounds.min}
            max={readerIntervalTimeBounds.max}
            step={readerIntervalTimeBounds.step}
            value={readerIntervalTimeValue}
            aria-label="阅读延迟"
            onChange={(event) => changeReaderScrollIntervalTime(Number(event.target.value))}
          />
        </label>
        {readerMode === 'scroll' && (
          <label className="reader-settings-slider">
            <span className="reader-settings-slider-header">
              <span>滚动步长</span>
              <strong>{readerSettings.scrollIntervalPixel} px</strong>
            </span>
            <input
              type="range"
              min="1"
              max="40"
              value={readerSettings.scrollIntervalPixel}
              aria-label="滚动步长"
              onChange={(event) => changeReaderScrollIntervalPixel(Number(event.target.value))}
            />
          </label>
        )}
        {readerMode === 'page' && (
          <label className="reader-settings-slider">
            <span className="reader-settings-slider-header">
              <span>翻页动画</span>
              <strong>{formatReaderPageFlipDuration(readerSettings.pageFlipDurationMs)}</strong>
            </span>
            <input
              type="range"
              min={readerPageFlipDurationBounds.min}
              max={readerPageFlipDurationBounds.max}
              step={readerPageFlipDurationBounds.step}
              value={readerSettings.pageFlipDurationMs}
              aria-label="翻页动画时长"
              onChange={(event) => changeReaderPageFlipDuration(Number(event.target.value))}
            />
          </label>
        )}
        {readerMode === 'scroll' && (
          <label className="reader-settings-slider">
            <span className="reader-settings-slider-header">
              <span>悬浮球拖动翻页幅度</span>
              <strong>{readerSettings.scrollDragStepPercent}%</strong>
            </span>
            <input
              type="range"
              min="2"
              max="12"
              step="1"
              value={readerSettings.scrollDragStepPercent}
              aria-label="拖动幅度"
              onChange={(event) => changeReaderScrollDragStepPercent(Number(event.target.value))}
            />
          </label>
        )}
      </div>
    </div>
  )
}
