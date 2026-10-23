import { formatUnits, decodeAbiParameters } from 'viem';
import { ANS_ABI, ANS_ADDRESS } from './abis';
import { cleanName } from './activity';
import { supabase, isSupabaseConfigured } from './supabase';

export interface MarketplaceListing {
  name: string;
  seller: string;
  price: number; // in USDC
  expiry: number;
}

export interface SoldListing {
  name: string;
  seller: string;
  buyer: string;
  price: number;
  timestamp: number;
  txHash?: string;
}

const STORAGE_KEY = `ans_marketplace_candidates_${ANS_ADDRESS}`;
const ACTIVE_CACHE_KEY = `ans_active_listings_cache_${ANS_ADDRESS}`;
const SOLD_STORAGE_KEY = `ans_marketplace_sold_${ANS_ADDRESS}`;
const SOLD_STORAGE_VERSION = `ans_sold_v7_${ANS_ADDRESS}`;

export const INITIAL_ACTIVE_LISTINGS: MarketplaceListing[] = [];
export const INITIAL_SOLD_LISTINGS: SoldListing[] = [];

interface SupabaseActiveRow {
  name: string;
  seller: string;
  price: number | string;
  listed_at?: string;
}

interface SupabaseSoldRow {
  name: string;
  seller: string;
  buyer?: string | null;
  price: number | string;
  sold_at?: string | null;
  last_tx_hash?: string | null;
}

interface ContractLogItem {
  address?: string;
  topics?: string[];
  data?: `0x${string}`;
  transaction_hash?: string;
  tx_hash?: string;
  block_timestamp?: string;
  timestamp?: string;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SUPABASE REALTIME & INDEXED PERSISTENCE (APPROACH 2)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function fetchActiveListingsFromSupabase(): Promise<MarketplaceListing[] | null> {
  if (!supabase || !isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('name, seller, price, listed_at')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) {
      // Table may not be created yet on remote Supabase instance
      return null;
    }

    if (!Array.isArray(data) || data.length === 0) return null;

    return (data as unknown as SupabaseActiveRow[]).map((row) => ({
      name: row.name.endsWith('.arc') ? row.name : `${row.name}.arc`,
      seller: row.seller,
      price: Number(row.price),
      expiry: Date.now() + 90 * 24 * 60 * 60 * 1000,
    }));
  } catch (err) {
    console.warn('[Marketplace] Supabase active fetch error:', err);
    return null;
  }
}

export async function fetchSoldListingsFromSupabase(): Promise<SoldListing[] | null> {
  if (!supabase || !isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('name, seller, buyer, price, sold_at, last_tx_hash')
      .eq('is_active', false)
      .not('sold_at', 'is', null)
      .order('sold_at', { ascending: false })
      .limit(50);

    if (error) {
      return null;
    }

    if (!Array.isArray(data) || data.length === 0) return null;

    return (data as unknown as SupabaseSoldRow[]).map((row) => ({
      name: row.name.endsWith('.arc') ? row.name : `${row.name}.arc`,
      seller: row.seller,
      buyer: row.buyer || '0x0000000000000000000000000000000000000000',
      price: Number(row.price),
      timestamp: row.sold_at ? new Date(row.sold_at).getTime() : Date.now(),
      txHash: row.last_tx_hash || undefined,
    }));
  } catch (err) {
    console.warn('[Marketplace] Supabase sold fetch error:', err);
    return null;
  }
}

/**
 * Optimistically upsert or update a listing in Supabase immediately upon user transaction
 */
export async function syncListingToSupabase(listing: {
  name: string;
  seller: string;
  price: number;
  is_active?: boolean;
  buyer?: string;
  txHash?: string;
}): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;
  try {
    const rawClean = cleanName(listing.name);
    const fullName = `${rawClean}.arc`;
    const payload: Record<string, unknown> = {
      name: fullName,
      seller: listing.seller.toLowerCase(),
      price: listing.price,
      is_active: listing.is_active !== false,
      last_tx_hash: listing.txHash || null,
      updated_at: new Date().toISOString(),
    };
    if (listing.is_active === false) {
      payload.sold_at = new Date().toISOString();
      if (listing.buyer) payload.buyer = listing.buyer.toLowerCase();
    } else {
      payload.listed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('marketplace_listings')
      .upsert(payload, { onConflict: 'name' });

    if (error) {
      console.warn('[Marketplace] syncListingToSupabase warning:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Marketplace] syncListingToSupabase failed:', err);
    return false;
  }
}

/**
 * Subscribe to realtime changes in marketplace_listings table
 */
export function subscribeToMarketplaceRealtime(onChanged: () => void): () => void {
  if (!supabase || !isSupabaseConfigured) return () => {};
  try {
    const channel = supabase
      .channel('realtime_marketplace')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'marketplace_listings' },
        () => {
          onChanged();
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCAL CACHE & TRACKING HELPERS
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function getTrackedListingNames(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const set = new Set<string>(Array.isArray(parsed) ? parsed.map(cleanName) : []);
    return Array.from(set);
  } catch {
    return [];
  }
}

export function removeSoldListing(name: string): void {
  const clean = cleanName(name);
  if (!clean) return;
  try {
    const raw = localStorage.getItem(SOLD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const updated = parsed.filter((item: SoldListing) => cleanName(item.name) !== clean);
        localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(updated));
      }
    }
  } catch (err) {
    console.error('Failed to remove sold listing:', err);
  }
}

