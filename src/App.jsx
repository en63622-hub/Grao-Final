import React, { useState } from 'react'
import { useAuth } from './context/AuthContext'
import { FinanceProvider, useFinance } from './context/FinanceContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CreditCard from './pages/CreditCard'
import Chat from './pages/Chat'
import Debtors from './pages/Debtors'
import Reports from './pages/Reports'
import Statement from './pages/Statement'
import BottomNav from './components/BottomNav'

function AppShell() {
  const [page, setPage] = useState('dashboard')
  const { loading } = useFinance()
  const { signOut, user } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-moss-700 font-display text-lg animate-pulse">Carregando seus dados…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper pb-24">
      <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-moss-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-moss-700 text-paper flex items-center justify-center text-sm">🌾</div>
          <span className="font-display text-lg text-ink">Grão</span>
        </div>
        <button onClick={signOut} className="text-xs text-slate2 font-medium">{user?.email?.split('@')[0]} · sair</button>
      </header>

      <main className="max-w-md mx-auto px-4 pt-4">
        {page === 'dashboard' && <Dashboard />}
        {page === 'statement' && <Statement />}
        {page === 'credit' && <CreditCard />}
        {page === 'chat' && <Chat />}
        {page === 'debtors' && <Debtors />}
        {page === 'reports' && <Reports />}
      </main>

      <BottomNav current={page} onChange={setPage} />
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user) return <Login />

  return (
    <FinanceProvider>
      <AppShell />
    </FinanceProvider>
  )
}
