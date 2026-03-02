// POST /api/sessions — Créer une nouvelle session
// ─────────────────────────────────────────────────────────────────────────────
// Vérifie le quota AVANT de créer la session.
// Ne débite pas le quota ici — uniquement à la complétion (décision 6A).

import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { canUserStartSession } from '@/lib/db/quotas'
import { createSession } from '@/lib/db/sessions'

export async function POST() {
  const supabase = await createSupabaseServerClient()

  // 1. Authentification
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifiée' }, { status: 401 })
  }

  // 2. Vérification du quota (via service client pour gérer le reset automatique)
  const serviceSupabase = createSupabaseServiceClient()
  const hasQuota = await canUserStartSession(serviceSupabase, user.id)

  if (!hasQuota) {
    return NextResponse.json(
      {
        error: 'quota_exceeded',
        message: 'Vous avez atteint votre limite de tirages pour cette période.',
      },
      { status: 403 },
    )
  }

  // 3. Création de la session
  const session = await createSession(supabase, user.id).catch((err: Error) => {
    console.error('[sessions] Erreur création :', err.message)
    return null
  })

  if (!session) {
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }

  return NextResponse.json(
    {
      session_id: session.id,
      status: session.status,
      started_at: session.started_at,
    },
    { status: 201 },
  )
}