export function addTrackedListing(name: string): void {
  const clean = cleanName(name);
  if (!clean) return;
  try {
    removeSoldListing(clean);
    const current = getTrackedListingNames();
    if (!current.includes(clean)) {
      current.push(clean);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    }
    window.dispatchEvent(new CustomEvent('ans_marketplace_updated'));
  } catch (err) {
    console.error('Failed to track listing:', err);
  }
}

export function removeTrackedListing(name: string): void {
  const clean = cleanName(name);
  if (!clean) return;
  try {
    const current = getTrackedListingNames();
    const updated = current.filter(n => cleanName(n) !== clean);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('ans_marketplace_updated'));
  } catch (err) {
    console.error('Failed to untrack listing:', err);
  }
}

/**
 * Get cached active listings for instant 0ms UI rendering
 * BUGFIX: Never resurrect INITIAL_ACTIVE_LISTINGS if the cached array is simply empty!
 */
export function getCachedActiveListings(): MarketplaceListing[] {
  try {
    const raw = localStorage.getItem(ACTIVE_CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

/** In-memory log cache shared between fetchActiveListings and syncSoldListingsFromLogs per-call */
let _sharedLogsCache: { items: ContractLogItem[]; fetchedAt: number } | null = null;
const LOG_CACHE_TTL_MS = 25_000;

async function fetchContractLogs(): Promise<ContractLogItem[]> {
  const now = Date.now();
  if (_sharedLogsCache && now - _sharedLogsCache.fetchedAt < LOG_CACHE_TTL_MS) {
    return _sharedLogsCache.items;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://explorer.testnet.arc.io/api/v2/addresses/${ANS_ADDRESS}/logs`, {
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeoutId);
    if (res && res.ok) {
      const json = await res.json();
      const items = (json.items || []) as ContractLogItem[];
      _sharedLogsCache = { items, fetchedAt: Date.now() };
      return items;
    }
  } catch {}
  return _sharedLogsCache?.items ?? [];
}

/**
 * Primary Fetcher:
 * 1. Checks Supabase marketplace_listings index (sub-30ms, deterministic across all users).
 * 2. Falls back to on-chain event reconstruction and RPC check if Supabase is offline.
 */
// oxlint-disable-next-line typescript(no-explicit-any)
export async function fetchActiveListings(publicClient: any, userOwnedNames: string[] = []): Promise<MarketplaceListing[]> {
  // 1. Try Supabase first (verified on-chain)
  const supabaseActive = await fetchActiveListingsFromSupabase();
  if (supabaseActive && supabaseActive.length > 0) {
    const verifiedResults = await Promise.all(
      supabaseActive.map(async (item) => {
        try {
          const clean = cleanName(item.name);
          const [onChainListing, onChainRecord] = await Promise.all([
            publicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'getListing',
              args: [clean],
            }).catch(() => null) as Promise<{ seller: string; price: bigint; active: boolean } | null>,
            publicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'getRecord',
              args: [clean],
            }).catch(() => null) as Promise<[string, bigint, boolean] | { owner: string; expiry: bigint; listed: boolean } | null>,
          ]);

          if (onChainListing && onChainListing.active && onChainListing.seller !== '0x0000000000000000000000000000000000000000') {
            let realExpiry = 0;
            if (onChainRecord) {
              if (Array.isArray(onChainRecord)) {
                realExpiry = Number(onChainRecord[1] || 0n) * 1000;
              } else if (typeof onChainRecord === 'object' && 'expiry' in onChainRecord) {
                realExpiry = Number(onChainRecord.expiry || 0n) * 1000;
              }
            }
            return {
              name: `${clean}.arc`,
              seller: onChainListing.seller,
              price: Number(formatUnits(onChainListing.price, 6)),
              expiry: realExpiry > 0 ? realExpiry : (Date.now() + 90 * 24 * 60 * 60 * 1000),
            };
          }
          return null;
        } catch {
          return null;
        }
      })
    );
    const verifiedActive = verifiedResults.filter((x): x is MarketplaceListing => x !== null);
    try {
      localStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(verifiedActive));
    } catch {}
    return verifiedActive;
  }

  // 2. Fallback: On-Chain Event Logs + RPC Verification
  const tracked = getTrackedListingNames();
  const candidates = new Set<string>([
    ...tracked,
    ...userOwnedNames.map(cleanName),
  ]);

  const logActiveMap = new Map<string, MarketplaceListing>();
  const logDeadNames = new Set<string>();

  try {
    const items = await fetchContractLogs();
    const chronological = [...items].reverse();
    for (const log of chronological) {
      const data = log.data;
      const topics = log.topics;
      if (!data || !topics || !topics[0]) continue;
      const topic0 = topics[0];
      if (topic0 === '0xc87e6029eb4b9211a0eb39f94b63248b8b1660b93a577aa53d04aeaf66ca77bc') {
        // NameListed
        if (!topics[1]) continue;
        try {
          const decoded = decodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], data);
          const clean = cleanName(decoded[0]);
          const seller = '0x' + topics[1].slice(26);
          const price = Number(decoded[1]) / 1e6;
          candidates.add(clean);
          logDeadNames.delete(clean);
          logActiveMap.set(clean, {
            name: decoded[0].endsWith('.arc') ? decoded[0] : `${decoded[0]}.arc`,
            seller,
            price,
            expiry: Date.now() + 90 * 24 * 60 * 60 * 1000,
          });
        } catch {}
      } else if (topic0?.toLowerCase() === '0xe3202271e290250caf3bcfb96c2e7e8e5f63158e26901feb4c260069737892ef') {
        // NameSold
        try {
          const decoded = decodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], data);
          const clean = cleanName(decoded[0]);
          logActiveMap.delete(clean);
          logDeadNames.add(clean);
        } catch {}
      } else if (topic0?.toLowerCase() === '0x4995c55eb42e0054dd11f631d6071f3ac8d525d856e7492f4b766858e9659d5f') {
        // NameListingCancelled
        try {
          const decoded = decodeAbiParameters([{ type: 'string' }], data);
          const clean = cleanName(decoded[0]);
          logActiveMap.delete(clean);
          logDeadNames.add(clean);
        } catch {}
      }
    }
  } catch {}

  const candidatesArray = Array.from(candidates).filter(Boolean);
  const confirmedActive: MarketplaceListing[] = [];
  const confirmedDead = new Set<string>(logDeadNames);

  for (let i = 0; i < candidatesArray.length; i += 2) {
    const batch = candidatesArray.slice(i, i + 2);
    await Promise.all(
      batch.map(async (cand) => {
        try {
          const listing = (await publicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getListing',
            args: [cand],
          })) as { seller: string; price: bigint; active: boolean } | null;
          if (listing && listing.active && listing.seller !== '0x0000000000000000000000000000000000000000') {
            confirmedActive.push({
              name: `${cand}.arc`,
              seller: listing.seller,
              price: Number(formatUnits(listing.price, 6)),
              expiry: Date.now() + 90 * 24 * 60 * 60 * 1000,
            });
            confirmedDead.delete(cand);
          } else {
            confirmedDead.add(cand);
          }
        } catch {
          if (logActiveMap.has(cand)) {
            confirmedActive.push(logActiveMap.get(cand)!);
          }
        }
      })
    );
    if (i + 2 < candidatesArray.length) {
      await new Promise((r) => setTimeout(r, 75));
    }
  }

  const mergedMap = new Map<string, MarketplaceListing>();
  for (const [cand, item] of logActiveMap) {
    if (!confirmedDead.has(cand)) {
      mergedMap.set(cand, item);
    }
  }
  for (const item of confirmedActive) {
    mergedMap.set(cleanName(item.name), item);
  }

  const finalActive = Array.from(mergedMap.values());
  const toReturn = finalActive;
  const finalTracked = Array.from(new Set([...candidatesArray, ...toReturn.map(l => cleanName(l.name))]));

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(finalTracked));
    localStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(toReturn));
  } catch {}

  return toReturn;
}

