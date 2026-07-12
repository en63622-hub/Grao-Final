import React, { useMemo, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { formatCurrency, monthLabel, addMonths, firstOfMonth, monthKey } from '../lib/dateUtils'
import Modal from '../components/Modal'
import AddBalanceModal from '../components/AddBalanceModal'

function BalanceCard({ label, value, accent, sub }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-slate2 uppercase tracking-wide">{label}</p>
      <p className={`font-display text-2xl mt-1 ${accent || 'text-ink'}`}>{formatCurrency(value)}</p>
      {sub && <p className="text-xs text-slate2 mt-0.5">{sub}</p>}
    </div>
  )
}

function DepositModal({ open, onClose }) {
  const { transferDinheiroToDebito, balances } = useFinance()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      await transferDinheiroToDebito(amount.replace(',', '.'))
      setAmount(''); onClose()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Depositar em Débito">
      <p className="text-sm text-slate2 mb-4">Simula um depósito bancário: o valor sai do seu Dinheiro e entra no Débito.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Valor a depositar (disponível: {formatCurrency(balances.dinheiro)})</label>
          <input required inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" />
        </div>
        {error && <p className="text-rose text-sm">{error}</p>}
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Depositando…' : 'Confirmar depósito'}</button>
      </form>
    </Modal>
  )
}

export default function Dashboard() {
  const { balances, saldoTotal, creditLimitAvailable, committedFuture, transactions } = useFinance()
  const [addOpen, setAddOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [summaryCursor, setSummaryCursor] = useState(firstOfMonth(new Date())) // navegação do resumo mensal

  // Resumo do mês selecionado (por padrão, o mês atual). Quando o mês
  // navegado é o mês corrente, soma só até hoje; quando é um mês passado
  // (inclusive um mês já fechado), soma o mês inteiro — assim o total
  // acumulado de um mês fechado continua visível bastando navegar até ele.
  //
  // Só entram no resumo transações com payment_method 'dinheiro' ou 'debito',
  // igual ao saldoTotal (Débito + Dinheiro) — limite de crédito nunca entra aqui.
  const monthSummary = useMemo(() => {
    const start = firstOfMonth(summaryCursor)
    const end = addMonths(start, 1)
    const now = new Date()
    const isCurrentMonth = monthKey(start) === monthKey(now)
    const upperBound = isCurrentMonth ? now : end

    let entradas = 0
    let saidas = 0
    for (const t of transactions) {
      if (t.canceled) continue
      if (t.payment_method !== 'dinheiro' && t.payment_method !== 'debito') continue
      const d = new Date(t.occurred_at)
      if (d >= start && d < upperBound) {
        if (t.kind === 'entrada') entradas += Number(t.amount)
        else if (t.kind === 'gasto') saidas += Number(t.amount)
      }
    }
    return { entradas, saidas, saldo: entradas - saidas, isCurrentMonth }
  }, [transactions, summaryCursor])

  return (
    <div className="space-y-5 animate-rise">
      <div className="card p-5 bg-moss-700 text-paper">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss-200">Saldo total (Débito + Dinheiro)</p>
        <p className="font-display text-4xl mt-1">{formatCurrency(saldoTotal)}</p>
        <p className="text-xs text-moss-200 mt-1">O limite de crédito não entra nessa soma.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BalanceCard label="Débito" value={balances.debito} />
        <BalanceCard label="Dinheiro" value={balances.dinheiro} />
        <BalanceCard label="Cartão VA" value={balances.va} accent="text-gold" />
        <BalanceCard label="Limite Crédito" value={creditLimitAvailable} accent="text-clay" sub={`Total: ${formatCurrency(balances.credit_limit_total)}`} />
      </div>

      {committedFuture > 0 && (
        <div className="card p-4 bg-clay/10 border-clay/30">
          <p className="text-sm font-semibold text-clay">Renda comprometida no futuro</p>
          <p className="text-lg font-display text-ink mt-0.5">{formatCurrency(committedFuture)}</p>
          <p className="text-xs text-slate2 mt-0.5">Total ainda travado em parcelas de meses futuros.</p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => setAddOpen(true)} className="btn-primary flex-1">+ Adicionar saldo</button>
        <button onClick={() => setDepositOpen(true)} className="btn-secondary flex-1">Depositar</button>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setSummaryCursor(addMonths(summaryCursor, -1))} className="w-8 h-8 rounded-full bg-moss-100 text-moss-800 flex items-center justify-center">‹</button>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate2">Movimentações · {monthLabel(summaryCursor)}</p>
            <p className="text-[11px] text-slate2">{monthSummary.isCurrentMonth ? 'Até hoje' : 'Mês fechado'}</p>
          </div>
          <button onClick={() => setSummaryCursor(addMonths(summaryCursor, 1))} className="w-8 h-8 rounded-full bg-moss-100 text-moss-800 flex items-center justify-center">›</button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-slate2">Entrou</p>
            <p className="font-semibold text-moss-600">{formatCurrency(monthSummary.entradas)}</p>
          </div>
          <div>
            <p className="text-xs text-slate2">Saiu</p>
            <p className="font-semibold text-rose">{formatCurrency(monthSummary.saidas)}</p>
          </div>
          <div>
            <p className="text-xs text-slate2">Saldo</p>
            <p className={`font-semibold ${monthSummary.saldo >= 0 ? 'text-ink' : 'text-rose'}`}>{formatCurrency(monthSummary.saldo)}</p>
          </div>
        </div>
        <p className="text-[11px] text-slate2 mt-2">Considera apenas Dinheiro + Débito — limite de crédito não entra na conta.</p>
      </div>

      <AddBalanceModal open={addOpen} onClose={() => setAddOpen(false)} />
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>
  )
}
