import dns from 'node:dns/promises';
import net from 'node:net';

// IPv4 ranges that must never be fetched server-side on a user's behalf:
// loopback, RFC1918 private ranges, link-local, and the cloud metadata
// endpoint (169.254.169.254 falls under link-local already, called out here
// for clarity since it's the classic SSRF target on cloud providers).
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();
  return (
    normalized === '::1' || // loopback
    normalized.startsWith('fe80:') || // link-local
    normalized.startsWith('fc') || // unique local (fc00::/7)
    normalized.startsWith('fd')
  );
}

/**
 * Resolves the hostname in `urlString` and throws if it points at a private,
 * loopback, or link-local address. Call this before any server-side fetch of
 * a URL the person supplied - never trust a hostname string alone, since DNS
 * can resolve a public-looking name to an internal address.
 */
export async function assertPublicHostname(urlString) {
  const { hostname } = new URL(urlString);

  if (hostname === 'localhost') {
    throw new Error('Refusing to fetch localhost');
  }

  // If it's already a literal IP, skip DNS and check it directly.
  if (net.isIP(hostname)) {
    const blocked = net.isIP(hostname) === 4 ? isPrivateIPv4(hostname) : isPrivateIPv6(hostname);
    if (blocked) throw new Error(`Refusing to fetch private address ${hostname}`);
    return;
  }

  const records = await dns.lookup(hostname, { all: true });
  for (const { address, family } of records) {
    const blocked = family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
    if (blocked) {
      throw new Error(`Refusing to fetch ${hostname} - resolves to private address ${address}`);
    }
  }
}