export function getSoldListings(activeNames?: Set<string> | string[]): SoldListing[] {
  try {
    if (typeof window !== 'undefined' && localStorage.getItem(SOLD_STORAGE_VERSION) !== 'true') {
      localStorage.removeItem(SOLD_STORAGE_KEY);
      localStorage.setItem(SOLD_STORAGE_VERSION, 'true');
    }

    const raw = localStorage.getItem(SOLD_STORAGE_KEY);
    let parsed: SoldListing[] = [];
    if (raw) {
      const stored = JSON.parse(raw);
      if (Array.isArray(stored)) {
        parsed = stored;
      }
    }

    // Filter out mock placeholder names
    let purged = parsed.filter((item: SoldListing) => {
      const c = cleanName(item.name);
      return c !== 'genesis' && c !== 'crypto' && c !== 'alpha' && c !== 'maler' && c !== 'fer' && c !== 'feran';
    });

    let activeSet: Set<string>;
    if (activeNames instanceof Set) {
      activeSet = activeNames;
    } else if (Array.isArray(activeNames)) {
      activeSet = new Set(activeNames.map(cleanName));
    } else {
      const cached = getCachedActiveListings();
      activeSet = new Set(cached.map(c => cleanName(c.name)));
    }

    if (activeSet.size > 0) {
      purged = purged.filter((item: SoldListing) => !activeSet.has(cleanName(item.name)));
    }

    return purged;
  } catch {
    return [];
  }
}

