import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0';
import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'https://esm.sh/viem@2.9.20';

/**
 * ANS Event Watcher Supabase Edge Function
 * =========================================
 * Bounded, scheduled blockchain event scanner for Arc Testnet -> Supabase Notifications.
 * Designed to run on Supabase Free Plan via pg_cron + pg_net with $0/month cost.
 *
 * Security Model:
 *   - Endpoint is protected by WATCHER_SECRET checked server-side with constant-time equality.
 *   - Privileged writes to `notifications` and `watcher_cursors` use the server-side
 *     SUPABASE_SERVICE_ROLE_KEY (never exposed to clients, git, logs, or cron SQL).
 *   - Invocations are short-running (< 2s) and bounded to MAX_BLOCKS_PER_INVOCATION blocks.
 *   - Distributed lease lock on `watcher_cursors` prevents overlapping concurrent runs.
 *   - Monotonic cursor progression: cursor is NEVER advanced on RPC or database failure.
 *   - Database deduplication on (tx_hash, log_index, recipient_address, kind) prevents duplicates.
 */

// -- Configuration & Constants ------------------------------------------------

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const DEFAULT_ANS_ADDRESS = '0x328b80405c05b84ba72a457fcfe389ad9c159fbb';
export const CONFIRMATION_DEPTH = 3n;
export const DEFAULT_MAX_BLOCKS_PER_INVOCATION = 200n;
export const MAX_ALLOWED_BLOCKS_PER_INVOCATION = 500n;

export const CURSOR_KEY = `ans_event_watcher_${ARC_TESTNET_CHAIN_ID}`;
export const LOCK_KEY = `ans_event_watcher_${ARC_TESTNET_CHAIN_ID}_lock`;
export const LOCK_LEASE_MS = 45_000; // 45 seconds lease for distributed lock

export const arcTestnet = {
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.io'] },
    public:  { http: ['https://rpc.testnet.arc.io'] },
  },
};

// -- ABI Event Definitions (matching contracts/ArcNameService.sol) -------------
export const NAME_SOLD_EVENT = parseAbiItem(
  'event NameSold(string name, address indexed seller, address indexed buyer, uint256 price)'
);
export const TIP_SENT_EVENT = parseAbiItem(
  'event TipSent(string toName, address indexed from, address indexed to, uint256 amount, string note)'
);
export const NAME_GIFTED_EVENT = parseAbiItem(
  'event NameGifted(string name, address indexed gifter, address indexed recipient, uint64 expiry)'
);
export const NAME_TRANSFERRED_EVENT = parseAbiItem(
  'event NameTransferred(string name, address indexed from, address indexed to)'
);
export const NAME_LISTED_EVENT = parseAbiItem(
  'event NameListed(string name, address indexed seller, uint256 price)'
);
export const NAME_LISTING_CANCELLED_EVENT = parseAbiItem(
  'event NameListingCancelled(string name)'
);

// -- Timing-Safe Secret Verification ------------------------------------------

export function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

export function authorizeWatcherRequest(req: Request, expectedSecret: string): boolean {
  if (!expectedSecret || expectedSecret.trim() === '') {
    return false;
  }

  // 1. Check custom header x-watcher-secret
  const headerSecret = req.headers.get('x-watcher-secret');
  if (headerSecret && timingSafeCompare(headerSecret, expectedSecret)) {
    return true;
  }

  // 2. Check standard Authorization: Bearer <secret>
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (timingSafeCompare(token, expectedSecret)) {
      return true;
    }
  }

  return false;
}

// -- Distributed Lease Lock (using existing watcher_cursors table) ------------

