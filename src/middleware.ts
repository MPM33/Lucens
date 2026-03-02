import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/dashboard', '/tirage', '/rapport']
const AUTH_ROUTE = '/auth'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              options as Parameters<typeof supabaseResponse.cookies.set>[2],
            ),
          )
        },
      },
    },
  )

  // Rafraîchir la session (obligatoire pour que les Server Components la lisent)
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Redirige vers /auth si la route est protégée et l'utilisatrice n'est pas connectée
  if (!user && PROTECTED.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = AUTH_ROUTE
    return NextResponse.redirect(url)
  }

  // Redirige vers /dashboard si déjà connectée et tente d'accéder à /auth
  if (user && pathname.startsWith(AUTH_ROUTE)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Toutes les routes sauf fichiers statiques et assets
    '/((?!_next/static|_next/image|favicon.ico|og-image.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