export function recordSoldListing(item: SoldListing): void {
  try {
    const current = getSoldListings();
    const clean = cleanName(item.name);
    const updated = [item, ...current.filter(c => cleanName(c.name) !== clean)];
    localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('ans_marketplace_updated'));
  } catch (err) {
    console.error('Failed to record sold listing:', err);
  }
}

export async function syncSoldListingsFromLogs(activeListingsInput?: MarketplaceListing[]): Promise<SoldListing[]> {
  // 1. Try Supabase first
  const supabaseSold = await fetchSoldListingsFromSupabase();
  if (supabaseSold && supabaseSold.length > 0) {
    try {
      localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(supabaseSold));
    } catch {}
    return supabaseSold;
  }

  // 2. Fallback: Parse Blockscout contract logs
  try {
    const items = await fetchContractLogs();
    if (!items.length) return getSoldListings();

    const activeListings = activeListingsInput || getCachedActiveListings();
    const activeNames = new Set(activeListings.map(l => cleanName(l.name)));

    const current = getSoldListings(activeNames);
    let updated = [...current];
    let changed = false;

    for (const item of items) {
      const data = item.data;
      const topics = item.topics;
      if (!data || !topics || !topics[0] || !topics[1] || !topics[2]) continue;
      if (topics[0]?.toLowerCase() === '0xe3202271e290250caf3bcfb96c2e7e8e5f63158e26901feb4c260069737892ef') {
        try {
          const seller = ('0x' + topics[1].slice(26)).toLowerCase();
          const buyer = ('0x' + topics[2].slice(26)).toLowerCase();
          const decoded = decodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], data);
          const clean = cleanName(decoded[0]);

          if (activeNames.has(clean)) {
            continue;
          }

          const name = decoded[0].endsWith('.arc') ? decoded[0] : `${decoded[0]}.arc`;
          const price = Number(decoded[1]) / 1e6;
          const itemTs = item.block_timestamp || item.timestamp;
          const timestamp = itemTs ? new Date(itemTs).getTime() : Date.now();
          const txHash = item.transaction_hash || item.tx_hash || '';

          const idx = updated.findIndex(s => cleanName(s.name) === clean && (s.txHash === txHash || (!s.txHash && !txHash)));
          if (idx === -1) {
            updated.push({
              name,
              seller,
              buyer,
              price,
              timestamp,
              txHash,
            });
            changed = true;
          }
        } catch {}
      }
    }

    // Always sort newest first
    updated.sort((a, b) => b.timestamp - a.timestamp);

    if (activeNames.size > 0) {
      const filtered = updated.filter(s => !activeNames.has(cleanName(s.name)));
      if (filtered.length !== updated.length) {
        updated = filtered;
        changed = true;
      }
    }

    if (changed || updated.length > 0) {
      localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(updated));
      localStorage.setItem('ans_marketplace_sold', JSON.stringify(updated));
      // NOTE: Do NOT dispatch 'ans_marketplace_updated' here to avoid infinite render loop!
    }
    return updated;
  } catch {
    return getSoldListings();
  }
}