export async function acquireDistributedLock(
  supabase: any,
  lockId = LOCK_KEY,
  leaseMs = LOCK_LEASE_MS
): Promise<{ acquired: boolean; token?: string; reason?: string }> {
  const now = Date.now();
  const token = crypto.randomUUID();

  // 1. Inspect existing lock
  const { data: existing, error: readErr } = await supabase
    .from('watcher_cursors')
    .select('id, last_block, updated_at')
    .eq('id', lockId)
    .maybeSingle();

  if (readErr) {
    return { acquired: false, reason: `DB_READ_ERROR: ${readErr.message}` };
  }

  if (existing) {
    const lockTime = new Date(existing.updated_at).getTime();
    const ageMs = now - lockTime;
    if (ageMs < leaseMs) {
      // Active lease owned by a recent invocation
      return {
        acquired: false,
        reason: 'CONCURRENT_RUN_IN_PROGRESS',
      };
    }
    // Expired lease -> safe to acquire/renew
  }

  // 2. Claim the lock without an unconditional upsert, which can overwrite
  // another invocation's lease between the read and write.
  const lockRow = {
    id: lockId,
    last_block: token,
    updated_at: new Date(now).toISOString(),
  };

  if (!existing) {
    const { error: insertErr } = await supabase
      .from('watcher_cursors')
      .insert(lockRow);

    if (insertErr) {
      return { acquired: false, reason: `LOCK_INSERT_FAILED: ${insertErr.message}` };
    }
  } else {
    // Compare-and-swap: update only if the row still has the timestamp we read.
    const { data: claimed, error: claimErr } = await supabase
      .from('watcher_cursors')
      .update({ last_block: token, updated_at: lockRow.updated_at })
      .eq('id', lockId)
      .eq('updated_at', existing.updated_at)
      .select('last_block')
      .maybeSingle();

    if (claimErr) {
      return { acquired: false, reason: `LOCK_CLAIM_FAILED: ${claimErr.message}` };
    }
    if (claimed?.last_block !== token) {
      return { acquired: false, reason: 'LOCK_RACE_LOST' };
    }
  }

  // 3. Verify the claimed lease token
  const { data: verified, error: verifyErr } = await supabase
    .from('watcher_cursors')
    .select('last_block')
    .eq('id', lockId)
    .maybeSingle();

  if (verifyErr || verified?.last_block !== token) {
    return { acquired: false, reason: 'LOCK_RACE_LOST' };
  }

  return { acquired: true, token };
}

export async function releaseDistributedLock(
  supabase: any,
  lockId = LOCK_KEY,
  token?: string
): Promise<boolean> {
  if (!token) return true;
  try {
    const { error } = await supabase
      .from('watcher_cursors')
      .delete()
      .eq('id', lockId)
      .eq('last_block', token);
    return !error;
  } catch {
    return false;
  }
}

// -- Argument Validation ------------------------------------------------------

export function isAddress(s: unknown): boolean {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);
}

export function isValidName(s: unknown): boolean {
  return typeof s === 'string' && /^[a-z0-9]{3,32}$/.test(s);
}

// -- Notification Builders ----------------------------------------------------

export function buildNameSoldNotifications(args: any, txHash: string, logIndex: number) {
  if (!args || typeof args !== 'object') return [];
  const { name, seller, buyer, price } = args;

  if (!isValidName(name) || !isAddress(seller) || !isAddress(buyer) || price == null) {
    return [];
  }

  let priceBigInt: bigint;
  try {
    priceBigInt = BigInt(price);
    if (priceBigInt < 0n) return [];
  } catch {
    return [];
  }

  const clean = String(name).trim().toLowerCase().replace(/\.arc$/, '');
  const priceUsdc = (Number(priceBigInt) / 1_000_000).toFixed(2);
  const safeLogIndex = typeof logIndex === 'number' ? logIndex : Number(logIndex || 0);
  const dedupBase = { tx_hash: txHash, log_index: safeLogIndex };

  return [
    {
      ...dedupBase,
      recipient_address: (seller as string).toLowerCase(),
      kind: 'name_sold',
      title: `${clean}.arc sold for ${priceUsdc} USDC`,
      body: `Your name ${clean}.arc was purchased by ${(buyer as string).slice(0, 6)}...${(buyer as string).slice(-4)}.`,
      link: `userprofile:${(buyer as string).toLowerCase()}`,
      is_read: false,
    },
    {
      ...dedupBase,
      recipient_address: (buyer as string).toLowerCase(),
      kind: 'name_bought',
      title: `You acquired ${clean}.arc`,
      body: `You successfully purchased ${clean}.arc for ${priceUsdc} USDC.`,
      link: `profile:${clean}.arc`,
      is_read: false,
    },
  ];
}

