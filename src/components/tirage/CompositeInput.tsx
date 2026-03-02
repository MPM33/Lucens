'use client'

import type { ProtocolSubInput } from '@/protocol/types'
import { ScaleInput } from './ScaleInput'
import { ChoiceInput } from './ChoiceInput'

type SubValue = { scale_value?: number; choice_id?: string }
type CompositeValue = Record<string, SubValue>

type Props = {
  subInputs: ProtocolSubInput[]
  value: CompositeValue
  onChange: (value: CompositeValue) => void
}

export function CompositeInput({ subInputs, value, onChange }: Props) {
  function updateSub(subId: string, patch: Partial<SubValue>) {
    onChange({ ...value, [subId]: { ...(value[subId] ?? {}), ...patch } })
  }

  return (
    <div className="space-y-8">
      {subInputs.map((sub, i) => {
        const subVal = value[sub.id] ?? {}
        return (
          <div key={sub.id}>
            {i > 0 && <hr className="border-stone-100 mb-8" />}
            <p className="text-base font-medium text-stone-800 mb-4">{sub.label}</p>
            {sub.input_type === 'scale_1_5' ? (
              <ScaleInput
                value={subVal.scale_value}
                onChange={(v) => updateSub(sub.id, { scale_value: v })}
              />
            ) : (
              <ChoiceInput
                options={sub.options ?? []}
                value={subVal.choice_id}
                onChange={(id) => updateSub(sub.id, { choice_id: id })}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
