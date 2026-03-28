/**
 * Shared geolocation utilities for resolving coordinates from URLs/IPs.
 */

const isPrivateIP = (ip: string) =>
  /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/.test(ip);

const looksLikeIP = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s);

interface GeoResult {
  lat: number;
  lng: number;
}

async function tryGeolocate(target: string): Promise<GeoResult | null> {
  try {
    const res = await fetch(`https://ipwho.is/${target}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !json.latitude || !json.longitude) return null;
    return { lat: json.latitude as number, lng: json.longitude as number };
  } catch {
    return null;
  }
}

/**
 * Resolve geolocation from a device URL.
 * Steps:
 * 1. If hostname is a public IP, query ipapi.co directly
 * 2. If hostname is a domain, resolve DNS via dns.google then query ipapi.co
 */
export async function resolveGeoFromUrl(url: string): Promise<GeoResult | null> {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // Direct public IP
    if (looksLikeIP(hostname) && !isPrivateIP(hostname)) {
      const geo = await tryGeolocate(hostname);
      if (geo) return geo;
    }

    // DNS resolution for hostnames (or private IPs that won't geolocate)
    if (!looksLikeIP(hostname) || isPrivateIP(hostname)) {
      try {
        const dnsRes = await fetch(`https://dns.google/resolve?name=${hostname}&type=A`);
        const dnsJson = await dnsRes.json();
        const resolvedIP = dnsJson?.Answer?.find((a: any) => a.type === 1)?.data;
        if (resolvedIP && !isPrivateIP(resolvedIP)) {
          const geo = await tryGeolocate(resolvedIP);
          if (geo) return geo;
        }
      } catch {
        // DNS resolution failed
      }
    }
  } catch {
    // Invalid URL
  }

  return null;
}
