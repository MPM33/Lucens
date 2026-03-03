import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSession, getSessionAnswers } from '@/lib/db/sessions'
import { TirageFlow } from '@/components/tirage/TirageFlow'
import type { StepAnswer } from '@/protocol/types'

type Props = { params: Promise<{ id: string }> }

export default async function TiragePage({ params }: Props) {
  const { id: sessionId } = await params
  const supabase = await createSupabaseServerClient()

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  // Session
  const session = await getSession(supabase, sessionId, user.id).catch(() => null)
  if (!session) redirect('/dashboard')
  if (session.status === 'completed') redirect(`/rapport/${sessionId}`)
  if (session.status !== 'in_progress') redirect('/dashboard')

  // Réponses déjà enregistrées (permet de reprendre une session)
  const answers = await getSessionAnswers(supabase, sessionId, user.id).catch(() => [])

  const initialAnswers = Object.fromEntries(
    answers.map((a) => [a.step_id, a as Partial<StepAnswer>]),
  )

  return (
    <TirageFlow
      sessionId={sessionId}
      initialAnswers={initialAnswers}
    />
  )
}
