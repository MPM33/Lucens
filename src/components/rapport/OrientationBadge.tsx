import type { OrientationId } from '@/protocol/types'

// Chaque orientation a sa teinte sémantique, sur fond navy structurant.
const CONFIG: Record<OrientationId, { label: string; dot: string; classes: string }> = {
  rester_en_conscience: {
    label: 'Rester en conscience',
    dot: 'bg-emerald-400',
    classes: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  },
  se_repositionner: {
    label: 'Se repositionner',
    dot: 'bg-gold',
    classes: 'bg-gold-light text-navy border-gold/40',
  },
  distance_strategique: {
    label: 'Prendre de la distance',
    dot: 'bg-blue-400',
    classes: 'bg-blue-50 text-blue-900 border-blue-200',
  },
  partir_et_se_proteger: {
    label: 'Partir et se protéger',
    dot: 'bg-red-400',
    classes: 'bg-red-50 text-red-900 border-red-200',
  },
}

export function OrientationBadge({ orientation }: { orientation: OrientationId }) {
  const { label, dot, classes } = CONFIG[orientation]
  return (
    <span
      className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border font-heading font-semibold text-sm tracking-wide ${classes}`}
    >
      <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />
      {label}
    </span>
  )
}
