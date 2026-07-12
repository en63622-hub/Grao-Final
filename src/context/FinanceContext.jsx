import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'
import { monthKey, addMonths, firstOfMonth } from '../lib/dateUtils'

const FinanceContext = createContext(null)

// ------------------------------------------------------------------
// Correção do fechamento de fatura (bug #3)
// Uma compra feita em um dia POSTERIOR ao dia de fechamento (closingDay)
// já cai automaticamente na fatura do mês seguinte. Compras feitas até o
// próprio dia de fechamento (inclusive) ainda entram na fatura do mês
// corrente. Ex: fecha dia 09, compra feita dia 11 → fatura de Agosto.
// Implementada localmente (não depende de lib/dateUtils) para garantir
// o comportamento correto.
//
// Correção adicional (bug do "sumiço"/deslocamento de fuso): `new
// Date('2026-07-10')` (string "date-only") é sempre interpretada pelo JS
// como meia-noite em UTC. Em fusos negativos como o do Brasil (UTC-3),
// ler essa data com getters locais (getDate/getMonth) "volta" um dia —
// uma compra feita no dia 10 (exatamente 1 dia depois do fechamento no
// dia 9) podia ser lida como dia 9 e ficar presa na fatura errada. Agora,
// strings 'YYYY-MM-DD' são parseadas manualmente como data LOCAL (sem
// passar por UTC), e só caem no `new Date(rawDate)` genérico quando não
// batem nesse formato (ex: já é um objeto Date, ou um timestamp ISO
// completo com hora, que aí sim carrega fuso de forma intencional).
function normalizeToLocalDate(rawDate) {
  if (rawDate instanceof Date) return rawDate
  const s = String(rawDate)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(s)
}

function getInvoiceMonth(rawDate, closingDay) {
  const d = normalizeToLocalDate(rawDate)
  const day = d.getDate()
  let year = d.getFullYear()
  let month = d.getMonth()
  if (day > Number(closingDay)) {
    month += 1
    if (month > 11) { month = 0; year += 1 }
  }
  return new Date(year, month, 1)
}

