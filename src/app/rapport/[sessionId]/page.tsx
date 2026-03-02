import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/db/sessions'
import { ReportViewer } from '@/components/rapport/ReportViewer'

type Props = { params: Promise<{ sessionId: string }> }

export default async function RapportPage({ params }: Props) {
  const { sessionId } = await params
  const supabase = await createSupabaseServerClient()

  // Auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  // Vérifier que la session appartient à l'utilisatrice et est terminée
  const session = await getSession(supabase, sessionId, user.id).catch(() => null)
  if (!session) redirect('/dashboard')
  if (session.status !== 'completed') redirect(`/tirage/${sessionId}`)

  return (
    <div className="min-h-screen bg-neutral">
      {/* En-tête navy */}
      <header className="bg-navy px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span className="text-gold font-heading font-bold text-sm tracking-widest uppercase">
            Lucens
          </span>
          <a
            href="/dashboard"
            className="text-white/40 hover:text-white text-xs font-body transition-colors"
          >
            ← Tableau de bord
          </a>
        </div>
      </header>

      {/* Titre */}
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-2">
        <h1 className="font-heading font-bold text-xl text-navy">Votre rapport</h1>
        <p className="text-sm text-gray-400 font-body mt-1">
          Protocole RELATION · Analyse personnalisée
        </p>
      </div>

      {/* Rapport (gère lui-même le chargement + streaming SSE) */}
      <ReportViewer sessionId={sessionId} />
    </div>
  )
}
