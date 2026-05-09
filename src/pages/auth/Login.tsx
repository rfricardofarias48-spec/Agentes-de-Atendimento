import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const { signIn, role } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg, setForgotMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) { setError('E-mail ou senha incorretos.'); setLoading(false); return }
    setTimeout(() => {
      if (role === 'admin') navigate('/admin')
      else navigate('/dashboard')
      setLoading(false)
    }, 500)
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setForgotMsg(null)
    setForgotLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setForgotLoading(false)
    if (error) {
      setForgotMsg({ ok: false, text: 'Erro ao enviar e-mail. Verifique o endereço.' })
    } else {
      setForgotMsg({ ok: true, text: 'E-mail enviado! Verifique sua caixa de entrada.' })
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--c-bg)' }}
    >
      <div className="w-full max-w-[360px] animate-scale-in">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: '#ffffff',
            border: '1px solid #e4e7ec',
            boxShadow: '0 4px 24px rgba(16,24,40,0.08), 0 1px 4px rgba(16,24,40,0.04)',
          }}
        >
          <div className="px-8 py-9">
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ background: '#2C82B5', boxShadow: '0 4px 12px rgba(44,130,181,0.3)' }}
              >
                <Bot className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: '#101828' }}>
                AgenteClin
              </h1>
              <p className="text-sm mt-1" style={{ color: '#98a2b3' }}>
                {forgotMode ? 'Recuperação de senha' : 'Painel de controle'}
              </p>
            </div>

            {/* ── LOGIN ── */}
            {!forgotMode && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#475467' }}>
                    E-mail
                  </label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required autoFocus
                    className="input-dark w-full px-4 py-2.5 text-sm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: '#475467' }}>
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotMsg(null) }}
                      className="text-xs font-medium transition-colors"
                      style={{ color: '#2C82B5' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#2570a0')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#2C82B5')}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
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
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-medium"
                    style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
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
                  {loading
                    ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <><span>Entrar</span><ArrowRight className="w-4 h-4" /></>
                  }
                </button>
              </form>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {forgotMode && (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#475467' }}>
                    Seu e-mail
                  </label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required autoFocus
                    className="input-dark w-full px-4 py-2.5 text-sm"
                  />
                </div>

                <p className="text-xs" style={{ color: '#98a2b3' }}>
                  Enviaremos um link para redefinir sua senha.
                </p>

                {forgotMsg && (
                  <div
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-medium"
                    style={forgotMsg.ok
                      ? { background: '#f0fdf4', border: '1px solid #b3d4ec', color: '#2570a0' }
                      : { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }
                    }
                  >
                    {forgotMsg.ok
                      ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      : <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    }
                    {forgotMsg.text}
                  </div>
                )}

                {!forgotMsg?.ok && (
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm"
                  >
                    {forgotLoading
                      ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><span>Enviar link</span><ArrowRight className="w-4 h-4" /></>
                    }
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setForgotMsg(null) }}
                  className="w-full text-center text-xs font-medium transition-colors"
                  style={{ color: '#98a2b3' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#344054')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#98a2b3')}
                >
                  ← Voltar ao login
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: '#d0d5dd' }}>
          AgenteClin © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
