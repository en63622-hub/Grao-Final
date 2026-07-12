import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setInfo(''); setLoading(true)
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) throw error
      } else {
        const { error } = await signUp(email, password)
        if (error) throw error
        setInfo('Conta criada! Verifique seu e-mail para confirmar (se exigido) e faça login.')
        setMode('signin')
      }
    } catch (err) {
      setError(err.message || 'Algo deu errado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 bg-gradient-to-b from-moss-900 to-ink text-paper">
      <div className="max-w-sm mx-auto w-full">
        <div className="mb-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-moss-400 mx-auto mb-4 flex items-center justify-center text-2xl">🌾</div>
          <h1 className="font-display text-3xl">Grão</h1>
          <p className="text-moss-200/80 mt-1 text-sm">Suas finanças, cultivadas com clareza.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email" required placeholder="E-mail" value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-moss-300"
          />
          <input
            type="password" required placeholder="Senha" value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-moss-300"
          />
          {error && <p className="text-rose text-sm bg-rose/10 rounded-lg px-3 py-2">{error}</p>}
          {info && <p className="text-moss-200 text-sm bg-white/5 rounded-lg px-3 py-2">{info}</p>}
          <button disabled={loading} className="w-full rounded-full bg-moss-400 text-ink font-semibold py-3 mt-2 active:scale-[0.98] transition-transform disabled:opacity-50">
            {loading ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo('') }}
          className="w-full text-center text-moss-200/80 text-sm mt-5 underline underline-offset-4"
        >
          {mode === 'signin' ? 'Não tem conta? Criar agora' : 'Já tenho conta, entrar'}
        </button>
      </div>
    </div>
  )
}
