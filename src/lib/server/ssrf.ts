import dns from 'dns';
import { BlockList, isIP } from 'net';

let lists: { blocked: BlockList; globalV6: BlockList; mappedV4: BlockList } | undefined;
function getAddressLists() {
if (lists) return lists;
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) {
  blocked.addSubnet(address, prefix, 'ipv6');
}
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const mappedV4 = new BlockList();
mappedV4.addSubnet('::ffff:0:0', 96, 'ipv6');
return lists = { blocked, globalV6, mappedV4 };
}

/** Fail closed for invalid, private, local, multicast and reserved addresses. */
export function isPrivateIP(address: string): boolean {
  const { blocked, globalV6, mappedV4 } = getAddressLists();
  const family = isIP(address);
  if (!family) return true;
  if (family === 4) return blocked.check(address, 'ipv4');
  if (blocked.check(address, 'ipv6')) return true;
  return !mappedV4.check(address, 'ipv6') && !globalV6.check(address, 'ipv6');
}

export async function resolvePublicTarget(input: string) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid media URL');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await dns.promises.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateIP(item.address))) throw new Error('Private or reserved network is forbidden');
  return { url, addresses };
}

/** Use fetchPublicUrl for actual requests so the checked DNS result is pinned to the connection. */
export async function validateProxyUrlServerSide(input: string): Promise<boolean> {
  try { await resolvePublicTarget(input); return true; } catch { return false; }
}
