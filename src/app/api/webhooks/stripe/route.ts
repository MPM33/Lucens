// POST /api/webhooks/stripe — Traitement des événements Stripe
// ─────────────────────────────────────────────────────────────────────────────
// Pattern idempotent (décision 16A) :
//   1. Vérifier la signature Stripe (sécurité)
//   2. Répondre 200 immédiatement (éviter les timeouts Stripe)
//   3. Vérifier l'idempotence (déjà traité ?)
//   4. Traiter l'événement de façon async

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import {
  isWebhookAlreadyProcessed,
  markWebhookSuccess,
  markWebhookFailed,
} from '@/lib/db/webhooks'
import { updateUserPlan, downgradeToFree } from '@/lib/db/quotas'
import type { PlanTier } from '@/lib/db/types'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
})

// Mapping des price IDs Stripe vers les plans internes
// À configurer via variables d'environnement en production
const PRICE_TO_PLAN: Record<string, PlanTier> = {
  [process.env.STRIPE_PRICE_ESSENTIAL ?? 'price_essential']: 'essential',
  [process.env.STRIPE_PRICE_UNLIMITED ?? 'price_unlimited']: 'unlimited',
}

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Signature manquante' }, { status: 400 })
  }

  // 1. Vérifier la signature Stripe (protection contre les requêtes forgées)
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    console.error('[stripe] Signature invalide :', err)
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 })
  }

  // 2. Répondre 200 immédiatement — Stripe attend < 30s
  // Le traitement se fait de façon async ci-dessous.
  // On ne peut pas réellement faire du vrai async dans Next.js Edge/Serverless
  // sans une queue, mais on process synchroniquement et rapidement.

  const serviceSupabase = createSupabaseServiceClient()

  // 3. Vérifier l'idempotence
  const alreadyProcessed = await isWebhookAlreadyProcessed(serviceSupabase, event.id)
  if (alreadyProcessed) {
    // Déjà traité — répondre 200 pour que Stripe arrête de retenter
    return NextResponse.json({ received: true, idempotent: true })
  }

  // 4. Traiter l'événement
  try {
    await handleStripeEvent(serviceSupabase, event)
    await markWebhookSuccess(serviceSupabase, event.id, event.type)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[stripe] Erreur traitement ${event.type} :`, errorMessage)
    await markWebhookFailed(serviceSupabase, event.id, event.type, errorMessage)
    // Retourner 500 pour que Stripe retente
    return NextResponse.json({ error: 'Erreur traitement' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers par type d'événement
// ─────────────────────────────────────────────────────────────────────────────

async function handleStripeEvent(
  serviceSupabase: ReturnType<typeof createSupabaseServiceClient>,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionChange(serviceSupabase, event.data.object as Stripe.Subscription)
      break

    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(serviceSupabase, event.data.object as Stripe.Subscription)
      break

    case 'invoice.payment_failed':
      // Paiement échoué : ne pas downgrader immédiatement (Stripe retente).
      // Logger pour monitoring, traiter le downgrade sur subscription.updated.
      console.warn('[stripe] Paiement échoué :', (event.data.object as Stripe.Invoice).id)
      break

    default:
      // Événements non gérés : loguer et ignorer
      console.info(`[stripe] Événement ignoré : ${event.type}`)
  }
}

async function handleSubscriptionChange(
  serviceSupabase: ReturnType<typeof createSupabaseServiceClient>,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = subscription.customer as string
  const priceId = subscription.items.data[0]?.price.id

  if (!priceId) throw new Error(`Pas de price ID pour subscription ${subscription.id}`)

  const plan = PRICE_TO_PLAN[priceId]
  if (!plan) throw new Error(`Price ID inconnu : ${priceId}`)

  // Récupérer l'userId depuis les métadonnées Stripe
  // Convention : on stocke le user_id Supabase dans subscription.metadata.user_id
  const userId = subscription.metadata?.['user_id']
  if (!userId) {
    // Fallback : chercher l'utilisatrice par stripe_customer_id
    const { data } = await serviceSupabase
      .from('user_quotas')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .single()

    if (!data) throw new Error(`Aucune utilisatrice pour customer ${customerId}`)

    await updateUserPlan(serviceSupabase, data.user_id, plan, customerId, subscription.id)
    return
  }

  await updateUserPlan(serviceSupabase, userId, plan, customerId, subscription.id)
}

async function handleSubscriptionCancelled(
  serviceSupabase: ReturnType<typeof createSupabaseServiceClient>,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = subscription.customer as string

  const { data } = await serviceSupabase
    .from('user_quotas')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!data) {
    console.warn(`[stripe] Aucune utilisatrice pour annulation customer ${customerId}`)
    return
  }

  await downgradeToFree(serviceSupabase, data.user_id)
}
