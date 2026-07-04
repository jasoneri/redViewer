import { useState, useEffect, type PointerEvent } from 'react'

export function TouchDebugOverlay({ enabled }: { enabled: boolean }) {
  const [events, setEvents] = useState<Array<{ id: number; type: string; x: number; y: number; time: number }>>([])

  useEffect(() => {
    if (!enabled) return

    const handler = (e: globalThis.PointerEvent) => {
      setEvents(prev => [
        ...prev.slice(-9),
        { id: Date.now(), type: e.type, x: e.clientX, y: e.clientY, time: Date.now() }
      ])
    }

    window.addEventListener('pointerdown', handler)
    window.addEventListener('pointermove', handler)
    window.addEventListener('pointerup', handler)

    return () => {
      window.removeEventListener('pointerdown', handler)
      window.removeEventListener('pointermove', handler)
      window.removeEventListener('pointerup', handler)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      color: 'lime',
      padding: '8px',
      fontSize: '10px',
      fontFamily: 'monospace',
      maxWidth: '200px',
      pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>🔍 Touch Debug</div>
      {events.slice(-5).reverse().map(e => (
        <div key={e.id} style={{ opacity: 0.6 + (Date.now() - e.time) / 2000 }}>
          {e.type.replace('pointer', '')}: ({e.x.toFixed(0)}, {e.y.toFixed(0)})
        </div>
      ))}
    </div>
  )
}
