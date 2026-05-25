import { useState, useCallback, useEffect } from 'react'
import { FiX, FiCheck, FiAlertCircle, FiInfo } from 'react-icons/fi'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

let addToastFn: ((type: ToastType, message: string, duration?: number) => void) | null = null

export function toast(type: ToastType, message: string, duration = 4000) {
  addToastFn?.(type, message, duration)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, type, message, duration }])
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => {
      addToastFn = null
    }
  }, [addToast])

  const icons: Record<ToastType, React.ReactNode> = {
    success: <FiCheck className="text-green-400" />,
    error: <FiAlertCircle className="text-red-400" />,
    info: <FiInfo className="text-blue-400" />,
    warning: <FiAlertCircle className="text-yellow-400" />
  }

  const borders: Record<ToastType, string> = {
    success: 'border-green-800',
    error: 'border-red-800',
    info: 'border-blue-800',
    warning: 'border-yellow-800'
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`bg-surface-900 border ${borders[t.type]} rounded-lg px-4 py-3 flex items-start gap-3 shadow-lg animate-slide-up`}
        >
          <span className="mt-0.5">{icons[t.type]}</span>
          <p className="text-sm text-gray-200 flex-1">{t.message}</p>
          <button
            onClick={() => removeToast(t.id)}
            className="text-gray-500 hover:text-gray-300 mt-0.5"
          >
            <FiX size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

