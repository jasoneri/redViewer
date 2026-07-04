export type ReaderMode = 'page' | 'scroll'
export type ReaderFit = 'contain' | 'width'
export type ReaderToolbarPosition = 'top' | 'bottom'
export type ReaderIntervalTimeBounds = {
  min: number
  max: number
  step: number
  defaultValue: number
}
export type ReaderItem = {
  id: string
  book: string
  ep: string
  title: string
  page_count: number
  source: 'cache' | 'remote'
  meta?: {
    source?: string | null
    btype?: string | null
  }
}
export type ReaderProgress = {
  page_index: number
  scroll_top: number
  reading_mode: ReaderMode
}
export type ReaderSettings = {
  readingMode: ReaderMode
  showCenterNextPrev: boolean
  scrollIntervalTime: number
  scrollIntervalPixel: number
  scrollDragStepPercent: number
  pageFlipDurationMs: number
  toolbarPosition: ReaderToolbarPosition
}
export type ReaderFloatingControlPosition = {
  x: number
  /** Distance from the reader bottom edge in pixels. */
  y: number
}
export type ReaderPageFlipDirection = 'next' | 'prev'
export type ReaderPageFlipState = {
  fromIndex: number
  toIndex: number
  fromSrc: string
  toSrc: string
  direction: ReaderPageFlipDirection
  durationMs: number
  key: number
}

export const SCROLL_PROGRESS_DEBOUNCE_MS = 600
export const PAGE_SWIPE_THRESHOLD = 50
export const READER_SETTINGS_KEY = 'rv_mobile_reader_settings'

const READER_CHROME_THRESHOLD = 0.15
const READER_SCROLL_INTERVAL_TIME_MIN = 1
const READER_SCROLL_INTERVAL_TIME_MAX = 400
const READER_SCROLL_INTERVAL_TIME_STEP = 1
const READER_SCROLL_INTERVAL_TIME_DEFAULT = 15
const READER_PAGE_INTERVAL_TIME_MIN = 1000
const READER_PAGE_INTERVAL_TIME_MAX = 30000
const READER_PAGE_INTERVAL_TIME_STEP = 500
const READER_PAGE_INTERVAL_TIME_DEFAULT = 3000
const READER_PAGE_FLIP_DURATION_MIN = 350
const READER_PAGE_FLIP_DURATION_MAX = 1800
const READER_PAGE_FLIP_DURATION_STEP = 50
const READER_PAGE_FLIP_DURATION_DEFAULT = 900
const READER_FLOATING_CONTROL_POSITION_KEY = 'rv_mobile_reader_floating_control_position'
const READER_FLOATING_CONTROL_EDGE_GAP = 8
const READER_FLOATING_CONTROL_DEFAULT_LEFT_RATIO = 0.12
const READER_FLOATING_CONTROL_DEFAULT_BOTTOM_RATIO = 0.16
const READER_FLOATING_CONTROL_WIDTH = 75
const READER_FLOATING_CONTROL_HEIGHT = 25
const READER_FLOATING_CONTROL_WIDTH_PROPERTY = '--reader-floating-control-width'
const READER_FLOATING_CONTROL_HEIGHT_PROPERTY = '--reader-floating-control-height'
const READER_SCROLL_DRAG_STEP_PERCENT_MIN = 2
const READER_SCROLL_DRAG_STEP_PERCENT_MAX = 12
const READER_SCROLL_DRAG_STEP_PERCENT_DEFAULT = 8
const READER_TOOLBAR_POSITION_DEFAULT: ReaderToolbarPosition = 'top'

