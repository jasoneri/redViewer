import type { ToastTone } from './useMobileAppModel'
import type { SkinAssets } from './appMeta'

export const SKIN_TOAST_HEIGHT = 42
export const SKIN_TOAST_BORDER_WIDTH = 3
export const TOAST_ICON_RATIO = 1.6
export const TOAST_ICON_LEFT_OFFSET = -28
export const TOAST_TEXT_LEFT_DISTANCE = 30
export const TOAST_MIN_WIDTH = 140
export const TOAST_MAX_WIDTH_RATIO = 0.88
export const TOAST_RIGHT_PADDING = 20

let cachedCanvas: HTMLCanvasElement | null = null

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (typeof window === 'undefined') return null
  if (!cachedCanvas) {
    cachedCanvas = document.createElement('canvas')
  }
  return cachedCanvas.getContext('2d')
}

function measureTextWidthCanvas(text: string, fontSize: number, fontWeight: number): number {
  const ctx = getCanvasContext()
  if (!ctx) return estimateTextWidthFallback(text, fontSize)
  ctx.font = `${fontWeight} ${fontSize}px system-ui, -apple-system, sans-serif`
  return ctx.measureText(text).width
}

function estimateTextWidthFallback(text: string, fontSize: number): number {
  let width = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0x4e00 && code <= 0x9fff) {
      width += fontSize
    } else if (code >= 0x30 && code <= 0x39) {
      width += fontSize * 0.5
    } else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      width += fontSize * 0.55
    } else {
      width += fontSize * 0.4
    }
  }
  return width
}

export function measureToastWidth(text: string): number {
  const fontSize = 13
  const fontWeight = 800
  const textWidth = measureTextWidthCanvas(text, fontSize, fontWeight)
  const totalWidth = TOAST_TEXT_LEFT_DISTANCE + textWidth + TOAST_RIGHT_PADDING
  
  return totalWidth
}

export function toastStyleVars(text: string) {
  return {
    '--skin-toast-height': `${SKIN_TOAST_HEIGHT}px`,
    '--skin-toast-border-width': `${SKIN_TOAST_BORDER_WIDTH}px`,
    '--skin-toast-width': `${measureToastWidth(text)}px`,
    '--toast-text-left-distance': `${TOAST_TEXT_LEFT_DISTANCE}px`,
    '--toast-icon-ratio': TOAST_ICON_RATIO.toString(),
    '--toast-icon-left-offset': `${TOAST_ICON_LEFT_OFFSET}px`,
    maxWidth: '75vw',
  } as React.CSSProperties
}

export function getSkinToastIconSrc(tone: ToastTone, skinAssets: SkinAssets): string {
  if (tone === 'ok') return skinAssets.toastSuccessIconSrc
  if (tone === 'warn') return skinAssets.toastWarnIconSrc
  return skinAssets.toastErrIconSrc
}
