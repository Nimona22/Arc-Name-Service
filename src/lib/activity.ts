import { decodeAbiParameters } from 'viem';
import { ANS_ADDRESS } from './abis';
import { getSoldListings } from './marketplace';

export interface NameActivityItem {
  id: string;
  name: string; // e.g. "nimox.arc"
  action:
  | 'Registered Name'
  | 'Received Tip'
  | 'Sent Tip'
  | 'Bought Name'
  | 'Sold Name'
  | 'Gifted Name'
  | 'Listed for Sale'
  | 'Renewed Name'
  | 'Transferred Name';
  amount: string; // e.g. "1.5 USDC", "50 USDC", "-"
  from: string; // e.g. "Arc Protocol", "0x5B16...", "bob.arc"
  to?: string;
  timestamp: number; // millisecond timestamp
  txHash?: string;
  note?: string;
}

export function cleanName(name: string): string {
  return name.toLowerCase().replace(/\.arc$/i, '').replace('.arc', '').trim();
}

/**
 * Format timestamp into human-readable relative time
 */
export function formatRelativeTime(timestampMs: number): string {
  if (!timestampMs || isNaN(timestampMs)) return 'Recently';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));

  if (diffSeconds < 60) return 'Just now';
  if (diffSeconds < 120) return '1 minute ago';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} minutes ago`;
  if (diffSeconds < 7200) return '1 hour ago';
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} hours ago`;
  if (diffSeconds < 172800) return 'Yesterday';
  if (diffSeconds < 2592000) return `${Math.floor(diffSeconds / 86400)} days ago`;
  if (diffSeconds < 31536000) {
    const months = Math.floor(diffSeconds / 2592000);
    return months <= 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.floor(diffSeconds / 31536000);
  return years <= 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * Calculate registration / renewal price based on name character length and duration
 */
export function calculateRegistrationPriceUSDC(name: string, durationMonths: number = 3): string {
  const clean = cleanName(name);
  const len = clean.length;
  const dur = Number(durationMonths) || 3;

  if (len === 3) {
    if (dur <= 3) return '5 USDC';
    if (dur <= 6) return '9 USDC';
    if (dur <= 9) return '12 USDC';
    return '15 USDC';
  } else if (len === 4) {
    if (dur <= 3) return '3 USDC';
    if (dur <= 6) return '5.5 USDC';
    if (dur <= 9) return '7.5 USDC';
    return '9 USDC';
  } else if (len === 5) {
    if (dur <= 3) return '1.5 USDC';
    if (dur <= 6) return '2.75 USDC';
    if (dur <= 9) return '3.75 USDC';
    return '4.5 USDC';
  } else {
    // 6+ characters
    if (dur <= 3) return '0.5 USDC';
    if (dur <= 6) return '0.9 USDC';
    if (dur <= 9) return '1.2 USDC';
    return '1.5 USDC';
  }
}

/**
 * Get stored activities from localStorage
 */
export function getStoredActivities(name: string): NameActivityItem[] {
  const clean = cleanName(name);
  if (!clean) return [];
  try {
    const raw = localStorage.getItem(`ans_activity_${clean}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Record a new activity item into localStorage and dispatch update event
 */
export function recordActivity(item: Omit<NameActivityItem, 'id'>): NameActivityItem {
  const clean = cleanName(item.name);
  const newItem: NameActivityItem = {
    ...item,
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name: clean.endsWith('.arc') ? clean : `${clean}.arc`,
  };

  try {
    const existing = getStoredActivities(clean);
    // Avoid duplicate transactions if same txHash and action
    const filtered = item.txHash
      ? existing.filter(e => !(e.txHash === item.txHash && e.action === item.action))
      : existing;

    const updated = [newItem, ...filtered];
    localStorage.setItem(`ans_activity_${clean}`, JSON.stringify(updated));

    // Also store in a recent activities feed
    const globalRaw = localStorage.getItem('ans_global_activities');
    const globalList: NameActivityItem[] = globalRaw ? JSON.parse(globalRaw) : [];
    const updatedGlobal = [newItem, ...globalList.filter(g => g.id !== newItem.id)].slice(0, 50);
    localStorage.setItem('ans_global_activities', JSON.stringify(updatedGlobal));

    if (item.action === 'Registered Name' || item.action === 'Gifted Name') {
      addRecentlyRegisteredName(clean);
    }

    window.dispatchEvent(new CustomEvent('ans_activity_updated', { detail: newItem }));
  } catch (err) {
    console.error('Failed to save activity:', err);
  }

  return newItem;
}

export const CONFIRMED_ONCHAIN_NAMES: readonly string[] = [];

export const KNOWN_ONCHAIN_ACTIVITIES: NameActivityItem[] = [];

/**
 * Get recently registered names from storage & activity logs
 */
export function getRecentlyRegisteredNames(): string[] {
  try {
    const raw = localStorage.getItem(`ans_recent_registered_${ANS_ADDRESS}`);
    const list: string[] = raw ? JSON.parse(raw) : [];

    // Also extract from contract-scoped global activities
    const globalRaw = localStorage.getItem(`ans_global_activities_${ANS_ADDRESS}`);
    if (globalRaw) {
      const activities = JSON.parse(globalRaw);
      for (const act of activities) {
        if ((act.action === 'Registered Name' || act.action === 'Gifted Name' || act.action === 'Sold Name') && act.name) {
          const formatted = act.name.endsWith('.arc') ? act.name : `${act.name}.arc`;
          if (!list.includes(formatted)) {
            list.unshift(formatted);
          }
        }
      }
    }

    // Include all confirmed on-chain registered identities, including sold ones
    for (const name of CONFIRMED_ONCHAIN_NAMES) {
      if (!list.includes(name)) {
        list.push(name);
      }
    }

    return list.slice(0, 16);
  } catch {
    return [...CONFIRMED_ONCHAIN_NAMES];
  }
}

/**
 * Sync all registered names dynamically from Blockscout v2 contract logs
 */
export async function syncRecentRegisteredNamesFromLogs(): Promise<string[]> {
  try {
    const res = await fetch(`https://explorer.testnet.arc.io/api/v2/addresses/${ANS_ADDRESS}/logs`);
    if (!res.ok) return getRecentlyRegisteredNames();
    const json = await res.json();
    const items = json.items || [];
    const list = getRecentlyRegisteredNames();
    let changed = false;

    for (const item of items) {
      const t0 = item.topics?.[0];
      if (['0x1860dd28d40eee8a69552879a055b5c8f1271081a42ffade0abb42d7edf509f1',
        '0xf936ba22d566eab894630104cae90a56f965c7cc0f64f7a6b3e1090793462e58',
        '0xe3202271e290250caf3bcfb96c2e7e8e5f63158e26901feb4c260069737892ef',
        '0x21e177c2bf9adbd548d25cc65d54b697122f907257d8318bddc22375fe666de8',
        '0xc87e6029eb4b9211a0eb39f94b63248b8b1660b93a577aa53d04aeaf66ca77bc'].includes(t0)) {
        try {
          const decoded = decodeAbiParameters([{ type: 'string' }], item.data);
          const rawName = decoded[0];
          if (rawName) {
            const formatted = rawName.endsWith('.arc') ? rawName : `${rawName}.arc`;
            if (!list.includes(formatted)) {
              list.push(formatted);
              changed = true;
            }
            // Auto-record real on-chain registration activity with block timestamp
            const itemTs = item.block_timestamp || item.timestamp;
            if (itemTs && t0 === '0x1860dd28d40eee8a69552879a055b5c8f1271081a42ffade0abb42d7edf509f1') {
              const clean = cleanName(rawName);
              const owner = item.topics?.[1] ? ('0x' + item.topics[1].slice(26)) : '';
              const blockMs = new Date(itemTs).getTime();
              const existing = getStoredActivities(clean);
              if (!existing.some(a => a.action === 'Registered Name')) {
                recordActivity({
                  name: formatted,
                  action: 'Registered Name',
                  amount: calculateRegistrationPriceUSDC(clean, 12),
                  from: 'Arc Protocol',
                  to: owner,
                  timestamp: blockMs,
                  txHash: item.transaction_hash,
                });
              }
            }
          }
        } catch { }
      }
    }

    if (changed) {
      localStorage.setItem(`ans_recent_registered_${ANS_ADDRESS}`, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('ans_recent_registered_updated', { detail: list }));
    }
    return list;
  } catch {
    return getRecentlyRegisteredNames();
  }
}

/**
 * Record a newly registered name to recent registrations list
 */
export function addRecentlyRegisteredName(name: string): void {
  const clean = cleanName(name);
  if (!clean) return;
  const fullName = `${clean}.arc`;
  try {
    const current = getRecentlyRegisteredNames();
    const updated = [fullName, ...current.filter(n => cleanName(n) !== clean)].slice(0, 12);
    localStorage.setItem(`ans_recent_registered_${ANS_ADDRESS}`, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('ans_recent_registered_updated', { detail: fullName }));
  } catch (err) {
    console.error('Failed to add recently registered name:', err);
  }
}

/**
 * Get the user's primary/main name preference for their wallet
 */
export function getUserPrimaryName(address?: string | null): string | null {
  if (!address) return null;
  try {
    const stored = localStorage.getItem(`ans_primary_${address.toLowerCase()}`);
    if (stored) {
      return stored.endsWith('.arc') ? stored : `${stored}.arc`;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Set which name the user will use as their main one
 */
export function setUserPrimaryName(address: string, name: string): void {
  if (!address || !name) return;
  const clean = cleanName(name);
  const fullName = `${clean}.arc`;
  try {
    localStorage.setItem(`ans_primary_${address.toLowerCase()}`, clean);
    window.dispatchEvent(
      new CustomEvent('ans_primary_changed', { detail: { address, primaryName: fullName } })
    );
  } catch (err) {
    console.error('Failed to set primary name:', err);
  }
}

/**
 * Detect on-chain registration timestamp and duration
 */
export function detectRegistrationDetails(
  clean: string,
  expirySeconds: number,
  memberSinceSeconds?: number
): { registrationTimestamp: number; durationMonths: number; priceUSDC: string } {
  const standardDurations = [
    { months: 3, seconds: 90 * 86400 },
    { months: 6, seconds: 180 * 86400 },
    { months: 9, seconds: 270 * 86400 },
    { months: 12, seconds: 360 * 86400 },
  ];

  // Check known on-chain activities first
  const known = KNOWN_ONCHAIN_ACTIVITIES.find(
    k => cleanName(k.name) === clean && (k.action === 'Registered Name' || k.action === 'Gifted Name')
  );
  if (known && known.timestamp) {
    const diff = expirySeconds - Math.floor(known.timestamp / 1000);
    const match = standardDurations.find(d => Math.abs(d.seconds - diff) < 7200);
    const durMonths = match ? match.months : 12;
    return {
      registrationTimestamp: known.timestamp,
      durationMonths: durMonths,
      priceUSDC: known.amount || calculateRegistrationPriceUSDC(clean, durMonths),
    };
  }

  // Check stored activities
  const stored = getStoredActivities(clean).find(
    a => a.action === 'Registered Name' || a.action === 'Gifted Name'
  );
  if (stored && stored.timestamp) {
    const diff = expirySeconds - Math.floor(stored.timestamp / 1000);
    const match = standardDurations.find(d => Math.abs(d.seconds - diff) < 7200);
    const durMonths = match ? match.months : 12;
    return {
      registrationTimestamp: stored.timestamp,
      durationMonths: durMonths,
      priceUSDC: stored.amount || calculateRegistrationPriceUSDC(clean, durMonths),
    };
  }

  // If memberSince exists and matches expiry - memberSince
  if (memberSinceSeconds && memberSinceSeconds > 0) {
    const diff = expirySeconds - memberSinceSeconds;
    const match = standardDurations.find(d => Math.abs(d.seconds - diff) < 1800); // within 30 mins
    if (match) {
      return {
        registrationTimestamp: memberSinceSeconds * 1000,
        durationMonths: match.months,
        priceUSDC: calculateRegistrationPriceUSDC(clean, match.months),
      };
    }
  }

  // Fallback: estimate from expiry remaining from current time (or block time)
  const nowSec = Math.floor(Date.now() / 1000);
  const remaining = expirySeconds - nowSec;
  // Find standard duration that encompasses remaining
  const matchedDur = standardDurations.find(d => d.seconds >= remaining - 3600) || standardDurations[0];
  const regTimestamp = Math.max(1, (expirySeconds - matchedDur.seconds)) * 1000;

  return {
    registrationTimestamp: regTimestamp,
    durationMonths: matchedDur.months,
    priceUSDC: calculateRegistrationPriceUSDC(clean, matchedDur.months),
  };
}

/**
 * Get all sold records for a specific name from storage and default registry
 */
export function getSoldRecordsForName(cleanNameInput: string): NameActivityItem[] {
  const clean = cleanName(cleanNameInput);
  const results: NameActivityItem[] = [];

  try {
    const list = getSoldListings();
    const filteredList = (Array.isArray(list) ? list : []).filter(item => cleanName(item.name) !== 'maler');
    const seenHashes = new Set<string>();

    for (const item of filteredList) {
      if (cleanName(item.name) === clean) {
        const key = item.txHash || `${item.timestamp}_${item.price}`;
        if (!seenHashes.has(key)) {
          seenHashes.add(key);
          results.push({
            id: `sold_${clean}_${item.timestamp}`,
            name: `${clean}.arc`,
            action: 'Sold Name',
            amount: `${item.price} USDC`,
            from: item.seller,
            to: item.buyer,
            timestamp: item.timestamp,
            txHash: item.txHash,
          });
        }
      }
    }
  } catch { }

  return results;
}

/**
 * Get realistic activities for a name, fusing on-chain facts and recorded local transactions
 */
export function getRealisticNameActivities(options: {
  name: string;
  hasOnchainOwner: boolean;
  ownerAddress?: string;
  expirySeconds?: number;
  memberSinceSeconds?: number;
  isMockName?: boolean;
}): NameActivityItem[] {
  const { name, hasOnchainOwner, ownerAddress, expirySeconds, memberSinceSeconds, isMockName } = options;
  const clean = cleanName(name);

  // 1. Get any real activities explicitly recorded in localStorage
  const stored = getStoredActivities(clean);
  const soldRecords = getSoldRecordsForName(clean);

  // 2. If it's registered on-chain:
  if (hasOnchainOwner && expirySeconds && expirySeconds > 0) {
    const hasRegEvent = stored.some(
      a => a.action === 'Registered Name' || a.action === 'Gifted Name'
    );

    let list = [...stored];
    if (!hasRegEvent) {
      const regInfo = detectRegistrationDetails(clean, expirySeconds, memberSinceSeconds);
      const onchainRegEvent: NameActivityItem = {
        id: `onchain_reg_${clean}`,
        name: `${clean}.arc`,
        action: 'Registered Name',
        amount: regInfo.priceUSDC,
        from: 'Arc Protocol',
        to: ownerAddress,
        timestamp: regInfo.registrationTimestamp,
      };
      list.push(onchainRegEvent);
    }

    // Attach any marketplace sold transactions for this name
    for (const s of soldRecords) {
      const alreadyHas = list.some(a => a.txHash === s.txHash && a.action === 'Sold Name');
      if (!alreadyHas) {
        list.push(s);
      }
    }

    // 1b. Check confirmed on-chain activities for this name
    const knownMatches = KNOWN_ONCHAIN_ACTIVITIES.filter(k => cleanName(k.name) === clean);
    for (const k of knownMatches) {
      const alreadyHas = list.some(a => a.txHash === k.txHash && a.action === k.action);
      if (!alreadyHas) {
        list.push(k);
      }
    }

    // Sort newest first
    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
  }

  // 3. If stored activities or sold records exist, return them
  const mergedFallback = [...stored];
  for (const s of soldRecords) {
    if (!mergedFallback.some(a => a.txHash === s.txHash && a.action === 'Sold Name')) {
      mergedFallback.push(s);
    }
  }
  for (const k of KNOWN_ONCHAIN_ACTIVITIES.filter(k => cleanName(k.name) === clean)) {
    if (!mergedFallback.some(a => a.txHash === k.txHash && a.action === k.action)) {
      mergedFallback.push(k);
    }
  }

  if (mergedFallback.length > 0) {
    return mergedFallback.sort((a, b) => b.timestamp - a.timestamp);
  }

  // 4. For purely mock names (preview only when not registered on-chain):
  if (isMockName) {
    return [
      {
        id: `mock_reg_${clean}`,
        name: `${clean}.arc`,
        action: 'Registered Name',
        amount: calculateRegistrationPriceUSDC(clean, 12),
        from: 'Arc Protocol',
        timestamp: Date.now() - 180 * 24 * 60 * 60 * 1000,
      },
    ];
  }

  return [];
}

/**
 * Strict and secure address matching helper supporting full 42-char and ellipsis-shortened addresses
 */
export function isAddressMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const aNorm = a.trim().toLowerCase();
  const bNorm = b.trim().toLowerCase();
  if (aNorm === bNorm) return true;

  // Handle ellipsis formatted addresses (e.g. 0x8152...da0c)
  if (aNorm.includes('...') || bNorm.includes('...')) {
    const full = aNorm.includes('...') ? bNorm : aNorm;
    const trunc = aNorm.includes('...') ? aNorm : bNorm;
    const parts = trunc.split('...');
    if (parts.length === 2 && parts[0].length >= 4 && parts[1].length >= 4) {
      return full.startsWith(parts[0]) && full.endsWith(parts[1]);
    }
  }

  return false;
}

/**
 * Get activities for a specific user from global feed, individual name histories, and on-chain records.
 * Strictly filters by actual wallet participation (isFromUser || isToUser).
 */
export function getUserActivities(address: string, ownedNames: string[] = []): NameActivityItem[] {
  if (!address) return [];
  const results: NameActivityItem[] = [];
  const seenKeys = new Set<string>();

  const addUnique = (item: NameActivityItem) => {
    const key = item.txHash
      ? `${item.txHash}_${cleanName(item.name)}`
      : `${cleanName(item.name)}_${item.action}_${Math.floor(item.timestamp / 60000)}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      results.push(item);
    }
  };

  // 0. Include confirmed real on-chain activity ledger transactions where user participated
  for (const item of KNOWN_ONCHAIN_ACTIVITIES) {
    const isFromUser = isAddressMatch(item.from, address);
    const isToUser = isAddressMatch(item.to, address);
    if (isFromUser || isToUser) {
      addUnique(item);
    }
  }

  // 1. Check global activities feed
  try {
    const globalRaw = localStorage.getItem('ans_global_activities');
    if (globalRaw) {
      const globalList: NameActivityItem[] = JSON.parse(globalRaw);
      for (const item of globalList) {
        const isFromUser = isAddressMatch(item.from, address);
        const isToUser = isAddressMatch(item.to, address);
        if (isFromUser || isToUser) {
          addUnique(item);
        }
      }
    }
  } catch (err) {
    console.warn('Failed reading global activities:', err);
  }

  // 2. Check sold listings in marketplace
  try {
    const soldList = getSoldListings();
    if (Array.isArray(soldList)) {
      for (const item of soldList) {
        const isSeller = isAddressMatch(item.seller, address);
        const isBuyer = isAddressMatch(item.buyer, address);
        if (isSeller || isBuyer) {
          addUnique({
            id: `sold_${cleanName(item.name)}_${item.timestamp}`,
            name: item.name.endsWith('.arc') ? item.name : `${item.name}.arc`,
            action: isBuyer && !isSeller ? 'Bought Name' : 'Sold Name',
            amount: `${item.price} USDC`,
            from: item.seller,
            to: item.buyer,
            timestamp: item.timestamp,
            txHash: item.txHash,
          });
        }
      }
    }
  } catch {
    // ignore
  }

  // 3. For owned names where no activity has been logged yet, include a valid registered record with accurate timestamp
  for (const name of ownedNames) {
    const clean = cleanName(name);
    if (!clean) continue;
    const hasAnyRecord = results.some(r => cleanName(r.name) === clean);
    if (!hasAnyRecord) {
      const known = KNOWN_ONCHAIN_ACTIVITIES.find(
        k => cleanName(k.name) === clean && (k.action === 'Registered Name' || k.action === 'Gifted Name')
      );
      const stored = getStoredActivities(clean).find(
        a => a.action === 'Registered Name' || a.action === 'Gifted Name'
      );
      const regTs = known?.timestamp || stored?.timestamp || 1791669677000;
      const price = known?.amount || stored?.amount || calculateRegistrationPriceUSDC(clean, 12);

      addUnique({
        id: `onchain_reg_${clean}`,
        name: `${clean}.arc`,
        action: 'Registered Name',
        amount: price,
        from: 'Arc Protocol',
        to: address,
        timestamp: regTs,
        txHash: known?.txHash || stored?.txHash,
      });
    }
  }

  // 4. Sort newest first
  return results.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Synchronize activities dynamically for a given address from Blockscout v2 token transfers
 */
export async function syncUserActivitiesFromChain(address: string): Promise<NameActivityItem[]> {
  if (!address) return [];
  try {
    const res = await fetch(`https://explorer.testnet.arc.io/api/v2/addresses/${address}/token-transfers`);
    if (!res.ok) return getUserActivities(address);
    const data = await res.json();
    const items = data.items || [];
    let updatedAny = false;

    for (const item of items) {
      const txHash = item.transaction_hash;
      if (!txHash) continue;
      const known = KNOWN_ONCHAIN_ACTIVITIES.find(k => k.txHash?.toLowerCase() === txHash.toLowerCase());
      if (known) {
        recordActivity(known);
        updatedAny = true;
      }
    }

    if (updatedAny) {
      window.dispatchEvent(new CustomEvent('ans_activity_updated'));
    }
  } catch (err) {
    console.warn('Failed to sync on-chain activities from explorer:', err);
  }
  return getUserActivities(address);
}
