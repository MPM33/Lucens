'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { StepAnswer } from '@/protocol/types'
import { RELATION_V1 } from '@/protocol/relation-v1.config'
import { StepCard } from './StepCard'
import { saveStep, completeSession } from '@/lib/api/sessions'

type Props = {
  sessionId: string
  // Réponses déjà enregistrées (pour reprendre une session en cours)
  initialAnswers?: Record<string, Partial<StepAnswer>>
}

export function TirageFlow({ sessionId, initialAnswers = {} }: Props) {
  const router = useRouter()
  const steps = RELATION_V1.steps

  const [currentIndex, setCurrentIndex] = useState(() =>
    // Reprendre à la première étape non encore répondue
    Math.min(Object.keys(initialAnswers).length, steps.length - 1),
  )
  const [answers, setAnswers] = useState<Record<string, Partial<StepAnswer>>>(initialAnswers)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const step = steps[currentIndex]!

  const handleAnswerChange = useCallback(
    (answer: Partial<StepAnswer>) => {
      setAnswers((prev) => ({ ...prev, [step.id]: answer }))
    },
    [step.id],
  )

  const handleNext = useCallback(async () => {
    const answer = answers[step.id] ?? {}
    setError(null)
    setIsSaving(true)

    try {
      await saveStep(sessionId, { step_id: step.id, step_position: step.position, answer })

      if (currentIndex < steps.length - 1) {
        setCurrentIndex((i) => i + 1)
      } else {
        await completeSession(sessionId)
        router.push(`/rapport/${sessionId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.')
    } finally {
      setIsSaving(false)
    }
  }, [answers, step.id, sessionId, currentIndex, steps.length, router])

  const handlePrev = useCallback(() => {
    setError(null)
    if (currentIndex > 0) setCurrentIndex((i) => i - 1)
  }, [currentIndex])

  return (
    <div className="min-h-screen bg-neutral">
      {/* En-tête navy */}
      <header className="bg-navy px-4 py-4 mb-8">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <span className="text-gold font-heading font-bold text-sm tracking-widest uppercase">
            Lucens
          </span>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="text-white/50 hover:text-white text-xs font-body transition-colors"
          >
            Abandonner
          </button>
        </div>
      </header>

      <div className="px-4 pb-8">

      <StepCard
        step={step}
        answer={answers[step.id] ?? {}}
        onChange={handleAnswerChange}
        stepNumber={currentIndex + 1}
        totalSteps={steps.length}
        onPrev={currentIndex > 0 ? handlePrev : undefined}
        onNext={handleNext}
        isLast={currentIndex === steps.length - 1}
        isSaving={isSaving}
        error={error}
      />
      </div>
    </div>
  )
}