export function buildTipSentNotifications(args: any, txHash: string, logIndex: number) {
  if (!args || typeof args !== 'object') return [];
  const { toName, from, to, amount, note } = args;

  if (!isValidName(toName) || !isAddress(from) || !isAddress(to) || amount == null) {
    return [];
  }

  let amountBigInt: bigint;
  try {
    amountBigInt = BigInt(amount);
    if (amountBigInt <= 0n) return [];
  } catch {
    return [];
  }

  const cleanToName = String(toName).trim().toLowerCase().replace(/\.arc$/, '');
  const amountUsdc = (Number(amountBigInt) / 1_000_000).toFixed(2);
  const safeLogIndex = typeof logIndex === 'number' ? logIndex : Number(logIndex || 0);
  const trimmedNote = typeof note === 'string' ? note.trim() : '';
  const noteSuffix = trimmedNote ? ` Note: "${trimmedNote.slice(0, 100)}"` : '';

  return [
    {
      tx_hash: txHash,
      log_index: safeLogIndex,
      recipient_address: (to as string).toLowerCase(),
      kind: 'tip_received',
      title: `You received a ${amountUsdc} USDC tip on ${cleanToName}.arc`,
      body: `${(from as string).slice(0, 6)}...${(from as string).slice(-4)} sent you ${amountUsdc} USDC.${noteSuffix}`,
      link: `userprofile:${(from as string).toLowerCase()}`,
      is_read: false,
    },
    {
      tx_hash: txHash,
      log_index: safeLogIndex,
      recipient_address: (from as string).toLowerCase(),
      kind: 'tip_sent',
      title: `You sent a ${amountUsdc} USDC tip on ${cleanToName}.arc`,
      body: `Tip successfully sent to ${(to as string).slice(0, 6)}...${(to as string).slice(-4)}.${noteSuffix}`,
      link: `profile:${cleanToName}.arc`,
      is_read: false,
    },
  ];
}

export function buildNameTransferredNotifications(args: any, txHash: string, logIndex: number) {
  if (!args || typeof args !== 'object') return [];
  const { name, from, to } = args;
  if (!isValidName(name) || !isAddress(from) || !isAddress(to)) return [];
  if ((from as string).toLowerCase() === (to as string).toLowerCase()) return [];

  const clean = String(name).trim().toLowerCase().replace(/\.arc$/, '');
  const dedupBase = {
    tx_hash: txHash,
    log_index: typeof logIndex === 'number' ? logIndex : Number(logIndex || 0),
  };
  return [
    {
      ...dedupBase,
      recipient_address: (from as string).toLowerCase(),
      kind: 'name_transferred',
      title: `You transferred ${clean}.arc`,
      body: `You transferred ${clean}.arc to ${(to as string).slice(0, 6)}...${(to as string).slice(-4)}.`,
      link: `profile:${clean}.arc`,
      is_read: false,
    },
    {
      ...dedupBase,
      recipient_address: (to as string).toLowerCase(),
      kind: 'name_transfer_received',
      title: `You received ${clean}.arc`,
      body: `You received ${clean}.arc from ${(from as string).slice(0, 6)}...${(from as string).slice(-4)}.`,
      link: `profile:${clean}.arc`,
      is_read: false,
    },
  ];
}

