import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tableau de bord',
  // Page derrière authentification : pas d'indexation
  robots: { index: false, follow: false },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
