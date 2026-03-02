import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Rapport',
  robots: { index: false, follow: false },
}

export default function RapportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
