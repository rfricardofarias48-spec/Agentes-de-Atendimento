import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, ArrowRight, AlertCircle } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

export default function Login() {
  const { signIn, role } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)

    if (error) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }

    setTimeout(() => {
      if (role === 'admin') navigate('/admin')
      else navigate('/dashboard')
      setLoading(false)
    }, 500)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden dot-grid"
      style={{ background: 'var(--c-bg)' }}
    >
      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '30%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 640,
          height: 360,
          background: 'radial-gradient(ellipse, rgba(16,185,129,0.12) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-[360px] mx-4 animate-scale-in">
        {/* Card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: '#0c0e1a',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {/* Top accent line */}
          <div
            className="h-px w-full"
            style={{ background: 'linear-gradient(90deg, transparent 0%, #10b981 50%, transparent 100%)' }}
          />

          <div className="px-8 py-9">
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: 'linear-gradient(135deg,#10b981,#059669)',
                  boxShadow: '0 0 28px rgba(16,185,129,0.45)',
                }}
              >
                <Bot className="w-5 h-5 text-white" />
              </div>
              <h1 className="font-display text-[22px] font-bold text-white tracking-tight">
                AgenteClin
              </h1>
              <p className="text-xs text-slate-600 font-body mt-1">
                Painel de controle
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 font-body">
                  E-mail
                </label>
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="input-dark w-full px-4 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 font-body">
                  Senha
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="input-dark w-full px-4 py-2.5 text-sm"
                />
              </div>

              {error && (
                <div
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-body font-medium text-red-400"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.14)' }}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm mt-1"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-slate-700 mt-5 font-body">
          AgenteClin © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
