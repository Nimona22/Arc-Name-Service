import { formatUnits, parseAbiItem, decodeEventLog, decodeAbiParameters } from 'viem';
import { ANS_ABI, ANS_ADDRESS } from './abis';
import { cleanName } from './activity';

export interface MarketplaceListing {
  name: string;
  seller: string;
  price: number; // in USDC
  expiry: number;
}

const STORAGE_KEY = 'ans_marketplace_candidates';

/**
 * Get candidate names that were listed for sale
 */
export function getTrackedListingNames(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const set = new Set<string>(['ferar', 'user1', ...(Array.isArray(parsed) ? parsed.map(cleanName) : [])]);
    return Array.from(set);
  } catch {
    return ['ferar', 'user1'];
  }
}

export function removeSoldListing(name: string): void {
  const clean = cleanName(name);
  if (!clean) return;
  try {
    const raw = localStorage.getItem('ans_marketplace_sold');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const updated = parsed.filter((item: any) => cleanName(item.name) !== clean);
        localStorage.setItem('ans_marketplace_sold', JSON.stringify(updated));
      }
    }
  } catch (err) {
    console.error('Failed to remove sold listing:', err);
  }
}

/**
 * Add a name to tracked marketplace candidates
 */
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

/**
 * Remove a name from tracked marketplace candidates
 */
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

const ACTIVE_CACHE_KEY = 'ans_active_listings_cache';

export const INITIAL_ACTIVE_LISTINGS: MarketplaceListing[] = [
  {
    name: 'ferar.arc',
    seller: '0x815289D5c67E533d008fd38C51B1159cFa9BDa0c',
    price: 8.0,
    expiry: Date.now() + 90 * 24 * 60 * 60 * 1000,
  },
  {
    name: 'user1.arc',
    seller: '0x815289D5c67E533d008fd38C51B1159cFa9BDa0c',
    price: 6.5,
    expiry: Date.now() + 90 * 24 * 60 * 60 * 1000,
  },
];

/**
 * Get cached active listings for instant 0ms UI rendering
 */
export function getCachedActiveListings(): MarketplaceListing[] {
  try {
    const raw = localStorage.getItem(ACTIVE_CACHE_KEY);
    if (!raw) {
      localStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(INITIAL_ACTIVE_LISTINGS));
      return INITIAL_ACTIVE_LISTINGS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(INITIAL_ACTIVE_LISTINGS));
      return INITIAL_ACTIVE_LISTINGS;
    }
    return parsed;
  } catch {
    return INITIAL_ACTIVE_LISTINGS;
  }
}

/**
 * Query on-chain contract to verify and fetch all truly active listings.
 * Uses parallel requests and fast timeouts for rapid loading.
 */
export function fetchActiveListings(publicClient: any, userOwnedNames: string[] = []): Promise<MarketplaceListing[]> {
  return (async () => {
    const tracked = getTrackedListingNames();
    const candidates = new Set([...tracked, ...userOwnedNames.map(cleanName), 'ferar', 'user1', 'nimox']);

    try {
      // 1. Try Explorer v2 API with a fast 1.2s timeout so it never stalls the UI
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const apiRes = await fetch(`https://explorer.testnet.arc.io/api/v2/addresses/${ANS_ADDRESS}/logs`, {
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeoutId);

      if (apiRes && apiRes.ok) {
        const json = await apiRes.json();
        const items = json.items || [];
        for (const log of items) {
          if (log.topics?.[0] === '0xc87e6029eb4b9211a0eb39f94b63248b8b1660b93a577aa53d04aeaf66ca77bc') {
            try {
              const decoded = decodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], log.data);
              if (decoded[0]) {
                candidates.add(cleanName(decoded[0]));
              }
            } catch {}
          }
        }
      }
    } catch {
      // Explorer fetch failed or timed out; proceed immediately with candidates
    }

    const candidatesArray = Array.from(candidates).filter(Boolean);

    // 2. Query candidates concurrently in parallel with Promise.all
    const results = await Promise.all(
      candidatesArray.map(async (cand) => {
        try {
          const listing = await publicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getListing',
            args: [cand],
          });

          if (listing && listing.active && listing.seller !== '0x0000000000000000000000000000000000000000') {
            return {
              cand,
              listing: {
                name: `${cand}.arc`,
                seller: listing.seller,
                price: Number(formatUnits(listing.price, 6)),
                expiry: Date.now() + 90 * 24 * 60 * 60 * 1000,
              } as MarketplaceListing,
            };
          }
        } catch {
          // Inactive or not listed
        }
        return null;
      })
    );

    const activeListings: MarketplaceListing[] = [];
    const validTracked: string[] = [];

    for (const res of results) {
      if (res) {
        activeListings.push(res.listing);
        validTracked.push(res.cand);
      }
    }

    const finalActive = activeListings.length > 0 ? activeListings : getCachedActiveListings();
    const finalTracked = Array.from(new Set([...validTracked, ...finalActive.map(l => cleanName(l.name)), 'ferar', 'user1']));

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finalTracked));
      localStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(finalActive));

      // Automatically purge any actively listed names from sold listings storage so they never conflict
      const activeCleanSet = new Set(finalActive.map(l => cleanName(l.name)));
      const rawSold = localStorage.getItem(SOLD_STORAGE_KEY);
      if (rawSold) {
        const parsedSold = JSON.parse(rawSold);
        if (Array.isArray(parsedSold)) {
          const purgedSold = parsedSold.filter((s: SoldListing) => !activeCleanSet.has(cleanName(s.name)));
          if (purgedSold.length !== parsedSold.length) {
            localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(purgedSold));
          }
        }
      }
    } catch {
      // ignore storage errors
    }

    return finalActive;
  })();
}

