/**
 * Subdomain Management & Resolution System for Arc Name Service.
 * Allows owners of 2nd-level domains (e.g. "nimox.arc") to issue, resolve,
 * and manage subdomains (e.g. "pay.nimox.arc" -> 0x5B16...) like Ethereum Name Service (ENS).
 */

import { validateSubdomainLabel, normalizeAnsName } from './ensNorm';
import { isAddress } from 'viem';

export interface SubdomainRecord {
  sublabel: string;       // e.g. "pay"
  parentName: string;     // e.g. "nimox"
  fullName: string;       // e.g. "pay.nimox.arc"
  targetAddress: string;  // e.g. "0x5B16cCCB2A13Fd2c5feC3321f0cFA98bccBBDa7d"
  createdAt: number;
  note?: string;
}

const STORAGE_PREFIX = 'ans_subdomains_';

function getStorageKey(parentName: string): string {
  const cleanParent = normalizeAnsName(parentName);
  return `${STORAGE_PREFIX}${cleanParent}`;
}

/**
 * Returns all configured subdomains for a parent .arc domain.
 */
export function getSubdomainsForParent(parentName: string): SubdomainRecord[] {
  if (!parentName) return [];
  const key = getStorageKey(parentName);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('Failed to parse subdomains for', parentName, err);
    return [];
  }
}

/**
 * Saves or updates a subdomain record under a parent domain.
 */
export function saveSubdomain(
  parentName: string,
  sublabel: string,
  targetAddress: string,
  note?: string
): SubdomainRecord {
  const cleanParent = normalizeAnsName(parentName);
  const validated = validateSubdomainLabel(sublabel);
  if (!validated.isValid) {
    throw new Error(validated.error || 'Invalid subdomain label.');
  }

  const cleanTarget = targetAddress.trim();
  if (!isAddress(cleanTarget)) {
    throw new Error('Target must be a valid 42-character Arc/EVM address (0x...).');
  }

  const list = getSubdomainsForParent(cleanParent);
  const existingIdx = list.findIndex(s => s.sublabel === validated.label);

  const record: SubdomainRecord = {
    sublabel: validated.label,
    parentName: cleanParent,
    fullName: `${validated.label}.${cleanParent}.arc`,
    targetAddress: cleanTarget,
    createdAt: Date.now(),
    note: note ? note.trim().slice(0, 100) : undefined,
  };

  if (existingIdx >= 0) {
    list[existingIdx] = record;
  } else {
    list.push(record);
  }

  localStorage.setItem(getStorageKey(cleanParent), JSON.stringify(list));

  // Dispatch change event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('ans_subdomains_changed', {
        detail: { parentName: cleanParent, subdomain: record },
      })
    );
  }

  return record;
}

/**
 * Deletes a subdomain under a parent domain.
 */
export function deleteSubdomain(parentName: string, sublabel: string): void {
  const cleanParent = normalizeAnsName(parentName);
  const cleanSub = normalizeAnsName(sublabel);
  const list = getSubdomainsForParent(cleanParent);
  const filtered = list.filter(s => s.sublabel !== cleanSub);
  localStorage.setItem(getStorageKey(cleanParent), JSON.stringify(filtered));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('ans_subdomains_changed', {
        detail: { parentName: cleanParent, deletedSublabel: cleanSub },
      })
    );
  }
}

/**
 * Parses and resolves a full subdomain string if applicable.
 * E.g. "pay.nimox.arc" -> returns SubdomainRecord
 * E.g. "nimox.arc" -> returns null (not a 3-part subdomain)
 */
export function parseAndResolveSubdomain(fullNameOrQuery: string): SubdomainRecord | null {
  if (!fullNameOrQuery) return null;
  const clean = fullNameOrQuery.toLowerCase().trim().replace(/^@/, '');
  
  // Format must match: <sublabel>.<parent> or <sublabel>.<parent>.arc
  const parts = clean.split('.');
  if (parts.length === 3 && parts[2] === 'arc') {
    const sublabel = normalizeAnsName(parts[0]);
    const parent = normalizeAnsName(parts[1]);
    const list = getSubdomainsForParent(parent);
    return list.find(s => s.sublabel === sublabel) || null;
  }
  
  if (parts.length === 2 && parts[1] !== 'arc') {
    const sublabel = normalizeAnsName(parts[0]);
    const parent = normalizeAnsName(parts[1]);
    const list = getSubdomainsForParent(parent);
    return list.find(s => s.sublabel === sublabel) || null;
  }

  return null;
}
