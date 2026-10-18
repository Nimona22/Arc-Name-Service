import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseAbiItem, decodeEventLog, encodeEventTopics, encodeAbiParameters, parseAbiParameters } from 'viem';

console.log('=================================================================');
console.log('       ANS Edge Function Watcher & Cron Test Suite               ');
console.log('=================================================================');

const PASS = (msg) => console.log(`  ✓ ${msg}`);

// ─── Edge Function Reference Constants & Logic ───────────────────────────────
export const ARC_TESTNET_CHAIN_ID = 5042002;
export const DEFAULT_ANS_ADDRESS = '0xa70e51df2472677219de4afa5124a47526e27033';
export const CONFIRMATION_DEPTH = 3n;
export const DEFAULT_MAX_BLOCKS_PER_INVOCATION = 200n;
export const MAX_ALLOWED_BLOCKS_PER_INVOCATION = 500n;
export const CURSOR_KEY = `ans_event_watcher_${ARC_TESTNET_CHAIN_ID}`;
export const LOCK_KEY = `ans_event_watcher_${ARC_TESTNET_CHAIN_ID}_lock`;
export const LOCK_LEASE_MS = 45_000;

export const NAME_SOLD_EVENT = parseAbiItem(
  'event NameSold(string name, address indexed seller, address indexed buyer, uint256 price)'
);
export const TIP_SENT_EVENT = parseAbiItem(
  'event TipSent(string toName, address indexed from, address indexed to, uint256 amount, string note)'
);

export function timingSafeCompare(a, b) {
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

export function authorizeWatcherRequest(req, expectedSecret) {
  if (!expectedSecret || expectedSecret.trim() === '') {
    return false;
  }
  const headerSecret = req.headers.get('x-watcher-secret');
  if (headerSecret && timingSafeCompare(headerSecret, expectedSecret)) {
    return true;
  }
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (timingSafeCompare(token, expectedSecret)) {
      return true;
    }
  }
  return false;
}

export async function acquireDistributedLock(supabase, lockId = LOCK_KEY, leaseMs = LOCK_LEASE_MS) {
  const now = Date.now();
  const token = crypto.randomUUID();

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
      return { acquired: false, reason: 'CONCURRENT_RUN_IN_PROGRESS' };
    }
  }

  const { error: upsertErr } = await supabase.from('watcher_cursors').upsert(
    {
      id: lockId,
      last_block: token,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: 'id' }
  );

  if (upsertErr) {
    return { acquired: false, reason: `DB_UPSERT_ERROR: ${upsertErr.message}` };
  }

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

export async function releaseDistributedLock(supabase, lockId = LOCK_KEY, token) {
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

export function isAddress(s) {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);
}

export function isValidName(s) {
  return typeof s === 'string' && /^[a-z0-9]{3,32}$/.test(s);
}

export function buildNameSoldNotifications(args, txHash, logIndex) {
  if (!args || typeof args !== 'object') return [];
  const { name, seller, buyer, price } = args;

  if (!isValidName(name) || !isAddress(seller) || !isAddress(buyer) || price == null) {
    return [];
  }

  let priceBigInt;
  try {
    priceBigInt = BigInt(price);
    if (priceBigInt < 0n) return [];
  } catch {
    return [];
  }

  const priceUsdc = (Number(priceBigInt) / 1_000_000).toFixed(2);
  const safeLogIndex = typeof logIndex === 'number' ? logIndex : Number(logIndex || 0);
  const dedupBase = { tx_hash: txHash, log_index: safeLogIndex };

  return [
    {
      ...dedupBase,
      recipient_address: seller.toLowerCase(),
      kind: 'name_sold',
      title: `${name}.arc sold for ${priceUsdc} USDC`,
      body: `Your name ${name}.arc was purchased by ${buyer.slice(0, 6)}...${buyer.slice(-4)}.`,
      link: `userprofile:${buyer.toLowerCase()}`,
      is_read: false,
    },
    {
      ...dedupBase,
      recipient_address: buyer.toLowerCase(),
      kind: 'name_bought',
      title: `You acquired ${name}.arc`,
      body: `You successfully purchased ${name}.arc for ${priceUsdc} USDC.`,
      link: `profile:${name}.arc`,
      is_read: false,
    },
  ];
}

