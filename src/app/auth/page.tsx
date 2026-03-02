'use client'

import { useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">

        <p className="text-gold font-heading font-bold text-xs uppercase tracking-widest text-center mb-10">
          Lucens
        </p>

        {sent ? (
          <div className="bg-white/10 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-4">✉</div>
            <p className="font-heading font-bold text-white text-lg mb-3">
              Vérifiez votre email
            </p>
            <p className="font-body text-white/60 text-sm leading-relaxed">
              Un lien de connexion a été envoyé à{' '}
              <span className="text-white font-semibold">{email}</span>.
            </p>
            <p className="font-body text-white/30 text-xs mt-4">
              Pensez à vérifier vos spams.
            </p>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h1 className="font-heading font-bold text-white text-xl mb-2">
              Connexion
            </h1>
            <p className="font-body text-white/50 text-sm mb-6">
              Entrez votre email pour recevoir un lien de connexion instantané.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 font-body text-sm focus:outline-none focus:border-gold/60 focus:ring-1 focus:ring-gold/30 transition-colors"
              />

              {error && (
                <p className="text-red-400 text-xs font-body">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold text-navy font-heading font-bold text-sm py-3 rounded-xl hover:bg-gold-hover disabled:opacity-50 transition-colors"
              >
                {loading ? 'Envoi en cours…' : 'Recevoir le lien'}
              </button>
            </form>
          </div>
        )}

        <p className="text-center mt-6 text-xs text-white/25 font-body">
          Pas de mot de passe. Connexion sécurisée par email uniquement.
        </p>

      </div>
    </div>
  )
}
