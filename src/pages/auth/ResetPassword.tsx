import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, ArrowRight, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null)
  const [ready, setReady]       = useState(false)

  useEffect(() => {
    // Supabase injeta a sessão automaticamente a partir do hash #access_token
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setMsg({ ok: false, text: 'As senhas não coincidem.' }); return }
    if (password.length < 6)  { setMsg({ ok: false, text: 'A senha deve ter pelo menos 6 caracteres.' }); return }

    setLoading(true)
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setMsg({ ok: false, text: 'Erro ao atualizar a senha. Tente solicitar um novo link.' })
    } else {
      setMsg({ ok: true, text: 'Senha atualizada com sucesso!' })
      setTimeout(() => navigate('/login'), 2000)
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
                Nova senha
              </h1>
              <p className="text-sm mt-1" style={{ color: '#98a2b3' }}>
                Defina sua nova senha de acesso
              </p>
            </div>

            {!ready ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin mx-auto" />
                <p className="text-xs" style={{ color: '#98a2b3' }}>Verificando link de recuperação...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#475467' }}>
                    Nova senha
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required autoFocus
                      className="input-dark w-full px-4 py-2.5 text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: '#d0d5dd' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#98a2b3')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#d0d5dd')}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: '#475467' }}>
                    Confirmar senha
                  </label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    placeholder="Repita a senha"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    className="input-dark w-full px-4 py-2.5 text-sm"
                  />
                </div>

                {msg && (
                  <div
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-medium"
                    style={msg.ok
                      ? { background: '#f0fdf4', border: '1px solid #b3d4ec', color: '#2570a0' }
                      : { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }
                    }
                  >
                    {msg.ok
                      ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      : <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    }
                    {msg.text}
                  </div>
                )}

                {!msg?.ok && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm mt-1"
                  >
                    {loading
                      ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <><span>Salvar nova senha</span><ArrowRight className="w-4 h-4" /></>
                    }
                  </button>
                )}
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
