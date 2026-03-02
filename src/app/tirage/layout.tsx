import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tirage en cours',
  robots: { index: false, follow: false },
}

export default function TirageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