export const READER_PAGE_FLIP_DURATION_BOUNDS: ReaderIntervalTimeBounds = {
  min: READER_PAGE_FLIP_DURATION_MIN,
  max: READER_PAGE_FLIP_DURATION_MAX,
  step: READER_PAGE_FLIP_DURATION_STEP,
  defaultValue: READER_PAGE_FLIP_DURATION_DEFAULT,
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  readingMode: 'scroll',
  showCenterNextPrev: true,
  scrollIntervalTime: READER_SCROLL_INTERVAL_TIME_DEFAULT,
  scrollIntervalPixel: 1,
  scrollDragStepPercent: READER_SCROLL_DRAG_STEP_PERCENT_DEFAULT,
  pageFlipDurationMs: READER_PAGE_FLIP_DURATION_DEFAULT,
  toolbarPosition: READER_TOOLBAR_POSITION_DEFAULT,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function readerIntervalTimeBoundsForMode(mode: ReaderMode): ReaderIntervalTimeBounds {
  if (mode === 'page') {
    return {
      min: READER_PAGE_INTERVAL_TIME_MIN,
      max: READER_PAGE_INTERVAL_TIME_MAX,
      step: READER_PAGE_INTERVAL_TIME_STEP,
      defaultValue: READER_PAGE_INTERVAL_TIME_DEFAULT,
    }
  }
  return {
    min: READER_SCROLL_INTERVAL_TIME_MIN,
    max: READER_SCROLL_INTERVAL_TIME_MAX,
    step: READER_SCROLL_INTERVAL_TIME_STEP,
    defaultValue: READER_SCROLL_INTERVAL_TIME_DEFAULT,
  }
}

export function normalizeReaderIntervalTime(value: unknown, mode: ReaderMode): number {
  const bounds = readerIntervalTimeBoundsForMode(mode)
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return bounds.defaultValue
  const steppedValue = Math.round(numericValue / bounds.step) * bounds.step
  if (steppedValue < bounds.min || steppedValue > bounds.max) return bounds.defaultValue
  return clamp(steppedValue, bounds.min, bounds.max)
}

export function normalizeReaderPageFlipDuration(value: unknown): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return READER_PAGE_FLIP_DURATION_DEFAULT
  const steppedValue = Math.round(numericValue / READER_PAGE_FLIP_DURATION_STEP) * READER_PAGE_FLIP_DURATION_STEP
  return clamp(steppedValue, READER_PAGE_FLIP_DURATION_MIN, READER_PAGE_FLIP_DURATION_MAX)
}

export function normalizeReaderScrollDragStepPercent(value: unknown): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return READER_SCROLL_DRAG_STEP_PERCENT_DEFAULT
  return clamp(Math.round(numericValue), READER_SCROLL_DRAG_STEP_PERCENT_MIN, READER_SCROLL_DRAG_STEP_PERCENT_MAX)
}

export function readerChromeShouldShow(scrollTop: number, maxScrollTop: number, pageCount: number): boolean {
  if (pageCount <= 1 || maxScrollTop <= 0) return true
  const threshold = maxScrollTop * READER_CHROME_THRESHOLD
  return scrollTop <= threshold || scrollTop >= maxScrollTop - threshold
}

export function readerChromeShouldShowPage(pageIndex: number, pageCount: number): boolean {
  if (pageCount <= 1) return true
  const ratio = pageIndex / Math.max(pageCount - 1, 1)
  return ratio <= READER_CHROME_THRESHOLD || ratio >= 1 - READER_CHROME_THRESHOLD
}

export function loadReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY)
    if (!raw) return DEFAULT_READER_SETTINGS
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>
    const readingMode: ReaderMode = parsed.readingMode === 'page' ? 'page' : 'scroll'
    return {
      readingMode,
      showCenterNextPrev: typeof parsed.showCenterNextPrev === 'boolean' ? parsed.showCenterNextPrev : DEFAULT_READER_SETTINGS.showCenterNextPrev,
      scrollIntervalTime: normalizeReaderIntervalTime(parsed.scrollIntervalTime, readingMode),
      scrollIntervalPixel: Number(parsed.scrollIntervalPixel) || DEFAULT_READER_SETTINGS.scrollIntervalPixel,
      scrollDragStepPercent: normalizeReaderScrollDragStepPercent(parsed.scrollDragStepPercent),
      pageFlipDurationMs: normalizeReaderPageFlipDuration(parsed.pageFlipDurationMs),
      toolbarPosition: parsed.toolbarPosition === 'bottom' ? 'bottom' : READER_TOOLBAR_POSITION_DEFAULT,
    }
  } catch {
    return DEFAULT_READER_SETTINGS
  }
}

