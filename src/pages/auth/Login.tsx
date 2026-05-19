import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const { signIn, role, noProfile, session, signOut } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]         = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

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
    setLoading(false)
  }

  // Redireciona após login bem-sucedido
  useEffect(() => {
    if (!role) return
    if (role === 'admin') navigate('/admin')
    else navigate('/dashboard')
  }, [role, navigate])

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { setError('Erro ao iniciar login com Google.'); setGoogleLoading(false) }
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

            {/* Sem perfil vinculado (ex: conta Google não cadastrada) */}
            {noProfile && session && (
              <div
                className="flex flex-col gap-2 px-3.5 py-3 rounded-xl text-xs mb-4"
                style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', color: '#f87171' }}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-semibold">Conta sem acesso</span>
                </div>
                <p style={{ color: 'rgba(248,113,113,0.8)' }}>
                  O e-mail <strong>{session.user.email}</strong> não está vinculado a nenhuma organização. Fale com o administrador.
                </p>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="text-left underline mt-0.5"
                  style={{ color: 'rgba(248,113,113,0.7)' }}
                >
                  Sair e tentar outra conta
                </button>
              </div>
            )}

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

                {/* Divisor */}
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>ou</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />
                </div>

                {/* Botão Google */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    color: '#fff',
                  }}
                  onMouseEnter={e => { if (!googleLoading) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)' }}
                  onMouseLeave={e => { if (!googleLoading) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                >
                  {googleLoading
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <>
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span>Entrar com Google</span>
                      </>
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
