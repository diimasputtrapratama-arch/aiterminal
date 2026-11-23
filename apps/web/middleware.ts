import { NextResponse, type NextRequest } from 'next/server';
// Pemeriksaan ringan; verifikasi tanda tangan sesi dilakukan di setiap API route.
export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname; if (p.startsWith('/api') || p === '/login' || p.startsWith('/_next')) return NextResponse.next();
  return req.cookies.get('att_session') ? NextResponse.next() : NextResponse.redirect(new URL('/login', req.url));
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