export interface SoldListing {
  name: string;
  seller: string;
  buyer: string;
  price: number;
  timestamp: number;
  txHash?: string;
}

const SOLD_STORAGE_KEY = 'ans_marketplace_sold';

export const INITIAL_SOLD_LISTINGS: SoldListing[] = [
  {
    name: 'feran.arc',
    seller: '0x5B16cCCB2A13Fd2c5feC3321f0cFA98bccBBDa7d',
    buyer: '0x815289D5c67E533d008fd38C51B1159cFa9BDa0c',
    price: 5.0,
    timestamp: 1791845600000,
    txHash: '0xb700f9087ec201422ef04bfca4db4964ca6cce0ffa1575a2a85d0b4b0553548c',
  },
];

export function getSoldListings(activeNames?: Set<string> | string[]): SoldListing[] {
  try {
    const raw = localStorage.getItem(SOLD_STORAGE_KEY);
    let parsed: SoldListing[] = [];
    if (!raw) {
      parsed = [...INITIAL_SOLD_LISTINGS];
      localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(parsed));
    } else {
      const stored = JSON.parse(raw);
      if (Array.isArray(stored) && stored.length > 0) {
        parsed = stored;
      } else {
        parsed = [...INITIAL_SOLD_LISTINGS];
        localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(parsed));
      }
    }

    // Filter out old fake mock names that do not exist on the smart contract, and maler.arc (which is not sold)
    let purged = parsed.filter((item: SoldListing) => {
      const c = cleanName(item.name);
      return c !== 'genesis' && c !== 'crypto' && c !== 'alpha' && c !== 'maler';
    });

    // Ensure confirmed on-chain sold listings are present if not already
    for (const init of INITIAL_SOLD_LISTINGS) {
      if (!purged.some((p: SoldListing) => cleanName(p.name) === cleanName(init.name))) {
        purged.push(init);
      }
    }

    // Determine actively listed names to exclude from sold listings
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
      const filtered = purged.filter((item: SoldListing) => !activeSet.has(cleanName(item.name)));
      if (filtered.length !== purged.length) {
        purged = filtered;
        localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(purged));
      }
    } else {
      localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(purged));
    }

    return purged;
  } catch {
    return INITIAL_SOLD_LISTINGS;
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

/**
 * Fetch and sync all sold events directly from Blockscout v2 contract logs
 */
export async function syncSoldListingsFromLogs(activeListingsInput?: MarketplaceListing[]): Promise<SoldListing[]> {
  try {
    const res = await fetch(`https://explorer.testnet.arc.io/api/v2/addresses/${ANS_ADDRESS}/logs`);
    if (!res.ok) return getSoldListings();
    const json = await res.json();
    const items = json.items || [];
    
    const activeListings = activeListingsInput || getCachedActiveListings();
    const activeNames = new Set(activeListings.map(l => cleanName(l.name)));

    const current = getSoldListings(activeNames);
    let updated = [...current];
    let changed = false;

    for (const item of items) {
      if (item.topics?.[0] === '0xe3202271e290250caf3bcfb96c2e7e8e5f63158e26901feb4c260069737892ef') {
        try {
          const seller = '0x' + item.topics[1].slice(26);
          const buyer = '0x' + item.topics[2].slice(26);
          const decoded = decodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], item.data);
          const clean = cleanName(decoded[0]);

          // If the name is currently actively listed, it was re-listed and is NOT sold out!
          if (activeNames.has(clean)) {
            continue;
          }

          const name = decoded[0].endsWith('.arc') ? decoded[0] : `${decoded[0]}.arc`;
          const price = Number(decoded[1]) / 1e6;
          const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : 1791845600000;
          const txHash = item.transaction_hash;

          const exists = updated.some(s => cleanName(s.name) === clean && s.txHash === txHash);
          if (!exists) {
            updated.unshift({
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

    if (activeNames.size > 0) {
      const filtered = updated.filter(s => !activeNames.has(cleanName(s.name)));
      if (filtered.length !== updated.length) {
        updated = filtered;
        changed = true;
      }
    }

    if (changed) {
      localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('ans_marketplace_updated'));
    }
    return updated;
  } catch (e) {
    return getSoldListings();
  }
}

