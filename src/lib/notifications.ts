/**
 * ANS Notifications Library
 *
 * Provides typed helpers for reading and marking-as-read the ANS in-app
 * notifications stored in Supabase.
 *
 * Security model:
 *   The `notifications` table has no direct public/anon access at the
 *   database level (all RLS policies block public SELECT and UPDATE).
 *   All notification operations go through the `get-notifications`
 *   Supabase Edge Function, which verifies wallet ownership via a
 *   server-issued challenge and ERC-1271/personal_sign signature before
 *   serving any data.
 *
 *   This prevents any client from reading or marking another wallet's
 *   notifications by simply passing a different address in a query.
 *
 * UX trade-off:
 *   Real-time Supabase channel subscriptions cannot be secured without
 *   a Supabase Auth JWT. They have been removed.
 *
 *   Notifications are fetched on demand when the user opens the bell
 *   dropdown. This avoids repeated signature prompts. The caller may
 *   also call `refresh()` explicitly (e.g. after a marketplace purchase).
 *
 *   Each fetch and mark-read requires the user to sign one challenge.
 *   Mark-read and fetch are batched into a single action to minimize prompts.
 *
 * Note on Circle counterfactual smart accounts:
 *   Circle smart accounts that have never been deployed on-chain cannot
 *   satisfy ERC-1271 verification. verifyMessage will return false and
 *   the Edge Function will return 401. This is the correct fail-closed
 *   response. If support for counterfactual accounts is required, a
 *   Circle-specific verification flow must be implemented.
 *
 * Never import or expose the service-role key in this file.
 */

import { useState, useCallback, useEffect } from 'react';
import { decodeAbiParameters } from 'viem';
import { toast } from 'sonner';
import { supabaseUrl, isSupabaseConfigured } from './supabase';
import { ANS_ADDRESS } from './abis';
import { cleanName } from '../hooks/useANS';
import { getCachedReverseName } from './reverseResolver';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationKind =
  | 'name_sold'          // Your name was sold to a buyer
  | 'name_bought'        // You purchased a name
  | 'name_gift_received' // You received a gifted name
  | 'name_gift_sent'     // You gifted a name
  | 'name_expiring'      // A name you own is expiring soon
  | 'tip_received'       // You received a USDC tip
  | 'tip_sent'           // You sent a USDC tip
  | 'tx_success'         // Transaction succeeded
  | 'tx_failed';         // Transaction failed

export interface ANSNotification {
  id: string;
  recipient_address: string;   // lowercase checksummed address
  kind: NotificationKind;
  title: string;
  body: string;
  /** Optional deep-link destination, e.g. "profile:alice.arc" or "marketplace" */
  link?: string | null;
  tx_hash?: string | null;
  is_read: boolean;
  created_at: string;          // ISO timestamp
}

/**
 * Callback type for signing a notification access challenge.
 * Receives the canonical message string, must return the hex signature.
 * Wire to: getSmartAccount(credential).signMessage({ message })
 */
export type SignChallengeCallback = (message: string) => Promise<string>;

// ─── Edge Function URL helper ─────────────────────────────────────────────────

function getEdgeFunctionUrl(functionName: string): string | null {
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

const getAnonKey = () =>
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';

// ─── Core API ────────────────────────────────────────────────────────────────

interface ChallengeResponse {
  success: boolean;
  challenge: string;
  message: string;
  expiresAt: string;
}

async function requestChallenge(walletAddress: string): Promise<ChallengeResponse | null> {
  const url = getEdgeFunctionUrl('get-notifications');
  if (!url) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: getAnonKey(),
      },
      body: JSON.stringify({ action: 'request_challenge', walletAddress }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[notifications] requestChallenge failed:', err);
      return null;
    }
    return await res.json() as ChallengeResponse;
  } catch (err) {
    console.error('[notifications] requestChallenge network error:', err);
    return null;
  }
}

export interface EdgeFunctionCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  isAccountUndeployed?: boolean;
  userCancelled?: boolean;
}