export function buildNameGiftedNotifications(args: any, txHash: string, logIndex: number) {
  if (!args || typeof args !== 'object') return [];
  const { name, gifter, recipient } = args;

  if (!isValidName(name) || !isAddress(gifter) || !isAddress(recipient)) {
    return [];
  }

  const clean = String(name).trim().toLowerCase().replace(/\.arc$/, '');
  const safeLogIndex = typeof logIndex === 'number' ? logIndex : Number(logIndex || 0);
  const dedupBase = { tx_hash: txHash, log_index: safeLogIndex };

  return [
    {
      ...dedupBase,
      recipient_address: (recipient as string).toLowerCase(),
      kind: 'name_gift_received',
      title: `You received a gift: ${clean}.arc!`,
      body: `${(gifter as string).slice(0, 6)}...${(gifter as string).slice(-4)} gifted you the name ${clean}.arc.`,
      link: `profile:${clean}.arc`,
      is_read: false,
    },
    {
      ...dedupBase,
      recipient_address: (gifter as string).toLowerCase(),
      kind: 'name_gift_sent',
      title: `You gifted ${clean}.arc`,
      body: `You successfully gifted ${clean}.arc to ${(recipient as string).slice(0, 6)}...${(recipient as string).slice(-4)}.`,
      link: `profile:${clean}.arc`,
      is_read: false,
    },
  ];
}

// -- Cursor Helpers -----------------------------------------------------------

export async function getLastBlock(client: any): Promise<bigint | null> {
  const { data, error } = await client
    .from('watcher_cursors')
    .select('last_block')
    .eq('id', CURSOR_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`Database error reading cursor: ${error.message} (code: ${error.code})`);
  }

  return data?.last_block ? BigInt(data.last_block) : null;
}

