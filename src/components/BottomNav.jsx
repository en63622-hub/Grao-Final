import React from 'react'

const ITEMS = [
  { key: 'dashboard', label: 'Início', icon: '⌂' },
  { key: 'statement', label: 'Extrato', icon: '≡' },
  { key: 'credit', label: 'Fatura', icon: '▤' },
  { key: 'chat', label: 'Chat', icon: '✎' },
  { key: 'debtors', label: 'Devedores', icon: '☺' },
  { key: 'reports', label: 'Relatórios', icon: '◔' }
]

export default function BottomNav({ current, onChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-moss-100 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto grid grid-cols-6">
        {ITEMS.map(item => (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              current === item.key ? 'text-moss-700' : 'text-slate2/70'
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