async function callEdgeFunction(
  action: 'fetch' | 'mark_read',
  walletAddress: string,
  signChallenge: SignChallengeCallback,
  extra?: Record<string, unknown>
): Promise<EdgeFunctionCallResult | null> {
  const url = getEdgeFunctionUrl('get-notifications');
  if (!url) return null;

  const challengeData = await requestChallenge(walletAddress);
  if (!challengeData) {
    console.error('[notifications] Failed to obtain challenge from Edge Function');
    return { success: false, error: 'Challenge request failed' };
  }

  let signature: string;
  try {
    signature = await signChallenge(challengeData.message);
  } catch (err: unknown) {
    const isCancel =
      (err as { name?: string })?.name === 'NotAllowedError' ||
      String(err).toLowerCase().includes('cancel') ||
      String(err).toLowerCase().includes('abort');
    if (!isCancel) {
      console.error('[notifications] Signing rejected or failed:', err);
    }
    return { success: false, userCancelled: isCancel, error: 'Signing rejected' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: getAnonKey(),
      },
      body: JSON.stringify({
        action,
        walletAddress,
        challenge: challengeData.challenge,
        message: challengeData.message,
        signature,
        ...extra,
      }),
    });

    if (res.status === 403) {
      const err = await res.json().catch(() => ({}));
      if (err?.error === 'ACCOUNT_NOT_DEPLOYED') {
        return { success: false, isAccountUndeployed: true, error: 'ACCOUNT_NOT_DEPLOYED' };
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[notifications] ${action} Edge Function error:`, err);
      return { success: false, error: err?.error || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    console.error(`[notifications] ${action} network error:`, err);
    return { success: false, error: 'Network error' };
  }
}

export interface FetchNotificationsResponse {
  notifications: ANSNotification[];
  isAccountUndeployed: boolean;
  userCancelled?: boolean;
  error?: string | null;
}

/**
 * Detailed notification fetch returning deployment status and error details.
 */
export async function fetchNotificationsDetailed(
  walletAddress: string,
  signChallenge: SignChallengeCallback
): Promise<FetchNotificationsResponse> {
  if (!isSupabaseConfigured) {
    return { notifications: [], isAccountUndeployed: false };
  }
  const result = await callEdgeFunction('fetch', walletAddress, signChallenge);
  if (!result) {
    return { notifications: [], isAccountUndeployed: false, error: 'Connection failed' };
  }
  if (result.isAccountUndeployed) {
    return { notifications: [], isAccountUndeployed: true, error: 'ACCOUNT_NOT_DEPLOYED' };
  }
  if (result.userCancelled) {
    return { notifications: [], isAccountUndeployed: false, userCancelled: true };
  }
  if (!result.success) {
    return { notifications: [], isAccountUndeployed: false, error: result.error ?? 'Request failed' };
  }
  const r = result.data as { notifications?: unknown[] } | undefined;
  return {
    notifications: ((r?.notifications ?? []) as ANSNotification[]),
    isAccountUndeployed: false,
  };
}

/**
 * Fetch notifications for a wallet.
 * Requires the wallet owner to sign a server-issued challenge.
 */
export async function fetchNotifications(
  walletAddress: string,
  signChallenge: SignChallengeCallback
): Promise<ANSNotification[]> {
  const res = await fetchNotificationsDetailed(walletAddress, signChallenge);
  return res.notifications;
}

/**
 * Mark a single notification as read.
 * Requires the wallet owner to sign a server-issued challenge.
 */
export async function markRead(
  id: string,
  walletAddress: string,
  signChallenge: SignChallengeCallback
): Promise<void> {
  if (!isSupabaseConfigured) return;
  await callEdgeFunction('mark_read', walletAddress, signChallenge, { id });
}

/**
 * Mark ALL notifications for a wallet as read.
 * Requires the wallet owner to sign a server-issued challenge.
 */
export async function markAllRead(
  walletAddress: string,
  signChallenge: SignChallengeCallback
): Promise<void> {
  if (!isSupabaseConfigured) return;
  await callEdgeFunction('mark_read', walletAddress, signChallenge);
}

// ─── React Hook ──────────────────────────────────────────────────────────────

export interface UseNotificationsResult {
  notifications: ANSNotification[];
  unreadCount: number;
  isLoading: boolean;
  isAccountUndeployed: boolean;
  hasCachedSession: boolean;
  /**
   * Manually load/refresh notifications.
   * Prompts the user to sign once per session unless force is true.
   */
  refresh: (force?: boolean) => Promise<void>;
  /** Optimistically marks one notification read, then persists via Edge Function. */
  markOneRead: (id: string) => Promise<void>;
  /** Optimistically marks all notifications read, then persists via Edge Function. */
  markAllAsRead: () => Promise<void>;
}

// ─── Client-side Transaction Notifications ─────────────────────────────────────

/** Helper to retrieve local client-side transaction notifications */
export function getClientNotifications(walletAddress: string): ANSNotification[] {
  if (!walletAddress || typeof window === 'undefined') return [];
  try {
    const key = `ans_client_notifs_${walletAddress.toLowerCase()}`;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ANSNotification[]) : [];
  } catch {
    return [];
  }
}

/**
 * Dispatch a client-side transaction status notification (success or failure with reason).
 * Immediately persists to localStorage and dispatches a notification update event.
 */
export function addClientNotification(
  walletAddress: string | null | undefined,
  data: {
    kind: NotificationKind;
    title: string;
    body: string;
    tx_hash?: string | null;
    link?: string | null;
  }
): void {
  if (!walletAddress || typeof window === 'undefined') return;
  const norm = walletAddress.toLowerCase();
  const newNotif: ANSNotification = {
    id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    recipient_address: norm,
    kind: data.kind,
    title: data.title,
    body: data.body,
    tx_hash: data.tx_hash || null,
    link: data.link || null,
    is_read: false,
    created_at: new Date().toISOString(),
  };

  try {
    const key = `ans_client_notifs_${norm}`;
    const existing: ANSNotification[] = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = [newNotif, ...existing.filter((x) => x.id !== newNotif.id)].slice(0, 50);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.warn('[notifications] Failed to persist client notification', err);
  }

  window.dispatchEvent(
    new CustomEvent('ans_notifications_updated', {
      detail: { wallet: norm, notif: newNotif },
    })
  );
}

function mergeWithClientNotifications(
  serverNotifs: ANSNotification[],
  clientNotifs: ANSNotification[]
): ANSNotification[] {
  const map = new Map<string, ANSNotification>();
  const txHashes = new Set<string>();

  for (const s of serverNotifs) {
    map.set(s.id, s);
    if (s.tx_hash) {
      txHashes.add(s.tx_hash.toLowerCase());
    }
  }

  for (const c of clientNotifs) {
    if (c.tx_hash && txHashes.has(c.tx_hash.toLowerCase())) {
      continue;
    }
    if (!map.has(c.id)) {
      map.set(c.id, c);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function getReadIds(normAddr: string): Set<string> {
  if (!normAddr || typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(`ans_read_notifs_${normAddr}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistReadId(normAddr: string, id: string): void {
  if (!normAddr || typeof window === 'undefined') return;
  try {
    const set = getReadIds(normAddr);
    set.add(id);
    localStorage.setItem(`ans_read_notifs_${normAddr}`, JSON.stringify(Array.from(set)));
  } catch {}
}

function persistAllReadIds(normAddr: string, ids: string[]): void {
  if (!normAddr || typeof window === 'undefined') return;
  try {
    const set = getReadIds(normAddr);
    for (const id of ids) set.add(id);
    localStorage.setItem(`ans_read_notifs_${normAddr}`, JSON.stringify(Array.from(set)));
  } catch {}
}

function getStoredSessionNotifs(normAddr: string): ANSNotification[] {
  if (!normAddr || typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(`ans_session_notifs_${normAddr}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredSessionNotifs(normAddr: string, notifs: ANSNotification[]): void {
  if (!normAddr || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`ans_session_notifs_${normAddr}`, JSON.stringify(notifs));
  } catch {}
}

// In-memory notification cache
const sessionNotificationCache = new Map<string, { notifications: ANSNotification[]; timestamp: number }>();

// ─── On-Chain Notifications Sync ──────────────────────────────────────────────

const TOPIC_NAME_SOLD = '0xe3202271e290250caf3bcfb96c2e7e8e5f63158e26901feb4c260069737892ef';
const TOPIC_NAME_GIFTED = '0xf936ba22d566eab894630104cae90a56f965c7cc0f64f7a6b3e1090793462e58';
const TOPIC_NAME_TRANSFERRED = '0x21e177c2bf9adbd548d25cc65d54b697122f907257d8318bddc22375fe666de8';
const TOPIC_TIP_SENT = '0x807311cccf0140391fe0fe34432f92ebcf55949a591c315de5f92b6d11577cbc';

function topicToAddress(topic: string | null | undefined): string {
  if (!topic || topic.length < 42) return '';
  return ('0x' + topic.slice(26)).toLowerCase();
}

function formatShortAddr(addr: string): string {
  if (!addr) return '';
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function fetchOnChainNotifications(walletAddress: string): Promise<ANSNotification[]> {
  if (!walletAddress) return [];
  const normUser = walletAddress.toLowerCase();
  const notifs: ANSNotification[] = [];

  try {
    const res = await fetch(`https://explorer.testnet.arc.io/api/v2/addresses/${ANS_ADDRESS}/logs`);
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    // Helper: format address with reverse-resolved .arc name if known
    const formatAddrWithArc = (addr: string): string => {
      const clean = addr.toLowerCase();
      const rev = getCachedReverseName(clean);
      if (rev) return rev;
      return formatShortAddr(clean);
    };

    // Pre-pass: Collect all transactions that emitted a NameSold event to suppress duplicate transfers
    const soldTxHashes = new Set<string>();
    for (const item of items) {
      const topics: (string | null)[] = item.topics || [];
      if (topics[0]?.toLowerCase() === TOPIC_NAME_SOLD) {
        const txHash = item.transaction_hash || item.tx_hash || '';
        if (txHash) soldTxHashes.add(txHash.toLowerCase());
      }
    }

    for (const item of items) {
      const topics: (string | null)[] = item.topics || [];
      const topic0 = topics[0]?.toLowerCase();
      if (!topic0) continue;

      const txHash: string = item.transaction_hash || item.tx_hash || '';
      const timestamp: string = item.block_timestamp || new Date().toISOString();
      const logIndex: number = item.index ?? 0;
      const rawData = item.data;

      // 1. NameSold(string name, address indexed seller, address indexed buyer, uint256 price)
      if (topic0 === TOPIC_NAME_SOLD && topics.length >= 3) {
        const seller = topicToAddress(topics[1]);
        const buyer = topicToAddress(topics[2]);

        if (seller === normUser || buyer === normUser) {
          let name = 'unknown';
          let priceWei = 0n;
          try {
            if (rawData && rawData !== '0x') {
              const decoded = decodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], rawData);
              name = cleanName(String(decoded[0] || ''));
              priceWei = BigInt(decoded[1] || 0n);
            }
          } catch (e) {
            console.warn('[notifications] Failed to decode NameSold data:', e);
          }

          const priceUsdc = (Number(priceWei) / 1e6).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 6,
          });

          const sellerLabel = formatAddrWithArc(seller);
          const buyerLabel = formatAddrWithArc(buyer);
          const dateStr = new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

          if (seller === normUser) {
            notifs.push({
              id: `onchain_sold_${txHash}_${logIndex}`,
              recipient_address: normUser,
              kind: 'name_sold',
              title: `Identity Sold: ${name}.arc`,
              body: `Your name ${name}.arc was purchased by ${buyerLabel} for ${priceUsdc} USDC on ${dateStr}.`,
              link: `userprofile:${buyer}`,
              tx_hash: txHash,
              is_read: false,
              created_at: timestamp,
            });
          } else if (buyer === normUser) {
            notifs.push({
              id: `onchain_bought_${txHash}_${logIndex}`,
              recipient_address: normUser,
              kind: 'name_bought',
              title: `Identity Acquired: ${name}.arc`,
              body: `You successfully purchased ${name}.arc from ${sellerLabel} for ${priceUsdc} USDC.`,
              link: `profile:${name}`,
              tx_hash: txHash,
              is_read: false,
              created_at: timestamp,
            });
          }
        }
      }

      // 2. NameGifted(string name, address indexed gifter, address indexed recipient, uint64 expiry)
      else if (topic0 === TOPIC_NAME_GIFTED && topics.length >= 3) {
        const gifter = topicToAddress(topics[1]);
        const recipient = topicToAddress(topics[2]);

        if (recipient === normUser || gifter === normUser) {
          let name = 'unknown';
          let expirySec = 0;
          try {
            if (rawData && rawData !== '0x') {
              const decoded = decodeAbiParameters([{ type: 'string' }, { type: 'uint64' }], rawData);
              name = cleanName(String(decoded[0] || ''));
              expirySec = Number(decoded[1] || 0n);
            }
          } catch (e) {
            console.warn('[notifications] Failed to decode NameGifted data:', e);
          }

          const gifterLabel = formatAddrWithArc(gifter);
          const recipientLabel = formatAddrWithArc(recipient);
          const expiryDateStr = expirySec > 0 ? new Date(expirySec * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
          const monthsDuration = expirySec > 0 ? Math.max(1, Math.round((expirySec - (Date.now() / 1000)) / (30 * 24 * 3600))) : 0;
          const durationLabel = monthsDuration > 0 ? `${monthsDuration} Months` : '';
          const detailSuffix = [durationLabel, expiryDateStr ? `expires ${expiryDateStr}` : ''].filter(Boolean).join(', ');

          if (recipient === normUser) {
            notifs.push({
              id: `onchain_gift_rec_${txHash}_${logIndex}`,
              recipient_address: normUser,
              kind: 'name_gift_received',
              title: 'Name Gift Received',
              body: `${gifterLabel} gifted you ${name}.arc${detailSuffix ? ` (${detailSuffix})` : ''}!`,
              link: `profile:${name}`,
              tx_hash: txHash,
              is_read: false,
              created_at: timestamp,
            });
          } else if (gifter === normUser) {
            notifs.push({
              id: `onchain_gift_sent_${txHash}_${logIndex}`,
              recipient_address: normUser,
              kind: 'name_gift_sent',
              title: 'Name Gifted',
              body: `You successfully gifted ${name}.arc${detailSuffix ? ` (${detailSuffix})` : ''} to ${recipientLabel}.`,
              link: `profile:${name}`,
              tx_hash: txHash,
              is_read: false,
              created_at: timestamp,
            });
          }
        }
      }

      // 3. TipSent(string toName, address indexed from, address indexed to, uint256 amount, string note)
      else if (topic0 === TOPIC_TIP_SENT && topics.length >= 3) {
        const from = topicToAddress(topics[1]);
        const to = topicToAddress(topics[2]);

        if (to === normUser || from === normUser) {
          let toName = '';
          let amountWei = 0n;
          let note = '';
          try {
            if (rawData && rawData !== '0x') {
              const decoded = decodeAbiParameters(
                [{ type: 'string' }, { type: 'uint256' }, { type: 'string' }],
                rawData
              );
              toName = cleanName(String(decoded[0] || ''));
              amountWei = BigInt(decoded[1] || 0n);
              note = String(decoded[2] || '').trim();
            }
          } catch (e) {
            console.warn('[notifications] Failed to decode TipSent data:', e);
          }

          const amountUsdc = (Number(amountWei) / 1e6).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 6,
          });

          const fromLabel = formatAddrWithArc(from);
          const toLabel = toName ? `${toName}.arc` : formatAddrWithArc(to);

          if (to === normUser) {
            notifs.push({
              id: `onchain_tip_rec_${txHash}_${logIndex}`,
              recipient_address: normUser,
              kind: 'tip_received',
              title: 'Tip Received',
              body: `You received a ${amountUsdc} USDC tip from ${fromLabel}${
                note ? ` ("${note}")` : ''
              }.`,
              link: `userprofile:${from}`,
              tx_hash: txHash,
              is_read: false,
              created_at: timestamp,
            });
          } else if (from === normUser) {
            notifs.push({
              id: `onchain_tip_sent_${txHash}_${logIndex}`,
              recipient_address: normUser,
              kind: 'tip_sent',
              title: 'Tip Sent',
              body: `You sent a ${amountUsdc} USDC tip to ${toLabel}.`,
              link: toName ? `profile:${toName}` : `userprofile:${to}`,
              tx_hash: txHash,
              is_read: false,
              created_at: timestamp,
            });
          }
        }
      }

      // 4. NameTransferred(string name, address indexed from, address indexed to)
      else if (topic0 === TOPIC_NAME_TRANSFERRED && topics.length >= 3) {
        // If this transfer was part of a marketplace purchase, suppress the duplicate gift notification!
        if (soldTxHashes.has(txHash.toLowerCase())) {
          continue;
        }

        const from = topicToAddress(topics[1]);
        const to = topicToAddress(topics[2]);

        if (to === normUser || from === normUser) {
          let name = 'unknown';
          try {
            if (rawData && rawData !== '0x') {
              const decoded = decodeAbiParameters([{ type: 'string' }], rawData);
              name = cleanName(String(decoded[0] || ''));
            }
          } catch (e) {
            console.warn('[notifications] Failed to decode NameTransferred data:', e);
          }

          const fromLabel = formatAddrWithArc(from);
          const toLabel = formatAddrWithArc(to);

          if (to === normUser) {
            notifs.push({
              id: `onchain_transfer_rec_${txHash}_${logIndex}`,
              recipient_address: normUser,
              kind: 'name_gift_received',
              title: 'Name Transferred to You',
              body: `${fromLabel} transferred ownership of ${name}.arc to your wallet.`,
              link: `profile:${name}`,
              tx_hash: txHash,
              is_read: false,
              created_at: timestamp,
            });
          } else if (from === normUser) {
            notifs.push({
              id: `onchain_transfer_sent_${txHash}_${logIndex}`,
              recipient_address: normUser,
              kind: 'name_gift_sent',
              title: 'Name Transferred',
              body: `You transferred ownership of ${name}.arc to ${toLabel}.`,
              link: `profile:${name}`,
              tx_hash: txHash,
              is_read: false,
              created_at: timestamp,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[notifications] fetchOnChainNotifications error:', err);
  }

  return notifs;
}

export function useNotifications(
  walletAddress: string | null | undefined,
  _signChallenge?: SignChallengeCallback | null | undefined
): UseNotificationsResult {
  const normAddr = walletAddress?.toLowerCase() || '';

  const [notifications, setNotifications] = useState<ANSNotification[]>(() => {
    if (!normAddr) return [];
    const client = getClientNotifications(normAddr);
    let server: ANSNotification[] = [];
    if (sessionNotificationCache.has(normAddr)) {
      server = sessionNotificationCache.get(normAddr)!.notifications;
    } else {
      server = getStoredSessionNotifs(normAddr);
      if (server.length > 0) {
        sessionNotificationCache.set(normAddr, { notifications: server, timestamp: Date.now() });
      }
    }
    const merged = mergeWithClientNotifications(server, client);
    const readIds = getReadIds(normAddr);
    return merged.map(n => readIds.has(n.id) ? { ...n, is_read: true } : n);
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAccountUndeployed, setIsAccountUndeployed] = useState(false);

  const refresh = useCallback(
    async (_force = false) => {
      if (!normAddr) {
        setNotifications([]);
        setIsAccountUndeployed(false);
        return;
      }

      setIsLoading(true);
      try {
        // Fetch confirmed on-chain event logs (NameSold, NameGifted, TipSent, NameTransferred)
        const onChainNotifs = await fetchOnChainNotifications(normAddr);

        // Load client-side transaction notifications
        const client = getClientNotifications(normAddr);

        // Load cached server or session notifications
        const cached = sessionNotificationCache.has(normAddr)
          ? sessionNotificationCache.get(normAddr)!.notifications
          : getStoredSessionNotifs(normAddr);

        const merged = mergeWithClientNotifications(
          mergeWithClientNotifications(cached, onChainNotifs),
          client
        );

        sessionNotificationCache.set(normAddr, {
          notifications: merged,
          timestamp: Date.now(),
        });
        saveStoredSessionNotifs(normAddr, merged);

        const readIds = getReadIds(normAddr);
        setNotifications(merged.map(n => readIds.has(n.id) ? { ...n, is_read: true } : n));
      } catch (err) {
        console.error('[notifications] refresh error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [normAddr]
  );

  // Sync state if wallet address switches & auto-refresh on mount
  useEffect(() => {
    if (normAddr) {
      refresh(false);
      // Background poll every 20 seconds for new events (no passkey needed)
      const timer = setInterval(() => {
        refresh(false);
      }, 20000);
      return () => clearInterval(timer);
    } else {
      setNotifications([]);
    }
  }, [normAddr, refresh]);

  // Listen for live client-side transaction updates
  useEffect(() => {
    if (!normAddr || typeof window === 'undefined') return;
    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ wallet: string; notif: ANSNotification }>;
      if (custom.detail?.wallet === normAddr) {
        setNotifications((prev) => {
          const client = getClientNotifications(normAddr);
          const server = sessionNotificationCache.has(normAddr)
            ? sessionNotificationCache.get(normAddr)!.notifications
            : getStoredSessionNotifs(normAddr);
          const merged = mergeWithClientNotifications(server, client);
          const readIds = getReadIds(normAddr);
          return merged.map(n => readIds.has(n.id) ? { ...n, is_read: true } : n);
        });
      }
    };
    window.addEventListener('ans_notifications_updated', handleUpdate);
    return () => window.removeEventListener('ans_notifications_updated', handleUpdate);
  }, [normAddr]);

  const hasCachedSession = Boolean(
    normAddr && (sessionNotificationCache.has(normAddr) || getStoredSessionNotifs(normAddr).length > 0)
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markOneRead = useCallback(
    async (id: string) => {
      if (!walletAddress) return;
      // Optimistic update locally
      const updated = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
      setNotifications(updated);

      if (normAddr) {
        persistReadId(normAddr, id);
        if (id.startsWith('client_')) {
          const key = `ans_client_notifs_${normAddr}`;
          try {
            const current = getClientNotifications(normAddr);
            const saved = current.map((n) => (n.id === id ? { ...n, is_read: true } : n));
            localStorage.setItem(key, JSON.stringify(saved));
          } catch {}
        }

        const cached = sessionNotificationCache.get(normAddr);
        if (cached) {
          const updatedCache = cached.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
          sessionNotificationCache.set(normAddr, {
            notifications: updatedCache,
            timestamp: Date.now(),
          });
          saveStoredSessionNotifs(normAddr, updatedCache);
        }
      }
      // Never prompt for passkey signature just to mark a notification read
    },
    [walletAddress, notifications, normAddr]
  );

  const markAllAsRead = useCallback(async () => {
    if (!walletAddress) return;
    const updated = notifications.map((n) => ({ ...n, is_read: true }));
    setNotifications(updated);

    if (normAddr) {
      persistAllReadIds(normAddr, notifications.map(n => n.id));
      const key = `ans_client_notifs_${normAddr}`;
      try {
        const current = getClientNotifications(normAddr);
        const saved = current.map((n) => ({ ...n, is_read: true }));
        localStorage.setItem(key, JSON.stringify(saved));
      } catch {}

      const cached = sessionNotificationCache.get(normAddr);
      if (cached) {
        const updatedCache = cached.notifications.map((n) => ({ ...n, is_read: true }));
        sessionNotificationCache.set(normAddr, {
          notifications: updatedCache,
          timestamp: Date.now(),
        });
        saveStoredSessionNotifs(normAddr, updatedCache);
      }
    }
    // Never prompt for passkey signature just to mark all notifications read
  }, [walletAddress, notifications, normAddr]);

  return {
    notifications,
    unreadCount,
    isLoading,
    isAccountUndeployed,
    hasCachedSession,
    refresh,
    markOneRead,
    markAllAsRead,
  };
}
