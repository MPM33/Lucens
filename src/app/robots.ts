import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lucens.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow:  '/',
        // Bloquer toutes les pages derrière authentification
        disallow: ['/dashboard/', '/tirage/', '/rapport/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
