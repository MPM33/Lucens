// ─────────────────────────────────────────────────────────────────────────────
// Client Supabase côté serveur (Next.js App Router)
// Utilise @supabase/ssr pour lire les cookies de session.
// Ne jamais importer ce fichier dans un composant Client ('use client').
// ─────────────────────────────────────────────────────────────────────────────

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        },
      },
    },
  )
}

/**
 * Client Supabase avec la clé service (contourne le RLS).
 * Uniquement pour les opérations serveur critiques :
 * mise à jour du quota, traitement des webhooks Stripe.
 * Ne jamais exposer SUPABASE_SERVICE_ROLE_KEY au client.
 */
export function createSupabaseServiceClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
