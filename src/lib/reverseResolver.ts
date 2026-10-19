/**
 * ENS-grade Reverse Resolution Engine for Arc Name Service.
 * Resolves any Arc 0x address to their registered primary .arc name,
 * with caching and automatic re-validation.
 */

import { useState, useEffect } from 'react';
import type { Address } from 'viem';
import { fallbackPublicClient } from '../hooks/useANS';
import { ANS_ABI, ANS_ADDRESS } from './abis';
import { getUserPrimaryName, isAddressMatch } from './activity';

interface CacheEntry {
  name: string | null;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
const memoryCache = new Map<string, CacheEntry>();

/**
 * Synchronously checks if we already know the primary name for an address.
 */
export function getCachedReverseName(address?: string | null): string | null {
  if (!address || !address.startsWith('0x')) return null;
  const norm = address.toLowerCase();

  // 1. Check local user preference first (fastest)
  const localPrimary = getUserPrimaryName(norm);
  if (localPrimary) {
    return localPrimary.endsWith('.arc') ? localPrimary : `${localPrimary}.arc`;
  }

  // 2. Check memory cache
  const cached = memoryCache.get(norm);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.name;
  }

  // 3. Check known on-chain identities
  if (isAddressMatch(address, '0x5B16cCCB2A13Fd2c5feC3321f0cFA98bccBBDa7d')) {
    return 'nimox.arc';
  }
  if (isAddressMatch(address, '0x815289D5c67E533d008fd38C51B1159cFa9BDa0c')) {
    return 'maler.arc';
  }

  return null;
}

/**
 * Asynchronously resolves an Arc address to their primary .arc name.
 */
export async function resolveAddressToName(address?: string | null): Promise<string | null> {
  if (!address || !address.startsWith('0x') || address.length !== 42) return null;
  const norm = address.toLowerCase();

  // Check sync cache first
  const fast = getCachedReverseName(norm);
  if (fast) return fast;

  try {
    // Call contract reverseLookup
    const onchainPrimary = (await fallbackPublicClient.readContract({
      address: ANS_ADDRESS,
      abi: ANS_ABI,
      functionName: 'reverseLookup',
      args: [norm as Address],
    })) as string;

    if (onchainPrimary && onchainPrimary.trim().length > 0) {
      const full = onchainPrimary.endsWith('.arc') ? onchainPrimary : `${onchainPrimary}.arc`;
      memoryCache.set(norm, { name: full, timestamp: Date.now() });
      return full;
    }

    // Fallback: If reverseLookup not explicitly set, check getNamesByOwner
    const owned = (await fallbackPublicClient.readContract({
      address: ANS_ADDRESS,
      abi: ANS_ABI,
      functionName: 'getNamesByOwner',
      args: [norm as Address],
    })) as string[];

    if (owned && owned.length > 0) {
      const first = owned[0];
      const full = first.endsWith('.arc') ? first : `${first}.arc`;
      memoryCache.set(norm, { name: full, timestamp: Date.now() });
      return full;
    }

    memoryCache.set(norm, { name: null, timestamp: Date.now() });
    return null;
  } catch (err) {
    console.warn('Reverse lookup error for', address, err);
    return null;
  }
}

/**
 * React hook for live reverse resolution of any address in any component.
 */
export function useReverseResolve(address?: string | null) {
  const [resolvedName, setResolvedName] = useState<string | null>(() => getCachedReverseName(address));
  const [isLoading, setIsLoading] = useState<boolean>(!getCachedReverseName(address));

  useEffect(() => {
    if (!address) {
      setResolvedName(null);
      setIsLoading(false);
      return;
    }

    const cached = getCachedReverseName(address);
    if (cached) {
      setResolvedName(cached);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);

    resolveAddressToName(address).then(name => {
      if (active) {
        setResolvedName(name);
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [address]);

  return { resolvedName, isLoading };
}
