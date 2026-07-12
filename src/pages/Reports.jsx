import React, { useMemo, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { formatCurrency, formatDateTime, monthLabel, addMonths, firstOfMonth, isSameMonth } from '../lib/dateUtils'
import Modal from '../components/Modal'

const TAGS = [
  { key: 'urgente', label: 'Urgente', color: 'bg-rose' },
  { key: 'necessario', label: 'Necessário', color: 'bg-gold' },
  { key: 'futil', label: 'Fútil', color: 'bg-moss-500' }
]

// ------------------------------------------------------------------
// Correção do bug de ciclo (bug #2): a versão anterior (lib/dateUtils
// `cycleRange`) não avançava o número de dias corretamente a partir da
// data de criação. Esta versão local usa aritmética de dias pura e "rola"
// automaticamente para a janela vigente sempre que o ciclo anterior já
// tiver terminado — uma meta de 30 dias criada em 11/07 vai até 10/08
// (e não fica presa em 29/07).
// ------------------------------------------------------------------
function cycleRangeFixed(referenceStart, days) {
  const dayMs = 24 * 60 * 60 * 1000
  let start = new Date(referenceStart)
  start.setHours(0, 0, 0, 0)
  const now = new Date()
  const elapsedMs = now - start
  if (elapsedMs > 0 && days > 0) {
    const elapsedCycles = Math.floor(elapsedMs / (days * dayMs))
    start = new Date(start.getTime() + elapsedCycles * days * dayMs)
  }
  const end = new Date(start.getTime() + days * dayMs)
  return { cycleStart: start, cycleEnd: end }
}

function GoalModal({ open, onClose }) {
  const { setGoal } = useFinance()
  const [period, setPeriod] = useState('mensal')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      // O ciclo sempre começa a partir de agora — é o que garante o
      // "janela rolante de N dias a partir da criação" (correção bug #2).
      await setGoal(period, description, amount.replace(',', '.'), new Date().toISOString())
      setAmount(''); setDescription(''); onClose()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova meta de gastos">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPeriod('mensal')} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${period === 'mensal' ? 'bg-moss-700 text-paper border-moss-700' : 'bg-white border-moss-200'}`}>Mensal (30 dias)</button>
          <button type="button" onClick={() => setPeriod('semanal')} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${period === 'semanal' ? 'bg-moss-700 text-paper border-moss-700' : 'bg-white border-moss-200'}`}>Semanal (7 dias)</button>
        </div>
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Descrição</label>
          <input required value={description} onChange={e => setDescription(e.target.value)} className="input-field" placeholder="Ex: Gastos fúteis de julho" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Valor da meta</label>
          <input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" placeholder="500,00" />
        </div>
        <p className="text-xs text-slate2">Você pode manter várias metas ativas ao mesmo tempo (ex: uma mensal e uma semanal).</p>
        {error && <p className="text-rose text-sm">{error}</p>}
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Salvando…' : 'Salvar meta'}</button>
      </form>
    </Modal>
  )
}

const METHOD_LABEL = { debito: 'Débito', dinheiro: 'Dinheiro', va: 'VA', credito: 'Crédito' }

function CategoryDetailModal({ tag, expenses, open, onClose }) {
  if (!tag) return null
  const items = expenses.filter(t => t.tag === tag.key)
  const total = items.reduce((s, t) => s + Number(t.amount), 0)

  return (
    <Modal open={open} onClose={onClose} title={`Gastos: ${tag.label}`}>
      <div className="space-y-3">
        <p className="text-sm text-slate2">Total no período: <span className="font-semibold text-ink">{formatCurrency(total)}</span> · {items.length} lançamento{items.length !== 1 ? 's' : ''}</p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {items.length === 0 && <p className="text-slate2 text-sm text-center py-6">Nenhum gasto nessa categoria.</p>}
          {items.map(t => (
            <div key={t.id} className="card p-3.5 flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">{t.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate2">{formatDateTime(t.occurred_at)}</span>
                  {t.payment_method && <span className="text-xs text-slate2">· {METHOD_LABEL[t.payment_method]}</span>}
                </div>
              </div>
              <span className="font-semibold text-rose whitespace-nowrap ml-3">{formatCurrency(t.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function GoalCard({ goal, transactions, onStop, onDelete }) {
  const days = goal.period === 'mensal' ? 30 : 7
  const { cycleStart, cycleEnd } = useMemo(() => cycleRangeFixed(goal.reference_start, days), [goal.reference_start, days])

  const cycleExpenses = useMemo(() => {
    return transactions.filter(t =>
      t.kind === 'gasto' && !t.canceled &&
      new Date(t.occurred_at) >= cycleStart && new Date(t.occurred_at) < cycleEnd
    )
  }, [transactions, cycleStart, cycleEnd])

  const currentSpend = cycleExpenses.reduce((s, t) => s + Number(t.amount), 0)
  const futilCurrent = cycleExpenses.filter(t => t.tag === 'futil').reduce((s, t) => s + Number(t.amount), 0)
  const goalPct = Math.min(999, (currentSpend / Number(goal.amount)) * 100)
  const futilPct = currentSpend > 0 ? (futilCurrent / currentSpend) * 100 : 0

  let alertMsg = null
  if (goalPct >= 60) {
    if (goalPct >= 100) alertMsg = `Você já ultrapassou sua meta (${goalPct.toFixed(0)}%)! ${futilPct > 20 ? `${futilPct.toFixed(0)}% foram gastos fúteis.` : ''}`
    else if (futilPct >= 30) alertMsg = `Você consumiu ${goalPct.toFixed(0)}% da sua meta e ${futilPct.toFixed(0)}% foi com gastos Fúteis. Cuidado!`
    else alertMsg = `Você já consumiu ${goalPct.toFixed(0)}% da sua meta neste período.`
  }

  async function handleDelete() {
    if (!confirm(`Excluir a meta "${goal.description}"? Essa ação não pode ser desfeita.`)) return
    await onDelete(goal.id)
  }

  return (
    <div className="card p-4">
      <div className="flex justify-between items-baseline mb-1">
        <p className="text-sm font-semibold text-ink">{goal.description} <span className="text-slate2 font-normal">· {goal.period} · ciclo de {days} dias</span></p>
        <p className="text-sm text-slate2">{formatCurrency(currentSpend)} / {formatCurrency(goal.amount)}</p>
      </div>
      <div className="h-2.5 rounded-full bg-moss-100 overflow-hidden">
        <div className={`h-full ${goalPct >= 100 ? 'bg-rose' : goalPct >= 80 ? 'bg-clay' : 'bg-moss-500'}`} style={{ width: `${Math.min(100, goalPct)}%` }} />
      </div>
      <p className="text-xs text-slate2 mt-1">Ciclo atual até {new Date(cycleEnd.getTime() - 86400000).toLocaleDateString('pt-BR')}</p>
      {alertMsg && <p className="text-xs text-clay font-medium mt-2">⚠ {alertMsg}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={() => onStop(goal.id)} className="btn-secondary flex-1 text-xs py-2">Interromper meta</button>
        <button onClick={handleDelete} className="flex-1 text-xs py-2 font-semibold text-rose">Excluir meta</button>
      </div>
    </div>
  )
}

function GoalHistoryCard({ goal, onDelete, onReactivate, reactivating }) {
  const days = goal.period === 'mensal' ? 30 : 7

  async function handleDelete() {
    if (!confirm(`Excluir permanentemente a meta "${goal.description}" do histórico? Essa ação não pode ser desfeita.`)) return
    await onDelete(goal.id)
  }

  return (
    <div className="card p-4 opacity-60 grayscale">
      <div className="flex justify-between items-baseline mb-1">
        <p className="text-sm font-semibold text-slate2">{goal.description} <span className="font-normal">· {goal.period} · ciclo de {days} dias</span></p>
        <p className="text-sm text-slate2">{formatCurrency(goal.amount)}</p>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="tag-pill bg-slate-200 text-slate2">Interrompida</span>
        <div className="flex gap-3">
          <button
            onClick={() => onReactivate(goal)}
            disabled={reactivating === goal.id}
            className="text-xs py-2 font-semibold text-moss-700"
          >
            {reactivating === goal.id ? 'Reativando…' : 'Reativar meta'}
          </button>
          <button onClick={handleDelete} className="text-xs py-2 font-semibold text-rose">Excluir do histórico</button>
        </div>
      </div>
    </div>
  )
}

export default function Reports() {
  const { transactions, goals, stopGoal, deleteGoal, reactivateGoal } = useFinance()
  const [cursor, setCursor] = useState(firstOfMonth(new Date()))
  const [goalOpen, setGoalOpen] = useState(false)
  const [expandedTag, setExpandedTag] = useState(null)
  const [reactivating, setReactivating] = useState(null)

  const monthExpenses = useMemo(() =>
    transactions.filter(t => t.kind === 'gasto' && !t.canceled && isSameMonth(t.occurred_at, cursor)),
    [transactions, cursor]
  )

  const totalSpend = monthExpenses.reduce((s, t) => s + Number(t.amount), 0)

  const byTag = TAGS.map(tag => {
    const items = monthExpenses.filter(t => t.tag === tag.key)
    const sum = items.reduce((s, t) => s + Number(t.amount), 0)
    return { ...tag, count: items.length, sum, pct: totalSpend ? (sum / totalSpend) * 100 : 0 }
  })

  // Correção bug #2: mostra TODAS as metas ativas simultaneamente (não
  // apenas "a mensal OU a semanal"), permitindo coexistirem várias metas.
  // `active !== false` mantém compatibilidade com registros antigos que
  // não tinham a coluna `active` preenchida.
  const activeGoals = useMemo(
    () => goals
      .filter(g => g.active !== false)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [goals]
  )

  // Metas interrompidas (active === false) não somem mais da tela: ficam
  // guardadas para exibição em "Histórico de Metas", só como registro
  // visual (sem recálculo de ciclo/progresso, já que a meta não está mais
  // rodando).
  const inactiveGoals = useMemo(
    () => goals
      .filter(g => g.active === false)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [goals]
  )

  const PERIOD_LABEL = { mensal: 'mensal', semanal: 'semanal' }

  // Trava de segurança: antes de reativar, checa se já existe uma meta
  // ATIVA do mesmo período (mensal/semanal). Sem essa checagem, reativar
  // uma meta antiga poderia violar uma constraint de unicidade no Supabase
  // (ex: um índice único em (period) WHERE active = true) e estourar um
  // erro feio direto no banco. Aqui barramos antes mesmo de chamar a API.
  async function handleReactivate(goal) {
    const conflict = activeGoals.some(g => g.period === goal.period)
    if (conflict) {
      alert(`Você já possui uma meta ${PERIOD_LABEL[goal.period] || goal.period} ativa. Interrompa ou exclua a meta atual antes de reativar uma antiga.`)
      return
    }
    setReactivating(goal.id)
    try {
      // reactivateGoal deve, no FinanceContext: setar active = true e
      // "zerar" o ciclo (reference_start = agora), para a janela rolante
      // de 7/30 dias recomeçar a contar do zero a partir de hoje — e não
      // retomar de onde a meta antiga tinha parado.
      await reactivateGoal(goal.id, new Date().toISOString())
    } catch (err) {
      alert(err.message)
    } finally {
      setReactivating(null)
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-ink">Relatórios</h2>
        <button onClick={() => setGoalOpen(true)} className="btn-secondary text-sm py-2 px-4">+ Meta</button>
      </div>

      {activeGoals.length > 0 && (
        <div className="space-y-3">
          {activeGoals.map(goal => (
            <GoalCard key={goal.id} goal={goal} transactions={transactions} onStop={stopGoal} onDelete={deleteGoal} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button onClick={() => setCursor(addMonths(cursor, -1))} className="w-9 h-9 rounded-full bg-moss-100 text-moss-800 flex items-center justify-center">‹</button>
        <p className="font-display text-lg text-ink">{monthLabel(cursor)}</p>
        <button onClick={() => setCursor(addMonths(cursor, 1))} className="w-9 h-9 rounded-full bg-moss-100 text-moss-800 flex items-center justify-center">›</button>
      </div>

      <div className="card p-4">
        <p className="text-sm text-slate2 mb-3">Total gasto no mês: <span className="font-semibold text-ink">{formatCurrency(totalSpend)}</span></p>
        <div className="space-y-3">
          {byTag.map(tag => (
            <button key={tag.key} onClick={() => setExpandedTag(tag)} className="w-full text-left" disabled={tag.count === 0}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-ink">{tag.label} {tag.count > 0 && <span className="text-slate2 font-normal">›</span>}</span>
                <span className="text-slate2">{tag.count}x · {formatCurrency(tag.sum)} · {tag.pct.toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-moss-100 overflow-hidden">
                <div className={`h-full ${tag.color}`} style={{ width: `${tag.pct}%` }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {inactiveGoals.length > 0 && (
        <div>
          <h3 className="font-display text-lg text-ink mb-2">Histórico de Metas</h3>
          <div className="space-y-3">
            {inactiveGoals.map(goal => (
              <GoalHistoryCard
                key={goal.id}
                goal={goal}
                onDelete={deleteGoal}
                onReactivate={handleReactivate}
                reactivating={reactivating}
              />
            ))}
          </div>
        </div>
      )}

      <GoalModal open={goalOpen} onClose={() => setGoalOpen(false)} />
      <CategoryDetailModal tag={expandedTag} expenses={monthExpenses} open={!!expandedTag} onClose={() => setExpandedTag(null)} />
    </div>
  )
}