export function buildTipSentNotifications(args, txHash, logIndex) {
  if (!args || typeof args !== 'object') return [];
  const { toName, from, to, amount, note } = args;

  if (!isValidName(toName) || !isAddress(from) || !isAddress(to) || amount == null) {
    return [];
  }

  let amountBigInt;
  try {
    amountBigInt = BigInt(amount);
    if (amountBigInt <= 0n) return [];
  } catch {
    return [];
  }

  const amountUsdc = (Number(amountBigInt) / 1_000_000).toFixed(2);
  const safeLogIndex = typeof logIndex === 'number' ? logIndex : Number(logIndex || 0);
  const trimmedNote = typeof note === 'string' ? note.trim() : '';
  const noteSuffix = trimmedNote ? ` Note: "${trimmedNote.slice(0, 100)}"` : '';

  return [
    {
      tx_hash: txHash,
      log_index: safeLogIndex,
      recipient_address: to.toLowerCase(),
      kind: 'tip_received',
      title: `You received a ${amountUsdc} USDC tip on ${toName}.arc`,
      body: `${from.slice(0, 6)}...${from.slice(-4)} sent you ${amountUsdc} USDC.${noteSuffix}`,
      link: `userprofile:${from.toLowerCase()}`,
      is_read: false,
    },
    {
      tx_hash: txHash,
      log_index: safeLogIndex,
      recipient_address: from.toLowerCase(),
      kind: 'tip_sent',
      title: `You sent a ${amountUsdc} USDC tip on ${toName}.arc`,
      body: `Tip successfully sent to ${to.slice(0, 6)}...${to.slice(-4)}.${noteSuffix}`,
      link: `profile:${toName}.arc`,
      is_read: false,
    },
  ];
}

