import React, { useState } from 'react'
import Modal from './Modal'
import { useFinance } from '../context/FinanceContext'

const TYPES = [
  { key: 'debito', label: 'Débito' },
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'va', label: 'VA/Alimentação' },
  { key: 'credito', label: 'Limite de Crédito' }
]

export default function AddBalanceModal({ open, onClose }) {
  const { addBalance } = useFinance()
  const [type, setType] = useState('debito')
  const [amount, setAmount] = useState('')
  const [obs, setObs] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await addBalance(type, amount.replace(',', '.'), obs)
      setAmount(''); setObs(''); setType('debito')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar saldo">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate2 mb-2 block">Tipo de saldo</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(t => (
              <button
                type="button" key={t.key} onClick={() => setType(t.key)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  type === t.key ? 'bg-moss-700 text-paper border-moss-700' : 'bg-white border-moss-200 text-ink'
                }`}
              >{t.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Valor</label>
          <input
            required inputMode="decimal" placeholder="0,00" value={amount}
            onChange={e => setAmount(e.target.value)} className="input-field"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate2 mb-1 block">Observação (opcional)</label>
          <input
            placeholder="Ex: Rendimentos PicPay" value={obs}
            onChange={e => setObs(e.target.value)} className="input-field"
          />
        </div>

        {error && <p className="text-rose text-sm">{error}</p>}

        <button disabled={saving} className="btn-primary w-full">{saving ? 'Salvando…' : 'Adicionar'}</button>
      </form>
    </Modal>
  )
}
