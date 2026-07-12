import React, { useEffect, useRef, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { parseChatMessage, FALLBACK_QUESTIONS, PAYMENT_LABELS } from '../lib/chatParser'
import { formatCurrency } from '../lib/dateUtils'

const TAGS = [
  { key: 'urgente', label: 'Urgente' },
  { key: 'necessario', label: 'Necessário' },
  { key: 'futil', label: 'Fútil' }
]

const PAYMENT_QUICK = [
  { key: 'debito', label: 'Débito' },
  { key: 'credito', label: 'Crédito' },
  { key: 'va', label: 'VA' },
  { key: 'dinheiro', label: 'Dinheiro' }
]

let idCounter = 0
function makeId() { idCounter += 1; return `m${idCounter}-${Date.now()}` }

export default function Chat() {
  const { addExpense, addIncome } = useFinance()
  const [messages, setMessages] = useState([
    { id: makeId(), from: 'bot', text: 'Oi! Me conta seu gasto ou recebimento. Ex: "50 no mercado no débito", "gastei 300 no crédito em 3x" ou "recebi um pix de 200".' }
  ])
  const [pending, setPending] = useState(null) // { amount, paymentMethod, description, missing: [] }
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages])

  function pushBot(text) { setMessages(m => [...m, { id: makeId(), from: 'bot', text }]) }
  function pushUser(text) { setMessages(m => [...m, { id: makeId(), from: 'user', text }]) }

  function askForNextMissing(state) {
    const nextMissing = state.missing[0]
    pushBot(FALLBACK_QUESTIONS[nextMissing])
  }

  function handleSend(e) {
    e?.preventDefault()
    const text = input.trim()
    if (!text) return
    pushUser(text)
    setInput('')

    if (pending && pending.missing.length > 0) {
      // resposta de complemento a um campo específico
      const field = pending.missing[0]
      const updated = { ...pending }
      if (field === 'amount') {
        const m = text.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/)
        if (m) updated.amount = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
      } else if (field === 'paymentMethod') {
        const parsed = parseChatMessage(text)
        if (parsed.paymentMethod) updated.paymentMethod = parsed.paymentMethod
        else {
          const lower = text.toLowerCase()
          if (lower.includes('deb')) updated.paymentMethod = 'debito'
          else if (lower.includes('cred')) updated.paymentMethod = 'credito'
          else if (lower.includes('va') || lower.includes('alim')) updated.paymentMethod = 'va'
          else if (lower.includes('dinh')) updated.paymentMethod = 'dinheiro'
        }
      } else if (field === 'description') {
        updated.description = text.charAt(0).toUpperCase() + text.slice(1)
      }
      updated.missing = updated.missing.filter(f => !(
        (f === 'amount' && updated.amount) ||
        (f === 'paymentMethod' && updated.paymentMethod) ||
        (f === 'description' && updated.description)
      ))
      setPending(updated)
      if (updated.missing.length > 0) {
        askForNextMissing(updated)
      } else {
        confirmSummary(updated)
      }
      return
    }

    // nova mensagem: parse completo
    const parsed = parseChatMessage(text)
    if (parsed.missing.length > 0) {
      setPending(parsed)
      askForNextMissing(parsed)
    } else {
      setPending(parsed)
      confirmSummary(parsed)
    }
  }

  function confirmSummary(state) {
    if (state.kind === 'entrada') {
      pushBot(`Entendi! Recebimento de ${formatCurrency(state.amount)} · ${PAYMENT_LABELS[state.paymentMethod]} · "${state.description}". Posso confirmar?`)
      return
    }
    const parcelasInfo = (state.paymentMethod === 'credito' && state.installments > 1)
      ? ` em ${state.installments}x de ${formatCurrency(state.amount / state.installments)}`
      : ''
    pushBot(`Beleza: ${formatCurrency(state.amount)}${parcelasInfo} · ${PAYMENT_LABELS[state.paymentMethod]} · "${state.description}". Qual a prioridade desse gasto?`)
  }

  function quickFillPayment(key) {
    if (!pending) return
    const updated = { ...pending, paymentMethod: key }
    updated.missing = updated.missing.filter(f => f !== 'paymentMethod')
    pushUser(PAYMENT_QUICK.find(p => p.key === key).label)
    setPending(updated)
    if (updated.missing.length > 0) askForNextMissing(updated)
    else confirmSummary(updated)
  }

  async function finalize(tag) {
    if (!pending) return
    pushUser(TAGS.find(t => t.key === tag).label)
    try {
      await addExpense({
        amount: pending.amount,
        paymentMethod: pending.paymentMethod,
        description: pending.description,
        tag,
        occurredAt: new Date(),
        origem: 'chat',
        installmentsCount: pending.installments || 1
      })
      const parcelasInfo = (pending.paymentMethod === 'credito' && pending.installments > 1) ? ` em ${pending.installments}x` : ''
      pushBot(`Lançado! ${formatCurrency(pending.amount)}${parcelasInfo} em ${pending.description}. 🌱`)
    } catch (err) {
      pushBot(`Não consegui lançar: ${err.message}`)
    }
    setPending(null)
  }

  async function finalizeIncome() {
    if (!pending) return
    pushUser('Confirmar')
    try {
      await addIncome({
        amount: pending.amount,
        paymentMethod: pending.paymentMethod,
        description: pending.description,
        occurredAt: new Date(),
        origem: 'chat'
      })
      pushBot(`Recebido! ${formatCurrency(pending.amount)} em ${pending.description}. 🌱`)
    } catch (err) {
      pushBot(`Não consegui lançar: ${err.message}`)
    }
    setPending(null)
  }

  const awaitingTag = pending && pending.missing.length === 0 && pending.kind === 'gasto'
  const awaitingIncomeConfirm = pending && pending.missing.length === 0 && pending.kind === 'entrada'

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] animate-rise">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-3">
        {messages.map(m => (
          <div key={m.id} className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            m.from === 'bot' ? 'bg-moss-50 text-ink rounded-bl-sm' : 'bg-moss-700 text-paper ml-auto rounded-br-sm'
          }`}>
            {m.text}
          </div>
        ))}

        {pending && pending.missing[0] === 'paymentMethod' && (
          <div className="flex flex-wrap gap-2">
            {PAYMENT_QUICK.map(p => (
              <button key={p.key} onClick={() => quickFillPayment(p.key)} className="rounded-full bg-white border border-moss-200 px-3 py-1.5 text-sm font-medium text-ink">{p.label}</button>
            ))}
          </div>
        )}

        {awaitingTag && (
          <div className="flex flex-wrap gap-2">
            {TAGS.map(t => (
              <button key={t.key} onClick={() => finalize(t.key)} className="rounded-full bg-white border border-moss-200 px-3 py-1.5 text-sm font-medium text-ink">{t.label}</button>
            ))}
          </div>
        )}

        {awaitingIncomeConfirm && (
          <div className="flex flex-wrap gap-2">
            <button onClick={finalizeIncome} className="rounded-full bg-moss-700 text-paper px-4 py-1.5 text-sm font-medium">✓ Confirmar</button>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 pt-2 border-t border-moss-100 bg-paper sticky bottom-0">
        <input
          value={input} onChange={e => setInput(e.target.value)}
          placeholder="Digite seu gasto…" className="input-field flex-1"
        />
        <button type="submit" className="btn-primary px-4 py-3">➤</button>
      </form>
    </div>
  )
}
