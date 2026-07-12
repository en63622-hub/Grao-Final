import React, { useMemo, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { formatCurrency, formatDate, formatDateTime, daysUntil } from '../lib/dateUtils'
import Modal from '../components/Modal'

function NewDebtorModal({ open, onClose }) {
  const { addDebtor } = useFinance()
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [hasInterest, setHasInterest] = useState(false)
  const [rate, setRate] = useState('')
  const [loanDate, setLoanDate] = useState(new Date().toISOString().slice(0, 10))
  const [expectedDate, setExpectedDate] = useState('')
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      await addDebtor({
        name, originalValue: value.replace(',', '.'), hasInterest, interestRate: rate.replace(',', '.'),
        loanDate, expectedPaymentDate: expectedDate || null, observation: obs
      })
      setName(''); setValue(''); setRate(''); setObs(''); setHasInterest(false)
      onClose()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo empréstimo">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Nome da pessoa</label>
          <input required value={name} onChange={e => setName(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Valor emprestado</label>
          <input required inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} className="input-field" placeholder="0,00" />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={hasInterest} onChange={e => setHasInterest(e.target.checked)} className="w-4 h-4" />
          Aplicar juros sobre este empréstimo
        </label>
        {hasInterest && (
          <div>
            <label className="text-sm font-medium text-slate2 mb-1 block">Taxa de juros (%)</label>
            <input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} className="input-field" placeholder="Ex: 2,5" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate2 mb-1 block">Data do empréstimo</label>
            <input type="date" value={loanDate} onChange={e => setLoanDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate2 mb-1 block">Previsão de pagamento</label>
            <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="input-field" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Observação</label>
          <input value={obs} onChange={e => setObs(e.target.value)} className="input-field" placeholder="Ex: Emprestado para viagem" />
        </div>
        {error && <p className="text-rose text-sm">{error}</p>}
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Salvando…' : 'Registrar empréstimo'}</button>
      </form>
    </Modal>
  )
}

function DebtorDeadlineAlert({ debtor }) {
  if (!debtor.expected_payment_date || Number(debtor.current_value) <= 0) return null
  const d = daysUntil(debtor.expected_payment_date)
  if (d === null) return null

  if (d < 0) {
    return (
      <p className="text-xs font-semibold text-rose bg-rose/10 rounded-lg px-3 py-2 mt-1">
        ⚠ Prazo vencido há {Math.abs(d)} dia{Math.abs(d) !== 1 ? 's' : ''}
      </p>
    )
  }
  if (d <= 7) {
    return (
      <p className="text-xs font-semibold text-clay bg-clay/10 rounded-lg px-3 py-2 mt-1">
        ⏰ {d === 0 ? 'Vence hoje!' : `Vence em ${d} dia${d !== 1 ? 's' : ''}`} — previsão de pagamento chegando
      </p>
    )
  }
  return null
}

function IncreaseDebtForm({ debtor }) {
  const { increaseDebt } = useFinance()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      await increaseDebt(debtor.id, amount.replace(',', '.'), note)
      setAmount(''); setNote(''); setOpen(false)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary w-full text-sm">
        + Somar novo valor à dívida
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 card p-3.5 bg-moss-50">
      <p className="text-sm font-semibold text-ink">Somar novo valor (ex: novo serviço/fiado)</p>
      <input required inputMode="decimal" placeholder="Valor a somar" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" />
      <input placeholder="Observação (opcional)" value={note} onChange={e => setNote(e.target.value)} className="input-field" />
      {error && <p className="text-rose text-sm">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1 text-sm">Cancelar</button>
        <button disabled={saving} className="btn-primary flex-1 text-sm">{saving ? 'Salvando…' : 'Somar valor'}</button>
      </div>
    </form>
  )
}

function DebtorDetailModal({ debtor, open, onClose }) {
  const { debtorTransactions, amortizeDebt, applyInterest, deleteDebtor } = useFinance()
  const [amount, setAmount] = useState('')
  const [wallet, setWallet] = useState('dinheiro')
  const [note, setNote] = useState('')
  // Nova previsão de pagamento, usada apenas quando o pagamento é parcial
  // (ainda sobra saldo devedor após o pagamento).
  const [newExpectedDate, setNewExpectedDate] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!debtor) return null
  const history = debtorTransactions.filter(t => t.debtor_id === debtor.id)

  const amountNum = Number((amount || '0').replace(',', '.')) || 0
  const remainingAfter = Math.max(0, Math.round((Number(debtor.current_value) - amountNum) * 100) / 100)
  const isPartialPayment = amountNum > 0 && remainingAfter > 0

  async function handleAmortize(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      await amortizeDebt(debtor.id, amount.replace(',', '.'), wallet, note, newExpectedDate || null)
      setAmount(''); setNote(''); setNewExpectedDate('')
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!confirm(`Excluir o registro de ${debtor.name}?`)) return
    await deleteDebtor(debtor.id)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={debtor.name}>
      <div className="space-y-5">
        <div className="card p-4 bg-moss-50">
          <div className="flex justify-between text-sm mb-1"><span className="text-slate2">Valor original</span><span className="font-medium">{formatCurrency(debtor.original_value)}</span></div>
          <div className="flex justify-between text-sm mb-1"><span className="text-slate2">Deve atualmente</span><span className="font-display text-lg text-clay">{formatCurrency(debtor.current_value)}</span></div>
          {debtor.has_interest && <div className="flex justify-between text-sm"><span className="text-slate2">Juros</span><span>{debtor.interest_rate}%</span></div>}
          {debtor.expected_payment_date && <div className="flex justify-between text-sm"><span className="text-slate2">Previsão de pagamento</span><span>{formatDate(debtor.expected_payment_date)}</span></div>}
          {debtor.observation && <p className="text-xs text-slate2 mt-2 italic">{debtor.observation}</p>}
          <DebtorDeadlineAlert debtor={debtor} />
        </div>

        {debtor.has_interest && debtor.current_value > 0 && (
          <button onClick={() => applyInterest(debtor.id)} className="btn-secondary w-full text-sm">Aplicar juros agora ({debtor.interest_rate}%)</button>
        )}

        <IncreaseDebtForm debtor={debtor} />

        {debtor.current_value > 0 && (
          <form onSubmit={handleAmortize} className="space-y-3 border-t border-moss-100 pt-4">
            <p className="text-sm font-semibold text-ink">Registrar pagamento recebido</p>
            <p className="text-xs text-slate2">Pode ser parcial — o valor entra no Extrato como "Recebimento Empréstimo".</p>
            <input required inputMode="decimal" placeholder="Valor recebido" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" />
            <div>
              <label className="text-xs font-medium text-slate2 mb-1 block">Recebido em</label>
              <div className="grid grid-cols-2 gap-2">
                {['dinheiro', 'debito'].map(w => (
                  <button type="button" key={w} onClick={() => setWallet(w)} className={`rounded-xl border px-2 py-2 text-xs font-semibold capitalize ${wallet === w ? 'bg-moss-700 text-paper border-moss-700' : 'bg-white border-moss-200'}`}>{w}</button>
                ))}
              </div>
            </div>
            <input placeholder="Observação (opcional)" value={note} onChange={e => setNote(e.target.value)} className="input-field" />

            {isPartialPayment && (
              <div className="rounded-lg bg-clay/10 px-3 py-2.5">
                <p className="text-xs text-clay font-semibold mb-1.5">Pagamento parcial — restará {formatCurrency(remainingAfter)}</p>
                <label className="text-xs font-medium text-slate2 mb-1 block">Nova previsão de pagamento (opcional)</label>
                <input type="date" value={newExpectedDate} onChange={e => setNewExpectedDate(e.target.value)} className="input-field" />
              </div>
            )}

            {error && <p className="text-rose text-sm">{error}</p>}
            <button disabled={saving} className="btn-primary w-full">{saving ? 'Salvando…' : 'Registrar pagamento'}</button>
          </form>
        )}

        <div className="border-t border-moss-100 pt-4">
          <p className="text-sm font-semibold text-ink mb-2">Histórico</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.map(h => (
              <div key={h.id} className="flex justify-between text-sm">
                <div>
                  <p className="text-ink">{h.kind === 'emprestimo' ? 'Empréstimo' : h.kind === 'juros' ? 'Juros aplicados' : `Pagamento (${h.destination_wallet})`}</p>
                  <p className="text-xs text-slate2">{formatDateTime(h.created_at)}</p>
                </div>
                <span className={h.kind === 'pagamento' ? 'text-moss-600 font-semibold' : 'text-ink font-semibold'}>{formatCurrency(h.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleDelete} className="w-full text-rose text-sm font-medium py-2">Excluir registro</button>
      </div>
    </Modal>
  )
}

export default function Debtors() {
  const { debtors } = useFinance()
  const [newOpen, setNewOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const selected = debtors.find(d => d.id === selectedId) || null

  const filtered = useMemo(() => {
    if (!search.trim()) return debtors
    const q = search.toLowerCase()
    return debtors.filter(d => d.name.toLowerCase().includes(q))
  }, [debtors, search])

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-ink">Devedores</h2>
        <button onClick={() => setNewOpen(true)} className="btn-secondary text-sm py-2 px-4">+ Novo</button>
      </div>

      {debtors.length > 0 && (
        <input
          placeholder="Buscar por nome…" value={search}
          onChange={e => setSearch(e.target.value)} className="input-field"
        />
      )}

      <div className="space-y-2">
        {debtors.length === 0 && <p className="text-slate2 text-sm text-center py-10">Nenhum empréstimo registrado ainda.</p>}
        {debtors.length > 0 && filtered.length === 0 && <p className="text-slate2 text-sm text-center py-10">Nenhum devedor encontrado para "{search}".</p>}
        {filtered.map(d => {
          const d2 = daysUntil(d.expected_payment_date)
          const dueSoon = d.current_value > 0 && d2 !== null && d2 >= 0 && d2 <= 7
          const overdue = d.current_value > 0 && d2 !== null && d2 < 0
          return (
            <button key={d.id} onClick={() => setSelectedId(d.id)} className="card p-4 w-full text-left flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-ink truncate">{d.name}</p>
                  {overdue && <span className="tag-pill tag-urgente shrink-0">Atrasado</span>}
                  {!overdue && dueSoon && <span className="tag-pill bg-clay/10 text-clay shrink-0">⏰ {d2 === 0 ? 'Vence hoje' : `${d2}d`}</span>}
                </div>
                <p className="text-xs text-slate2 mt-0.5">Emprestado em {formatDate(d.loan_date)}{d.expected_payment_date ? ` · previsão ${formatDate(d.expected_payment_date)}` : ''}</p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className={`font-display text-lg ${d.current_value > 0 ? 'text-clay' : 'text-moss-600'}`}>{formatCurrency(d.current_value)}</p>
                {d.current_value <= 0 && <p className="text-xs text-moss-600">Quitado</p>}
              </div>
            </button>
          )
        })}
      </div>

      <NewDebtorModal open={newOpen} onClose={() => setNewOpen(false)} />
      <DebtorDetailModal debtor={selected} open={!!selected} onClose={() => setSelectedId(null)} />
    </div>
  )
}
