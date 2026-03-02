// ─────────────────────────────────────────────────────────────────────────────
// Couche de persistance — Idempotence des webhooks Stripe (décision 16A)
// Avant tout traitement d'un événement Stripe, vérifier qu'il n'a pas déjà
// été traité. Stocker le résultat pour éviter les doublons.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Vérifie si un événement Stripe a déjà été traité.
 * Doit être appelé AVANT tout traitement, avec le client service.
 */
export async function isWebhookAlreadyProcessed(
  serviceSupabase: SupabaseClient,
  stripeEventId: string,
): Promise<boolean> {
  const { data } = await serviceSupabase
    .from('processed_webhook_events')
    .select('stripe_event_id, status')
    .eq('stripe_event_id', stripeEventId)
    .maybeSingle()

  return data !== null
}

/**
 * Marque un événement Stripe comme traité avec succès.
 * À appeler APRÈS un traitement réussi.
 */
export async function markWebhookSuccess(
  serviceSupabase: SupabaseClient,
  stripeEventId: string,
  eventType: string,
): Promise<void> {
  const { error } = await serviceSupabase
    .from('processed_webhook_events')
    .insert({
      stripe_event_id: stripeEventId,
      event_type: eventType,
      status: 'success',
    })

  // Ignorer les conflits de clé primaire (double appel concurrent — idempotent)
  if (error && !error.message.includes('duplicate')) {
    throw new Error(`Erreur enregistrement webhook : ${error.message}`)
  }
}

/**
 * Enregistre un webhook ayant échoué (pour debug et alerting).
 * Stripe retentera — l'entrée sera overwritée si un retry réussit.
 */
export async function markWebhookFailed(
  serviceSupabase: SupabaseClient,
  stripeEventId: string,
  eventType: string,
  errorMessage: string,
): Promise<void> {
  await serviceSupabase
    .from('processed_webhook_events')
    .upsert({
      stripe_event_id: stripeEventId,
      event_type: eventType,
      status: 'failed',
      error_message: errorMessage,
      processed_at: new Date().toISOString(),
    })
}
