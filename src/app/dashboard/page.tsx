'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { createSession } from '@/lib/api/sessions'
import { QuotaCard } from '@/components/dashboard/QuotaCard'
import type { OrientationId } from '@/protocol/types'

type QuotaStatus = {
  plan_tier: string
  readings_completed: number
  quota_limit: number | null
  remaining: number | null
  quota_reset_at: string
}

type SessionSummary = {
  id: string
  status: string
  started_at: string
  completed_at: string | null
  reports: { orientation: OrientationId | null; final_score: number | null } | null
}

const ORIENTATION_LABELS: Record<string, string> = {
  rester_en_conscience:  'Rester en conscience',
  se_repositionner:      'Se repositionner',
  distance_strategique:  'Prendre de la distance',
  partir_et_se_proteger: 'Partir et se protéger',
}

export default function DashboardPage() {
  const router = useRouter()
  const [quota, setQuota] = useState<QuotaStatus | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      // Quota
      const { data: quotaRow } = await supabase
        .from('user_quotas')
        .select('plan_tier, readings_completed, quota_limit, quota_reset_at')
        .eq('user_id', user.id)
        .single()

      if (quotaRow) {
        setQuota({
          plan_tier: quotaRow.plan_tier as string,
          readings_completed: quotaRow.readings_completed as number,
          quota_limit: quotaRow.quota_limit as number | null,
          remaining: quotaRow.quota_limit === null
            ? null
            : (quotaRow.quota_limit as number) - (quotaRow.readings_completed as number),
          quota_reset_at: quotaRow.quota_reset_at as string,
        })
      }

      // Sessions récentes
      const { data: rows } = await supabase
        .from('sessions')
        .select('id, status, started_at, completed_at, reports(orientation, final_score)')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(10)

      if (rows) {
        setSessions(
          rows.map((r) => ({
            ...r,
            reports: Array.isArray(r.reports) ? (r.reports[0] ?? null) : (r.reports ?? null),
          })) as SessionSummary[],
        )
      }

      setLoading(false)
    }
    load()
  }, [router])

  async function handleStart() {
    setStartError(null)
    setIsStarting(true)
    try {
      const { session_id } = await createSession()
      router.push(`/tirage/${session_id}`)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Impossible de démarrer.')
      setIsStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral">
      {/* En-tête navy */}
      <header className="bg-navy px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="text-gold font-heading font-bold text-sm tracking-widest uppercase">
            Lucens
          </span>
          <button
            type="button"
            onClick={async () => {
              await getSupabaseBrowserClient().auth.signOut()
              router.push('/')
            }}
            className="text-white/40 hover:text-white text-xs font-body transition-colors"
          >
            Se déconnecter
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Quota + CTA */}
        {quota && (
          <QuotaCard
            quota={quota}
            onStartNew={handleStart}
            isStarting={isStarting}
            startError={startError}
          />
        )}

        {/* Historique */}
        {sessions.length > 0 && (
          <section>
            <h2 className="text-xs font-heading font-semibold text-gray-400 uppercase tracking-widest mb-3 px-1">
              Mes tirages
            </h2>
            <div className="space-y-2">
              {sessions.map((s) => (
                <SessionRow key={s.id} session={s} />
              ))}
            </div>
          </section>
        )}

        {sessions.length === 0 && !loading && (
          <p className="text-center text-sm text-gray-400 font-body py-8">
            Aucun tirage pour l'instant. Commencez dès maintenant.
          </p>
        )}
      </main>
    </div>
  )
}

function SessionRow({ session }: { session: SessionSummary }) {
  const router = useRouter()
  const date = new Date(session.started_at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const isComplete = session.status === 'completed'
  const orientation = session.reports?.orientation
    ? ORIENTATION_LABELS[session.reports.orientation]
    : null
  const finalScore = session.reports?.final_score ?? null

  return (
    <button
      type="button"
      onClick={() => {
        if (isComplete) router.push(`/rapport/${session.id}`)
        else router.push(`/tirage/${session.id}`)
      }}
      className="w-full bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center justify-between hover:border-gold/40 hover:shadow-sm transition-all text-left group"
    >
      <div className="space-y-0.5">
        <p className="text-sm font-heading font-semibold text-navy group-hover:text-navy">
          {orientation ?? (isComplete ? 'Rapport disponible' : 'Session en cours')}
        </p>
        <p className="text-xs text-gray-400 font-body">{date}</p>
      </div>
      <div className="flex items-center gap-3">
        {isComplete && finalScore !== null && (
          <span className="text-sm font-heading font-bold text-navy tabular-nums">
            {finalScore}/100
          </span>
        )}
        <span
          className={`text-xs px-2.5 py-0.5 rounded-full font-heading font-semibold ${
            isComplete
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-gold-light text-gold-hover'
          }`}
        >
          {isComplete ? 'Terminé' : 'En cours'}
        </span>
      </div>
    </button>
  )
}
