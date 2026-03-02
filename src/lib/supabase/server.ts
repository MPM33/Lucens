// ─────────────────────────────────────────────────────────────────────────────
// Client Supabase côté serveur (Next.js App Router)
// Utilise @supabase/ssr pour lire les cookies de session.
// Ne jamais importer ce fichier dans un composant Client ('use client').
// ─────────────────────────────────────────────────────────────────────────────

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

type CookieItem = { name: string; value: string; options?: Record<string, unknown> }

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieItem[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]),
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
  return createClient(
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
