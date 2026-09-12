import bs58 from 'bs58';

import type { ConfigSubscription } from '@/lib/admin.types';
import {
  MAX_CONFIG_BYTES,
  parseSubscriptionConfig,
  validateSubscriptions,
} from '@/lib/config-subscriptions';

import { readLimitedText } from './media-body';

export async function fetchSubscriptionContent(url: string): Promise<string> {
  const [validated] = validateSubscriptions([
    {
      ID: 'fetch',
      Name: '',
      URL: url,
      Enabled: true,
      AutoUpdate: false,
      LastCheck: '',
    },
  ]);
  // Owner-managed configuration fetches retain the runtime's normal network path.
  // Media proxy DNS pinning would reject the fake IPs used by local network proxies.
  const response = await fetch(validated.URL, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`请求失败：HTTP ${response.status}`);
  }
  const text = (await readLimitedText(response, MAX_CONFIG_BYTES)).trim();
  let content: string;
  try {
    content = text.startsWith('{')
      ? text
      : new TextDecoder().decode(bs58.decode(text));
  } catch {
    throw new Error('订阅内容不是有效的 JSON 或 Base58 编码');
  }
  return JSON.stringify(parseSubscriptionConfig(content));
}

export async function refreshSubscriptions(
  subscriptions: ConfigSubscription[],
  options: { id?: string; automatic?: boolean; retries?: number } = {},
  fetchContent: (url: string) => Promise<string> = fetchSubscriptionContent
): Promise<ConfigSubscription[]> {
  const next = subscriptions.map((sub) => ({ ...sub }));
  const pending = next.filter(
    (sub) =>
      sub.Enabled &&
      (!options.id || sub.ID === options.id) &&
      (!options.automatic || (sub.AutoUpdate && (!sub.LastAttempt || Date.now() - Date.parse(sub.LastAttempt) >= (sub.UpdateIntervalHours || 1) * 3600_000)))
  );
  // Limit concurrent requests without making a failed subscription block its peers.
  await Promise.all(
    Array.from({ length: Math.min(4, pending.length) }, async () => {
      for (;;) {
        const sub = pending.shift();
        if (!sub) return;
        try {
          sub.LastAttempt = new Date().toISOString();
          let content = '';
          for (let attempt = 0; ; attempt++) {
            try { content = await fetchContent(sub.URL); break; }
            catch (error) {
              if (attempt >= (options.retries ?? 2)) throw error;
              await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
            }
          }
          parseSubscriptionConfig(content);
          sub.ConfigContent = content;
          sub.LastCheck = new Date().toISOString();
          sub.LastError = '';
        } catch (error) {
          sub.LastError =
            error instanceof Error
              ? error.message.slice(0, 1000)
              : '订阅更新失败';
        }
      }
    })
  );
  return next;
}
