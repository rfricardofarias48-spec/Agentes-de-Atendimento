import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
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
      style={{ background: '#f0f2f5' }}
    >
      <div className="relative w-full max-w-[380px]">

        {/* Card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: '#141414',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          }}
        >
          {/* Logo area inside card */}
          <div className="flex justify-center pt-8 pb-6">
            <img
              src="https://ik.imagekit.io/xsbrdnr0y/Logo%20sem%20fundo.png"
              alt="Gestor"
              className="h-28 w-auto object-contain"
            />
          </div>

          {/* Divider */}
          <div className="mx-8 mb-6" style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }} />

          <div className="px-8 pb-8">

            <h2 className="text-base font-semibold text-white mb-1">
              {forgotMode ? 'Recuperar senha' : 'Entrar na sua conta'}
            </h2>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {forgotMode ? 'Enviaremos um link para seu e-mail.' : 'Bem-vindo de volta.'}
            </p>

            {/* ── LOGIN ── */}
            {!forgotMode && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5 uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    E-mail
                  </label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required autoFocus
                    className="w-full px-4 py-2.5 text-sm rounded-xl outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      color: '#fff',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(44,130,181,0.6)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotMsg(null) }}
                      className="text-[11px] font-medium transition-colors"
                      style={{ color: 'rgba(44,130,181,0.8)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#2C82B5')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(44,130,181,0.8)')}
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
                    className="w-full px-4 py-2.5 text-sm rounded-xl outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      color: '#fff',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(44,130,181,0.6)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}
                  />
                </div>

                {error && (
                  <div
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium"
                    style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', color: '#f87171' }}
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-all mt-1 disabled:opacity-50"
                  style={{ background: '#2C82B5', color: '#fff' }}
                  onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#2570a0' }}
                  onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#2C82B5' }}
                >
                  {loading
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><span>Entrar</span><ArrowRight className="w-4 h-4" /></>
                  }
                </button>
              </form>
            )}

            {/* ── FORGOT PASSWORD ── */}
            {forgotMode && (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5 uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Seu e-mail
                  </label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required autoFocus
                    className="w-full px-4 py-2.5 text-sm rounded-xl outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      color: '#fff',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(44,130,181,0.6)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}
                  />
                </div>

                {forgotMsg && (
                  <div
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium"
                    style={forgotMsg.ok
                      ? { background: 'rgba(44,130,181,0.12)', border: '1px solid rgba(44,130,181,0.25)', color: '#7ec8e3' }
                      : { background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', color: '#f87171' }
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
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
                    style={{ background: '#2C82B5', color: '#fff' }}
                    onMouseEnter={e => { if (!forgotLoading) (e.currentTarget as HTMLElement).style.background = '#2570a0' }}
                    onMouseLeave={e => { if (!forgotLoading) (e.currentTarget as HTMLElement).style.background = '#2C82B5' }}
                  >
                    {forgotLoading
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <><span>Enviar link</span><ArrowRight className="w-4 h-4" /></>
                    }
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setForgotMsg(null) }}
                  className="w-full text-center text-xs font-medium transition-colors py-1"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                >
                  ← Voltar ao login
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] mt-5" style={{ color: '#b0b8c4' }}>
          Gestor © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