export function FinanceProvider({ children }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [balances, setBalances] = useState(null)
  const [ccSettings, setCcSettings] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [creditPurchases, setCreditPurchases] = useState([])
  const [creditInstallments, setCreditInstallments] = useState([])
  const [invoicePayments, setInvoicePayments] = useState([])
  const [debtors, setDebtors] = useState([])
  const [debtorTransactions, setDebtorTransactions] = useState([])
  const [goals, setGoals] = useState([])

  const loadAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const uid = user.id
    const [b, cc, tx, cp, ci, ip, dt, dtx, gl] = await Promise.all([
      supabase.from('balances').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('credit_card_settings').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('transactions').select('*').eq('user_id', uid).order('occurred_at', { ascending: false }),
      supabase.from('credit_purchases').select('*').eq('user_id', uid).order('purchase_date', { ascending: false }),
      supabase.from('credit_installments').select('*').eq('user_id', uid),
      supabase.from('invoice_payments').select('*').eq('user_id', uid),
      supabase.from('debtors').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('debtor_transactions').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('goals').select('*').eq('user_id', uid).order('created_at', { ascending: false })
    ])
    setBalances(b.data || { debito: 0, dinheiro: 0, va: 0, credit_limit_total: 0 })
    setCcSettings(cc.data || { closing_day: 25, due_day: 5 })
    setTransactions(tx.data || [])
    setCreditPurchases(cp.data || [])
    setCreditInstallments(ci.data || [])
    setInvoicePayments(ip.data || [])
    setDebtors(dt.data || [])
    setDebtorTransactions(dtx.data || [])
    setGoals(gl.data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { loadAll() }, [loadAll])

  // ------------------------------------------------------------------
  // SALDOS
  // ------------------------------------------------------------------
  async function addBalance(type, amount, observacao) {
    const val = Number(amount)
    if (!val || val <= 0) throw new Error('Valor inválido')
    const field = { debito: 'debito', credito: null, va: 'va', dinheiro: 'dinheiro' }[type]

    if (type === 'credito') {
      // acréscimo de saldo em crédito = aumenta o limite total do cartão
      const newLimit = Number(balances.credit_limit_total) + val
      const { error } = await supabase.from('balances').update({ credit_limit_total: newLimit, updated_at: new Date().toISOString() }).eq('user_id', user.id)
      if (error) throw error
    } else {
      const newVal = Number(balances[field]) + val
      const { error } = await supabase.from('balances').update({ [field]: newVal, updated_at: new Date().toISOString() }).eq('user_id', user.id)
      if (error) throw error
    }

    await supabase.from('transactions').insert({
      user_id: user.id,
      kind: 'entrada',
      // payment_method fica null para aumento de limite de crédito de propósito:
      // isso NÃO é dinheiro real movimentado em conta (ver bug #4 corrigido no
      // Dashboard, que soma apenas transações com payment_method 'dinheiro'/'debito').
      payment_method: type === 'credito' ? null : type,
      amount: val,
      description: type === 'credito' ? 'Aumento de limite de crédito' : 'Adição de saldo',
      observacao: observacao || '',
      origem: 'manual'
    })

    await loadAll()
  }

  async function transferDinheiroToDebito(amount) {
    const val = Number(amount)
    if (!val || val <= 0) throw new Error('Valor inválido')
    if (val > Number(balances.dinheiro)) throw new Error('Saldo em dinheiro insuficiente')

    const { error } = await supabase.from('balances').update({
      dinheiro: Number(balances.dinheiro) - val,
      debito: Number(balances.debito) + val,
      updated_at: new Date().toISOString()
    }).eq('user_id', user.id)
    if (error) throw error

    await supabase.from('transactions').insert({
      user_id: user.id,
      kind: 'transferencia',
      payment_method: 'dinheiro',
      amount: val,
      description: 'Depósito: Dinheiro → Débito',
      origem: 'manual'
    })

    await loadAll()
  }

  // ------------------------------------------------------------------
  // GASTOS (débito / dinheiro / VA / crédito)
  // ------------------------------------------------------------------
  async function addExpense({ amount, paymentMethod, description, tag, occurredAt, origem = 'manual', installmentsCount = 1 }) {
    const val = Number(amount)
    if (!val || val <= 0) throw new Error('Valor inválido')
    const when = occurredAt ? new Date(occurredAt) : new Date()

    if (paymentMethod === 'credito') {
      return addCreditPurchase({ description, totalValue: val, installmentsCount, tag, purchaseDate: when, origem })
    }

    const field = paymentMethod // 'debito' | 'dinheiro' | 'va'
    const currentVal = Number(balances[field])
    const newVal = currentVal - val
    const { error } = await supabase.from('balances').update({ [field]: newVal, updated_at: new Date().toISOString() }).eq('user_id', user.id)
    if (error) throw error

    const { error: txErr } = await supabase.from('transactions').insert({
      user_id: user.id,
      kind: 'gasto',
      payment_method: paymentMethod,
      amount: val,
      description: description || 'Gasto',
      tag: tag || 'necessario',
      origem,
      occurred_at: when.toISOString()
    })
    if (txErr) throw txErr

    await loadAll()
  }

  // ------------------------------------------------------------------
  // RECEITAS (débito / dinheiro / VA) — usado pelo Dashboard e pelo Chat
  // ------------------------------------------------------------------
  async function addIncome({ amount, paymentMethod, description, occurredAt, origem = 'manual' }) {
    const val = Number(amount)
    if (!val || val <= 0) throw new Error('Valor inválido')
    if (!['debito', 'dinheiro', 'va'].includes(paymentMethod)) {
      throw new Error('Forma de recebimento inválida')
    }
    const when = occurredAt ? new Date(occurredAt) : new Date()

    const field = paymentMethod
    const newVal = Number(balances[field]) + val
    const { error } = await supabase.from('balances').update({
      [field]: newVal,
      updated_at: new Date().toISOString()
    }).eq('user_id', user.id)
    if (error) throw error

    const { error: txErr } = await supabase.from('transactions').insert({
      user_id: user.id,
      kind: 'entrada',
      payment_method: paymentMethod,
      amount: val,
      description: description || 'Recebimento',
      origem,
      occurred_at: when.toISOString()
    })
    if (txErr) throw txErr

    await loadAll()
  }

  // ------------------------------------------------------------------
  // CARTÃO DE CRÉDITO
  // ------------------------------------------------------------------
  async function updateCreditCardSettings(closingDay, dueDay) {
    const { error } = await supabase.from('credit_card_settings').upsert({
      user_id: user.id, closing_day: closingDay, due_day: dueDay, updated_at: new Date().toISOString()
    })
    if (error) throw error
    await loadAll()
  }

  async function addCreditPurchase({ description, totalValue, installmentsCount, tag, purchaseDate, origem = 'manual' }) {
    const total = Number(totalValue)
    const n = Math.max(1, parseInt(installmentsCount || 1))
    if (!total || total <= 0) throw new Error('Valor inválido')

    const available = creditLimitAvailable
    if (total > available) {
      throw new Error('Limite de crédito insuficiente para essa compra.')
    }

    const installmentValue = Math.round((total / n) * 100) / 100
    const lastAdjust = Math.round((total - installmentValue * (n - 1)) * 100) / 100

    const { data: purchase, error } = await supabase.from('credit_purchases').insert({
      user_id: user.id,
      description: description || 'Compra no crédito',
      total_value: total,
      installments_count: n,
      installment_value: installmentValue,
      tag: tag || 'necessario',
      purchase_date: new Date(purchaseDate || Date.now()).toISOString().slice(0, 10)
    }).select().single()
    if (error) throw error

    // Correção bug #3: usa a data de fechamento real para decidir a fatura.
    const firstInvoiceMonth = getInvoiceMonth(purchaseDate || Date.now(), ccSettings.closing_day)
    const rows = []
    for (let i = 0; i < n; i++) {
      rows.push({
        purchase_id: purchase.id,
        user_id: user.id,
        installment_number: i + 1,
        invoice_month: monthKey(addMonths(firstInvoiceMonth, i)),
        value: i === n - 1 ? lastAdjust : installmentValue
      })
    }
    const { error: instErr } = await supabase.from('credit_installments').insert(rows)
    if (instErr) throw instErr

    await supabase.from('transactions').insert({
      user_id: user.id,
      kind: 'gasto',
      payment_method: 'credito',
      amount: total,
      description: description || 'Compra no crédito',
      tag: tag || 'necessario',
      origem,
      occurred_at: new Date(purchaseDate || Date.now()).toISOString(),
      credit_purchase_id: purchase.id
    })

    await loadAll()
  }

  async function payInvoice({ invoiceMonth, amount, source }) {
    const val = Number(amount)
    if (!val || val <= 0) throw new Error('Valor inválido')
    if (source !== 'dinheiro' && source !== 'debito') throw new Error('Origem inválida')
    if (val > Number(balances[source])) throw new Error(`Saldo em ${source} insuficiente`)

    const { error } = await supabase.from('balances').update({
      [source]: Number(balances[source]) - val,
      updated_at: new Date().toISOString()
    }).eq('user_id', user.id)
    if (error) throw error

    const { error: payErr } = await supabase.from('invoice_payments').insert({
      user_id: user.id,
      invoice_month: monthKey(invoiceMonth),
      amount: val,
      payment_source: source
    })
    if (payErr) throw payErr

    await supabase.from('transactions').insert({
      user_id: user.id,
      kind: 'gasto',
      payment_method: source,
      amount: val,
      description: `Pagamento de fatura do cartão`,
      origem: 'manual'
    })

    await loadAll()
  }

  // ------------------------------------------------------------------
  // ESTORNO / CANCELAMENTO DE COMPRAS
  // ------------------------------------------------------------------
  async function cancelCreditPurchase(purchaseId) {
    const purchase = creditPurchases.find(p => p.id === purchaseId)
    if (!purchase) throw new Error('Compra não encontrada')
    if (purchase.canceled) throw new Error('Essa compra já foi estornada')

    const { error } = await supabase.from('credit_purchases')
      .update({ canceled: true, canceled_at: new Date().toISOString() })
      .eq('id', purchaseId)
    if (error) throw error

    const { error: instErr } = await supabase.from('credit_installments').delete().eq('purchase_id', purchaseId)
    if (instErr) throw instErr

    const { error: txErr } = await supabase.from('transactions')
      .update({ canceled: true, canceled_at: new Date().toISOString() })
      .eq('credit_purchase_id', purchaseId)
    if (txErr) throw txErr

    await loadAll()
  }

  async function cancelTransaction(transactionId) {
    const tx = transactions.find(t => t.id === transactionId)
    if (!tx) throw new Error('Transação não encontrada')
    if (tx.canceled) throw new Error('Essa transação já foi estornada')
    if (tx.kind !== 'gasto') throw new Error('Apenas gastos podem ser estornados')

    if (tx.payment_method === 'credito') {
      if (!tx.credit_purchase_id) throw new Error('Compra no crédito não localizada para estorno')
      return cancelCreditPurchase(tx.credit_purchase_id)
    }

    const field = tx.payment_method // 'debito' | 'dinheiro' | 'va'
    const newVal = Number(balances[field]) + Number(tx.amount)
    const { error } = await supabase.from('balances').update({ [field]: newVal, updated_at: new Date().toISOString() }).eq('user_id', user.id)
    if (error) throw error

    const { error: txErr } = await supabase.from('transactions')
      .update({ canceled: true, canceled_at: new Date().toISOString() })
      .eq('id', transactionId)
    if (txErr) throw txErr

    await loadAll()
  }

  // limite de crédito disponível = limite total - (parcelas totais lançadas - total pago em faturas)
  const creditLimitAvailable = useMemo(() => {
    if (!balances) return 0
    const totalInstallments = creditInstallments.reduce((s, i) => s + Number(i.value), 0)
    const totalPaid = invoicePayments.reduce((s, p) => s + Number(p.amount), 0)
    const used = Math.max(0, totalInstallments - totalPaid)
    return Math.max(0, Number(balances.credit_limit_total) - used)
  }, [balances, creditInstallments, invoicePayments])

  function invoiceForMonth(monthDate) {
    const mk = monthKey(monthDate)
    // Bug do "sumiço": i.invoice_month e p.invoice_month JÁ são strings no
    // formato canônico (gravadas via monthKey() no momento da compra/
    // pagamento). Rodar monthKey() de novo em cima delas força um reparse
    // ('new Date("2026-08")'), que o JS interpreta como UTC — em fusos
    // negativos (Brasil) isso "recua" um dia e pode trocar o mês inteiro.
    // Comparação direta de string com string evita esse round-trip.
    const items = creditInstallments.filter(i => i.invoice_month === mk)
    const totalDue = items.reduce((s, i) => s + Number(i.value), 0)
    const paid = invoicePayments.filter(p => p.invoice_month === mk).reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Math.max(0, Math.round((totalDue - paid) * 100) / 100)
    const purchasesInMonth = items.map(i => {
      const purchase = creditPurchases.find(p => p.id === i.purchase_id)
      return { ...i, purchase }
    })
    return { monthKey: mk, totalDue, paid, remaining, items: purchasesInMonth, isPaid: totalDue > 0 && remaining <= 0.005 }
  }

  // renda comprometida: soma de parcelas em meses futuros (a partir do mês atual, exclusive) ainda não quitadas
  const committedFuture = useMemo(() => {
    const now = firstOfMonth(new Date())
    let total = 0
    // i.invoice_month já é a string canônica — usar direto, sem reparse.
    const monthsSeen = new Set(creditInstallments.map(i => i.invoice_month))
    for (const mk of monthsSeen) {
      if (!mk) continue
      const [y, m] = mk.split('-').map(Number)
      const monthDate = new Date(y, (m || 1) - 1, 1) // parse local, sem UTC
      if (monthDate > now) {
        const inv = invoiceForMonth(monthDate)
        total += inv.remaining
      }
    }
    return Math.round(total * 100) / 100
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditInstallments, invoicePayments])

  // ------------------------------------------------------------------
  // DEVEDORES
  // ------------------------------------------------------------------
  async function addDebtor({ name, originalValue, hasInterest, interestRate, loanDate, expectedPaymentDate, observation }) {
    const val = Number(originalValue)
    const { data, error } = await supabase.from('debtors').insert({
      user_id: user.id,
      name,
      original_value: val,
      current_value: val,
      has_interest: !!hasInterest,
      interest_rate: hasInterest ? Number(interestRate) : 0,
      loan_date: loanDate || new Date().toISOString().slice(0, 10),
      expected_payment_date: expectedPaymentDate || null,
      observation: observation || ''
    }).select().single()
    if (error) throw error

    await supabase.from('debtor_transactions').insert({
      debtor_id: data.id, user_id: user.id, kind: 'emprestimo', amount: val, note: 'Empréstimo concedido'
    })

    await loadAll()
    return data
  }

  async function applyInterest(debtorId) {
    const debtor = debtors.find(d => d.id === debtorId)
    if (!debtor || !debtor.has_interest) throw new Error('Devedor sem juros configurados')
    const jurosVal = Math.round(Number(debtor.current_value) * (Number(debtor.interest_rate) / 100) * 100) / 100
    const newVal = Number(debtor.current_value) + jurosVal

    const { error } = await supabase.from('debtors').update({ current_value: newVal }).eq('id', debtorId)
    if (error) throw error

    await supabase.from('debtor_transactions').insert({
      debtor_id: debtorId, user_id: user.id, kind: 'juros', amount: jurosVal, note: `Juros de ${debtor.interest_rate}% aplicados`
    })

    await loadAll()
  }

  // Registra um pagamento (parcial ou total) de um devedor.
  // Correção bug #1: agora, além de atualizar o saldo, também lança a
  // transação no Extrato Geral como ENTRADA (respeitando dinheiro/débito),
  // com o nome fixo "Recebimento Empréstimo". Também permite definir uma
  // nova previsão de pagamento para o saldo restante, quando o pagamento
  // for parcial.
  async function amortizeDebt(debtorId, amount, destinationWallet, note, newExpectedDate) {
    const val = Number(amount)
    const debtor = debtors.find(d => d.id === debtorId)
    if (!debtor) throw new Error('Devedor não encontrado')
    if (!val || val <= 0) throw new Error('Valor inválido')
    if (destinationWallet !== 'dinheiro' && destinationWallet !== 'debito') {
      throw new Error('Recebimento de dívida só pode ser em dinheiro ou débito')
    }

    const newVal = Math.max(0, Math.round((Number(debtor.current_value) - val) * 100) / 100)

    const debtorUpdate = { current_value: newVal }
    if (newVal > 0) {
      // pagamento parcial: se o usuário informou uma nova previsão, atualiza
      debtorUpdate.expected_payment_date = newExpectedDate || debtor.expected_payment_date || null
    } else {
      // dívida quitada: não faz mais sentido manter previsão de pagamento
      debtorUpdate.expected_payment_date = null
    }

    const { error } = await supabase.from('debtors').update(debtorUpdate).eq('id', debtorId)
    if (error) throw error

    const { error: field } = await supabase.from('balances').update({
      [destinationWallet]: Number(balances[destinationWallet]) + val,
      updated_at: new Date().toISOString()
    }).eq('user_id', user.id)
    if (field) throw field

    await supabase.from('debtor_transactions').insert({
      debtor_id: debtorId, user_id: user.id, kind: 'pagamento', amount: val, destination_wallet: destinationWallet, note: note || ''
    })

    // Correção bug #1: reflete o recebimento no Extrato Geral como entrada real.
    const { error: txErr } = await supabase.from('transactions').insert({
      user_id: user.id,
      kind: 'entrada',
      payment_method: destinationWallet,
      amount: val,
      description: 'Recebimento Empréstimo',
      observacao: note || '',
      origem: 'devedor'
    })
    if (txErr) throw txErr

    await loadAll()
  }

  // Soma um novo valor à dívida já existente de um devedor (ex: cliente fez
  // um novo serviço/fiado antes de quitar o anterior). Atualiza tanto o
  // valor original quanto o valor atual devido, e registra no histórico.
  async function increaseDebt(debtorId, amount, note) {
    const val = Number(amount)
    if (!val || val <= 0) throw new Error('Valor inválido')
    const debtor = debtors.find(d => d.id === debtorId)
    if (!debtor) throw new Error('Devedor não encontrado')

    const newCurrent = Math.round((Number(debtor.current_value) + val) * 100) / 100
    const newOriginal = Math.round((Number(debtor.original_value) + val) * 100) / 100

    const { error } = await supabase.from('debtors')
      .update({ current_value: newCurrent, original_value: newOriginal })
      .eq('id', debtorId)
    if (error) throw error

    await supabase.from('debtor_transactions').insert({
      debtor_id: debtorId, user_id: user.id, kind: 'emprestimo', amount: val, note: note || 'Novo valor somado à dívida'
    })

    await loadAll()
  }

  async function deleteDebtor(debtorId) {
    const { error } = await supabase.from('debtors').delete().eq('id', debtorId)
    if (error) throw error
    await loadAll()
  }

  // ------------------------------------------------------------------
  // METAS (correção bug #2: múltiplas metas simultâneas)
  // ------------------------------------------------------------------
  // Antes o setGoal fazia upsert em (user_id, period, reference_start), o
  // que impedia coexistir mais de uma meta ativa por período. Agora cada
  // chamada cria uma nova meta independente, com descrição obrigatória e
  // flag "active" para permitir "Interromper" sem apagar o histórico.
  //
  // ATENÇÃO (migração necessária no Supabase):
  //   - adicionar coluna `description text not null default ''`
  //   - adicionar coluna `active boolean not null default true`
  //   - remover a constraint única antiga em (user_id, period, reference_start),
  //     caso exista, pois agora podem existir várias metas com o mesmo período.
  async function setGoal(period, description, amount, referenceStart) {
    if (!description || !description.trim()) throw new Error('Descrição da meta é obrigatória')
    const { error } = await supabase.from('goals').insert({
      user_id: user.id,
      period,
      description: description.trim(),
      amount: Number(amount),
      reference_start: referenceStart,
      active: true
    })
    if (error) throw error
    await loadAll()
  }

  async function stopGoal(goalId) {
    const { error } = await supabase.from('goals').update({ active: false }).eq('id', goalId)
    if (error) throw error
    await loadAll()
  }

  // Reativa uma meta antiga (active = false → true) e reseta o ciclo: a
  // janela rolante de 7/30 dias passa a contar do zero a partir de agora
  // (reference_start = referenceStartISO, ou "agora" se não informado).
  // A trava contra duas metas ativas do mesmo período (mensal/semanal) é
  // responsabilidade do frontend (Reports.jsx), checada ANTES de chamar
  // esta função — aqui fazemos apenas o UPDATE.
  async function reactivateGoal(goalId, referenceStartISO) {
    const goal = goals.find(g => g.id === goalId)
    if (!goal) throw new Error('Meta não encontrada')
    const { error } = await supabase.from('goals').update({
      active: true,
      reference_start: referenceStartISO || new Date().toISOString()
    }).eq('id', goalId)
    if (error) throw error
    await loadAll()
  }

  async function deleteGoal(goalId) {
    const { error } = await supabase.from('goals').delete().eq('id', goalId)
    if (error) throw error
    await loadAll()
  }

  // ------------------------------------------------------------------
  const saldoTotal = balances ? Number(balances.debito) + Number(balances.dinheiro) : 0

  const value = {
    loading, balances, ccSettings, transactions, creditPurchases, creditInstallments,
    invoicePayments, debtors, debtorTransactions, goals,
    saldoTotal, creditLimitAvailable, committedFuture,
    loadAll, addBalance, transferDinheiroToDebito, addExpense, addIncome,
    updateCreditCardSettings, addCreditPurchase, payInvoice, invoiceForMonth,
    addDebtor, applyInterest, amortizeDebt, increaseDebt, deleteDebtor,
    setGoal, stopGoal, reactivateGoal, deleteGoal,
    cancelTransaction, cancelCreditPurchase,
    getInvoiceMonthForPurchase: getInvoiceMonth
  }

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}

export function useFinance() {
  return useContext(FinanceContext)
}
