'use client'

const SCALE_LABELS: Record<number, string> = {
  1: 'Pas du tout',
  2: 'Peu',
  3: 'Moyennement',
  4: 'Plutôt oui',
  5: 'Tout à fait',
}

type Props = {
  value: number | undefined
  onChange: (value: number) => void
  minLabel?: string
  maxLabel?: string
}

export function ScaleInput({ value, onChange, minLabel, maxLabel }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 justify-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={[
              'w-12 h-12 rounded-full font-heading font-bold text-base transition-all duration-150',
              value === n
                ? 'bg-gold text-navy shadow-md scale-110'
                : 'bg-white text-charcoal border border-gray-200 hover:border-gold hover:bg-gold-light',
            ].join(' ')}
          >
            {n}
          </button>
        ))}
      </div>

      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-xs text-gray-400 px-1">
          <span>{minLabel ?? ''}</span>
          <span>{maxLabel ?? ''}</span>
        </div>
      )}

      {value !== undefined && (
        <p className="text-center text-sm text-gray-500">
          {SCALE_LABELS[value]}
        </p>
      )}
    </div>
  )
}
