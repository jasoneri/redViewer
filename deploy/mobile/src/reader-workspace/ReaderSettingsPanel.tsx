import { Settings } from 'lucide-react'
import { CustomIcon } from '../icons/CustomIcon'
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
      <div className="reader-settings-panel-polygon-wrap" aria-hidden="true">
        <div className="reader-settings-panel-tail-fill" />
        <svg className="reader-settings-panel-polygon" fill="none" viewBox="0 0 16 9">
          <path className="reader-settings-panel-polygon-stroke" d="M0.75 8.5L8 1L15.25 8.5" />
        </svg>
      </div>
      <div className="reader-settings-header">
        <div className="reader-settings-heading">
          <Settings className="reader-settings-heading-icon" size={18} aria-hidden="true" />
          <strong>阅读设置</strong>
        </div>
        <div className="reader-settings-logo-slot" aria-hidden="true" />
      </div>

      <div className="reader-settings-action-grid" aria-label="阅读工具栏与模式">
        <button className={`reader-settings-action-card ${readerSettings.toolbarPosition === 'top' ? 'active' : ''}`} onClick={() => changeReaderToolbarPosition('top')} aria-pressed={readerSettings.toolbarPosition === 'top'}>
          <CustomIcon name="toolbarTop" size={20} />
          <span>置顶</span>
        </button>
        <button className={`reader-settings-action-card ${readerSettings.toolbarPosition === 'bottom' ? 'active' : ''}`} onClick={() => changeReaderToolbarPosition('bottom')} aria-pressed={readerSettings.toolbarPosition === 'bottom'}>
          <CustomIcon name="toolbarTop" className="reader-toolbar-icon-rotated" size={20} />
          <span>置底</span>
        </button>
        <button className={`reader-settings-action-card ${readerMode === 'scroll' ? 'active' : ''}`} onClick={() => changeReaderMode('scroll')} aria-pressed={readerMode === 'scroll'}>
          <CustomIcon name="arrowsVertical" size={20} />
          <span>滚动</span>
        </button>
        <button className={`reader-settings-action-card ${readerMode === 'page' ? 'active' : ''}`} onClick={() => changeReaderMode('page')} aria-pressed={readerMode === 'page'}>
          <CustomIcon name="arrowsHorizontal" size={20} />
          <span>翻页</span>
        </button>
      </div>

      <div className="reader-settings-toggle-row" aria-label="阅读辅助开关">
        <button id="reader-nav-toggle" className={`reader-settings-toggle reader-nav-toggle ${readerSettings.showCenterNextPrev ? 'active' : ''}`} onClick={() => changeReaderShowCenterNextPrev(!readerSettings.showCenterNextPrev)} aria-pressed={readerSettings.showCenterNextPrev}>
          <span>显示悬浮导航</span>
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
