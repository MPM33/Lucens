import type { Metadata } from 'next'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────────────────────────
// SEO — page publique principale
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Lucens — Clarifiez votre situation sentimentale',

  description:
    'Un protocole structuré en 7 étapes pour prendre une décision lucide sur votre relation amoureuse. Analyse personnalisée, résultat en moins de 10 minutes.',

  keywords: [
    'aide décision sentimentale',
    'relation amoureuse ambiguë',
    'protocole décisionnel',
    'clarté émotionnelle',
    'analyse relation',
  ],

  alternates: {
    canonical: '/',
  },

  openGraph: {
    type:        'website',
    url:         '/',
    title:       'Lucens — Clarifiez votre situation sentimentale',
    description: 'Un protocole structuré en 7 étapes pour prendre une décision lucide sur votre relation amoureuse.',
    images: [
      {
        url:    '/og-image.png',
        width:  1200,
        height: 630,
        alt:    'Lucens — Protocole décisionnel sentimental',
      },
    ],
  },

  twitter: {
    card:        'summary_large_image',
    title:       'Lucens — Clarifiez votre situation sentimentale',
    description: 'Un protocole structuré en 7 étapes pour prendre une décision lucide sur votre relation amoureuse.',
    images:      ['/og-image.png'],
  },
}

// JSON-LD : WebApplication schema.org
const jsonLd = {
  '@context': 'https://schema.org',
  '@type':    'WebApplication',
  name:       'Lucens',
  url:        'https://lucens.com',
  description:
    'Protocole structuré d\'aide à la décision sentimentale en 7 étapes. Analyse personnalisée avec 4 orientations possibles.',
  applicationCategory: 'LifestyleApplication',
  operatingSystem:     'Web',
  inLanguage:          'fr-FR',
  offers: {
    '@type':         'Offer',
    price:           '0',
    priceCurrency:   'EUR',
    description:     '1 tirage gratuit par semaine',
  },
  featureList: [
    '7 étapes structurées',
    '4 orientations de décision',
    'Analyse IA personnalisée',
    'Résultat en moins de 10 minutes',
  ],
}

export default function HomePage() {
  return (
    <>
      {/* JSON-LD injecté dans <head> par Next.js */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

    <main className="min-h-screen flex flex-col">
      {/* Hero — 60 % navy */}
      <section className="flex-1 bg-navy flex flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-gold font-heading font-bold text-xs uppercase tracking-widest mb-6">
          Lucens
        </p>
        <h1 className="font-heading font-bold text-3xl sm:text-4xl text-white leading-tight max-w-sm mb-5">
          Clarifiez votre situation sentimentale
        </h1>
        <p className="font-body text-white/60 text-base leading-relaxed max-w-xs mb-10">
          Un protocole structuré pour prendre une décision lucide — pas impulsive.
        </p>

        <Link
          href="/dashboard"
          className="bg-gold text-navy font-heading font-bold text-sm px-8 py-4 rounded-xl hover:bg-gold-hover active:scale-[0.98] transition-all duration-150"
        >
          Commencer un tirage
        </Link>
        <p className="mt-4 text-xs text-white/30 font-body">
          1 tirage gratuit par semaine
        </p>
      </section>

      {/* Statistiques — 30 % neutre */}
      <section className="bg-neutral px-6 py-10">
        <div className="max-w-sm mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { label: '7 étapes', sub: 'structurées' },
            { label: '4 orientations', sub: 'possibles' },
            { label: '< 10 min', sub: 'par tirage' },
          ].map(({ label, sub }) => (
            <div key={label} className="space-y-1">
              <p className="font-heading font-bold text-navy text-base">{label}</p>
              <p className="font-body text-xs text-gray-400">{sub}</p>
            </div>
          ))}
        </div>

        {/* Ligne de ton — 10 % gold */}
        <div className="mt-8 max-w-sm mx-auto border-t border-gray-200 pt-6 text-center space-y-1">
          <p className="font-heading font-semibold text-sm text-charcoal">
            Lucens ne rassure pas artificiellement.
          </p>
          <p className="font-heading font-semibold text-sm text-gold">
            Lucens clarifie.
          </p>
        </div>
      </section>
    </main>
    </>
  )
}
