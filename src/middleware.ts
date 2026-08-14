import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  WORKSPACE_COOKIE,
  hasSupabaseAuthCookie,
  workspaceCookieOptions,
} from '@/lib/auth/workspace-cookie'

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
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do NOT call getUser() here. Hard refresh sends the document request
  // and then the browser client also refreshes; two refresh-token uses
  // wedge the session until cookies are cleared.
  const loggedIn = hasSupabaseAuthCookie(request.cookies.getAll())

  const withAuthCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  if (loggedIn && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/dashboard'
      url.search = ''
    }
    return withAuthCookies(NextResponse.redirect(url))
  }

  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/automations', '/settings']
  if (!loggedIn && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withAuthCookies(NextResponse.redirect(url))
  }

  if (!loggedIn && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return withAuthCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  if (loggedIn && request.nextUrl.pathname.startsWith('/api/')) {
    const queryWorkspaceId = request.nextUrl.searchParams.get('workspace_id')
    let workspaceId = queryWorkspaceId || request.cookies.get(WORKSPACE_COOKIE)?.value
    if (!workspaceId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: firstMember } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()
        workspaceId = firstMember?.workspace_id
      }
    }
    if (workspaceId) {
      supabaseResponse.cookies.set(WORKSPACE_COOKIE, workspaceId, workspaceCookieOptions)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
