import React from 'react'

export default function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-paper rounded-t-3xl sm:rounded-xl2 shadow-card p-6 max-h-[88vh] overflow-y-auto animate-rise">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl text-ink">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-moss-100 text-moss-800 flex items-center justify-center">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
