import React, { useMemo, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { formatCurrency, monthLabel, addMonths, firstOfMonth, monthKey } from '../lib/dateUtils'
import Modal from '../components/Modal'

const TAGS = [
  { key: 'urgente', label: 'Urgente' },
  { key: 'necessario', label: 'Necessário' },
  { key: 'futil', label: 'Fútil' }
]

// Bug do "sumiço": item.purchase.purchase_date às vezes vem do Supabase
// como timestamp completo ('2026-07-12T00:00:00.000Z' ou com hora local),
// enquanto o campo `date` do formulário de nova compra é só 'YYYY-MM-DD'.
// Se getInvoiceMonthForPurchase for sensível ao formato (ou o parsing
// interno usar `new Date(str)`, que trata string "date-only" como UTC),
// duas chamadas com o "mesmo dia" podem cair em fusos diferentes e gerar
// monthKeys diferentes para o mesmo evento — fazendo a parcela não bater
// nem com o cursorKey de Julho nem com o de Agosto, e portanto sumir da
// tela nos dois meses (mesmo aparecendo no Extrato, que provavelmente lê a
// data de outra forma). Esta função sempre normaliza para uma string local
// 'YYYY-MM-DD' pura, sem componente de hora/fuso, para que
// getInvoiceMonthForPurchase receba sempre o mesmo formato em todos os
// pontos do app (aqui e no preview do NewPurchaseModal).
function toDateOnly(dateLike) {
  if (!dateLike) return null
  if (dateLike instanceof Date) {
    const y = dateLike.getFullYear()
    const m = String(dateLike.getMonth() + 1).padStart(2, '0')
    const d = String(dateLike.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  // Já é string: pega só os 10 primeiros chars ('YYYY-MM-DD'), descartando
  // qualquer 'THH:mm:ss.sssZ' que o Supabase possa ter incluído.
  return String(dateLike).slice(0, 10)
}

function SettingsModal({ open, onClose }) {
  const { ccSettings, updateCreditCardSettings } = useFinance()
  const [closingDay, setClosingDay] = useState(ccSettings.closing_day)
  const [dueDay, setDueDay] = useState(ccSettings.due_day)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateCreditCardSettings(Number(closingDay), Number(dueDay))
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Configurar fatura">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Dia de fechamento</label>
          <input type="number" min={1} max={28} required value={closingDay} onChange={e => setClosingDay(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Dia de vencimento</label>
          <input type="number" min={1} max={28} required value={dueDay} onChange={e => setDueDay(e.target.value)} className="input-field" />
        </div>
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Salvando…' : 'Salvar'}</button>
      </form>
    </Modal>
  )
}

function NewPurchaseModal({ open, onClose }) {
  const { addCreditPurchase, ccSettings, getInvoiceMonthForPurchase } = useFinance()
  const [description, setDescription] = useState('')
  const [totalValue, setTotalValue] = useState('')
  const [installments, setInstallments] = useState('1')
  const [tag, setTag] = useState('necessario')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      await addCreditPurchase({
        description, totalValue: totalValue.replace(',', '.'), installmentsCount: installments, tag, purchaseDate: date
      })
      setDescription(''); setTotalValue(''); setInstallments('1'); onClose()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  // Aviso de transparência (bug #3): mostra em qual fatura essa compra vai
  // cair, considerando o dia de fechamento configurado. Normaliza com
  // toDateOnly para usar exatamente o mesmo formato de data que o
  // lockedInvoice (em CreditCard) usa ao recalcular a fatura verdadeira —
  // evita que o preview mostre "vai para Agosto" e a compra some ao ser
  // salva, por causa de dois formatos de data diferentes gerando meses
  // diferentes.
  const previewInvoiceMonth = date ? getInvoiceMonthForPurchase(toDateOnly(date), ccSettings.closing_day) : null

  return (
    <Modal open={open} onClose={onClose} title="Nova compra no crédito">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Descrição</label>
          <input required value={description} onChange={e => setDescription(e.target.value)} className="input-field" placeholder="Ex: Notebook" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate2 mb-1 block">Valor total</label>
            <input required inputMode="decimal" value={totalValue} onChange={e => setTotalValue(e.target.value)} className="input-field" placeholder="0,00" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate2 mb-1 block">Parcelas</label>
            <input required type="number" min={1} value={installments} onChange={e => setInstallments(e.target.value)} className="input-field" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Data da compra</label>
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="input-field" />
          {previewInvoiceMonth && (
            <p className="text-xs text-slate2 mt-1">Vai entrar na fatura de {monthLabel(previewInvoiceMonth)}</p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-slate2 mb-2 block">Categoria</label>
          <div className="grid grid-cols-3 gap-2">
            {TAGS.map(t => (
              <button type="button" key={t.key} onClick={() => setTag(t.key)}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold ${tag === t.key ? 'bg-moss-700 text-paper border-moss-700' : 'bg-white border-moss-200 text-ink'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-rose text-sm">{error}</p>}
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Salvando…' : 'Lançar compra'}</button>
      </form>
    </Modal>
  )
}

function PayInvoiceModal({ open, onClose, invoice, monthDate }) {
  const { payInvoice, balances } = useFinance()
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('debito')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  React.useEffect(() => { if (open) setAmount(invoice.remaining.toFixed(2).replace('.', ',')) }, [open, invoice.remaining])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      await payInvoice({ invoiceMonth: monthDate, amount: amount.replace(',', '.'), source })
      onClose()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Pagar fatura">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate2">Saldo devedor da fatura: <b className="text-ink">{formatCurrency(invoice.remaining)}</b></p>
        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Valor a pagar</label>
          <input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" />
          <p className="text-xs text-slate2 mt-1">Pode ser parcial ou antecipado — o restante fica registrado para depois.</p>
        </div>
        <div>
          <label className="text-sm font-medium text-slate2 mb-2 block">Pagar com</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSource('dinheiro')} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${source === 'dinheiro' ? 'bg-moss-700 text-paper border-moss-700' : 'bg-white border-moss-200 text-ink'}`}>
              Dinheiro ({formatCurrency(balances.dinheiro)})
            </button>
            <button type="button" onClick={() => setSource('debito')} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${source === 'debito' ? 'bg-moss-700 text-paper border-moss-700' : 'bg-white border-moss-200 text-ink'}`}>
              Débito ({formatCurrency(balances.debito)})
            </button>
          </div>
        </div>
        {error && <p className="text-rose text-sm">{error}</p>}
        <button disabled={saving} className="btn-primary w-full">{saving ? 'Pagando…' : 'Confirmar pagamento'}</button>
      </form>
    </Modal>
  )
}

export default function CreditCard() {
  const { ccSettings, invoiceForMonth, creditLimitAvailable, balances, cancelCreditPurchase, getInvoiceMonthForPurchase } = useFinance()
  const [cursor, setCursor] = useState(firstOfMonth(new Date()))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [canceling, setCanceling] = useState(null)

  const invoice = invoiceForMonth(cursor)

  // Estilo Nubank: a fatura "aberta atual" é aquela que receberia uma compra
  // feita hoje, considerando o dia de fechamento configurado. Qualquer
  // fatura anterior a essa já está fechada; compras feitas após o
  // fechamento do mês corrente já aparecem automaticamente na fatura
  // seguinte (correção bug #3 — ver getInvoiceMonthForPurchase no
  // FinanceContext, usado tanto aqui quanto em addCreditPurchase).
  const openInvoiceMonthKey = monthKey(getInvoiceMonthForPurchase(toDateOnly(new Date()), ccSettings.closing_day))
  const cursorKey = monthKey(cursor)
  const isOpenInvoice = cursorKey === openInvoiceMonthKey
  const isClosedInvoice = cursorKey < openInvoiceMonthKey

  // Trava de fatura fechada: não confia apenas no invoice_month já gravado
  // na parcela (que pode ter ficado desatualizado por registros antigos ou
  // qualquer drift de fuso horário). Recalcula, a partir da fonte da verdade
  // (data da compra + dia de fechamento + número da parcela), qual é o mês
  // de fatura verdadeiro de cada item, e só exibe o item se ele realmente
  // pertencer ao mês que está sendo visualizado. Isso garante que uma
  // compra feita em 12/07 (fechamento dia 09) nunca apareça "vazada" dentro
  // da fatura de Julho — ela só pode aparecer em Agosto.
  // Fatura isolada (bug do "efeito bola de neve"): antes, apenas os itens
  // exibidos na lista eram filtrados por trueInvoiceMonth === cursorKey, mas
  // os totais (totalDue/paid/remaining/isPaid) continuavam vindo direto de
  // invoice.* — que reflete a agregação bruta do contexto e pode incluir
  // parcelas de outras faturas (ex.: compra de 12/07 com fechamento dia 09
  // cai em Agosto, mas o total de Julho e o de Agosto acabavam somando tudo).
  // Agora o totalDue é recalculado como a soma exclusiva dos itens que
  // realmente pertencem a este cursorKey.
  //
  // OBS: não temos, neste arquivo, a estrutura interna de como o "paid" é
  // registrado no FinanceContext (payInvoice grava o pagamento associado a
  // um invoiceMonth específico, então em tese invoice.paid já vem correto
  // para o mês do cursor — diferente do totalDue, que dependia do
  // invoice_month gravado em cada parcela, esse sim sujeito a drift). Por
  // segurança, o "paid" é normalizado (nunca maior que o novo totalDue) em
  // vez de recalculado a partir dos itens, já que os itens não carregam um
  // campo de valor pago individual aqui. Se o "paid" do contexto também
  // estiver acumulando faturas erradas, será preciso expor o valor pago
  // por item (ou por invoiceMonth) no FinanceContext para fechar 100%.
  const lockedInvoice = useMemo(() => {
    const items = invoice.items.filter(item => {
      if (!item.purchase?.purchase_date) return true
      const baseInvoiceMonth = getInvoiceMonthForPurchase(toDateOnly(item.purchase.purchase_date), ccSettings.closing_day)
      const trueInvoiceMonth = addMonths(baseInvoiceMonth, (item.installment_number || 1) - 1)
      return monthKey(trueInvoiceMonth) === cursorKey
    })

    const totalDue = items.reduce((sum, item) => sum + (item.value || 0), 0)
    const paid = Math.min(invoice.paid || 0, totalDue)
    const remaining = Math.max(0, totalDue - paid)
    const isPaid = totalDue > 0 && remaining <= 0

    return { items, totalDue, paid, remaining, isPaid }
  }, [invoice.items, invoice.paid, ccSettings.closing_day, cursorKey, getInvoiceMonthForPurchase])

  const lockedItems = lockedInvoice.items

  async function handleCancelItem(item) {
    if (!confirm(`Estornar a compra "${item.purchase?.description}"? Isso remove todas as parcelas restantes e reduz o valor da fatura.`)) return
    setCanceling(item.purchase_id)
    try {
      await cancelCreditPurchase(item.purchase_id)
    } catch (err) {
      alert(err.message)
    } finally {
      setCanceling(null)
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="card p-5 bg-clay text-paper">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Limite disponível</p>
          <button onClick={() => setSettingsOpen(true)} className="text-xs bg-white/15 rounded-full px-3 py-1">⚙ Fechamento/Venc.</button>
        </div>
        <p className="font-display text-3xl mt-1">{formatCurrency(creditLimitAvailable)}</p>
        <p className="text-xs text-white/80 mt-1">Total: {formatCurrency(balances.credit_limit_total)} · Fecha dia {ccSettings.closing_day}, vence dia {ccSettings.due_day}</p>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setCursor(addMonths(cursor, -1))} className="w-9 h-9 rounded-full bg-moss-100 text-moss-800 flex items-center justify-center">‹</button>
        <div className="text-center">
          <p className="font-display text-lg text-ink">{monthLabel(cursor)}</p>
          {isOpenInvoice && <p className="text-xs text-moss-600 font-semibold">Fatura Aberta Atual</p>}
          {isClosedInvoice && <p className="text-xs text-slate2 font-semibold">Fatura Fechada</p>}
        </div>
        <button onClick={() => setCursor(addMonths(cursor, 1))} className="w-9 h-9 rounded-full bg-moss-100 text-moss-800 flex items-center justify-center">›</button>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-slate2">Total da fatura</p>
          <p className="font-display text-xl text-ink">{formatCurrency(lockedInvoice.totalDue)}</p>
        </div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-slate2">Pago até agora</p>
          <p className="text-moss-600 font-semibold">{formatCurrency(lockedInvoice.paid)}</p>
        </div>
        <div className="h-2 rounded-full bg-moss-100 overflow-hidden mb-3">
          <div className="h-full bg-moss-500" style={{ width: `${lockedInvoice.totalDue ? Math.min(100, (lockedInvoice.paid / lockedInvoice.totalDue) * 100) : 0}%` }} />
        </div>
        {lockedInvoice.totalDue > 0 && (
          <div className="flex items-center justify-between">
            <span className={`tag-pill ${lockedInvoice.isPaid ? 'tag-necessario' : 'tag-urgente'}`}>
              {lockedInvoice.isPaid ? 'Fatura quitada' : `Restam ${formatCurrency(lockedInvoice.remaining)}`}
            </span>
            {!lockedInvoice.isPaid && <button onClick={() => setPayOpen(true)} className="btn-secondary text-sm py-2 px-4">Pagar fatura</button>}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-display text-lg text-ink mb-2">Compras nesta fatura</h3>
        <div className="space-y-2">
          {lockedItems.length === 0 && <p className="text-slate2 text-sm text-center py-6">Nenhuma compra nesta fatura.</p>}
          {lockedItems.map(item => (
            <div key={item.id} className="card p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink">{item.purchase?.description}</p>
                  <p className="text-xs text-slate2 mt-0.5">Parcela {item.installment_number}/{item.purchase?.installments_count}</p>
                </div>
                <span className="font-semibold text-ink">{formatCurrency(item.value)}</span>
              </div>
              <button
                onClick={() => handleCancelItem(item)}
                disabled={canceling === item.purchase_id}
                className="mt-2 text-xs font-semibold text-rose"
              >
                {canceling === item.purchase_id ? 'Estornando…' : 'Estornar compra'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => setPurchaseOpen(true)} className="btn-primary w-full">+ Nova compra no crédito</button>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewPurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
      <PayInvoiceModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        invoice={{ ...invoice, totalDue: lockedInvoice.totalDue, paid: lockedInvoice.paid, remaining: lockedInvoice.remaining, isPaid: lockedInvoice.isPaid }}
        monthDate={cursor}
      />
    </div>
  )
}
