import React, { useMemo, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { formatCurrency, formatDateTime } from '../lib/dateUtils'

const TAG_STYLE = { urgente: 'tag-urgente', necessario: 'tag-necessario', futil: 'tag-futil' }
const TAG_LABEL = { urgente: 'Urgente', necessario: 'Necessário', futil: 'Fútil' }
const METHOD_LABEL = { debito: 'Débito', dinheiro: 'Dinheiro', va: 'VA', credito: 'Crédito' }

export default function Statement() {
  const { transactions, cancelTransaction } = useFinance()
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [activeTags, setActiveTags] = useState([])
  const [canceling, setCanceling] = useState(null)

  function toggleTag(tag) {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  async function handleCancel(t) {
    const label = t.payment_method === 'credito' ? 'Isso vai estornar a compra inteira no crédito e reduzir a fatura.' : 'O valor volta para o saldo de origem.'
    if (!confirm(`Estornar "${t.description}"? ${label}`)) return
    setCanceling(t.id)
    try {
      await cancelTransaction(t.id)
    } catch (err) {
      alert(err.message)
    } finally {
      setCanceling(null)
    }
  }

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (search) {
        const q = search.toLowerCase()
        const hay = `${t.description} ${t.observacao || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (activeTags.length > 0 && !activeTags.includes(t.tag)) return false
      if (dateFrom && new Date(t.occurred_at) < new Date(dateFrom)) return false
      if (dateTo && new Date(t.occurred_at) > new Date(dateTo + 'T23:59:59')) return false
      return true
    })
  }, [transactions, search, activeTags, dateFrom, dateTo])

  // Totais do resultado filtrado. IMPORTANTE: aumento de limite de crédito
  // é lançado como kind:'entrada' com payment_method null — isso NÃO é
  // dinheiro real entrando em conta, então é excluído desta soma. Compras
  // no crédito (payment_method 'credito') continuam contando como saída
  // real, pois representam gasto efetivo, só que a prazo.
  const filteredTotals = useMemo(() => {
    let entrada = 0
    let saida = 0
    for (const t of filtered) {
      if (t.canceled) continue
      if (t.kind === 'entrada' && t.payment_method !== null) entrada += Number(t.amount)
      else if (t.kind === 'gasto') saida += Number(t.amount)
    }
    return { entrada, saida, saldo: entrada - saida }
  }, [filtered])

  const hasActiveFilter = !!search || activeTags.length > 0 || !!dateFrom || !!dateTo

  return (
    <div className="space-y-5 animate-rise">
      <h2 className="font-display text-xl text-ink">Extrato Geral</h2>

      <div className="space-y-2">
        <input
          placeholder="Buscar (ex: Rendimentos PicPay)" value={search}
          onChange={e => setSearch(e.target.value)} className="input-field"
        />
        <div className="flex flex-wrap gap-2">
          {Object.entries(TAG_LABEL).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleTag(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${activeTags.includes(key) ? 'bg-moss-700 text-paper border-moss-700' : 'bg-white border-moss-200 text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field text-sm" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field text-sm" />
        </div>

        {hasActiveFilter && (
          <div className="card p-3 bg-moss-50 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[11px] text-slate2">Total Entrada</p>
              <p className="text-sm font-semibold text-moss-600">{formatCurrency(filteredTotals.entrada)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate2">Total Saída</p>
              <p className="text-sm font-semibold text-rose">{formatCurrency(filteredTotals.saida)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate2">Saldo do filtro</p>
              <p className={`text-sm font-semibold ${filteredTotals.saldo >= 0 ? 'text-ink' : 'text-rose'}`}>{formatCurrency(filteredTotals.saldo)}</p>
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate2">Limite de crédito (aumento) não entra nessas somas — apenas movimentação real.</p>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-slate2 text-sm text-center py-6">Nenhum lançamento encontrado.</p>}
        {filtered.map(t => (
          <div key={t.id} className={`card p-3.5 ${t.canceled ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className={`font-medium text-ink truncate ${t.canceled ? 'line-through' : ''}`}>{t.description}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-slate2">{formatDateTime(t.occurred_at)}</span>
                  {t.payment_method && <span className="text-xs text-slate2">· {METHOD_LABEL[t.payment_method]}</span>}
                  {t.tag && <span className={`tag-pill ${TAG_STYLE[t.tag]}`}>{TAG_LABEL[t.tag]}</span>}
                  {t.canceled && <span className="tag-pill bg-slate2/10 text-slate2">Estornado</span>}
                </div>
                {t.observacao && <p className="text-xs text-slate2 mt-0.5 italic">{t.observacao}</p>}
              </div>
              <span className={`font-semibold whitespace-nowrap ml-3 ${t.canceled ? 'text-slate2 line-through' : t.kind === 'gasto' ? 'text-rose' : 'text-moss-600'}`}>
                {t.kind === 'gasto' ? '-' : '+'}{formatCurrency(t.amount)}
              </span>
            </div>
            {t.kind === 'gasto' && !t.canceled && (
              <button
                onClick={() => handleCancel(t)}
                disabled={canceling === t.id}
                className="mt-2 text-xs font-semibold text-rose"
              >
                {canceling === t.id ? 'Estornando…' : 'Estornar'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
