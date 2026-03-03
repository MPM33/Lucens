'use client'

type Props = {
  value: number | undefined
  onChange: (value: number) => void
  descriptions?: Record<number, string>
}

export function ScaleInput({ value, onChange, descriptions }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3 justify-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="flex flex-col items-center gap-1.5">
            <button
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
            {descriptions?.[n] && (
              <span className="text-xs text-gray-400 font-body text-center max-w-[56px] leading-tight">
                {descriptions[n]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
