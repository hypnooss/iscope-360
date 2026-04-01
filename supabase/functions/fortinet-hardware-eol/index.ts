import { getCorsHeaders } from '../_shared/cors.ts';

// In-memory cache (persists across warm invocations)
let cachedItems: Array<{ title: string; endOfOrder: string | null; lastServiceExtension: string | null; endOfSupport: string | null }> | null = null;
let cacheTime = 0;
const CACHE_TTL = 3600_000; // 1 hour

async function fetchRssItems() {
  const now = Date.now();
  if (cachedItems && (now - cacheTime) < CACHE_TTL) return cachedItems;

  const resp = await fetch('https://support.fortinet.com/rss/Hardware.xml');
  if (!resp.ok) throw new Error(`RSS fetch failed: ${resp.status}`);
  const xml = await resp.text();

  // Simple XML parsing for <item> blocks
  const items: typeof cachedItems = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      || block.match(/<title>(.*?)<\/title>/)?.[1]
      || '';
    const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
      || block.match(/<description>(.*?)<\/description>/)?.[1]
      || '';

    // Only FortiGate items
    if (!desc.toLowerCase().includes('category: fortigate') && !title.toLowerCase().includes('fortigate')) continue;

    const extractDate = (label: string): string | null => {
      const re = new RegExp(label + '\\s*[:=]\\s*(\\d{4}-\\d{2}-\\d{2})', 'i');
      return desc.match(re)?.[1] || null;
    };

    items.push({
      title: title.trim(),
      endOfOrder: extractDate('End of Order'),
      lastServiceExtension: extractDate('Last Service Extension'),
      endOfSupport: extractDate('End of Support'),
    });
  }

  cachedItems = items;
  cacheTime = now;
  return items;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[-\s_]/g, '').replace(/fortigate/i, 'fg').replace(/^fgt/, 'fg');
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { model } = await req.json();
    if (!model || typeof model !== 'string') {
      return new Response(JSON.stringify({ error: 'model is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const items = await fetchRssItems();
    const normalizedModel = normalize(model);

    // Try exact normalized match first, then partial
    let found = items!.find(item => normalize(item.title) === normalizedModel);
    if (!found) {
      found = items!.find(item => {
        const nt = normalize(item.title);
        return nt.includes(normalizedModel) || normalizedModel.includes(nt);
      });
    }

    return new Response(JSON.stringify({ data: found || null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
