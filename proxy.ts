import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function proxy(request: NextRequest) {
  // Start with a plain next() response; the Supabase client may replace it
  // below if it needs to write refreshed session cookies.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // 1. Write cookies back onto the request so downstream Server
          //    Components see the refreshed values.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // 2. Rebuild supabaseResponse with the mutated request so the
          //    Set-Cookie headers are forwarded to the browser.
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Calling getUser() refreshes the session token when it is close to expiry.
  // Do NOT replace this with getSession() — it only reads the local cookie and
  // won't detect server-side revocations.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/auth')

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static  (static assets)
     * - _next/image   (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
