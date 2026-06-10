import { useEffect, useRef } from 'react'
import type { ReaderFit, ReaderPageFlipState } from './readerCore'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

type PageDrawRect = {
  x: number
  y: number
  width: number
  height: number
  right: number
  bottom: number
}

function pageImageDrawRect(canvasWidth: number, canvasHeight: number, image: HTMLImageElement, fit: ReaderFit): PageDrawRect {
  const imageWidth = image.naturalWidth || image.width || 1
  const imageHeight = image.naturalHeight || image.height || 1
  const scale = fit === 'width' ? canvasWidth / imageWidth : Math.min(1, canvasWidth / imageWidth, canvasHeight / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  const x = (canvasWidth - width) / 2
  const y = (canvasHeight - height) / 2
  return { x, y, width, height, right: x + width, bottom: y + height }
}

function canDrawPageImage(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
}

function pageElementDrawRect(canvas: HTMLCanvasElement, image: HTMLImageElement, fallback: PageDrawRect): PageDrawRect {
  const canvasRect = canvas.getBoundingClientRect()
  const imageRect = image.getBoundingClientRect()
  if (imageRect.width <= 0 || imageRect.height <= 0) return fallback
  const x = imageRect.left - canvasRect.left
  const y = imageRect.top - canvasRect.top
  return { x, y, width: imageRect.width, height: imageRect.height, right: x + imageRect.width, bottom: y + imageRect.height }
}

function preparePageTurnCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): { width: number; height: number } {
  const rect = canvas.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const ratio = window.devicePixelRatio || 1
  const pixelWidth = Math.round(width * ratio)
  const pixelHeight = Math.round(height * ratio)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)
  return { width, height }
}

function drawPageTurnShadow(context: CanvasRenderingContext2D, page: PageDrawRect, direction: ReaderPageFlipState['direction'], foldX: number, progress: number) {
  const shadowStrength = Math.sin(Math.PI * progress)
  if (shadowStrength <= 0.01) return
  const shadowWidth = clamp(page.width * (0.16 + 0.12 * (1 - progress)), 28, 120)
  context.save()
  context.beginPath()
  context.rect(page.x, page.y, page.width, page.height)
  context.clip()
  if (direction === 'next') {
    const underShadow = context.createLinearGradient(foldX, 0, foldX + shadowWidth, 0)
    underShadow.addColorStop(0, `rgba(0,0,0,${0.34 * shadowStrength})`)
    underShadow.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = underShadow
    context.fillRect(foldX, page.y, shadowWidth, page.height)
  } else {
    const underShadow = context.createLinearGradient(foldX - shadowWidth, 0, foldX, 0)
    underShadow.addColorStop(0, 'rgba(0,0,0,0)')
    underShadow.addColorStop(1, `rgba(0,0,0,${0.34 * shadowStrength})`)
    context.fillStyle = underShadow
    context.fillRect(foldX - shadowWidth, page.y, shadowWidth, page.height)
  }
  context.restore()
}

function drawPageTurnFold(context: CanvasRenderingContext2D, page: PageDrawRect, direction: ReaderPageFlipState['direction'], foldX: number, progress: number) {
  const foldStrength = Math.sin(Math.PI * progress)
  const bandWidth = clamp(page.width * 0.06, 16, 54)
  context.save()
  context.beginPath()
  context.rect(page.x, page.y, page.width, page.height)
  context.clip()
  if (direction === 'next') {
    const band = context.createLinearGradient(foldX - bandWidth, 0, foldX, 0)
    band.addColorStop(0, `rgba(0,0,0,${0.26 * foldStrength})`)
    band.addColorStop(0.64, `rgba(255,255,255,${0.10 * foldStrength})`)
    band.addColorStop(1, `rgba(255,255,255,${0.30 * foldStrength})`)
    context.fillStyle = band
    context.fillRect(foldX - bandWidth, page.y, bandWidth, page.height)
  } else {
    const band = context.createLinearGradient(foldX, 0, foldX + bandWidth, 0)
    band.addColorStop(0, `rgba(255,255,255,${0.30 * foldStrength})`)
    band.addColorStop(0.36, `rgba(255,255,255,${0.10 * foldStrength})`)
    band.addColorStop(1, `rgba(0,0,0,${0.26 * foldStrength})`)
    context.fillStyle = band
    context.fillRect(foldX, page.y, bandWidth, page.height)
  }
  context.restore()
}

function easeInOutCubic(progress: number): number {
  const safe = clamp(progress, 0, 1)
  return safe < 0.5 ? 4 * safe * safe * safe : 1 - Math.pow(-2 * safe + 2, 3) / 2
}

function drawPageTurnFrame(context: CanvasRenderingContext2D, image: HTMLImageElement, page: PageDrawRect, direction: ReaderPageFlipState['direction'], progress: number) {
  const eased = easeInOutCubic(progress)
  const foldX = direction === 'next'
    ? page.right - page.width * eased
    : page.x + page.width * eased

  drawPageTurnShadow(context, page, direction, foldX, eased)
  context.save()
  context.beginPath()
  if (direction === 'next') {
    context.moveTo(page.x, page.y)
    context.lineTo(foldX, page.y)
    context.lineTo(foldX, page.bottom)
    context.lineTo(page.x, page.bottom)
  } else {
    context.moveTo(foldX, page.y)
    context.lineTo(page.right, page.y)
    context.lineTo(page.right, page.bottom)
    context.lineTo(foldX, page.bottom)
  }
  context.closePath()
  context.clip()
  context.drawImage(image, page.x, page.y, page.width, page.height)
  context.restore()
  drawPageTurnFold(context, page, direction, foldX, eased)
}

export function ReaderPageTurnCanvas({ onFirstFrame, pageTurn, readerFit }: { onFirstFrame: (key: number) => void; pageTurn: ReaderPageFlipState; readerFit: ReaderFit }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    let cancelled = false
    let animationFrame = 0
    let firstFrameDrawn = false
    let startedAt = 0
    const draw = (timestamp: number) => {
      if (cancelled) return
      const sourceImage = canvas.parentElement?.querySelector<HTMLImageElement>('.reader-page-image:not(.reader-page-turn-bottom)')
      const bottomImage = canvas.parentElement?.querySelector<HTMLImageElement>('.reader-page-turn-bottom')
      if (!sourceImage || !bottomImage || !canDrawPageImage(sourceImage) || !canDrawPageImage(bottomImage)) {
        animationFrame = window.requestAnimationFrame(draw)
        return
      }
      if (!startedAt) startedAt = timestamp
      const { width, height } = preparePageTurnCanvas(canvas, context)
      const progress = clamp((timestamp - startedAt) / Math.max(pageTurn.durationMs, 1), 0, 1)
      const fallbackPage = pageImageDrawRect(width, height, sourceImage, readerFit)
      const turningPage = pageElementDrawRect(canvas, sourceImage, fallbackPage)
      drawPageTurnFrame(context, sourceImage, turningPage, pageTurn.direction, progress)
      if (!firstFrameDrawn) {
        firstFrameDrawn = true
        onFirstFrame(pageTurn.key)
      }
      if (progress < 1) animationFrame = window.requestAnimationFrame(draw)
    }

    const start = () => {
      if (cancelled || animationFrame) return
      animationFrame = window.requestAnimationFrame(draw)
    }

    start()

    return () => {
      cancelled = true
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
    }
  }, [onFirstFrame, pageTurn.direction, pageTurn.durationMs, pageTurn.key, readerFit])

  return <canvas ref={canvasRef} className={`reader-page-turn-canvas reader-page-turn-${pageTurn.direction}`} aria-hidden="true" />
}
