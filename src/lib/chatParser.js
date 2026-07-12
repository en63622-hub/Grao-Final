// ============================================================
// Parser 100% Regex (sem IA) para lançamentos digitados no chat.
// Extrai: tipo (gasto/entrada), valor, forma de pagamento, parcelas, descrição.
// Ex: "50 no mercado no débito" | "gastei R$ 23,90 de uber no crédito"
//     "gastei 100 no crédito em 5x" | "recebi um salário de 1500 no débito"
//     "ganhei 50 da minha tia em dinheiro" | "recebi um pix de 399"
// ============================================================

// Nota: a ramificação "com separador de milhar" exige ao menos 1 grupo ".xxx" (usa "+" em vez de "*").
// Isso evita que números de 4+ dígitos sem pontuação (ex: 1500, 3000) sejam truncados para 3 dígitos.
const VALUE_REGEX = /(?:r\$|rs|reais|conto[s]?)?\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:reais|conto[s]?)?/i

// Parcelas: "em 5x", "5x", "5 vezes", "em 5 vezes", "5 parcelas", "parcelado em 5"
const INSTALLMENTS_REGEX = /\b(?:em\s+)?(\d{1,2})\s*(?:x\b|vezes\b|parcelas\b)|\bparcel(?:ado|ada)\s+em\s+(\d{1,2})\b/i

// Recebimento de dinheiro (entrada) vs gasto
const INCOME_REGEX = /\b(recebi|receber|ganhei|ganhar|caiu|entrou|sal[áa]rio)\b/i

// Pix: sempre cai no Débito automaticamente
const PIX_REGEX = /\bpix\b/i

const PAYMENT_PATTERNS = [
  { key: 'debito', regex: /\bd[ée]bito\b/i },
  { key: 'credito', regex: /\bcr[ée]dito\b/i },
  { key: 'va', regex: /\b(va|vr|alimenta[çc][ãa]o|refei[çc][ãa]o)\b/i },
  { key: 'dinheiro', regex: /\bdinheiro\b|\bem esp[ée]cie\b/i }
]

const FILLER_WORDS = /\b(gastei|gasto|comprei|paguei|recebi|receber|ganhei|ganhar|caiu|entrou|de|do|da|no|na|em|com|foi|um|uma|reais|conto|contos|r\$|rs)\b/gi

export function parseChatMessage(text) {
  const raw = text.trim()
  const result = { kind: 'gasto', amount: null, paymentMethod: null, installments: 1, description: '', missing: [] }

  // ---- tipo: gasto ou entrada (recebimento) ----
  if (INCOME_REGEX.test(raw)) result.kind = 'entrada'

  // ---- valor ----
  const valueMatch = raw.match(VALUE_REGEX)
  if (valueMatch) {
    let numStr = valueMatch[1]
    // normaliza "1.234,56" -> 1234.56  |  "23,90" -> 23.90 | "50" -> 50
    if (numStr.includes(',')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.')
    } else if ((numStr.match(/\./g) || []).length > 1) {
      numStr = numStr.replace(/\./g, '')
    }
    const parsed = parseFloat(numStr)
    if (!isNaN(parsed)) result.amount = parsed
  }
  if (result.amount === null) result.missing.push('amount')

  // ---- parcelas (só relevante para crédito, mas tentamos capturar sempre) ----
  const instMatch = raw.match(INSTALLMENTS_REGEX)
  if (instMatch) {
    const n = parseInt(instMatch[1] || instMatch[2], 10)
    if (n && n > 1) result.installments = n
  }

  // ---- forma de pagamento ----
  const pixDetected = PIX_REGEX.test(raw)
  for (const p of PAYMENT_PATTERNS) {
    if (p.regex.test(raw)) {
      result.paymentMethod = p.key
      break
    }
  }
  // Pix cai automaticamente no Débito quando não há outra forma de pagamento explícita
  if (!result.paymentMethod && pixDetected) result.paymentMethod = 'debito'
  if (!result.paymentMethod) result.missing.push('paymentMethod')

  // ---- descrição: remove o trecho do valor, parcelas, forma de pagamento e conectores ----
  let desc = raw
  if (valueMatch) desc = desc.replace(valueMatch[0], ' ')
  if (instMatch) desc = desc.replace(instMatch[0], ' ')
  for (const p of PAYMENT_PATTERNS) desc = desc.replace(p.regex, ' ')
  desc = desc.replace(PIX_REGEX, ' ')
  desc = desc.replace(FILLER_WORDS, ' ').replace(/\s+/g, ' ').trim()
  if (!desc && result.kind === 'entrada') {
    desc = pixDetected ? 'Pix recebido' : 'Recebimento'
  }
  result.description = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : ''
  if (!result.description) result.missing.push('description')

  return result
}

export const FALLBACK_QUESTIONS = {
  amount: 'Não entendi o valor 💬 Qual foi o valor gasto?',
  paymentMethod: 'Em qual forma de pagamento? (débito, crédito, VA ou dinheiro)',
  description: 'Me conta rapidinho o que foi esse gasto?'
}

export const PAYMENT_LABELS = {
  debito: 'Débito',
  credito: 'Crédito',
  va: 'VA/Alimentação',
  dinheiro: 'Dinheiro'
}
