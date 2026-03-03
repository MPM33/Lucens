'use client'

import type { ProtocolStep, StepAnswer, ScaleValue } from '@/protocol/types'
import { ScaleInput } from './ScaleInput'
import { ChoiceInput } from './ChoiceInput'
import { CompositeInput } from './CompositeInput'

type Props = {
  step: ProtocolStep
  answer: Partial<StepAnswer>
  onChange: (answer: Partial<StepAnswer>) => void
  stepNumber: number
  totalSteps: number
  onPrev?: () => void
  onNext: () => void
  isLast: boolean
  isSaving: boolean
  error?: string | null
}

export function StepCard({
  step, answer, onChange,
  stepNumber, totalSteps,
  onPrev, onNext, isLast, isSaving, error,
}: Props) {
  const answered = isStepAnswered(step, answer)

  return (
    <div className="max-w-xl mx-auto w-full">
      {/* Barre de progression */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-400 mb-2 font-body">
          <span>Étape {stepNumber} / {totalSteps}</span>
          <span>{Math.round((stepNumber / totalSteps) * 100)} %</span>
        </div>
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gold rounded-full transition-all duration-500"
            style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Carte */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        {/* Enoncé */}
        <div>
          <p className="text-base sm:text-lg font-heading font-semibold text-navy leading-relaxed">
            {step.user_prompt}
          </p>
          {step.user_hint && (
            <p className="mt-2 text-sm text-gray-400 font-body leading-relaxed">{step.user_hint}</p>
          )}
        </div>

        {/* Input principal */}
        {step.scoring.input_type === 'scale_1_5' && (
          <ScaleInput
            value={answer.scale_value}
            onChange={(v) => onChange({ ...answer, scale_value: v as ScaleValue })}
          />
        )}

        {step.scoring.input_type === 'multiple_choice' && (
          <ChoiceInput
            options={step.scoring.options}
            value={answer.choice_id}
            onChange={(id) => onChange({ ...answer, choice_id: id })}
          />
        )}

        {step.scoring.input_type === 'composite' && (
          <CompositeInput
            subInputs={step.scoring.sub_inputs}
            value={answer.composite_values ?? {}}
            onChange={(cv) => onChange({ ...answer, composite_values: cv as StepAnswer['composite_values'] })}
          />
        )}

        {/* Champ texte libre */}
        {step.has_free_text && (
          <div>
            <label className="block text-sm text-gray-500 font-body mb-1.5">
              Quelque chose à ajouter ?{' '}
              <span className="text-gray-400">(optionnel)</span>
            </label>
            <textarea
              value={answer.free_text ?? ''}
              onChange={(e) => onChange({ ...answer, free_text: e.target.value })}
              rows={3}
              placeholder="Votre ressenti en quelques mots…"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-charcoal placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gold/50 font-body resize-none"
            />
          </div>
        )}

        {/* Erreur */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 font-body">{error}</p>
        )}

        {/* Navigation */}
        <div className="flex gap-3 pt-1">
          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-navy/20 text-sm text-navy font-body hover:bg-navy hover:text-white disabled:opacity-40 transition-all duration-150"
            >
              ← Précédent
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={!answered || isSaving}
            className={[
              'flex-1 py-2.5 rounded-xl text-sm font-heading font-semibold transition-all duration-150',
              answered && !isSaving
                ? 'bg-gold text-navy hover:bg-gold-hover active:scale-[0.98]'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            {isSaving ? 'Sauvegarde…' : isLast ? 'Terminer le tirage' : 'Suivant →'}
          </button>
        </div>
      </div>
    </div>
  )
}

function isStepAnswered(step: ProtocolStep, answer: Partial<StepAnswer>): boolean {
  const s = step.scoring
  if (s.input_type === 'scale_1_5') return answer.scale_value !== undefined
  if (s.input_type === 'multiple_choice') return answer.choice_id !== undefined
  if (s.input_type === 'composite') {
    const cv = answer.composite_values ?? {}
    return s.sub_inputs.every((sub) => {
      const v = cv[sub.id]
      if (!v) return false
      if (sub.input_type === 'scale_1_5') return v.scale_value !== undefined
      if (sub.input_type === 'multiple_choice') return v.choice_id !== undefined
      return false
    })
  }
  return false
}
