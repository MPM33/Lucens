'use client'

import { useState, useEffect } from 'react'
import type { OrientationId } from '@/protocol/types'
import type { ReportStreamEvent } from '@/lib/llm/types'
import { RELATION_V1 } from '@/protocol/relation-v1.config'
import { ScoreDisplay } from './ScoreDisplay'
import { OrientationBadge } from './OrientationBadge'

// ─────────────────────────────────────────────────────────────────────────────
// Types locaux (miroir de la réponse API)
// ─────────────────────────────────────────────────────────────────────────────

type ScoringData = {
  final_score: number
  orientation: OrientationId
  sub_scores: Record<string, number>
  short_circuit_triggered: string | null
  gut_check_adjustment: number
  coherence_gap: number | null
  tension_percent: number | null
  timing_flags?: { impulsive_risk: boolean; limited_influence: boolean; early_relationship: boolean } | null
}

type StepProseItem = { step_id: string; step_label: string; prose: string }

type ViewState =
  | { phase: 'loading' }
  | { phase: 'waiting'; message: string }
  | { phase: 'streaming'; stepProse: StepProseItem[]; assemblyText: string }
  | { phase: 'complete'; scoring: ScoringData; stepProse: StepProseItem[]; assemblyProse: string }
  | { phase: 'error'; message: string }

// ─────────────────────────────────────────────────────────────────────────────