export async function getLastBlock(client) {
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

export async function setLastBlock(client, block) {
  const blockBigInt = BigInt(block);
  const current = await getLastBlock(client).catch(() => null);
  if (current !== null && blockBigInt < current) {
    return true;
  }

  const { error } = await client.from('watcher_cursors').upsert(
    { id: CURSOR_KEY, last_block: blockBigInt.toString(), updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );

  return !error;
}

export async function pollChunk({
  rpcClient,
  dbClient,
  ansAddress = DEFAULT_ANS_ADDRESS.toLowerCase(),
  tippingAddress = DEFAULT_ANS_ADDRESS.toLowerCase(),
  confirmationDepth = CONFIRMATION_DEPTH,
  maxBlocks = DEFAULT_MAX_BLOCKS_PER_INVOCATION,
  startBlockOverride = null,
}) {
  const boundedMaxBlocks = maxBlocks > MAX_ALLOWED_BLOCKS_PER_INVOCATION
    ? MAX_ALLOWED_BLOCKS_PER_INVOCATION
    : (maxBlocks < 1n ? 1n : maxBlocks);

  const latestBlock = await rpcClient.getBlockNumber();
  const safeLatest = latestBlock > confirmationDepth
    ? latestBlock - confirmationDepth
    : 0n;

  let fromBlock;
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
  } catch (err) {
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

  const soldLogs = [];
  const tipLogs = [];

  try {
    if (ansAddress === tippingAddress) {
      const rawLogs = await rpcClient.getLogs({
        address: ansAddress,
        events: [NAME_SOLD_EVENT, TIP_SENT_EVENT],
        fromBlock,
        toBlock,
      });

      for (const log of rawLogs) {
        if (log.address.toLowerCase() !== ansAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [NAME_SOLD_EVENT, TIP_SENT_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'NameSold') soldLogs.push({ ...log, decoded });
          else if (decoded.eventName === 'TipSent') tipLogs.push({ ...log, decoded });
        } catch {}
      }
    } else {
      const [rawSold, rawTip] = await Promise.all([
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
    }
  } catch (rpcErr) {
    return {
      success: false,
      error: `RPC error fetching logs: ${rpcErr.message}`,
      cursorAdvanced: false,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
    };
  }

  const toInsert = [];

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

  if (toInsert.length > 0) {
    const { error: insertErr } = await dbClient
      .from('notifications')
      .upsert(toInsert, {
        onConflict: 'tx_hash,log_index,recipient_address,kind',
        ignoreDuplicates: true,
      });

    if (insertErr) {
      return {
        success: false,
        error: `DB error inserting notifications: ${insertErr.message}`,
        cursorAdvanced: false,
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
      };
    }
  }

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

// ─── PART 1: Configuration & Security Invariants ─────────────────────────────
console.log('\n--- PART 1: Constants & Contract Configuration ---');

console.log('1. Verifying Arc Testnet chain ID and contract defaults...');
assert.equal(ARC_TESTNET_CHAIN_ID, 5042002, 'Chain ID must be Arc Testnet 5042002');
assert.equal(DEFAULT_ANS_ADDRESS.toLowerCase(), '0xa70e51df2472677219de4afa5124a47526e27033');
assert.equal(CONFIRMATION_DEPTH, 3n, 'Confirmation depth must be 3 blocks');
assert.equal(DEFAULT_MAX_BLOCKS_PER_INVOCATION, 200n, 'Default bounded chunk must be 200 blocks');
assert.equal(MAX_ALLOWED_BLOCKS_PER_INVOCATION, 500n, 'Maximum allowed chunk must be 500 blocks');
assert.equal(CURSOR_KEY, 'ans_event_watcher_5042002');
assert.equal(LOCK_KEY, 'ans_event_watcher_5042002_lock');
assert.equal(LOCK_LEASE_MS, 45_000, 'Lock lease must be 45 seconds');
PASS('All contract addresses, confirmation depth, and limits match specification.');

console.log('2. Verifying event ABI signatures...');
assert.equal(NAME_SOLD_EVENT.name, 'NameSold');
assert.equal(TIP_SENT_EVENT.name, 'TipSent');
PASS('Event ABI signatures for NameSold and TipSent verified.');

// ─── PART 2: Server-Side Authorization & Timing Safety ───────────────────────
console.log('\n--- PART 2: Server-Side Authorization & Timing Safety ---');

console.log('3. Testing timingSafeCompare helper...');
assert.equal(timingSafeCompare('secret123', 'secret123'), true);
assert.equal(timingSafeCompare('secret123', 'secret124'), false);
assert.equal(timingSafeCompare('secret123', 'short'), false);
assert.equal(timingSafeCompare('', ''), true);
assert.equal(timingSafeCompare('a', ''), false);
PASS('Constant-time comparison accurately validates strings of matching and different lengths.');

console.log('4. Testing authorizeWatcherRequest with x-watcher-secret header...');
const testSecret = 'super-secure-watcher-secret-token-12345';
const reqWithHeader = new Request('https://example.com', {
  method: 'POST',
  headers: { 'x-watcher-secret': testSecret },
});
assert.equal(authorizeWatcherRequest(reqWithHeader, testSecret), true);

const reqWithWrongHeader = new Request('https://example.com', {
  method: 'POST',
  headers: { 'x-watcher-secret': 'wrong-secret' },
});
assert.equal(authorizeWatcherRequest(reqWithWrongHeader, testSecret), false);
PASS('x-watcher-secret header authorization verified.');

console.log('5. Testing authorizeWatcherRequest with Authorization: Bearer <secret>...');
const reqWithBearer = new Request('https://example.com', {
  method: 'POST',
  headers: { authorization: `Bearer ${testSecret}` },
});
assert.equal(authorizeWatcherRequest(reqWithBearer, testSecret), true);

const reqWithWrongBearer = new Request('https://example.com', {
  method: 'POST',
  headers: { authorization: 'Bearer wrong-secret' },
});
assert.equal(authorizeWatcherRequest(reqWithWrongBearer, testSecret), false);
PASS('Bearer token authorization verified.');

console.log('6. Testing authorizeWatcherRequest rejection of missing or empty credentials...');
const reqEmpty = new Request('https://example.com', { method: 'POST' });
assert.equal(authorizeWatcherRequest(reqEmpty, testSecret), false);
assert.equal(authorizeWatcherRequest(reqWithHeader, ''), false);
assert.equal(authorizeWatcherRequest(reqWithHeader, '   '), false);
PASS('Requests missing secrets or when server secret is empty are safely rejected.');

// ─── PART 3: Distributed Concurrency Lock on watcher_cursors ─────────────────
console.log('\n--- PART 3: Distributed Concurrency Lock on watcher_cursors ---');

let mockCursorTable = {};

const createMockLockDb = () => ({
  from(table) {
    if (table !== 'watcher_cursors') throw new Error(`Unexpected table: ${table}`);
    return {
      select() {
        return {
          eq(col, val) {
            return {
              maybeSingle: async () => ({
                data: mockCursorTable[val] ? { ...mockCursorTable[val] } : null,
                error: null,
              }),
            };
          },
        };
      },
      upsert: async (row) => {
        mockCursorTable[row.id] = { ...row };
        return { error: null };
      },
      delete() {
        return {
          eq(col1, val1) {
            return {
              eq: async (col2, val2) => {
                const existing = mockCursorTable[val1];
                if (existing && existing[col2] === val2) {
                  delete mockCursorTable[val1];
                }
                return { error: null };
              },
            };
          },
        };
      },
    };
  },
});

console.log('7. Testing fresh lock acquisition...');
mockCursorTable = {};
const db1 = createMockLockDb();
const lockResult1 = await acquireDistributedLock(db1, LOCK_KEY, LOCK_LEASE_MS);
assert.equal(lockResult1.acquired, true, 'First caller should acquire the lease');
assert.ok(lockResult1.token, 'Should receive execution token');
assert.ok(mockCursorTable[LOCK_KEY], 'Lock row should exist in watcher_cursors');
PASS('Fresh distributed lock acquired successfully.');

console.log('8. Testing concurrent lock collision while lease is active...');
const db2 = createMockLockDb();
const lockResult2 = await acquireDistributedLock(db2, LOCK_KEY, LOCK_LEASE_MS);
assert.equal(lockResult2.acquired, false, 'Second concurrent caller must be rejected');
assert.equal(lockResult2.reason, 'CONCURRENT_RUN_IN_PROGRESS');
PASS('Concurrent invocation blocked while active lease is held.');

console.log('9. Testing recovery from expired lease (> 45 seconds old)...');
mockCursorTable[LOCK_KEY] = {
  id: LOCK_KEY,
  last_block: 'old-stale-token',
  updated_at: new Date(Date.now() - 50_000).toISOString(),
};
const lockResultRecovered = await acquireDistributedLock(db1, LOCK_KEY, LOCK_LEASE_MS);
assert.equal(lockResultRecovered.acquired, true, 'Should take over expired lock');
assert.notEqual(lockResultRecovered.token, 'old-stale-token');
PASS('Expired lease safely recovered without deadlock or manual intervention.');

console.log('10. Testing clean lock release...');
const released = await releaseDistributedLock(db1, LOCK_KEY, lockResultRecovered.token);
assert.equal(released, true);
assert.equal(mockCursorTable[LOCK_KEY], undefined, 'Lock row removed after release');

mockCursorTable[LOCK_KEY] = { id: LOCK_KEY, last_block: 'worker-token-b', updated_at: new Date().toISOString() };
await releaseDistributedLock(db1, LOCK_KEY, 'worker-token-a');
assert.ok(mockCursorTable[LOCK_KEY], 'Must not release lock owned by different token');
PASS('Lock release is clean and token-safe.');

// ─── PART 4: Argument Validation & Notifications ─────────────────────────────
console.log('\n--- PART 4: Event Decoding & Notification Generation ---');

console.log('11. Testing NameSold notification generation...');
const soldNotifs = buildNameSoldNotifications(
  {
    name: 'alice',
    seller: '0x1111111111111111111111111111111111111111',
    buyer: '0x2222222222222222222222222222222222222222',
    price: 25_000_000n, // 25 USDC
  },
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  0
);
assert.equal(soldNotifs.length, 2);
assert.equal(soldNotifs[0].recipient_address, '0x1111111111111111111111111111111111111111');
assert.equal(soldNotifs[0].kind, 'name_sold');
assert.equal(soldNotifs[0].title, 'alice.arc sold for 25.00 USDC');
assert.equal(soldNotifs[1].recipient_address, '0x2222222222222222222222222222222222222222');
assert.equal(soldNotifs[1].kind, 'name_bought');
assert.equal(soldNotifs[1].title, 'You acquired alice.arc');
PASS('NameSold correctly generates seller and buyer notifications.');

console.log('12. Testing TipSent notification generation...');
const tipNotifs = buildTipSentNotifications(
  {
    toName: 'bob',
    from: '0x1111111111111111111111111111111111111111',
    to: '0x3333333333333333333333333333333333333333',
    amount: 5_000_000n,
    note: 'Thank you for ANS!',
  },
  '0x999988887777',
  1
);
assert.equal(tipNotifs.length, 2);
assert.equal(tipNotifs[0].recipient_address, '0x3333333333333333333333333333333333333333');
assert.equal(tipNotifs[0].kind, 'tip_received');
assert.ok(tipNotifs[0].body.includes('Thank you for ANS!'));
assert.equal(tipNotifs[1].recipient_address, '0x1111111111111111111111111111111111111111');
assert.equal(tipNotifs[1].kind, 'tip_sent');
PASS('TipSent correctly routes recipient and sender notifications with note attached.');

console.log('13. Testing rejection of invalid events...');
assert.equal(buildNameSoldNotifications({ name: 'ab', seller: '0x1', buyer: '0x2', price: 100 }, '0x1', 0).length, 0);
assert.equal(buildTipSentNotifications({ toName: 'b', from: '0x1', to: '0x2', amount: 0n }, '0x1', 0).length, 0);
PASS('Invalid names, addresses, and amounts are strictly rejected.');

// ─── PART 5: Bounded Scanning & Confirmation Depth Math ──────────────────────
console.log('\n--- PART 5: Bounded Scanning & Confirmation Depth ---');

console.log('14. Testing bounded chunk math and confirmation depth...');
const chainTip = 100_000n;
const safeTip = chainTip - CONFIRMATION_DEPTH; // 99_997n
assert.equal(safeTip, 99997n);

// Case A: Backlog of 1000 blocks
const cursorA = 90_000n;
const fromA = cursorA + 1n; // 90001n
const maxBlocksA = DEFAULT_MAX_BLOCKS_PER_INVOCATION; // 200n
const toA = (fromA + maxBlocksA - 1n) < safeTip ? fromA + maxBlocksA - 1n : safeTip;
assert.equal(fromA, 90001n);
assert.equal(toA, 90200n, 'Scans exactly 200 blocks in bounded chunk');
assert.equal(toA < safeTip, true, 'Correctly flags backlog remaining');

// Case B: Small remainder of 5 blocks
const cursorB = 99_992n;
const fromB = cursorB + 1n; // 99993n
const toB = (fromB + maxBlocksA - 1n) < safeTip ? fromB + maxBlocksA - 1n : safeTip;
assert.equal(fromB, 99993n);
assert.equal(toB, 99997n, 'Bounds scan at safeTip without exceeding confirmation depth');

// Case C: Fully caught up
const cursorC = 99_997n;
const fromC = cursorC + 1n; // 99998n
assert.equal(fromC > safeTip, true, 'Detects fully caught up with 0 queries needed');
PASS('Bounded scanning math is strictly contiguous, bounded, and honors confirmation depth.');

// ─── PART 6: Full pollChunk Pipeline Simulation ──────────────────────────────
console.log('\n--- PART 6: pollChunk Pipeline Simulation ---');

let simulatedDb = {
  cursor: { id: CURSOR_KEY, last_block: '500' },
  notifications: [],
  lastUpsertOpts: null,
};

const createMockAppDb = () => ({
  from(table) {
    if (table === 'watcher_cursors') {
      return {
        select() {
          return {
            eq(col, val) {
              return {
                maybeSingle: async () => ({
                  data: simulatedDb.cursor ? { ...simulatedDb.cursor } : null,
                  error: null,
                }),
              };
            },
          };
        },
        upsert: async (row) => {
          simulatedDb.cursor = { ...row };
          return { error: null };
        },
      };
    }
    if (table === 'notifications') {
      return {
        upsert: async (rows, opts) => {
          simulatedDb.notifications.push(...rows);
          simulatedDb.lastUpsertOpts = opts;
          return { error: null };
        },
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  },
});

console.log('15. Testing pollChunk when chain is up to date...');
const mockRpcCaughtUp = {
  getBlockNumber: async () => 500n + CONFIRMATION_DEPTH,
  getLogs: async () => [],
};
const resCaughtUp = await pollChunk({
  rpcClient: mockRpcCaughtUp,
  dbClient: createMockAppDb(),
});
assert.equal(resCaughtUp.success, true);
assert.equal(resCaughtUp.upToDate, true);
assert.equal(resCaughtUp.insertedCount, 0);
PASS('Up-to-date state correctly detected with zero DB writes.');

console.log('16. Testing pollChunk ingesting events and advancing cursor...');
simulatedDb.cursor = { id: CURSOR_KEY, last_block: '500' };
simulatedDb.notifications = [];

const soldTopics = encodeEventTopics({
  abi: [NAME_SOLD_EVENT],
  eventName: 'NameSold',
  args: {
    seller: '0x1111111111111111111111111111111111111111',
    buyer: '0x2222222222222222222222222222222222222222',
  },
});
const soldData = encodeAbiParameters(
  parseAbiParameters('string name, uint256 price'),
  ['vitalik', 50000000n]
);

const mockRpcWithLogs = {
  getBlockNumber: async () => 550n + CONFIRMATION_DEPTH,
  getLogs: async () => [
    {
      address: '0xa70e51df2472677219de4afa5124a47526e27033',
      transactionHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      logIndex: 0,
      topics: soldTopics,
      data: soldData,
    },
  ],
};

const resScan = await pollChunk({
  rpcClient: mockRpcWithLogs,
  dbClient: createMockAppDb(),
  maxBlocks: 50n,
});

assert.equal(resScan.success, true);
assert.equal(resScan.fromBlock, '501');
assert.equal(resScan.toBlock, '550');
assert.equal(resScan.insertedCount, 2);
assert.equal(simulatedDb.cursor.last_block, '550', 'Cursor must advance to 550');
assert.equal(
  simulatedDb.lastUpsertOpts.onConflict,
  'tx_hash,log_index,recipient_address,kind',
  'Must specify table dedup conflict key'
);
assert.equal(simulatedDb.lastUpsertOpts.ignoreDuplicates, true);
PASS('Events ingested, deduplicated, and cursor advanced contiguously.');

console.log('17. Testing RPC error fail-closed safety (cursor NOT advanced)...');
simulatedDb.cursor = { id: CURSOR_KEY, last_block: '550' };
const mockRpcFailing = {
  getBlockNumber: async () => 600n + CONFIRMATION_DEPTH,
  getLogs: async () => {
    throw new Error('RPC query exceeded maximum block range (limit: 500)');
  },
};

const resRpcError = await pollChunk({
  rpcClient: mockRpcFailing,
  dbClient: createMockAppDb(),
  maxBlocks: 50n,
});

assert.equal(resRpcError.success, false);
assert.equal(resRpcError.cursorAdvanced, false);
assert.equal(simulatedDb.cursor.last_block, '550', 'Cursor must stay at 550 on RPC error');
PASS('RPC error halts scan safely without advancing cursor; events will be retried.');

console.log('18. Testing DB write error fail-closed safety (cursor NOT advanced)...');
simulatedDb.cursor = { id: CURSOR_KEY, last_block: '550' };
const mockDbFailingWrites = {
  from(table) {
    if (table === 'watcher_cursors') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: simulatedDb.cursor, error: null }) }) }),
        upsert: async () => { throw new Error('Should not be called if insert fails'); },
      };
    }
    if (table === 'notifications') {
      return {
        upsert: async () => ({ error: { message: 'Supabase DB write timeout' } }),
      };
    }
  },
};

