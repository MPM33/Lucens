'use client'

const PLAN_LABELS: Record<string, string> = {
  free:      'Gratuit',
  essential: 'Essentiel',
  unlimited: 'Illimité',
}

type QuotaStatus = {
  plan_tier: string
  readings_completed: number
  quota_limit: number | null
  remaining: number | null
  quota_reset_at: string
}

type Props = {
  quota: QuotaStatus
  onStartNew: () => void
  isStarting: boolean
  startError?: string | null
}

export function QuotaCard({ quota, onStartNew, isStarting, startError }: Props) {
  const isExhausted = quota.remaining !== null && quota.remaining <= 0
  const resetDate = new Date(quota.quota_reset_at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="bg-navy rounded-2xl shadow-lg p-6 space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-semibold text-white">Mon plan</h2>
        <span className="text-xs bg-white/10 text-gold px-2.5 py-1 rounded-full font-heading font-semibold tracking-wide">
          {PLAN_LABELS[quota.plan_tier] ?? quota.plan_tier}
        </span>
      </div>

      {/* Utilisation */}
      {quota.quota_limit !== null ? (
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-body">
            <span className="text-white/70">
              {quota.readings_completed} tirage{quota.readings_completed !== 1 ? 's' : ''} effectué{quota.readings_completed !== 1 ? 's' : ''}
            </span>
            <span className="text-white/40">sur {quota.quota_limit}</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isExhausted ? 'bg-red-400' : 'bg-gold'}`}
              style={{ width: `${Math.min((quota.readings_completed / quota.quota_limit) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-white/40 font-body">
            Reset le {resetDate}
          </p>
        </div>
      ) : (
        <p className="text-sm text-white/70 font-body">
          {quota.readings_completed} tirage{quota.readings_completed !== 1 ? 's' : ''} effectué{quota.readings_completed !== 1 ? 's' : ''} · Tirages illimités
        </p>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={onStartNew}
        disabled={isExhausted || isStarting}
        className={[
          'w-full py-3 rounded-xl text-sm font-heading font-semibold transition-all duration-150',
          isExhausted || isStarting
            ? 'bg-white/10 text-white/30 cursor-not-allowed'
            : 'bg-gold text-navy hover:bg-gold-hover active:scale-[0.98]',
        ].join(' ')}
      >
        {isStarting ? 'Démarrage…' : isExhausted ? 'Quota épuisé' : 'Nouveau tirage'}
      </button>

      {startError && (
        <p className="text-xs text-red-400 text-center font-body">{startError}</p>
      )}

      {isExhausted && (
        <p className="text-xs text-center text-white/40 font-body">
          Passez en plan Essentiel ou Illimité pour continuer.
        </p>
      )}
    </div>
  )
}
