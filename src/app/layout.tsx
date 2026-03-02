import type { Metadata } from 'next'
import { Montserrat, Inter } from 'next/font/google'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// NEXT_PUBLIC_SITE_URL requis en production pour les URLs absolues dans OG/Twitter
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lucens.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  // Template : chaque page peut faire `title: 'Mon titre'` → "Mon titre | Lucens"
  title: {
    default:  'Lucens — Protocole décisionnel sentimental',
    template: '%s | Lucens',
  },

  description:
    'Un protocole structuré en 7 étapes pour clarifier votre situation sentimentale et prendre une décision lucide — pas impulsive.',

  // Open Graph par défaut (écrasé page par page)
  openGraph: {
    siteName: 'Lucens',
    locale:   'fr_FR',
    type:     'website',
    url:      siteUrl,
  },

  // Twitter Card par défaut
  twitter: {
    card: 'summary_large_image',
    site: '@lucens',
  },

  // Robots par défaut : indexable — les pages privées surchargent ça
  robots: {
    index:  true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${montserrat.variable} ${inter.variable}`}>
      <body className="font-body bg-neutral text-charcoal min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