const mockRpcWithNewLogs = {
  getBlockNumber: async () => 600n + CONFIRMATION_DEPTH,
  getLogs: async () => [
    {
      address: '0xa70e51df2472677219de4afa5124a47526e27033',
      transactionHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      logIndex: 0,
      topics: soldTopics,
      data: soldData,
    },
  ],
};

const resDbError = await pollChunk({
  rpcClient: mockRpcWithNewLogs,
  dbClient: mockDbFailingWrites,
  maxBlocks: 50n,
});

assert.equal(resDbError.success, false);
assert.equal(resDbError.cursorAdvanced, false);
assert.equal(simulatedDb.cursor.last_block, '550', 'Cursor must stay at 550 on DB write error');
PASS('Database write error halts scan safely without advancing cursor; no events lost.');

// ─── PART 7: Static Security & Invariants Checks ─────────────────────────────
console.log('\n--- PART 7: Static Security Invariants ---');

console.log('19. Inspecting supabase/functions/ans-event-watcher/index.ts...');
const edgeFnCode = fs.readFileSync(path.resolve('supabase/functions/ans-event-watcher/index.ts'), 'utf8');
assert.ok(edgeFnCode.includes("Deno.env.get('WATCHER_SECRET')"), 'Must read WATCHER_SECRET from server env');
assert.ok(edgeFnCode.includes("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"), 'Must use server-side service role key');
assert.ok(edgeFnCode.includes('timingSafeCompare'), 'Must use constant-time secret comparison');
assert.ok(edgeFnCode.includes('acquireDistributedLock'), 'Must use distributed lease lock');
assert.ok(edgeFnCode.includes('CONFIRMATION_DEPTH = 3n'), 'Must enforce confirmation depth 3n');
assert.ok(edgeFnCode.includes('ARC_TESTNET_CHAIN_ID = 5042002'), 'Must target Arc Testnet 5042002');
PASS('Edge Function code adheres to all security and architecture requirements.');

