'use client'

import type { ChoiceOption } from '@/protocol/types'

type Props = {
  options: ChoiceOption[]
  value: string | undefined
  onChange: (id: string) => void
}

export function ChoiceInput({ options, value, onChange }: Props) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={[
            'w-full text-left px-4 py-3 rounded-xl border-2 text-sm leading-snug transition-all duration-150 font-body',
            value === opt.id
              ? 'border-gold bg-navy-light text-navy font-semibold'
              : 'border-gray-200 bg-white text-charcoal hover:border-gold/60 hover:bg-gold-light',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
