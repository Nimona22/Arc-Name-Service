import React, { useState, useEffect } from 'react';
import type { Address } from 'viem';
import { User, Shield, AlertTriangle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { fallbackPublicClient } from '../hooks/useANS';
import { ANS_ABI, ANS_ADDRESS, REPUTATION_ABI, REPUTATION_ADDRESS } from '../lib/abis';
import { loadProfile } from '../lib/profile';

interface RecipientProfilePreviewProps {
  input: string; // 0x... address or name.arc
  currentWallet?: string | null;
  className?: string;
  onResolvedAddress?: (resolved: string | null) => void;
}

export const RecipientProfilePreview: React.FC<RecipientProfilePreviewProps> = ({
  input,
  currentWallet,
  className = '',
  onResolvedAddress,
}) => {
  const [loading, setLoading] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [primaryName, setPrimaryName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [tier, setTier] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clean = input.trim();
  const isAddress = clean.startsWith('0x') && clean.length === 42;
  const isName = clean.toLowerCase().endsWith('.arc') || (!clean.startsWith('0x') && clean.length >= 3);

  useEffect(() => {
    let active = true;

    if (!clean || (!isAddress && !isName)) {
      setResolvedAddress(null);
      setPrimaryName(null);
      setDisplayName(null);
      setAvatarUrl(null);
      setTier(null);
      setError(null);
      onResolvedAddress?.(null);
      return;
    }

    const resolveIdentity = async () => {
      setLoading(true);
      setError(null);

      try {
        let targetAddress = '';
        let targetPrimaryName: string | null = null;

        if (isAddress) {
          targetAddress = clean.toLowerCase();
          // Try reverse lookup
          try {
            const p = await fallbackPublicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'reverseLookup',
              args: [targetAddress as Address],
            });
            if (p && typeof p === 'string' && p.trim() !== '') {
              targetPrimaryName = p.endsWith('.arc') ? p : `${p}.arc`;
            }
          } catch {
            // Ignore reverse lookup fail
          }
        } else {
          // Resolve name to address
          const normalizedName = clean.toLowerCase().replace(/\.arc$/i, '').trim();
          try {
            const rec = await fallbackPublicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'getNameRecord',
              args: [normalizedName],
            });
            if (rec && rec.owner && rec.owner !== '0x0000000000000000000000000000000000000000') {
              const nowSec = Math.floor(Date.now() / 1000);
              if (Number(rec.expiry) > nowSec) {
                targetAddress = rec.owner.toLowerCase();
                targetPrimaryName = `${normalizedName}.arc`;
              } else {
                if (active) setError('This .arc name has expired');
                return;
              }
            } else {
              if (active) setError('Name is not registered on Arc Testnet');
              return;
            }
          } catch {
            if (active) setError('Could not resolve .arc name');
            return;
          }
        }

        if (!active) return;
        setResolvedAddress(targetAddress);
        setPrimaryName(targetPrimaryName);
        onResolvedAddress?.(targetAddress);

        // Fetch reputation tier
        try {
          const t = await fallbackPublicClient.readContract({
            address: REPUTATION_ADDRESS,
            abi: REPUTATION_ABI,
            functionName: 'getTier',
            args: [targetAddress as Address],
          });
          if (active) setTier(Number(t));
        } catch {
          if (active) setTier(0);
        }

        // Fetch profile
        try {
          const prof = loadProfile(targetAddress);
          if (active) {
            setDisplayName(prof?.displayName || null);
            setAvatarUrl(prof?.avatarUrl || null);
          }
        } catch {}
      } catch (err: any) {
        if (active) {
          setError('Failed to fetch recipient details');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = setTimeout(resolveIdentity, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [clean, isAddress, isName]);

  if (!clean || (!isAddress && !isName)) {
    return null;
  }

  const isSelf = currentWallet && resolvedAddress && currentWallet.toLowerCase() === resolvedAddress.toLowerCase();

  const getTierLabel = (t: number | null) => {
    if (t === null) return null;
    if (t >= 4) return { name: 'Tier 4 · Elite', bg: 'bg-purple-100 text-purple-800 border-purple-200' };
    if (t === 3) return { name: 'Tier 3 · Trusted', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    if (t === 2) return { name: 'Tier 2 · Active', bg: 'bg-blue-100 text-blue-800 border-blue-200' };
    if (t === 1) return { name: 'Tier 1 · Member', bg: 'bg-gray-100 text-gray-700 border-gray-200' };
    return { name: 'Tier 0 · New', bg: 'bg-gray-50 text-gray-500 border-gray-200' };
  };

  const tierInfo = getTierLabel(tier);

  return (
    <div className={`mt-2 rounded-xl border transition-all ${isSelf ? 'border-amber-300 bg-amber-50/60' : error ? 'border-red-200 bg-red-50/50' : 'border-[#137A43]/20 bg-[#E8F5E9]/30'} p-3 text-xs font-sans ${className}`}>
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 font-mono py-1">
          <Loader2 size={13} className="animate-spin text-[#137A43]" />
          <span>Verifying recipient identity on Arc...</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 font-mono">
          <AlertTriangle size={13} className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : resolvedAddress ? (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#137A43] font-semibold">
              <CheckCircle2 size={13} className="text-[#137A43]" />
              <span>Recipient Verified</span>
            </div>
            {tierInfo && (
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold ${tierInfo.bg}`}>
                {tierInfo.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Recipient avatar"
                className="w-8 h-8 rounded-full object-cover border border-white shadow-2xs shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white border border-[#E5E5E2] flex items-center justify-center text-gray-600 shrink-0 shadow-2xs font-mono font-bold text-xs">
                {primaryName ? primaryName.slice(0, 1).toUpperCase() : resolvedAddress.slice(2, 4).toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {primaryName && (
                  <span className="font-serif font-bold text-gray-900 text-sm">
                    {primaryName}
                  </span>
                )}
                {displayName && displayName !== primaryName && (
                  <span className="text-gray-500 font-sans text-xs">
                    ({displayName})
                  </span>
                )}
                {!primaryName && !displayName && (
                  <span className="font-mono text-gray-800 font-semibold text-xs">
                    Unnamed Wallet
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-gray-500 truncate" title={resolvedAddress}>
                {resolvedAddress.slice(0, 8)}...{resolvedAddress.slice(-6)}
              </div>
            </div>
          </div>

          {isSelf && (
            <div className="mt-2 pt-2 border-t border-amber-200/60 flex items-center gap-1.5 text-amber-800 font-mono text-[11px]">
              <AlertTriangle size={12} className="shrink-0 text-amber-600" />
              <span>Notice: You are sending to your currently connected wallet.</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
export default RecipientProfilePreview;
