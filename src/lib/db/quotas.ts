// ─────────────────────────────────────────────────────────────────────────────
// Couche de persistance — Quotas
// Lecture et mise à jour du quota freemium (décision 3A).
// Les lectures utilisent le client user (RLS actif).
// Les écritures critiques utilisent le client service (contourne RLS).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserQuotaRow, PlanTier } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Lecture du quota
// ─────────────────────────────────────────────────────────────────────────────

export async function getUserQuota(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserQuotaRow> {
  const { data, error } = await supabase
    .from('user_quotas')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) throw new Error('Quota utilisatrice introuvable')
  return data as UserQuotaRow
}

/**
 * Vérifie si l'utilisatrice peut démarrer une nouvelle session.
 * Délègue à la fonction SQL can_user_start_session (gère aussi le reset du quota).
 */
export async function canUserStartSession(
  serviceSupabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await serviceSupabase.rpc('can_user_start_session', {
    p_user_id: userId,
  })

  if (error) {
    console.error('[quota] Erreur vérification quota :', error.message)
    // En cas d'erreur de quota, on refuse par sécurité
    return false
  }

  return data === true
}

/**
 * Retourne le quota restant de l'utilisatrice sous forme lisible.
 * null = illimité.
 */
export async function getQuotaStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  plan_tier: PlanTier
  readings_completed: number
  quota_limit: number | null
  remaining: number | null
  quota_reset_at: string
}> {
  const quota = await getUserQuota(supabase, userId)

  return {
    plan_tier: quota.plan_tier,
    readings_completed: quota.readings_completed,
    quota_limit: quota.quota_limit,
    remaining: quota.quota_limit === null ? null : quota.quota_limit - quota.readings_completed,
    quota_reset_at: quota.quota_reset_at,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mise à jour du quota (depuis les webhooks Stripe)
// Uniquement via le client service — jamais depuis le client.
// ─────────────────────────────────────────────────────────────────────────────

type PlanConfig = {
  quota_limit: number | null
  period: 'week' | 'month'
}

const PLAN_CONFIG: Record<PlanTier, PlanConfig> = {
  free:      { quota_limit: 1,    period: 'week' },
  essential: { quota_limit: 5,    period: 'month' },
  unlimited: { quota_limit: null, period: 'month' },
}

/**
 * Met à jour le plan d'une utilisatrice après un événement Stripe.
 * Remet le compteur de lectures à zéro et recalcule le prochain reset.
 */
export async function updateUserPlan(
  serviceSupabase: SupabaseClient,
  userId: string,
  newPlan: PlanTier,
  stripeCustomerId: string,
  stripeSubscriptionId: string | null,
): Promise<void> {
  const config = PLAN_CONFIG[newPlan]
  const now = new Date()

  const resetAt = config.period === 'week'
    ? getNextWeekStart(now)
    : getNextMonthStart(now)

  const { error } = await serviceSupabase
    .from('user_quotas')
    .update({
      plan_tier: newPlan,
      quota_limit: config.quota_limit,
      readings_completed: 0, // reset à l'upgrade
      quota_period_start: now.toISOString(),
      quota_reset_at: resetAt,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId)

  if (error) throw new Error(`Erreur mise à jour plan : ${error.message}`)
}

/**
 * Passe l'utilisatrice en plan 'free' (annulation d'abonnement).
 * Ne remet pas le compteur à zéro — la période en cours reste active.
 */
export async function downgradeToFree(
  serviceSupabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const config = PLAN_CONFIG.free
  const now = new Date()

  const { error } = await serviceSupabase
    .from('user_quotas')
    .update({
      plan_tier: 'free',
      quota_limit: config.quota_limit,
      // Pas de reset du compteur : la période en cours continue
      quota_reset_at: getNextWeekStart(now),
      stripe_subscription_id: null,
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId)

  if (error) throw new Error(`Erreur downgrade : ${error.message}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de date
// ─────────────────────────────────────────────────────────────────────────────

function getNextWeekStart(from: Date): string {
  const d = new Date(from)
  const day = d.getDay() // 0 = dimanche
  const daysUntilMonday = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + daysUntilMonday)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function getNextMonthStart(from: Date): string {
  const d = new Date(from)
  d.setMonth(d.getMonth() + 1, 1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
