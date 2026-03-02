import { createBrowserClient } from '@supabase/ssr'

let _instance: ReturnType<typeof createBrowserClient> | null = null

// Singleton pour éviter de créer plusieurs clients en dev (HMR)
export function getSupabaseBrowserClient() {
  if (!_instance) {
    _instance = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return _instance
}
