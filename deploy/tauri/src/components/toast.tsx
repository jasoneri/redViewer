import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import './toast.css'

interface ToastPayload {
  message: string
}

function Toast() {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const unlisten = listen<ToastPayload>('toast-show', (event) => {
      setMessage(event.payload.message)
      setVisible(true)

      // Hide after 2s (animation handled in CSS)
      setTimeout(() => setVisible(false), 2000)
    })

    return () => { unlisten.then(f => f()) }
  }, [])

  return (
    <div className={`toast ${visible ? 'visible' : ''}`}>
      <span className="toast-message">{message}</span>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Toast /></StrictMode>,
)
