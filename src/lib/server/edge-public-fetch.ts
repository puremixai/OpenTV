import { validateProxyUrlServerSide } from './edge-ssrf';

/** Edge fetch cannot use Node's pinned DNS agent. Restrict proxying to explicitly trusted hosts. */
export async function fetchPublicUrl(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const name of ['authorization', 'cookie', 'host', 'proxy-authorization'])
    headers.delete(name);
  let url = new URL(input);
  for (let hop = 0; hop <= 5; hop++) {
    if (!(await validateProxyUrlServerSide(url.href))) {
      throw new Error(
        'Edge media proxy requires this host in MEDIA_PROXY_ALLOWED_HOSTS'
      );
    }
    const response = await fetch(url, {
      ...init,
      headers,
      redirect: 'manual',
      signal: init.signal || AbortSignal.timeout(30_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location || hop === 5)
      throw new Error('Invalid or excessive media redirects');
    url = new URL(location, url);
  }
  throw new Error('Too many redirects');
}

export { readLimitedText } from './media-body';