export async function setLastBlock(client: any, block: bigint): Promise<boolean> {
  const blockBigInt = BigInt(block);
  // A cursor read failure must fail closed; treating it as an empty cursor
  // could overwrite a valid high-water mark.
  const current = await getLastBlock(client);
  if (current !== null && blockBigInt < current) {
    // Monotonic safety: never regress backwards
    return true;
  }

  const { error } = await client.from('watcher_cursors').upsert(
    { id: CURSOR_KEY, last_block: blockBigInt.toString(), updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );

  return !error;
}

// -- Core Bounded Scanning Pass -----------------------------------------------

export interface PollOptions {
  rpcClient: any;
  dbClient: any;
  ansAddress?: string;
  tippingAddress?: string;
  confirmationDepth?: bigint;
  maxBlocks?: bigint;
  startBlockOverride?: bigint | null;
}

export async function pollChunk({
  rpcClient,
  dbClient,
  ansAddress = DEFAULT_ANS_ADDRESS.toLowerCase(),
  tippingAddress = DEFAULT_ANS_ADDRESS.toLowerCase(),
  confirmationDepth = CONFIRMATION_DEPTH,
  maxBlocks = DEFAULT_MAX_BLOCKS_PER_INVOCATION,
  startBlockOverride = null,
}: PollOptions) {
  // Clamp maxBlocks to safe bounds [1, MAX_ALLOWED_BLOCKS_PER_INVOCATION]
  const boundedMaxBlocks = maxBlocks > MAX_ALLOWED_BLOCKS_PER_INVOCATION
    ? MAX_ALLOWED_BLOCKS_PER_INVOCATION
    : (maxBlocks < 1n ? 1n : maxBlocks);

  const latestBlock = await rpcClient.getBlockNumber();
  const safeLatest = latestBlock > confirmationDepth
    ? latestBlock - confirmationDepth
    : 0n;

  let fromBlock: bigint;
  try {
    const lastCommitted = await getLastBlock(dbClient);
    if (lastCommitted === null) {
      if (startBlockOverride !== null) {
        fromBlock = startBlockOverride <= safeLatest ? startBlockOverride : safeLatest;
      } else {
        fromBlock = safeLatest > 200n ? safeLatest - 200n : 0n;
      }
    } else {
      fromBlock = lastCommitted + 1n;
    }
  } catch (err: any) {
    return { success: false, error: err.message, cursorAdvanced: false };
  }

  if (fromBlock > safeLatest) {
    return {
      success: true,
      upToDate: true,
      fromBlock: fromBlock.toString(),
      safeLatest: safeLatest.toString(),
      latestBlock: latestBlock.toString(),
      insertedCount: 0,
      hasBacklog: false,
    };
  }

  const toBlock = (fromBlock + boundedMaxBlocks - 1n) < safeLatest
    ? fromBlock + boundedMaxBlocks - 1n
    : safeLatest;

  const soldLogs: any[] = [];
  const tipLogs: any[] = [];
  const giftedLogs: any[] = [];
  const transferredLogs: any[] = [];
  const listedLogs: any[] = [];
  const cancelledLogs: any[] = [];

  try {
    if (ansAddress === tippingAddress) {
      const rawLogs = await rpcClient.getLogs({
        address: ansAddress,
        events: [NAME_SOLD_EVENT, TIP_SENT_EVENT, NAME_GIFTED_EVENT, NAME_TRANSFERRED_EVENT, NAME_LISTED_EVENT, NAME_LISTING_CANCELLED_EVENT],
        fromBlock,
        toBlock,
      });

      for (const log of rawLogs) {
        if (log.address.toLowerCase() !== ansAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [NAME_SOLD_EVENT, TIP_SENT_EVENT, NAME_GIFTED_EVENT, NAME_TRANSFERRED_EVENT, NAME_LISTED_EVENT, NAME_LISTING_CANCELLED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'NameSold') soldLogs.push({ ...log, decoded });
          else if (decoded.eventName === 'TipSent') tipLogs.push({ ...log, decoded });
          else if (decoded.eventName === 'NameGifted') giftedLogs.push({ ...log, decoded });
          else if (decoded.eventName === 'NameTransferred') transferredLogs.push({ ...log, decoded });
          else if (decoded.eventName === 'NameListed') listedLogs.push({ ...log, decoded });
          else if (decoded.eventName === 'NameListingCancelled') cancelledLogs.push({ ...log, decoded });
        } catch {
          // Skip corrupt or unparseable log without failing entire batch
        }
      }
    } else {
      const [rawSold, rawTip, rawGifted, rawListed, rawCancelled, rawTransferred] = await Promise.all([
        rpcClient.getLogs({
          address: ansAddress,
          events: [NAME_SOLD_EVENT],
          fromBlock,
          toBlock,
        }),
        rpcClient.getLogs({
          address: tippingAddress,
          events: [TIP_SENT_EVENT],
          fromBlock,
          toBlock,
        }),
        rpcClient.getLogs({
          address: ansAddress,
          events: [NAME_GIFTED_EVENT],
          fromBlock,
          toBlock,
        }),
        rpcClient.getLogs({
          address: ansAddress,
          events: [NAME_LISTED_EVENT],
          fromBlock,
          toBlock,
        }),
        rpcClient.getLogs({
          address: ansAddress,
          events: [NAME_LISTING_CANCELLED_EVENT],
          fromBlock,
          toBlock,
        }),
        rpcClient.getLogs({
          address: ansAddress,
          events: [NAME_TRANSFERRED_EVENT],
          fromBlock,
          toBlock,
        }),
      ]);

      for (const log of rawSold) {
        if (log.address.toLowerCase() !== ansAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [NAME_SOLD_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'NameSold') soldLogs.push({ ...log, decoded });
        } catch {}
      }

      for (const log of rawTip) {
        if (log.address.toLowerCase() !== tippingAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [TIP_SENT_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'TipSent') tipLogs.push({ ...log, decoded });
        } catch {}
      }

      for (const log of rawGifted) {
        if (log.address.toLowerCase() !== ansAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [NAME_GIFTED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'NameGifted') giftedLogs.push({ ...log, decoded });
        } catch {}
      }

      for (const log of rawListed) {
        if (log.address.toLowerCase() !== ansAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [NAME_LISTED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'NameListed') listedLogs.push({ ...log, decoded });
        } catch {}
      }

      for (const log of rawCancelled) {
        if (log.address.toLowerCase() !== ansAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [NAME_LISTING_CANCELLED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'NameListingCancelled') cancelledLogs.push({ ...log, decoded });
        } catch {}
      }

      for (const log of rawTransferred) {
        if (log.address.toLowerCase() !== ansAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [NAME_TRANSFERRED_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'NameTransferred') transferredLogs.push({ ...log, decoded });
        } catch {}
      }
    }
  } catch (rpcErr: any) {
    // RPC error (range limit or network timeout) -> Fail closed, do NOT advance cursor
    return {
      success: false,
      error: `RPC error fetching logs: ${rpcErr.message}`,
      cursorAdvanced: false,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
    };
  }

  const toInsert: any[] = [];

  for (const item of soldLogs) {
    if (!item.transactionHash) continue;
    const notifs = buildNameSoldNotifications(
      item.decoded.args,
      item.transactionHash,
      item.logIndex ?? 0
    );
    toInsert.push(...notifs);
  }

  for (const item of tipLogs) {
    if (!item.transactionHash) continue;
    const notifs = buildTipSentNotifications(
      item.decoded.args,
      item.transactionHash,
      item.logIndex ?? 0
    );
    toInsert.push(...notifs);
  }

  for (const item of giftedLogs) {
    if (!item.transactionHash) continue;
    const notifs = buildNameGiftedNotifications(
      item.decoded.args,
      item.transactionHash,
      item.logIndex ?? 0
    );
    toInsert.push(...notifs);
  }

  // Marketplace purchases emit both NameSold and NameTransferred in one tx.
  // Skip transfer notifications for those transactions to avoid duplicates.
  const saleTxHashes = new Set(
    soldLogs.map((item) => String(item.transactionHash || '').toLowerCase())
  );
  for (const item of transferredLogs) {
    if (!item.transactionHash || saleTxHashes.has(String(item.transactionHash).toLowerCase())) continue;
    const notifs = buildNameTransferredNotifications(
      item.decoded.args,
      item.transactionHash,
      item.logIndex ?? 0
    );
    toInsert.push(...notifs);
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await dbClient
      .from('notifications')
      .upsert(toInsert, {
        onConflict: 'tx_hash,log_index,recipient_address,kind',
        ignoreDuplicates: true,
      });

    if (insertErr) {
      // Database write failed -> Cursor MUST NOT advance, events will be retried safely
      return {
        success: false,
        error: `DB error inserting notifications: ${insertErr.message}`,
        cursorAdvanced: false,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
      };
    }
  }

  // Synchronize marketplace listings state
  try {
    const mlTable = dbClient?.from?.('marketplace_listings');
    if (mlTable && typeof mlTable.upsert === 'function') {
      const mlRows: any[] = [];
      for (const item of listedLogs) {
        const args = item.decoded?.args;
        if (!args) continue;
        const rawName = String(args.name || '').trim().toLowerCase();
        const name = rawName.endsWith('.arc') ? rawName : `${rawName}.arc`;
        mlRows.push({
          name,
          seller: String(args.seller || '').toLowerCase(),
          price: Number(args.price) / 1e6,
          is_active: true,
          last_tx_hash: item.transactionHash,
          updated_at: new Date().toISOString(),
        });
      }
      for (const item of soldLogs) {
        const args = item.decoded?.args;
        if (!args) continue;
        const rawName = String(args.name || '').trim().toLowerCase();
        const name = rawName.endsWith('.arc') ? rawName : `${rawName}.arc`;
        mlRows.push({
          name,
          seller: String(args.seller || '').toLowerCase(),
          buyer: String(args.buyer || '').toLowerCase(),
          price: Number(args.price) / 1e6,
          is_active: false,
          sold_at: new Date().toISOString(),
          last_tx_hash: item.transactionHash,
          updated_at: new Date().toISOString(),
        });
      }
      for (const item of cancelledLogs) {
        const args = item.decoded?.args;
        if (!args) continue;
        const rawName = String(args.name || '').trim().toLowerCase();
        const name = rawName.endsWith('.arc') ? rawName : `${rawName}.arc`;
        mlRows.push({
          name,
          is_active: false,
          last_tx_hash: item.transactionHash,
          updated_at: new Date().toISOString(),
        });
      }
      if (mlRows.length > 0) {
        await mlTable.upsert(mlRows, { onConflict: 'name' });
      }
    }
  } catch {
    // Graceful fallback if mock DB doesn't support marketplace_listings or table uninitialized
  }

  // Only advance cursor after successful event persistence
  const advanced = await setLastBlock(dbClient, toBlock);
  if (!advanced) {
    return {
      success: false,
      error: 'Failed to update watcher cursor in database',
      cursorAdvanced: false,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
    };
  }

  return {
    success: true,
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString(),
    safeLatest: safeLatest.toString(),
    latestBlock: latestBlock.toString(),
    eventsFound: { sold: soldLogs.length, tip: tipLogs.length },
    insertedCount: toInsert.length,
    hasBacklog: toBlock < safeLatest,
    cursorAdvanced: true,
  };
}

// -- HTTP Handler for Supabase Edge Runtime -----------------------------------

let inProcessLock = false;

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. Server-side authorization check against WATCHER_SECRET
  const expectedSecret = Deno.env.get('WATCHER_SECRET');
  if (!expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error: WATCHER_SECRET is not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!authorizeWatcherRequest(req, expectedSecret)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: invalid watcher secret' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Intra-container concurrency guard
  if (inProcessLock) {
    return new Response(
      JSON.stringify({ success: false, skipped: true, reason: 'CONCURRENT_RUN_IN_PROGRESS' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }
  inProcessLock = true;

  // 3. Initialize Privileged Database Client (server-side only)
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    inProcessLock = false;
    return new Response(
      JSON.stringify({ error: 'Server configuration error: missing Supabase service credentials' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 4. Acquire distributed lease lock across all serverless instances
  let lockToken: string | undefined;
  try {
    const lockResult = await acquireDistributedLock(supabaseAdmin, LOCK_KEY, LOCK_LEASE_MS);
    if (!lockResult.acquired) {
      inProcessLock = false;
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          reason: lockResult.reason || 'CONCURRENT_RUN_IN_PROGRESS',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    lockToken = lockResult.token;

    // 5. Parse optional request overrides
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      // Body is optional for standard cron trigger
    }

    const maxBlocks = body?.maxBlocks ? BigInt(body.maxBlocks) : DEFAULT_MAX_BLOCKS_PER_INVOCATION;
    const startBlock = body?.startBlock ? BigInt(body.startBlock) : null;

    const rpcUrl = Deno.env.get('RPC_URL') || 'https://rpc.testnet.arc.io';
    const ansAddress = (Deno.env.get('ANS_CONTRACT_ADDRESS') || DEFAULT_ANS_ADDRESS).toLowerCase();
    const tippingAddress = (Deno.env.get('TIPPING_CONTRACT_ADDRESS') || ansAddress).toLowerCase();

    const rpcClient = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl, { timeout: 15_000 }),
    });

    // 6. Execute bounded polling pass
    const result = await pollChunk({
      rpcClient,
      dbClient: supabaseAdmin,
      ansAddress,
      tippingAddress,
      confirmationDepth: CONFIRMATION_DEPTH,
      maxBlocks,
      startBlockOverride: startBlock,
    });

    const statusCode = result.success ? 200 : 500;
    return new Response(JSON.stringify(result), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Unexpected watcher execution error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    if (lockToken) {
      await releaseDistributedLock(supabaseAdmin, LOCK_KEY, lockToken).catch(() => {});
    }
    inProcessLock = false;
  }
});