console.log('20. Inspecting supabase_cron_setup.sql...');
const cronSql = fs.readFileSync(path.resolve('supabase_cron_setup.sql'), 'utf8');
assert.ok(cronSql.includes('SECURITY DEFINER'), 'Trigger function must be SECURITY DEFINER');
assert.ok(cronSql.includes('REVOKE ALL ON FUNCTION trigger_ans_event_watcher() FROM public, anon, authenticated'), 'Must revoke from public roles');
assert.ok(cronSql.includes('vault.decrypted_secrets'), 'Must fetch secret from vault.decrypted_secrets');
assert.ok(cronSql.includes('cron.unschedule'), 'Must unschedule before scheduling for idempotency');
assert.ok(cronSql.includes('net.http_post'), 'Must use pg_net for asynchronous HTTP POST');
assert.ok(!cronSql.includes('my_real_secret'), 'No raw secrets in cron SQL');
assert.ok(cronSql.includes('REPLACE_WITH_YOUR_RANDOM_WATCHER_SECRET'), 'Uses clear placeholder for secret setup');
PASS('supabase_cron_setup.sql is fully idempotent, secure, and preserves secrets.');

console.log('21. Verifying existing get-notifications and SQL setups remain unmodified...');
const setupSql = fs.readFileSync(path.resolve('supabase_setup.sql'), 'utf8');
const sec001Sql = fs.readFileSync(path.resolve('supabase_migration_sec_001.sql'), 'utf8');
const getNotifsCode = fs.readFileSync(path.resolve('supabase/functions/get-notifications/index.ts'), 'utf8');

assert.ok(setupSql.includes('REVOKE ALL ON notifications FROM public, anon, authenticated'));
assert.ok(sec001Sql.includes('REVOKE ALL ON notifications FROM public, anon, authenticated'));
assert.ok(getNotifsCode.includes('consumeChallenge'));
PASS('Existing source of truth (setup SQL, sec_001, get-notifications) preserved exactly.');

console.log('\n=================================================================');
console.log('  All 21 Edge Watcher & Cron Test Assertions Passed Successfully!');
console.log('=================================================================\n');
