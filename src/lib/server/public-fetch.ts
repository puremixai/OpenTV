import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import type { LookupFunction } from 'net';
import nodeFetch from 'node-fetch';
import { Readable } from 'stream';

import { resolvePublicTarget } from './ssrf';

export async function fetchPublicUrl(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  let url = input;
  const headers = new Headers(init.headers);
  // A media proxy must never forward site credentials or a caller-controlled Host header.
  for (const name of ['authorization', 'cookie', 'host', 'proxy-authorization'])
    headers.delete(name);

  for (let hop = 0; hop <= 5; hop++) {
    const target = await resolvePublicTarget(url);
    const lookup: LookupFunction = (_host, options, callback) => {
      const addresses = target.addresses.filter(
        (item) => !options.family || item.family === options.family
      );
      if (!addresses.length)
        return callback(
          new Error('No permitted address for this family'),
          '',
          0
        );
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    };
    const Agent = target.url.protocol === 'https:' ? HttpsAgent : HttpAgent;
    const agent = new Agent({ keepAlive: false, lookup });
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal?.aborted) controller.abort();
    init.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 30_000);
    let streaming = false;
    const cleanup = () => {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', abort);
      agent.destroy();
    };
    try {
      const response = await nodeFetch(target.url.href, {
        method: 'GET',
        headers: Object.fromEntries(headers.entries()),
        redirect: 'manual',
        agent,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        (response.body as Readable | null)?.destroy();
        const location = response.headers.get('location');
        if (!location || hop === 5)
          throw new Error('Invalid or excessive media redirects');
        url = new URL(location, target.url).href;
        continue;
      }
      const responseHeaders = new Headers();
      response.headers.forEach((value, name) =>
        responseHeaders.set(name, value)
      );
      if (responseHeaders.has('content-encoding')) {
        responseHeaders.delete('content-encoding');
        responseHeaders.delete('content-length');
      }
      responseHeaders.delete('set-cookie');
      const noBody = [204, 205, 304].includes(response.status);
      if (!noBody && response.body) {
        streaming = true;
        (response.body as Readable).once('close', cleanup);
      }
      const body =
        noBody || !response.body
          ? null
          : (Readable.toWeb(
              response.body as Readable
            ) as ReadableStream<Uint8Array>);
      const result = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
      Object.defineProperty(result, 'url', { value: target.url.href });
      return result;
    } finally {
      if (!streaming) cleanup();
    }
  }
  throw new Error('Too many redirects');
}

export { readLimitedText } from './media-body';