export function ReportViewer({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<ViewState>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    async function load() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/report`)
        if (cancelled) return

        const contentType = res.headers.get('content-type') ?? ''

        // ── Réponse JSON (rapport terminé ou en génération) ──────────────────
        if (contentType.includes('application/json')) {
          const data = await res.json()

          if (res.status === 202) {
            // Génération en cours → retry dans 3s
            setState({ phase: 'waiting', message: data.message ?? 'Génération en cours…' })
            retryTimer = setTimeout(load, 3000)
            return
          }

          if (data.prose?.status === 'failed') {
            setState({ phase: 'error', message: 'La génération du rapport a échoué. Les données de scoring restent disponibles.' })
            return
          }

          if (data.prose?.status === 'completed') {
            const stepProse = buildStepProseFromJSON(data.prose.step_prose ?? {})
            setState({
              phase: 'complete',
              scoring: data.scoring,
              stepProse,
              assemblyProse: data.prose.assembly ?? '',
            })
          }
          return
        }

        // ── Stream SSE (génération en cours) ─────────────────────────────────
        if (!res.body) {
          setState({ phase: 'error', message: 'Aucune réponse du serveur.' })
          return
        }

        setState({ phase: 'streaming', stepProse: [], assemblyText: '' })

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accSteps: StepProseItem[] = []
        let accAssembly = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done || cancelled) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''

          for (const part of parts) {
            for (const line of part.split('\n')) {
              if (!line.startsWith('data: ')) continue
              let event: ReportStreamEvent
              try {
                event = JSON.parse(line.slice(6)) as ReportStreamEvent
              } catch {
                continue
              }

              if (event.type === 'step_prose') {
                accSteps = [
                  ...accSteps,
                  { step_id: event.step_id, step_label: event.step_label, prose: event.prose },
                ]
                setState({ phase: 'streaming', stepProse: accSteps, assemblyText: accAssembly })
              } else if (event.type === 'assembly_chunk') {
                accAssembly += event.text
                setState({ phase: 'streaming', stepProse: accSteps, assemblyText: accAssembly })
              } else if (event.type === 'complete' && !cancelled) {
                // Re-fetch pour récupérer le scoring complet depuis la DB
                const finalRes = await fetch(`/api/sessions/${sessionId}/report`)
                const finalData = await finalRes.json()
                if (!cancelled) {
                  setState({
                    phase: 'complete',
                    scoring: finalData.scoring,
                    stepProse: accSteps,
                    assemblyProse: accAssembly,
                  })
                }
              } else if (event.type === 'error') {
                setState({ phase: 'error', message: event.message })
              }
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: err instanceof Error ? err.message : 'Erreur réseau inattendue.',
          })
        }
      }
    }

    load()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [sessionId])

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (state.phase === 'loading') {
    return <LoadingScreen message="Chargement du rapport…" />
  }

  if (state.phase === 'waiting') {
    return <LoadingScreen message={state.message} />
  }

  if (state.phase === 'error') {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-3">
        <p className="text-gray-500 text-sm font-body">{state.message}</p>
      </div>
    )
  }

  if (state.phase === 'streaming') {
    return <StreamingView stepProse={state.stepProse} assemblyText={state.assemblyText} />
  }

  // phase === 'complete'
  const { scoring, stepProse, assemblyProse } = state
  const orientation = RELATION_V1.orientations.find((o) => o.id === scoring.orientation)

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">

      {/* Scoring — carte navy avec score en or */}
      <section className="bg-navy rounded-2xl shadow-lg p-6">
        <ScoreDisplay scoring={scoring} />
      </section>

      {/* Description orientation */}
      {orientation && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="mb-4">
            <OrientationBadge orientation={scoring.orientation} />
          </div>
          <p className="text-charcoal text-sm font-body leading-relaxed">{orientation.description}</p>
        </section>
      )}

      {/* Rapport assemblé (prose principale) */}
      {assemblyProse && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-xs font-heading font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Analyse complète
          </h2>
          <div className="text-charcoal text-sm font-body leading-relaxed whitespace-pre-wrap">
            {assemblyProse}
          </div>
        </section>
      )}

      {/* Analyses par étape */}
      {stepProse.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-heading font-semibold text-gray-400 uppercase tracking-widest px-1">
            Détail par étape
          </h2>
          {stepProse.map((item) => (
            <div
              key={item.step_id}
              className="bg-white rounded-xl border border-gray-100 p-5 space-y-2"
            >
              <p className="text-xs font-heading font-semibold text-navy/50 uppercase tracking-widest">
                {item.step_label}
              </p>
              <p className="text-sm text-charcoal font-body leading-relaxed">{item.prose}</p>
            </div>
          ))}
        </section>
      )}

      {/* Plans d'action */}
      {orientation && (
        <section className="grid sm:grid-cols-2 gap-4">
          <ActionPlan title="Plan 7 jours" items={orientation.action_plan_7_days} />
          <ActionPlan title="Plan 30 jours" items={orientation.action_plan_30_days} />
        </section>
      )}

      {/* Indicateurs de suivi */}
      {orientation?.tracking_indicators && orientation.tracking_indicators.length > 0 && (
        <section className="bg-navy-light rounded-2xl p-6">
          <h2 className="text-xs font-heading font-semibold text-navy/60 uppercase tracking-widest mb-3">
            Indicateurs de suivi
          </h2>
          <ul className="space-y-2">
            {orientation.tracking_indicators.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-navy font-body">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Composants internes
// ─────────────────────────────────────────────────────────────────────────────

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      <p className="text-sm text-gray-400 font-body">{message}</p>
    </div>
  )
}

function StreamingView({ stepProse, assemblyText }: { stepProse: StepProseItem[]; assemblyText: string }) {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3 text-gray-400 text-sm font-body">
        <div className="w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
        <span>Génération du rapport en cours…</span>
      </div>

      {stepProse.length > 0 && (
        <div className="space-y-3">
          {stepProse.map((item) => (
            <div key={item.step_id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
              <p className="text-xs font-heading font-semibold text-navy/50 uppercase tracking-widest">{item.step_label}</p>
              <p className="text-sm text-charcoal font-body leading-relaxed">{item.prose}</p>
            </div>
          ))}
        </div>
      )}

      {assemblyText && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-charcoal font-body leading-relaxed whitespace-pre-wrap">
            {assemblyText}
            <span className="inline-block w-1.5 h-4 bg-gold ml-0.5 animate-pulse align-middle" />
          </p>
        </div>
      )}
    </div>
  )
}

function ActionPlan({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-navy rounded-xl p-5">
      <h3 className="text-xs font-heading font-semibold text-gold uppercase tracking-widest mb-3">{title}</h3>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-white/80 font-body">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-gold flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function buildStepProseFromJSON(stepProseRecord: Record<string, string>): StepProseItem[] {
  return Object.entries(stepProseRecord).map(([step_id, prose]) => ({
    step_id,
    step_label: RELATION_V1.steps.find((s) => s.id === step_id)?.label ?? step_id,
    prose,
  }))
}
