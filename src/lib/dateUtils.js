// ---------- Helpers de data ----------

export function firstOfMonth(date) {
  const d = new Date(date)
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function addMonths(date, n) {
  const d = new Date(date)
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function monthKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function monthLabel(date) {
  const d = new Date(date)
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${meses[d.getMonth()]} de ${d.getFullYear()}`
}

export function monthLabelShort(date) {
  const d = new Date(date)
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[d.getMonth()]}/${d.getFullYear()}`
}

/**
 * Regra de fechamento:
 * - Se o dia da compra for <= dia de fechamento: a compra cai na fatura do
 *   mês corrente da compra.
 * - Se for > dia de fechamento: cai na fatura do mês seguinte.
 * Retorna a data (dia 01) do MÊS DA FATURA (mês de fechamento) em que a
 * 1ª parcela deve entrar. O vencimento (due_day) é apenas um dia dentro
 * desse mesmo mês/ciclo, configurado separadamente em credit_card_settings
 * — por isso a função não soma mais um mês extra aqui.
 */
export function getInvoiceMonthForPurchase(purchaseDate, closingDay) {
  const d = new Date(purchaseDate)
  const day = d.getDate()
  let invoiceMonth = new Date(d.getFullYear(), d.getMonth(), 1)
  if (day > closingDay) {
    invoiceMonth = addMonths(invoiceMonth, 1)
  }
  return invoiceMonth
}

export function formatCurrency(value) {
  const v = Number(value || 0)
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('pt-BR')
}

export function formatDateTime(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function isSameMonth(a, b) {
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()
}

export function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay() // 0 = domingo
  const diff = (day === 0 ? -6 : 1) - day // volta pra segunda-feira
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Quantos dias faltam (ou já passaram, se negativo) até a data informada,
 * contando a partir de hoje (00:00). Usado no alerta de prazo de pagamento
 * dos devedores.
 */
export function daysUntil(date) {
  if (!date) return null
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

/**
 * Calcula o ciclo corrente (janela rolante de `days` dias) de uma meta,
 * repetindo a partir de `referenceStart`. Ex: meta mensal = ciclo de 30
 * dias, meta semanal = ciclo de 7 dias — sempre reiniciando a cada N dias
 * a partir da data em que a meta foi definida.
 */
export function cycleRange(referenceStart, days) {
  const ref = new Date(referenceStart)
  ref.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today - ref) / 86400000)
  const cyclesElapsed = Math.floor(diffDays / days)
  const cycleStart = new Date(ref)
  cycleStart.setDate(cycleStart.getDate() + cyclesElapsed * days)
  const cycleEnd = new Date(cycleStart)
  cycleEnd.setDate(cycleEnd.getDate() + days)
  return { cycleStart, cycleEnd }
}
