import React, { useState, useEffect } from 'react';
import type { Address } from 'viem';
import { X, Tag, Store, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { fallbackPublicClient, cleanName } from '../hooks/useANS';
import { ANS_ABI, ANS_ADDRESS } from '../lib/abis';
import { addTrackedListing, syncListingToSupabase } from '../lib/marketplace';
import { recordActivity } from '../lib/activity';
import { addClientNotification } from '../lib/notifications';

interface QuickListModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAddress: string;
  listForSale: (name: string, priceUsdc: string) => Promise<string>;
  onListedSuccess: (name: string, price: string) => void;
  humanizeError: (err: any) => string;
}

export const QuickListModal: React.FC<QuickListModalProps> = ({
  isOpen,
  onClose,
  userAddress,
  listForSale,
  onListedSuccess,
  humanizeError,
}) => {
  const [loadingNames, setLoadingNames] = useState(false);
  const [eligibleNames, setEligibleNames] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState<string>('');
  const [price, setPrice] = useState<string>('25');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !userAddress) return;

    let active = true;
    const fetchEligibleNames = async () => {
      setLoadingNames(true);
      try {
        const rawNames = (await fallbackPublicClient.readContract({
          address: ANS_ADDRESS,
          abi: ANS_ABI,
          functionName: 'getNamesByOwner',
          args: [userAddress as Address],
        })) as string[];

        const nowSec = Math.floor(Date.now() / 1000);
        const unlisted: string[] = [];

        await Promise.all(
          rawNames.map(async (n) => {
            try {
              const clean = cleanName(n);
              const rec = await fallbackPublicClient.readContract({
                address: ANS_ADDRESS,
                abi: ANS_ABI,
                functionName: 'getNameRecord',
                args: [clean],
              });
              if (
                rec.owner.toLowerCase() === userAddress.toLowerCase() &&
                Number(rec.expiry) > nowSec &&
                !rec.listed
              ) {
                unlisted.push(clean.endsWith('.arc') ? clean : `${clean}.arc`);
              }
            } catch {}
          })
        );

        if (active) {
          setEligibleNames(unlisted);
          if (unlisted.length > 0) {
            setSelectedName(unlisted[0]);
          } else {
            setSelectedName('');
          }
        }
      } catch (err) {
        console.error('Failed to load owned names for listing:', err);
      } finally {
        if (active) setLoadingNames(false);
      }
    };

    fetchEligibleNames();
    return () => {
      active = false;
    };
  }, [isOpen, userAddress]);

  if (!isOpen) return null;

  const numPrice = parseFloat(price) || 0;
  const protocolFee = (numPrice * 0.025).toFixed(2);
  const proceeds = (numPrice * 0.975).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedName) {
      toast.error('Please select a name to list');
      return;
    }
    if (numPrice <= 0) {
      toast.error('Price must be greater than 0 USDC');
      return;
    }

    setSubmitting(true);
    try {
      toast.loading(`Listing ${selectedName} on Marketplace...`, { id: 'quick-list' });
      const txHash = await listForSale(selectedName, price);
      addTrackedListing(selectedName);
      syncListingToSupabase({
        name: selectedName,
        seller: userAddress || '',
        price: Number(price),
        is_active: true,
        txHash: typeof txHash === 'string' ? txHash : undefined,
      }).catch(() => {});
      recordActivity({
        name: selectedName,
        action: 'Listed for Sale',
        amount: `${price} USDC`,
        from: userAddress || 'Seller',
        timestamp: Date.now(),
        txHash: typeof txHash === 'string' ? txHash : undefined,
      });
      addClientNotification(userAddress, {
        kind: 'tx_success',
        title: `Listing Published: ${selectedName}`,
        body: `Listed for sale at ${price} USDC.`,
        tx_hash: typeof txHash === 'string' ? txHash : undefined,
        link: 'marketplace',
      });
      toast.success(`${selectedName} is now listed for ${price} USDC!`, { id: 'quick-list' });
      onListedSuccess(selectedName, price);
      onClose();
    } catch (err: any) {
      const msg = humanizeError(err);
      toast.error(msg, { id: 'quick-list' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl border border-[#E5E5E2] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[#E5E5E2]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E8F5E9] text-[#137A43] flex items-center justify-center font-bold">
              <Store size={16} />
            </div>
            <div>
              <h3 className="font-serif font-bold text-gray-900 text-base">List Name on Marketplace</h3>
              <p className="text-xs font-mono text-gray-500">Atomic escrow on Arc Testnet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {loadingNames ? (
            <div className="py-8 flex flex-col items-center justify-center text-gray-500 font-mono text-xs gap-2">
              <Loader2 size={20} className="animate-spin text-[#137A43]" />
              <span>Fetching your active names...</span>
            </div>
          ) : eligibleNames.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <AlertCircle size={28} className="mx-auto text-amber-500" />
              <h4 className="font-serif font-bold text-gray-900">No Unlisted Names Found</h4>
              <p className="text-xs font-sans text-gray-500 max-w-xs mx-auto">
                You do not have any active, unlisted .arc names in this wallet. Register a new name first to sell it.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Select Name to Sell
                </label>
                <select
                  value={selectedName}
                  onChange={(e) => setSelectedName(e.target.value)}
                  disabled={submitting}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-[#E5E5E2] rounded-xl text-sm font-serif font-bold text-gray-900 focus:outline-none focus:border-[#137A43] focus:bg-white transition-all cursor-pointer"
                >
                  {eligibleNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Listing Price (USDC)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    disabled={submitting}
                    placeholder="e.g. 25"
                    className="w-full pl-3.5 pr-16 py-2.5 bg-gray-50 border border-[#E5E5E2] rounded-xl text-sm font-mono font-semibold text-gray-900 focus:outline-none focus:border-[#137A43] focus:bg-white transition-all"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-gray-400">
                    USDC
                  </span>
                </div>
              </div>

              <div className="p-3 bg-[#FBFBFA] border border-[#E5E5E2] rounded-xl space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-gray-500">
                  <span>Protocol Fee (2.5%):</span>
                  <span>{protocolFee} USDC</span>
                </div>
                <div className="flex justify-between font-bold text-[#137A43] pt-1 border-t border-[#E5E5E2]/60">
                  <span>You Receive Upon Sale:</span>
                  <span>{proceeds} USDC</span>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-[#E5E5E2] text-xs font-mono font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedName || numPrice <= 0}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#137A43] hover:bg-[#0e5c32] text-white text-xs font-mono font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Listing...</span>
                    </>
                  ) : (
                    <>
                      <Tag size={14} />
                      <span>Confirm Listing</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
export default QuickListModal;