function defaultReaderFloatingControlPosition(): ReaderFloatingControlPosition {
  if (typeof window === 'undefined') return { x: READER_FLOATING_CONTROL_EDGE_GAP, y: READER_FLOATING_CONTROL_EDGE_GAP }
  const container = readerFloatingControlContainerSize()
  return {
    x: Math.max(READER_FLOATING_CONTROL_EDGE_GAP, container.width * READER_FLOATING_CONTROL_DEFAULT_LEFT_RATIO),
    y: Math.max(READER_FLOATING_CONTROL_EDGE_GAP, container.height * READER_FLOATING_CONTROL_DEFAULT_BOTTOM_RATIO),
  }
}

function readerFloatingControlContainerSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  const reader = document.querySelector<HTMLElement>('.reader')
  return {
    width: reader?.clientWidth || window.innerWidth,
    height: reader?.clientHeight || window.innerHeight,
  }
}

function readerFloatingControlCssPixelValue(propertyName: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  // RVLAY001: JS clamp/default geometry follows the CSS variables that size the DOM.
  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(propertyName)
  const value = Number.parseFloat(rawValue)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function readerFloatingControlWidth(): number {
  return readerFloatingControlCssPixelValue(READER_FLOATING_CONTROL_WIDTH_PROPERTY, READER_FLOATING_CONTROL_WIDTH)
}

function readerFloatingControlHeight(): number {
  return readerFloatingControlCssPixelValue(READER_FLOATING_CONTROL_HEIGHT_PROPERTY, READER_FLOATING_CONTROL_HEIGHT)
}

export function clampReaderFloatingControlPosition(position: ReaderFloatingControlPosition): ReaderFloatingControlPosition {
  if (typeof window === 'undefined') return position
  const container = readerFloatingControlContainerSize()
  const maxX = Math.max(
    READER_FLOATING_CONTROL_EDGE_GAP,
    container.width - readerFloatingControlWidth() - READER_FLOATING_CONTROL_EDGE_GAP,
  )
  const maxY = Math.max(
    READER_FLOATING_CONTROL_EDGE_GAP,
    container.height - readerFloatingControlHeight() - READER_FLOATING_CONTROL_EDGE_GAP,
  )
  return {
    x: clamp(Math.round(position.x), READER_FLOATING_CONTROL_EDGE_GAP, maxX),
    y: clamp(Math.round(position.y), READER_FLOATING_CONTROL_EDGE_GAP, maxY),
  }
}

export function loadReaderFloatingControlPosition(): ReaderFloatingControlPosition {
  try {
    const raw = localStorage.getItem(READER_FLOATING_CONTROL_POSITION_KEY)
    if (!raw) return defaultReaderFloatingControlPosition()
    const parsed = JSON.parse(raw) as Partial<ReaderFloatingControlPosition>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return defaultReaderFloatingControlPosition()
    const container = readerFloatingControlContainerSize()
    if (parsed.x > container.width * 0.5 && parsed.y > container.height * 0.7) return defaultReaderFloatingControlPosition()
    return clampReaderFloatingControlPosition({ x: parsed.x, y: parsed.y })
  } catch {
    return defaultReaderFloatingControlPosition()
  }
}

export function saveReaderFloatingControlPosition(position: ReaderFloatingControlPosition): ReaderFloatingControlPosition {
  const next = clampReaderFloatingControlPosition(position)
  localStorage.setItem(READER_FLOATING_CONTROL_POSITION_KEY, JSON.stringify(next))
  return next
}
