/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { isAccessTokenInvalidated } from '@/lib/access-token-invalidation';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { verifyAuthSignature } from '@/lib/auth-signature';
import { isTVModeEnabled, resolveLoginPath } from '@/lib/tv-mode';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isTVModeEnabled() && isTVModePath(pathname)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // 跳过不需要认证的路径
  if (shouldSkipAuth(pathname)) {
    return NextResponse.next();
  }

  if (!process.env.PASSWORD) {
    // 如果未配置密码，重定向到警告页面
    const warningUrl = new URL('/warning', request.url);
    return warningUrl.pathname === pathname
      ? NextResponse.next()
      : NextResponse.redirect(warningUrl);
  }

  // 从cookie获取认证信息
  const authInfo = getAuthInfoFromCookie(request);

  if (!authInfo) {
    return handleAuthFailure(request, pathname);
  }

  const valid = await verifyAuthSignature(authInfo, {
    // The client can refresh an expired access token after the page shell loads.
    allowExpiredAccessToken: !pathname.startsWith('/api'),
  });
  if (!valid || isAccessTokenInvalidated(authInfo))
    return handleAuthFailure(request, pathname);
  return NextResponse.next();
}

// 处理认证失败的情况
function handleAuthFailure(
  request: NextRequest,
  pathname: string
): NextResponse {
  // 如果是 API 路由，返回 401 状态码
  if (pathname.startsWith('/api')) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'Cache-Control': 'private, no-store',
        'CDN-Cache-Control': 'no-store',
        Vary: 'Cookie, Authorization',
      },
    });
  }

  // TV 端页面未授权时进入电视扫码登录页
  const loginUrl = new URL(resolveLoginPath(pathname), request.url);
  // 保留完整的URL，包括查询参数
  const fullUrl = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('redirect', fullUrl);
  return NextResponse.redirect(loginUrl);
}

// 判断是否需要跳过认证的路径
function shouldSkipAuth(pathname: string): boolean {
  // The login page must be able to register the worker and its push extension.
  if (pathname === '/sw.js' || pathname === '/push-sw.js') return true;
  // These public player assets are also requested by worker/runtime loading.
  if (
    pathname.startsWith('/players/') ||
    pathname.startsWith('/assets/jassub/') ||
    pathname === '/scripts/bangumi-proxy.worker.js'
  ) return true;
  // The internal worker route validates a process-local secret, never a browser cookie.
  if (pathname === '/api/ai-comments/worker') return true;
  const skipPaths = [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/manifest.json',
    '/icons/',
    '/logo.png',
    '/screenshot.png',
  ];

  return skipPaths.some((path) => pathname.startsWith(path));
}

function isTVModePath(pathname: string): boolean {
  return (
    pathname === '/tv' ||
    pathname.startsWith('/tv/') ||
    pathname.startsWith('/api/tv-remote/')
  );
}

// 配置middleware匹配规则
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|register|oidc-register|qr-login|warning|tv/login|api/login|api/register|api/logout|api/auth/oidc|api/auth/qr|api/auth/refresh|api/telegram/login|api/telegram/config|api/telegram/webhook|api/cron/|api/server-config|api/proxy-m3u8|api/proxy/vod/|api/video-proxy|api/cms-proxy|api/tvbox/subscribe|api/theme/css|api/openlist/cms-proxy|api/openlist/play|api/openlist/proxy|api/emby/cms-proxy|api/emby/play|api/emby/subtitle|api/emby/sources|tvbox/).*)',
  ],
};
