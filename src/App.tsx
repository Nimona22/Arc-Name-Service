import { trackEvent } from './lib/analytics';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, Send, Store, Wallet, User, Check, AlertCircle, ChevronDown, 
  ArrowRightLeft, Tag, X, Shield, History, ArrowUpRight, Info, 
  Activity, Zap, CreditCard, CheckCircle2, RefreshCw, Clock, ArrowRight, ArrowRight as ArrowRightIcon, Gift,
  Copy, LogOut, Mail, Edit3, Star, Fingerprint, Home as HomeIcon,
  Camera, Share, Bell, BellDot, ShoppingCart, ExternalLink, Globe, Plus, Trash2,
  Github, MessageCircle, MapPin, Twitter,
  TrendingUp, TrendingDown, DollarSign, Coins, BarChart3, PieChart, ArrowDownLeft, ShieldCheck, FolderKanban, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { useReadContract } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { formatUnits, type Address } from 'viem';
import { usePasskeyAuth, type AuthState } from './hooks/usePasskeyAuth';
import { useANS, cleanName, fallbackPublicClient } from './hooks/useANS';
import { ANS_ABI, ANS_ADDRESS, REPUTATION_ABI, REPUTATION_ADDRESS, USDC_ABI, USDC_ADDRESS } from './lib/abis';
import {
  NameActivityItem,
  getRealisticNameActivities,
  recordActivity,
  formatRelativeTime,
  calculateRegistrationPriceUSDC,
  getUserPrimaryName,
  setUserPrimaryName,
  getRecentlyRegisteredNames,
  getUserActivities,
  syncRecentRegisteredNamesFromLogs,
  CONFIRMED_ONCHAIN_NAMES,
  KNOWN_ONCHAIN_ACTIVITIES,
  getStoredActivities,
  isAddressMatch,
  syncUserActivitiesFromChain,
} from './lib/activity';
import {
  fetchActiveListings,
  getCachedActiveListings,
  addTrackedListing,
  removeTrackedListing,
  getSoldListings,
  recordSoldListing,
  syncSoldListingsFromLogs,
  syncListingToSupabase,
  subscribeToMarketplaceRealtime,
  type MarketplaceListing,
  type SoldListing,
} from './lib/marketplace';
import {
  UserProfile,
  loadProfile,
  saveProfile,
  saveProfileGlobal,
  fetchProfileGlobal,
  compressImage,
  useUserProfile,
  subscribeToProfile,
} from './lib/profile';
import { useNotifications, addClientNotification, type ANSNotification, type SignChallengeCallback } from './lib/notifications';
import { ShareQRModal } from './components/ShareQRModal';
import { RecipientProfilePreview } from './components/RecipientProfilePreview';
import { QuickListModal } from './components/QuickListModal';
import {
  getSubdomainsForParent,
  saveSubdomain,
  deleteSubdomain,
  parseAndResolveSubdomain,
  type SubdomainRecord,
} from './lib/subdomains';
import { normalizeAnsName, validateAnsName, validateSubdomainLabel } from './lib/ensNorm';
import { getCachedReverseName, resolveAddressToName, useReverseResolve } from './lib/reverseResolver';
import { AddressDisplay } from './components/AddressDisplay';
export type { UserProfile };
export { loadProfile, saveProfile, saveProfileGlobal, fetchProfileGlobal, compressImage, useUserProfile };


const globalStyles = `
  body {
    background-color: #FBFBFA;
    color: #141413;
    font-family: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
    margin: 0;
  }
  
  .font-serif { font-family: 'Newsreader', 'PT Serif', Georgia, serif; }
  .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .font-sans { font-family: 'IBM Plex Sans', system-ui, -apple-system, sans-serif; }

  .hero-green { color: #137A43; }

  @keyframes snakeTicker {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }

  .animate-snake-line {
    display: flex;
    width: max-content;
    animation: snakeTicker 24s linear infinite;
  }

  .animate-snake-line:hover {
    animation-play-state: paused;
  }

  @keyframes floatSquare {
    0%, 100% {
      transform: translateY(0px) rotate(0deg);
      box-shadow: 0 10px 25px -5px rgba(19, 122, 67, 0.08), 0 8px 10px -6px rgba(19, 122, 67, 0.05);
    }
    50% {
      transform: translateY(-8px) rotate(0.5deg);
      box-shadow: 0 20px 30px -10px rgba(19, 122, 67, 0.16), 0 12px 14px -6px rgba(19, 122, 67, 0.10);
    }
  }

  .animate-float-square {
    animation: floatSquare 5s ease-in-out infinite;
  }

  @keyframes ansLevitate {
    0%, 100% {
      transform: translateY(0px) rotate(0deg);
    }
    50% {
      transform: translateY(-11px) rotate(0.4deg);
    }
  }

  @keyframes ansShadowPulse {
    0%, 100% {
      transform: scale(1);
      opacity: 0.08;
    }
    50% {
      transform: scale(0.86);
      opacity: 0.035;
    }
  }

  @keyframes ansSheenGlint {
    0%, 35% {
      transform: translate(-140px, -140px);
      opacity: 0;
    }
    40% {
      opacity: 0.85;
    }
    55% {
      transform: translate(140px, 140px);
      opacity: 0;
    }
    100% {
      transform: translate(140px, 140px);
      opacity: 0;
    }
  }

  .animate-ans-levitate {
    animation: ansLevitate 5.2s ease-in-out infinite;
    transform-origin: 282px 320px;
  }

  .animate-ans-shadow {
    animation: ansShadowPulse 5.2s ease-in-out infinite;
    transform-origin: 250px 385px;
  }

  .animate-ans-sheen {
    animation: ansSheenGlint 6.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
`;

// ─── Brand Social Icons (Official X, GitHub, Discord, Telegram) ──────────────

const XIcon = ({ size = 12, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const GithubIcon = ({ size = 12, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const DiscordIcon = ({ size = 12, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const TelegramIcon = ({ size = 12, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
  </svg>
);

// ─── Notification Bell ──────────────────────────────────────────────────────

const NotificationBell = ({
  walletAddress,
  navigateTo,
  signChallenge,
}: {
  walletAddress: string | null | undefined;
  navigateTo: (view: string, arg?: string | null) => void;
  /** Signs a challenge message with the wallet. Required to fetch notifications securely. */
  signChallenge: SignChallengeCallback | null | undefined;
}) => {
  const { notifications, unreadCount, isLoading, isAccountUndeployed, hasCachedSession, refresh, markOneRead, markAllAsRead } = useNotifications(walletAddress, signChallenge);
  const [open, setOpen] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<ANSNotification | null>(null);

  const kindIcon = (kind: ANSNotification['kind']) => {
    if (kind === 'name_sold') return <Tag size={13} className="text-[#137A43]" />;
    if (kind === 'name_bought') return <ShoppingCart size={13} className="text-[#137A43]" />;
    if (kind === 'name_gift_received' || kind === 'name_gift_sent') return <Gift size={13} className="text-[#137A43]" />;
    if (kind === 'tip_received') return <CreditCard size={13} className="text-[#137A43]" />;
    if (kind === 'tip_sent') return <Send size={13} className="text-[#137A43]" />;
    if (kind === 'tx_success') return <CheckCircle2 size={13} className="text-[#137A43]" />;
    if (kind === 'tx_failed') return <AlertCircle size={13} className="text-red-600" />;
    return <Bell size={13} className="text-[#137A43]" />;
  };

  // Whitelist of valid view IDs the watcher can produce as notification links.
  const VALID_NOTIFICATION_VIEWS = new Set(['marketplace', 'mynames', 'send', 'home', 'names']);

  const handleNotifClick = (n: ANSNotification) => {
    if (!n.is_read) markOneRead(n.id);
    setSelectedNotif(n);
    setOpen(false);
  };

  const [isResolvingTarget, setIsResolvingTarget] = useState(false);

  const getActionLabel = (n: ANSNotification) => {
    if (n.kind === 'tip_received') return 'View Sender Profile';
    if (n.kind === 'name_sold') return 'View Buyer Profile';
    if (n.kind === 'name_bought') return 'View Identity Profile';
    if (n.kind === 'name_gift_received') return 'View Gifted Identity';
    if (n.kind === 'name_gift_sent') return 'View Identity Profile';
    if (n.kind === 'tip_sent') return 'View Recipient Identity';
    if (n.link?.startsWith('userprofile:')) return 'View User Profile';
    if (n.link?.startsWith('profile:')) return 'View Identity Profile';
    if (n.link === 'marketplace') return 'Go to Marketplace';
    if (n.link === 'mynames') return 'Go to My Names';
    if (n.link === 'send') return 'Go to Send';
    return 'Go to Destination';
  };

  const handleActionClick = async () => {
    if (!selectedNotif) return;
    const n = selectedNotif;
    const link = n.link || '';

    // 1. Tip Received: Must ALWAYS navigate to the sender!
    if (n.kind === 'tip_received') {
      setIsResolvingTarget(true);
      try {
        let senderAddr: string | null = null;
        if (link.startsWith('userprofile:')) {
          senderAddr = link.replace('userprofile:', '').trim();
        } else {
          // Check if body has a full 42-char address
          const fullMatch = n.body?.match(/0x[a-fA-F0-9]{40}/i);
          if (fullMatch) {
            senderAddr = fullMatch[0].toLowerCase();
          } else if (n.tx_hash) {
            // Resolve directly from on-chain tx
            const tx = await fallbackPublicClient.getTransaction({
              hash: n.tx_hash as `0x${string}`,
            });
            if (tx?.from) senderAddr = tx.from.toLowerCase();
          }
        }

        if (senderAddr) {
          // Check if sender owns a primary .arc name
          try {
            const names = (await fallbackPublicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'getNamesByOwner',
              args: [senderAddr as Address],
            })) as string[];
            if (names && names.length > 0 && names[0]) {
              setSelectedNotif(null);
              setIsResolvingTarget(false);
              navigateTo('profile', names[0]);
              return;
            }
          } catch {}

          setSelectedNotif(null);
          setIsResolvingTarget(false);
          navigateTo('userprofile', senderAddr);
          return;
        }
      } catch (err) {
        console.error('[notifications] Failed to resolve sender:', err);
      } finally {
        setIsResolvingTarget(false);
      }
    }

    // 2. Name Sold: Must ALWAYS navigate to the buyer!
    if (n.kind === 'name_sold') {
      setIsResolvingTarget(true);
      try {
        let buyerAddr: string | null = null;
        if (link.startsWith('userprofile:')) {
          buyerAddr = link.replace('userprofile:', '').trim();
        } else {
          const fullMatch = n.body?.match(/0x[a-fA-F0-9]{40}/i);
          if (fullMatch) {
            buyerAddr = fullMatch[0].toLowerCase();
          } else if (n.tx_hash) {
            const receipt = await fallbackPublicClient.getTransactionReceipt({
              hash: n.tx_hash as `0x${string}`,
            });
            if (receipt?.from) buyerAddr = receipt.from.toLowerCase();
          }
        }

        if (buyerAddr) {
          try {
            const names = (await fallbackPublicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'getNamesByOwner',
              args: [buyerAddr as Address],
            })) as string[];
            if (names && names.length > 0 && names[0]) {
              setSelectedNotif(null);
              setIsResolvingTarget(false);
              navigateTo('profile', names[0]);
              return;
            }
          } catch {}

          setSelectedNotif(null);
          setIsResolvingTarget(false);
          navigateTo('userprofile', buyerAddr);
          return;
        }
      } catch (err) {
        console.error('[notifications] Failed to resolve buyer:', err);
      } finally {
        setIsResolvingTarget(false);
      }
    }

    // 3. Standard Navigation
    setSelectedNotif(null);
    setIsResolvingTarget(false);
    if (link.startsWith('profile:')) {
      const target = link.replace('profile:', '').trim();
      if (target.length >= 3) navigateTo('profile', target);
    } else if (link.startsWith('userprofile:')) {
      const target = link.replace('userprofile:', '').trim();
      if (target.length >= 3) navigateTo('userprofile', target);
    } else if (VALID_NOTIFICATION_VIEWS.has(link)) {
      navigateTo(link);
    }
  };

  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  if (!walletAddress) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Notifications"
        className="relative p-2 text-gray-500 hover:text-gray-900 bg-white hover:bg-gray-50 border border-[#E5E5E2] rounded-full transition-colors shadow-2xs shrink-0 cursor-pointer"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        {unreadCount > 0 ? (
          <BellDot size={15} className="text-[#137A43]" />
        ) : (
          <Bell size={15} />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#137A43] text-white text-[9px] font-mono font-bold rounded-full flex items-center justify-center px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#E5E5E2] rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0F0ED]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-sans font-semibold text-gray-800">Notifications</span>
                <button
                  onClick={() => refresh(false)}
                  disabled={isLoading}
                  title="Refresh notifications"
                  className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-full hover:bg-gray-100 disabled:opacity-50"
                >
                  <RefreshCw size={11} className={isLoading ? 'animate-spin text-[#137A43]' : ''} />
                </button>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  disabled={isLoading}
                  className="text-[10px] font-sans font-semibold text-[#137A43] hover:underline disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto divide-y divide-[#F7F7F6]">
              {isLoading ? (
                <div className="py-10 text-center">
                  <div className="w-5 h-5 border-2 border-[#137A43] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-gray-500 font-sans">Checking notifications...</p>
                </div>
              ) : isAccountUndeployed ? (
                <div className="py-8 px-4 text-center">
                  <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2">
                    <Info size={16} />
                  </div>
                  <p className="text-xs font-semibold text-gray-800 font-sans mb-1">Account Activation Pending</p>
                  <p className="text-[11px] text-gray-500 font-sans leading-relaxed">
                    Passkey smart accounts activate on Arc with your first transaction (e.g. registering a name). Notifications will begin syncing automatically once activated.
                  </p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell size={24} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-xs text-gray-400 font-sans">No notifications yet</p>
                  {!hasCachedSession && (
                    <Button
                      variant="secondary"
                      className="text-[11px] font-sans py-1.5 px-3 mt-3 mx-auto"
                      onClick={() => refresh(true)}
                    >
                      Connect & Check
                    </Button>
                  )}
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`w-full text-left px-4 py-3 flex gap-3 items-start transition-colors ${
                      n.is_read ? 'bg-white hover:bg-[#FBFBFA]' : 'bg-[#F0FAF4] hover:bg-[#E8F5E9]'
                    }`}
                  >
                    {/* Kind icon */}
                    <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-white border border-[#E5E5E2] flex items-center justify-center shadow-sm">
                      {kindIcon(n.kind)}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-sans leading-snug mb-0.5 ${
                        n.is_read ? 'text-gray-700 font-medium' : 'text-gray-900 font-semibold'
                      }`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-[10px] text-gray-500 font-sans leading-snug truncate">{n.body}</p>
                      )}
                      <p className="text-[9px] text-gray-400 font-mono mt-1">
                        {new Date(n.created_at).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                    {/* Unread dot */}
                    {!n.is_read && (
                      <div className="w-2 h-2 rounded-full bg-[#137A43] shrink-0 mt-1" />
                    )}
                    {/* Link hint */}
                    {n.link && <ExternalLink size={11} className="text-gray-300 shrink-0 mt-1" />}
                  </button>
                ))
              )}
            </div>
          </div>
      )}

      {/* Notification Detail Modal - portaled to document.body to break out of header backdrop-filter containing block */}
      {selectedNotif && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedNotif(null);
          }}
        >
          <div className="bg-white border border-[#E5E5E2] rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#E8F5E9] border border-[#137A43]/20 flex items-center justify-center shrink-0">
                  {selectedNotif.kind === 'name_bought' ? (
                    <ShoppingCart size={20} className="text-[#137A43]" />
                  ) : selectedNotif.kind === 'name_sold' ? (
                    <Tag size={20} className="text-[#137A43]" />
                  ) : selectedNotif.kind === 'name_gift_received' || selectedNotif.kind === 'name_gift_sent' ? (
                    <Gift size={20} className="text-[#137A43]" />
                  ) : selectedNotif.kind === 'tip_sent' ? (
                    <Send size={20} className="text-[#137A43]" />
                  ) : selectedNotif.kind === 'tip_received' ? (
                    <CreditCard size={20} className="text-[#137A43]" />
                  ) : selectedNotif.kind === 'tx_success' ? (
                    <CheckCircle2 size={20} className="text-[#137A43]" />
                  ) : selectedNotif.kind === 'tx_failed' ? (
                    <AlertCircle size={20} className="text-red-600" />
                  ) : (
                    <Bell size={20} className="text-[#137A43]" />
                  )}
                </div>
                <div>
                  <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    selectedNotif.kind === 'tx_failed'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-[#E8F5E9] text-[#137A43]'
                  }`}>
                    {selectedNotif.kind === 'name_bought'
                      ? 'Identity Acquired'
                      : selectedNotif.kind === 'name_sold'
                      ? 'Identity Sold'
                      : selectedNotif.kind === 'name_gift_received'
                      ? 'Gift Received'
                      : selectedNotif.kind === 'name_gift_sent'
                      ? 'Gift Sent'
                      : selectedNotif.kind === 'tip_sent'
                      ? 'Tip Sent'
                      : selectedNotif.kind === 'tip_received'
                      ? 'Tip Received'
                      : selectedNotif.kind === 'tx_success'
                      ? 'Transaction Confirmed'
                      : selectedNotif.kind === 'tx_failed'
                      ? 'Transaction Failed'
                      : 'Protocol Notification'}
                  </span>
                  <h3 className="font-serif font-bold text-gray-900 text-lg mt-1">{selectedNotif.title}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedNotif(null)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            {selectedNotif.body && (
              <p className="text-sm text-gray-600 font-sans leading-relaxed mb-4 bg-[#FBFBFA] p-3 rounded-xl border border-[#E5E5E2]">
                {selectedNotif.body}
              </p>
            )}

            <div className="space-y-2 text-xs font-mono text-gray-500 border-t border-[#F0F0ED] pt-3 mb-6">
              <div className="flex justify-between items-center">
                <span>Timestamp:</span>
                <span className="text-gray-900">{new Date(selectedNotif.created_at).toLocaleString()}</span>
              </div>
              {selectedNotif.tx_hash && (
                <div className="flex justify-between items-center">
                  <span>On-Chain Tx:</span>
                  <a
                    href={`https://explorer.testnet.arc.io/tx/${selectedNotif.tx_hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#137A43] hover:underline font-semibold flex items-center gap-1"
                  >
                    <span>{selectedNotif.tx_hash.slice(0, 10)}...{selectedNotif.tx_hash.slice(-6)}</span>
                    <ArrowUpRight size={12} />
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                className="text-xs py-2 px-4"
                onClick={() => {
                  setSelectedNotif(null);
                  setIsResolvingTarget(false);
                }}
              >
                Close
              </Button>
              {(selectedNotif.link || selectedNotif.tx_hash || selectedNotif.kind === 'tip_received' || selectedNotif.kind === 'name_sold') && (
                <Button
                  variant="accent"
                  disabled={isResolvingTarget}
                  className="text-xs py-2 px-4 flex items-center gap-1.5 disabled:opacity-60"
                  onClick={handleActionClick}
                >
                  {isResolvingTarget && <RefreshCw size={12} className="animate-spin text-white" />}
                  <span>{getActionLabel(selectedNotif)}</span>
                  {!isResolvingTarget && <ArrowRightIcon size={14} />}
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

/**
 * ANS Sovereign Geometric Logo
 * Distinctive geometric vector mark representing identity resolution on Arc
 */
export const ANSLogo = ({ size = 28, className = "" }: { size?: number; className?: string }) => (
  <div className={`flex items-center select-none shrink-0 ${className}`}>
    <img
      src="/ans-primary.svg"
      alt="ANS"
      height={size}
      style={{ height: `${size}px`, width: 'auto' }}
      className="block object-contain"
    />
  </div>
);

const MOCK_REPUTATION: Record<string, { tier: string; txs: number; sales: number; buys: number; tips: number; since: string; disputes: number }> = {
  "alice.arc": { tier: "Elite", txs: 142, sales: 12, buys: 8, tips: 45, since: "Jan 2024", disputes: 0 },
  "vitalik.arc": { tier: "Verified", txs: 89, sales: 2, buys: 5, tips: 14, since: "Feb 2024", disputes: 0 },
  "bob.arc": { tier: "Trusted", txs: 34, sales: 1, buys: 2, tips: 5, since: "Mar 2024", disputes: 0 },
  "pro.arc": { tier: "New", txs: 4, sales: 0, buys: 1, tips: 0, since: "Sep 2024", disputes: 0 },
  "defi.arc": { tier: "Verified", txs: 67, sales: 5, buys: 10, tips: 2, since: "Dec 2023", disputes: 1 },
  "alex.arc": { tier: "Verified", txs: 14, sales: 8, buys: 4, tips: 2, since: "2026", disputes: 0 },
  "build.arc": { tier: "Trusted", txs: 28, sales: 3, buys: 4, tips: 8, since: "Apr 2025", disputes: 0 },
  "pay.arc": { tier: "Elite", txs: 310, sales: 4, buys: 20, tips: 150, since: "Jan 2023", disputes: 0 },
};

const INITIAL_MOCK_NAMES: { name: string; owner: string; expiry: number; status: string; isPrimary: boolean }[] = [];

const INITIAL_MOCK_LISTINGS: any[] = [];

const TIER_NAMES = ['New', 'Trusted', 'Verified', 'Elite'] as const;

// ─── Client Owned Names Cache & Sync ─────────────────────────────────────────

export function getCachedOwnedNames(wallet: string | null | undefined): string[] {
  if (!wallet || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`ans_owned_names_cache_${wallet.toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCachedOwnedNames(wallet: string | null | undefined, names: string[]): void {
  if (!wallet || typeof window === 'undefined') return;
  try {
    const clean = Array.from(new Set(names.map(n => cleanName(n)).filter(Boolean)));
    localStorage.setItem(`ans_owned_names_cache_${wallet.toLowerCase()}`, JSON.stringify(clean));
  } catch {}
}

export function addCachedOwnedName(wallet: string | null | undefined, name: string): void {
  if (!wallet || typeof window === 'undefined') return;
  const existing = getCachedOwnedNames(wallet);
  const clean = cleanName(name);
  if (!existing.includes(clean)) {
    saveCachedOwnedNames(wallet, [clean, ...existing]);
  }
}

export function removeCachedOwnedName(wallet: string | null | undefined, name: string): void {
  if (!wallet || typeof window === 'undefined') return;
  const existing = getCachedOwnedNames(wallet);
  const clean = cleanName(name);
  saveCachedOwnedNames(wallet, existing.filter(n => n !== clean));
}

/**
 * Humanize technical Web3 errors for reduced cognitive load (Cognitive Load Law)
 */
function humanizeWeb3Error(err: any): string {
  if (!err) return 'Transaction failed. Please try again.';

  const rawParts: string[] = [];
  if (typeof err === 'string') {
    rawParts.push(err);
  } else if (err && typeof err === 'object') {
    if (err.name) rawParts.push(String(err.name));
    if (err.shortMessage) rawParts.push(String(err.shortMessage));
    if (err.message) rawParts.push(String(err.message));
    if (err.details) rawParts.push(String(err.details));
    if (err.cause) {
      if (typeof err.cause === 'string') rawParts.push(err.cause);
      else if (typeof err.cause === 'object') {
        if (err.cause.name) rawParts.push(String(err.cause.name));
        if (err.cause.shortMessage) rawParts.push(String(err.cause.shortMessage));
        if (err.cause.message) rawParts.push(String(err.cause.message));
        if (err.cause.details) rawParts.push(String(err.cause.details));
      }
    }
    try {
      rawParts.push(JSON.stringify(err));
    } catch {}
  }
  const msg = rawParts.join(' ').toLowerCase();

  if (
    msg.includes('user rejected') ||
    msg.includes('user denied') ||
    msg.includes('cancelled') ||
    msg.includes('canceled') ||
    msg.includes('abort') ||
    msg.includes('notallowederror') ||
    msg.includes('failed to request credential') ||
    msg.includes('timed out or was not allowed') ||
    msg.includes('webauthn') ||
    msg.includes('w3.org') ||
    msg.includes('privacy-considerations') ||
    msg.includes('securityerror')
  ) {
    return 'Transaction authorization was cancelled in your wallet.';
  }
  if (msg.includes('nameislisted')) {
    return 'Listed names cannot be transferred. Cancel the marketplace listing first.';
  }
  if (msg.includes('notnameowner')) {
    return 'You are not the recorded owner of this name.';
  }
  if (msg.includes('nameexpired')) {
    return 'This .arc name has expired.';
  }
  if (msg.includes('namenotavailable')) {
    return 'This .arc name is not available for registration.';
  }
  if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('transfer amount exceeds')) {
    return 'Insufficient USDC balance on Arc Testnet to complete this transaction.';
  }
  if (msg.includes('already registered') || msg.includes('taken') || msg.includes('not available')) {
    return 'This .arc name is already claimed by another user.';
  }
  if (msg.includes('allowance') || msg.includes('approve')) {
    return 'USDC spending approval failed. Please try approving again.';
  }
  if (msg.includes('quota') || msg.includes('max names') || msg.includes('maxnamesreached') || msg.includes('exceeds max')) {
    return 'Maximum quota reached: wallets can hold up to 10 active .arc names.';
  }
  const raw = err?.shortMessage || err?.message || 'Transaction failed';
  return raw.length > 100 ? `${raw.slice(0, 97)}...` : raw;
}

/**
 * Format expiration countdown for cognitive convenience (Tesler's Law)
 */
function formatExpirationCountdown(expiryMs: number): { text: string; urgent: boolean; expired: boolean } {
  const now = Date.now();
  const diffMs = expiryMs - now;
  if (diffMs <= 0) {
    return { text: 'Expired', urgent: true, expired: true };
  }
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) {
    return { text: 'Expires today', urgent: true, expired: false };
  }
  if (days < 30) {
    return { text: `${days}d left`, urgent: true, expired: false };
  }
  const months = Math.round(days / 30);
  if (months < 12) {
    return { text: `${months}mo left`, urgent: false, expired: false };
  }
  const years = (days / 365).toFixed(1);
  return { text: `${years}y left`, urgent: false, expired: false };
}

const Button = ({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger' }) => {
  const hasPx = /(?:^|\s)px-/.test(className);
  const hasPy = /(?:^|\s)py-/.test(className);
  const hasTextSize = /(?:^|\s)text-(xs|sm|base|lg|xl|2xl)\b/.test(className);

  const defaultPx = hasPx ? "" : "px-5";
  const defaultPy = hasPy ? "" : "py-2.5";
  const defaultText = hasTextSize ? "" : "text-sm";

  const baseStyle = `font-sans font-medium rounded-full transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#137A43] focus-visible:ring-offset-2 active:scale-[0.98] select-none ${defaultPx} ${defaultPy} ${defaultText}`;
  
  const variants = {
    primary: "bg-[#141413] text-white hover:bg-[#282826] shadow-sm disabled:bg-[#E5E5E2] disabled:text-[#8E8E89]",
    secondary: "bg-white border border-[#E5E5E2] text-[#141413] hover:bg-[#F7F7F6] hover:border-[#D5D5D0] shadow-sm disabled:border-[#ECECE9] disabled:text-[#A0A09B]",
    accent: "bg-[#137A43] text-white hover:bg-[#0F6536] shadow-sm border border-transparent disabled:bg-[#E8F5E9] disabled:text-[#137A43]/50",
    ghost: "bg-transparent text-[#60605A] hover:text-[#141413] hover:bg-[#F2F2EF] disabled:text-[#A0A09B]",
    danger: "bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 shadow-sm disabled:opacity-50"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Card = ({ children, className = '', noPadding = false, hoverable = false, onClick }: {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  hoverable?: boolean;
  onClick?: () => void;
}) => (
  <div 
    onClick={onClick}
    className={`border border-[#E5E5E2] bg-white rounded-2xl overflow-hidden ${hoverable ? 'hover:border-[#137A43]/40 hover:shadow-[0_6px_20px_rgba(0,0,0,0.04)] transition-all duration-200 cursor-pointer' : 'shadow-[0_1px_3px_rgba(0,0,0,0.02)]'} ${noPadding ? '' : 'p-6'} ${className}`}
  >
    {children}
  </div>
);

const ReputationBadge = ({ name, showDetails = true }: { name: string; showDetails?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const clean = cleanName(name);
  const isAddress = name.startsWith('0x') && name.length === 42;

  const { data: resolvedOwner } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'resolve',
    args: [clean],
    chainId: arcTestnet.id,
    query: { enabled: !isAddress && clean.length >= 3 },
  });

  const targetAddress = (isAddress ? (name as Address) : resolvedOwner) as Address | undefined;

  const { data: tierNum } = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getTier',
    args: targetAddress ? [targetAddress] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const { data: repRecord } = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getReputation',
    args: targetAddress ? [targetAddress] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const fallback = MOCK_REPUTATION[name] || { tier: "New", txs: 0, sales: 0, buys: 0, tips: 0, since: "Just now", disputes: 0 };
  
  const rep = repRecord && targetAddress ? {
    tier: TIER_NAMES[Number(tierNum ?? 0)] ?? "New",
    txs: Number(repRecord.salesCompleted) + Number(repRecord.purchasesCompleted) + Number(repRecord.tipsGiftsGiven),
    sales: Number(repRecord.salesCompleted),
    buys: Number(repRecord.purchasesCompleted),
    tips: Number(repRecord.tipsGiftsGiven),
    since: repRecord.memberSince > 0n ? new Date(Number(repRecord.memberSince) * 1000).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : fallback.since,
    disputes: Number(repRecord.disputeFlags),
  } : fallback;
  
  const colors: Record<string, string> = {
    "New": "text-[#60605A] bg-[#F7F7F6] border-[#E5E5E2]",
    "Trusted": "text-[#2C2C2A] bg-[#F2F2EF] border-[#DCDCD8]",
    "Verified": "text-[#137A43] bg-[#E8F5E9] border-[#137A43]/20",
    "Elite": "text-[#0B4B27] bg-[#DEF2E3] border-[#137A43]/30"
  };

  return (
    <div className="relative inline-block">
      <button 
        onClick={(e) => { e.stopPropagation(); if (showDetails) setIsOpen(!isOpen); }}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-sans font-semibold border transition-all ${colors[rep.tier] || colors.New} ${!showDetails && 'cursor-default'}`}
      >
        <Shield size={11} strokeWidth={2.2} />
        {rep.tier}
      </button>

      {isOpen && showDetails && (
        <div className="absolute z-50 top-full mt-2 left-0 w-64 bg-white border border-[#E5E5E2] rounded-xl p-4 shadow-xl text-sm font-sans" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#F0F0ED]">
            <span className="font-serif font-bold text-[#141413] text-sm">{name} Reputation</span>
            <button onClick={() => setIsOpen(false)} className="text-[#8E8E89] hover:text-[#141413]"><X size={15} /></button>
          </div>
          <div className="space-y-2 text-[#60605A] text-xs">
            <div className="flex justify-between"><span>Member Since</span><span className="text-[#141413] font-medium font-mono">{rep.since}</span></div>
            <div className="flex justify-between"><span>Total Transactions</span><span className="text-[#141413] font-medium font-mono">{rep.txs}</span></div>
            <div className="flex justify-between"><span>Names Bought</span><span className="text-[#141413] font-medium font-mono">{rep.buys}</span></div>
            <div className="flex justify-between"><span>Names Sold</span><span className="text-[#141413] font-medium font-mono">{rep.sales}</span></div>
            <div className="flex justify-between"><span>Tips Sent/Recv</span><span className="text-[#141413] font-medium font-mono">{rep.tips}</span></div>
            <div className="flex justify-between pt-1 mt-1 border-t border-[#F0F0ED]">
              <span>Dispute Flags</span>
              <span className={rep.disputes > 0 ? "text-red-600 font-bold font-mono" : "text-[#137A43] font-bold font-mono"}>{rep.disputes}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InteractiveSearch = ({ 
  navigateToProfile, 
  autoFocus = false, 
  isHero = false,
  auth,
  ans,
  initialQuery = '',
  navigateTo,
}: {
  navigateToProfile: (name: string) => void;
  autoFocus?: boolean;
  isHero?: boolean;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
  initialQuery?: string;
  navigateTo?: (view: string, arg?: string | null) => void;
}) => {
  const [query, setQuery] = useState(initialQuery ? cleanName(initialQuery) : '');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (initialQuery) {
      setQuery(cleanName(initialQuery));
    }
  }, [initialQuery]);

  useEffect(() => {
    if (!query) {
      setResult(null);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const formatted = cleanName(query);
      const fullName = `${formatted}.arc`;

      if (formatted.length < 3) {
        setResult({ type: 'invalid' });
        setIsSearching(false);
        return;
      }

      try {
        if (auth.address && getCachedOwnedNames(auth.address).includes(formatted)) {
          setResult({
            type: 'owned',
            data: {
              name: fullName,
              owner: auth.address,
              expiry: Date.now() + 365 * 24 * 60 * 60 * 1000,
            },
          });
          setIsSearching(false);
          return;
        }

        const isAvail = await fallbackPublicClient.readContract({
          address: ANS_ADDRESS,
          abi: ANS_ABI,
          functionName: 'isAvailable',
          args: [formatted],
        });

        if (isAvail) {
          if (auth.address && getCachedOwnedNames(auth.address).includes(formatted)) {
            setResult({
              type: 'owned',
              data: {
                name: fullName,
                owner: auth.address,
                expiry: Date.now() + 365 * 24 * 60 * 60 * 1000,
              },
            });
          } else {
            setResult({ type: 'available', name: fullName, length: formatted.length });
          }
        } else {
          const listing = await fallbackPublicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getListing',
            args: [formatted],
          });

          if (listing && listing.active) {
            setResult({
              type: 'listed',
              data: {
                name: fullName,
                seller: listing.seller,
                price: Number(formatUnits(listing.price, 6)),
              },
            });
          } else {
            const record = await fallbackPublicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'getNameRecord',
              args: [formatted],
            });
            const isUserOwner = auth.address && record.owner && record.owner.toLowerCase() === auth.address.toLowerCase();
            if (isUserOwner) {
              addCachedOwnedName(auth.address, formatted);
              setResult({
                type: 'owned',
                data: {
                  name: fullName,
                  owner: record.owner,
                  expiry: Number(record.expiry) * 1000,
                },
              });
            } else {
              setResult({
                type: 'taken',
                data: {
                  name: fullName,
                  owner: record.owner,
                  expiry: Number(record.expiry) * 1000,
                },
              });
            }
          }
        }
      } catch {
        const isLocallyOwned = auth.address && getCachedOwnedNames(auth.address).includes(formatted);
        const taken = INITIAL_MOCK_NAMES.find(n => n.name === fullName);
        const listed = INITIAL_MOCK_LISTINGS.find(l => l.name === fullName);

        if (isLocallyOwned) {
          setResult({
            type: 'owned',
            data: {
              name: fullName,
              owner: auth.address,
              expiry: Date.now() + 365 * 24 * 60 * 60 * 1000,
            },
          });
        } else if (listed) {
          setResult({ type: 'listed', data: listed });
        } else if (taken) {
          if (auth.address && taken.owner.toLowerCase() === auth.address.toLowerCase()) {
            setResult({ type: 'owned', data: taken });
          } else {
            setResult({ type: 'taken', data: taken });
          }
        } else {
          setResult({ type: 'available', name: fullName, length: formatted.length });
        }
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, auth.address]);

  return (
    <div className={`w-full ${isHero ? 'max-w-2xl' : 'max-w-3xl'} mx-auto`}>
      <form 
        onSubmit={(e) => {
          e.preventDefault();
        }} 
        className="relative max-w-2xl mx-auto mb-4"
      >
        <div className="relative flex items-center bg-white border border-[#E5E5E2] rounded-full p-2 pl-6 shadow-sm focus-within:border-[#137A43] focus-within:ring-2 focus-within:ring-[#137A43]/10 transition-all">
          <Search size={20} className="text-gray-400 mr-3 shrink-0" />
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a name (e.g. alice.arc)"
            autoFocus={autoFocus}
            aria-label="Search for a .arc name"
            className="w-full bg-transparent text-sm sm:text-base text-[#141413] placeholder:text-gray-400 font-sans outline-none pr-3"
            spellCheck="false"
          />
          <button 
            type="submit" 
            disabled={isSearching}
            className="bg-[#137A43] hover:bg-[#0F6536] text-white font-medium text-sm px-7 py-2.5 sm:px-8 sm:py-3 rounded-full transition-colors shrink-0 disabled:opacity-60 flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            {isSearching ? <RefreshCw size={15} className="animate-spin" /> : 'Search'}
          </button>
        </div>

        {query.trim().length > 0 && query.trim().length < 3 && (
          <p className="text-center text-xs font-mono text-amber-700/80 mt-2 animate-in fade-in duration-150">
            Names must be at least 3 characters long (letters, numbers, or hyphens)
          </p>
        )}
      </form>

      {/* Popular shortcuts matching the design system with real smart contract registered names */}
      <div className="flex items-center justify-center flex-wrap gap-2 mb-8 text-xs font-mono">
        <span className="text-[#8E8E89] mr-1 font-sans">
          {getRecentlyRegisteredNames().length > 0 ? 'Popular:' : 'Try searching:'}
        </span>
        {(getRecentlyRegisteredNames().length > 0 ? getRecentlyRegisteredNames().slice(0, 5) : ['builder.arc', 'wallet.arc', 'alpha.arc', 'pay.arc', 'dev.arc']).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setQuery(item.replace('.arc', ''))}
            className="px-3.5 py-1 bg-white border border-[#E5E5E2] hover:border-[#137A43] hover:text-[#137A43] text-[#40403B] rounded-full text-xs font-mono transition-colors shadow-2xs cursor-pointer"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="min-h-[20px] text-left">
        {isSearching && (
          <div className="text-center text-[#60605A] font-mono text-xs flex items-center justify-center gap-2 py-4">
            <div className="w-3.5 h-3.5 border-2 border-[#137A43] border-t-transparent rounded-full animate-spin"></div>
            Querying Arc namespace...
          </div>
        )}

        {!isSearching && result?.type === 'owned' && (
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-[#137A43]/30 bg-gradient-to-r from-[#E8F5E9]/40 via-white to-white shadow-sm p-6 rounded-2xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#E8F5E9] border border-[#137A43]/20 flex items-center justify-center text-[#137A43] font-serif font-bold text-xl shrink-0 shadow-2xs">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  <h3 className="text-2xl font-serif font-bold text-[#141413]">{result.data.name}</h3>
                  <span className="px-2.5 py-0.5 bg-[#E8F5E9] text-[#137A43] text-[10px] font-mono font-bold uppercase tracking-wider rounded-full border border-[#137A43]/20 flex items-center gap-1">
                    <Star size={10} className="fill-[#137A43]" /> You Own This Identity
                  </span>
                </div>
                <p className="text-[#60605A] font-sans text-xs">
                  Bound to your wallet: <span className="font-mono text-[#141413] font-medium">{auth.address}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Button variant="secondary" onClick={() => navigateToProfile(result.data.name)} className="text-xs py-2 px-3">
                View Profile
              </Button>
              <Button variant="accent" onClick={() => navigateTo ? navigateTo('mynames') : navigateToProfile(result.data.name)} className="text-xs py-2 px-4 flex items-center gap-1.5">
                Manage in My Names <ArrowRight size={13} />
              </Button>
            </div>
          </Card>
        )}
        
        {!isSearching && result?.type === 'available' && (
          <RegistrationProcess name={result.name} length={result.length} auth={auth} ans={ans} navigateTo={navigateTo} />
        )}

        {!isSearching && result?.type === 'taken' && (
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-[#E5E5E2]">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h3 className="text-2xl font-serif font-bold text-[#141413]">{result.data.name}</h3>
                <span className="px-2 py-0.5 bg-[#F7F7F6] text-[#60605A] text-[10px] font-mono uppercase tracking-wider rounded border border-[#E5E5E2]">Registered</span>
              </div>
              <div className="text-[#60605A] font-sans text-xs flex items-center gap-1.5">
                <span>Owner:</span>
                <AddressDisplay address={result.data.owner} linkToProfile onNavigate={navigateTo} />
              </div>
            </div>
            <Button variant="secondary" onClick={() => navigateToProfile(result.data.name)}>
              View Profile
            </Button>
          </Card>
        )}

        {!isSearching && result?.type === 'listed' && (
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-amber-200/80 bg-amber-50/30">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h3 className="text-2xl font-serif font-bold text-[#141413]">{result.data.name}</h3>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-mono uppercase tracking-wider rounded border border-amber-200">Listed for Sale</span>
              </div>
              <p className="text-[#60605A] font-sans text-xs">
                Asking Price: <span className="text-[#141413] font-mono font-bold">{result.data.price} USDC</span>
              </p>
            </div>
            <Button variant="primary" onClick={() => navigateToProfile(result.data.name)}>
              View Listing
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
};

const RegistrationProcess = ({ 
  name, 
  length, 
  auth, 
  ans,
  navigateTo,
}: { 
  name: string; 
  length: number; 
  auth: AuthState; 
  ans: ReturnType<typeof useANS>; 
  navigateTo?: (view: string, arg?: string | null) => void;
}) => {
  const [duration, setDuration] = useState(12);
  const [isGift, setIsGift] = useState(false);
  const [giftTarget, setGiftTarget] = useState('');
  const [txStep, setTxStep] = useState('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPrice = (len: number, dur: number) => {
    let base = len === 3 ? 5 : len === 4 ? 3 : len === 5 ? 1.5 : 0.5;
    if (dur === 6) base = base * 1.8;
    if (dur === 9) base = base * 2.4;
    if (dur === 12) base = base * 3;
    return base.toFixed(2);
  };

  const price = getPrice(length, duration);

  const handleRegister = async () => {
    if (isLoading) return; // prevent double-fire
    if (!auth.isConnected) {
      toast.info('Connecting with Passkey...');
      await auth.signIn();
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setTxStep('approving');
      let hash = '';
      if (isGift) {
        if (!giftTarget) {
          toast.error('Please enter a recipient address or .arc name');
          setTxStep('idle');
          setIsLoading(false);
          return;
        }
        hash = await ans.giftName(name, duration, giftTarget, (step) => {
          if (step === 'approving') setTxStep('approving');
          else if (step === 'registering') setTxStep('registering');
        });
      } else {
        hash = await ans.register(name, duration, (step) => {
          if (step === 'approving') setTxStep('approving');
          else if (step === 'registering') setTxStep('registering');
        });
      }
      setTxHash(hash);
      setTxStep('success');
      if (!isGift && auth.address) {
        addCachedOwnedName(auth.address, name);
        window.dispatchEvent(new CustomEvent('ans_owned_names_updated', { detail: { wallet: auth.address, name } }));
      }
      recordActivity({
        name,
        action: isGift ? 'Gifted Name' : 'Registered Name',
        amount: calculateRegistrationPriceUSDC(name, duration),
        from: isGift ? (auth.address || 'You') : 'Arc Protocol',
        to: isGift ? giftTarget : (auth.address || ''),
        timestamp: Date.now(),
        txHash: hash,
      });
      const expiryTimestamp = Date.now() + duration * 30.44 * 24 * 3600 * 1000;
      const expiryDateStr = new Date(expiryTimestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const gifterDisplay = (auth.address && getCachedReverseName(auth.address)) || (auth.address ? `${auth.address.slice(0, 6)}...${auth.address.slice(-4)}` : 'A supporter');
      const recipTargetDisplay = giftTarget.endsWith('.arc') ? giftTarget : (getCachedReverseName(giftTarget) || (giftTarget.startsWith('0x') ? `${giftTarget.slice(0, 6)}...${giftTarget.slice(-4)}` : giftTarget));

      // 1. Notify the gifter / registrar
      addClientNotification(auth.address, {
        kind: isGift ? 'name_gift_sent' : 'tx_success',
        title: isGift ? `Gift Sent: ${name}.arc` : `Registration Confirmed: ${name}.arc`,
        body: isGift
          ? `You successfully gifted ${name}.arc (${duration} Months) to ${recipTargetDisplay}. Valid until ${expiryDateStr}.`
          : `Successfully registered for ${duration} months on Arc Testnet. Valid until ${expiryDateStr}.`,
        tx_hash: hash,
        link: `profile:${name}.arc`,
      });

      // 2. Notify the recipient user
      if (isGift && giftTarget) {
        let recipientAddr = giftTarget.trim();
        if (recipientAddr.toLowerCase().endsWith('.arc')) {
          try {
            const resolved = await fallbackPublicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'resolve',
              args: [cleanName(recipientAddr)],
            });
            if (resolved && typeof resolved === 'string' && resolved !== '0x0000000000000000000000000000000000000000') {
              recipientAddr = resolved;
            }
          } catch {}
        }
        if (recipientAddr.startsWith('0x')) {
          addClientNotification(recipientAddr, {
            kind: 'name_gift_received',
            title: `Gift Received: ${name}.arc!`,
            body: `${gifterDisplay} gifted you ${name}.arc registered for ${duration} Months! Valid until ${expiryDateStr}.`,
            tx_hash: hash,
            link: `profile:${name}.arc`,
          });
        }
      }
      toast.success(`Done! ${name} ${isGift ? 'gifted' : 'registered'} successfully!`);
    } catch (err: any) {
      console.error(err);
      const friendlyMsg = humanizeWeb3Error(err);
      setError(friendlyMsg);
      addClientNotification(auth.address, {
        kind: 'tx_failed',
        title: `${isGift ? 'Gift' : 'Registration'} Failed: ${name}.arc`,
        body: friendlyMsg,
        link: 'names',
      });
      toast.error(friendlyMsg);
      setTxStep('idle');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShareOnX = () => {
    const tweetText = encodeURIComponent(`I just secured my Web3 identity ${name} on @ArcNetwork with ANS! Settle payments & tips with zero gas using USDC.\n\nExplore on Arc:`);
    const shareUrl = encodeURIComponent(typeof window !== 'undefined' ? `${window.location.origin}/app?view=profile&name=${name}` : '');
    window.open(`https://twitter.com/intent/tweet?text=${tweetText}&url=${shareUrl}`, '_blank', 'noopener,noreferrer');
  };

  const isAlreadyOwned = Boolean(
    auth.isConnected && 
    auth.address && 
    getCachedOwnedNames(auth.address).includes(cleanName(name))
  );

  if (isAlreadyOwned && txStep !== 'success') {
    return (
      <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-[#137A43]/30 bg-gradient-to-r from-[#E8F5E9]/40 via-white to-white shadow-sm p-6 sm:p-8 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#E8F5E9] border border-[#137A43]/20 flex items-center justify-center text-[#137A43] font-serif font-bold text-xl shrink-0 shadow-2xs">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
              <h3 className="text-2xl font-serif font-bold text-[#141413]">{cleanName(name)}.arc</h3>
              <span className="px-2.5 py-0.5 bg-[#E8F5E9] text-[#137A43] text-[10px] font-mono font-bold uppercase tracking-wider rounded-full border border-[#137A43]/20 flex items-center gap-1">
                <Star size={10} className="fill-[#137A43]" /> You Own This Identity
              </span>
            </div>
            <p className="text-[#60605A] font-sans text-xs">
              Bound to your wallet: <span className="font-mono text-[#141413] font-medium">{auth.address}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="secondary" onClick={() => navigateTo ? navigateTo('profile', cleanName(name)) : undefined} className="text-xs py-2.5 px-4">
            View Profile
          </Button>
          <Button variant="accent" onClick={() => navigateTo ? navigateTo('mynames') : undefined} className="text-xs py-2.5 px-4 flex items-center gap-1.5">
            Manage in My Names <ArrowRight size={13} />
          </Button>
        </div>
      </Card>
    );
  }

  if (txStep === 'success') {
    return (
      <Card className="text-center py-10 px-6 sm:px-10 border-[#137A43]/20 bg-gradient-to-b from-[#E8F5E9]/40 to-white shadow-sm">
        <div className="w-14 h-14 rounded-full bg-[#E8F5E9] text-[#137A43] flex items-center justify-center mx-auto mb-4 border border-[#137A43]/30 shadow-xs">
          <Check size={28} strokeWidth={2.5} />
        </div>
        
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#137A43] font-bold block mb-1">
          {isGift ? 'Gift Sent Successfully' : 'Identity Minted Successfully'}
        </span>
        <h3 className="text-3xl font-serif font-bold text-gray-900 mb-2">
          {isGift ? `${name} Sent to Recipient!` : `${name} is Officially Yours!`}
        </h3>
        <p className="text-gray-600 font-sans text-sm max-w-md mx-auto mb-6">
          {isGift 
            ? `Successfully gifted to ${giftTarget}. The recipient is now the on-chain owner and can manage subdomains & receive tips.` 
            : 'Your decentralized .arc identity is live on Arc Network and bound to your smart account.'}
        </p>

        {/* Celebratory Identity Badge Card (Peak-End Rule) */}
        <div className="max-w-md mx-auto bg-white border border-[#E5E5E2] rounded-2xl p-5 mb-8 text-left shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#E8F5E9] rounded-bl-full pointer-events-none opacity-60" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 font-semibold">{isGift ? 'Gifted Identity' : 'Universal Identity'}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#137A43] font-bold border border-[#137A43]/20">Active · {duration} Months</span>
          </div>
          <div className="text-2xl font-serif font-bold text-gray-900 mb-1">{name}</div>
          <div className="text-xs font-mono text-gray-500 truncate">Owner: {isGift ? giftTarget : (auth.address || 'Smart Account')}</div>
        </div>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 max-w-md mx-auto">
          <button 
            onClick={handleShareOnX}
            className="w-full sm:w-auto flex-1 py-3 px-5 bg-[#141413] hover:bg-[#282826] text-white rounded-full text-xs font-mono font-semibold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-95"
            title="Share identity announcement on X"
          >
            <Share size={14} />
            <span>Share on X</span>
          </button>
          
          <Button 
            variant="accent" 
            onClick={() => {
              setTxStep('idle');
              if (navigateTo) {
                navigateTo(isGift ? 'home' : 'mynames');
              }
            }} 
            className="w-full sm:w-auto flex-1 text-xs font-mono font-semibold py-3 px-5"
          >
            {isGift ? 'Done' : 'Manage Identity'}
          </Button>

          {txHash && (
            <Button 
              variant="secondary" 
              className="w-full sm:w-auto py-3 px-4 font-mono text-xs"
              onClick={() => window.open(`https://explorer.testnet.arc.io/tx/${txHash}`, '_blank')}
            >
              Tx <ArrowUpRight size={13}/>
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-[#E5E5E2] bg-white shadow-sm p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#E5E5E2] gap-4">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 font-semibold block mb-1">
            Namespace Record
          </span>
          <h2 className="text-3xl font-serif font-bold text-gray-900 tracking-tight">{name}</h2>
          <span className="text-[#137A43] text-xs font-mono font-semibold inline-flex items-center gap-1.5 mt-2 bg-[#E8F5E9] border border-[#137A43]/20 px-3 py-1 rounded-full">
            <CheckCircle2 size={13} /> Unregistered / Available
          </span>
        </div>
        <div className="text-left sm:text-right bg-[#FBFBFA] p-3.5 rounded-2xl border border-[#E5E5E2]">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 block mb-0.5">Tier Pricing</span>
          <div className="text-2xl font-mono font-bold text-gray-900 tabular-nums">
            {price} <span className="text-gray-500 text-xs font-mono font-normal">USDC</span>
          </div>
        </div>
      </div>

      <div className="space-y-6 pt-6">
        <div>
          <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold mb-2">
            Registration Mode
          </label>
          <div className="grid grid-cols-2 bg-[#F5F5F3] p-1 rounded-full border border-[#E5E5E2]">
            <button 
              className={`py-2 text-xs font-mono font-semibold rounded-full transition-all cursor-pointer ${!isGift ? 'bg-white text-gray-900 shadow-sm border border-[#E5E5E2]' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setIsGift(false)}
            >
              Self-Register
            </button>
            <button 
              className={`py-2 text-xs font-mono font-semibold rounded-full transition-all cursor-pointer ${isGift ? 'bg-white text-gray-900 shadow-sm border border-[#E5E5E2]' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setIsGift(true)}
            >
              Gift to Recipient
            </button>
          </div>
        </div>

        {isGift && (
          <div>
            <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold mb-2">
              Recipient Address or Name
            </label>
            <input 
              type="text" 
              value={giftTarget}
              onChange={(e) => setGiftTarget(e.target.value)}
              placeholder="0x... or alice.arc"
              className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-mono p-3 rounded-xl focus:outline-none focus:border-[#137A43] focus:bg-white text-sm transition-all"
            />
            <RecipientProfilePreview input={giftTarget} currentWallet={auth.address} />
          </div>
        )}

        <div>
          <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold mb-2">
            Registration Period
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[3, 6, 9, 12].map(m => {
              const durPrice = getPrice(length, m);
              const isSelected = duration === m;
              return (
                <button 
                  key={m}
                  onClick={() => setDuration(m)}
                  className={`py-3 px-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected 
                      ? 'border-[#137A43] bg-[#E8F5E9]/50 text-gray-900 shadow-2xs ring-1 ring-[#137A43]' 
                      : 'border-[#E5E5E2] text-gray-700 hover:border-gray-400 bg-white'
                  }`}
                >
                  <div className="text-xs font-mono font-semibold text-gray-900">
                    {m} Months
                  </div>
                  <div className={`text-[11px] font-mono mt-0.5 tabular-nums ${isSelected ? 'text-[#137A43] font-bold' : 'text-gray-500'}`}>
                    {durPrice} USDC
                  </div>
                </button>
              );
            })}
          </div>

          {/* Law of Proximity: Dynamic Fee Summary placed directly below selection */}
          <div className="mt-3 p-3.5 bg-[#FBFBFA] border border-[#E5E5E2] rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 font-semibold block">Total Settlement Due</span>
              <span className="text-xs text-gray-500 font-sans">Guaranteed rate for {duration} months on Arc Testnet</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-mono font-bold text-gray-900 tabular-nums">{price}</span>
              <span className="text-xs font-mono font-semibold text-gray-600 ml-1">USDC</span>
            </div>
          </div>
        </div>

        {/* Tesler's Law: 2-step progress visualizer when transaction is in-flight */}
        {(txStep === 'approving' || txStep === 'registering') && (
          <div className="p-3.5 bg-[#FBFBFA] border border-[#E5E5E2] rounded-2xl space-y-2 animate-in fade-in duration-200">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500 font-semibold block">Protocol Execution Progress</span>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className={`p-2 rounded-xl flex items-center gap-2 border ${txStep === 'approving' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-[#E8F5E9] text-[#137A43] border-[#137A43]/20'}`}>
                {txStep === 'approving' ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                <span>1. Unlock USDC</span>
              </div>
              <div className={`p-2 rounded-xl flex items-center gap-2 border ${txStep === 'registering' ? 'bg-[#E8F5E9] text-[#137A43] border-[#137A43]/20' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                {txStep === 'registering' ? <RefreshCw size={13} className="animate-spin text-[#137A43]" /> : <Clock size={13} />}
                <span>2. Mint {name}</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-mono flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-2">
          <Button 
            variant="accent"
            className="w-full py-3.5 text-sm font-sans font-medium" 
            onClick={handleRegister}
            disabled={isLoading || txStep !== 'idle' || (isGift && !giftTarget)}
          >
            {isLoading && txStep === 'idle' && 'Initializing transaction...'}
            {txStep === 'idle' && !isLoading && (isGift ? `Authorize ${price} USDC & Gift` : `Authorize ${price} USDC & Register`)}
            {txStep === 'approving' && 'Step 1/2: Approving USDC Settlement...'}
            {txStep === 'registering' && (isGift ? 'Step 2/2: Executing Gift Operation...' : 'Step 2/2: Minting Arc Identity...')}
          </Button>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500 font-mono mt-3">
            <Shield size={12} className="text-[#137A43]" />
            <span>Atomic settlement on Arc Testnet (ERC-4337 Passkey Smart Account)</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

/**
 * Official ANS Geometric Monogram Centerpiece (Approach 1: 3D Perspective + Levitation & Celestial Orbit)
 * - 3D Multi-layered Extrusion (rear base shadow, deep extrusion wall, mid extrusion wall, front face)
 * - Interactive Mouse-Parallax 3D Tilt with smooth spring return
 * - Perpetual Zero-Gravity Levitation synchronized with breathing ground shadow
 * - Active Celestial Satellites gliding along orbital trajectories
 * - Specular Emerald Sheen Sweep
 */
const ArcGeometricCenterpiece = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);
  const extrudeBaseRef = useRef<SVGGElement>(null);
  const extrudeMidRef = useRef<SVGGElement>(null);
  const nodeRef = useRef<SVGGElement>(null);

  const isHoveredRef = useRef(false);
  const isVisibleRef = useRef(true);
  const mouseTarget = useRef({ x: 0, y: 0 });
  const mouseLerp = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // IntersectionObserver to pause loop completely when scrolled away (saves 100% CPU/battery)
    const observer = new IntersectionObserver(([entry]) => {
      isVisibleRef.current = entry.isIntersecting;
    }, { threshold: 0.05 });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    let animId: number;
    let startTime = performance.now();

    const loop = () => {
      animId = requestAnimationFrame(loop);
      if (!isVisibleRef.current) return;

      const t = (performance.now() - startTime) * 0.001;

      // Spring-damped mouse tracking
      mouseLerp.current.x += (mouseTarget.current.x - mouseLerp.current.x) * 0.07;
      mouseLerp.current.y += (mouseTarget.current.y - mouseLerp.current.y) * 0.07;

      // Continuous 3D multi-frequency harmonic wave motion (Decentralize AI noise feel)
      const idleYaw = Math.sin(t * 0.8) * 11 + Math.cos(t * 0.38) * 4.5;
      const idlePitch = Math.cos(t * 0.65) * 7.5 + Math.sin(t * 0.28) * 3;
      const idleRoll = Math.sin(t * 0.5) * 2.2;
      const levitate = Math.sin(t * 1.2) * 8;

      const yaw = idleYaw + mouseLerp.current.x * 20;
      const pitch = idlePitch - mouseLerp.current.y * 15;
      const roll = idleRoll + mouseLerp.current.x * 3;
      const scale = isHoveredRef.current ? 1.04 : 1.0;

      // Dynamic real-time extrusion: walls expand & shift as 3D angle turns
      const extrudeX = 4 + (yaw * 0.35);
      const extrudeY = 6 - (pitch * 0.35);

      // Autonomous quantum node levitation & breathing inside the arch
      const nodeFloatY = Math.sin(t * 2.5) * 4.5;
      const nodeFloatX = Math.cos(t * 1.9) * 2;
      const pulse = 1 + Math.sin(t * 2.0) * 0.04;

      // Direct GPU transform updates without triggering any React reconciliation passes
      if (transformRef.current) {
        transformRef.current.style.transform = `translate3d(0, ${levitate.toFixed(2)}px, 0) rotateX(${pitch.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg) rotateZ(${roll.toFixed(2)}deg) scale3d(${scale}, ${scale}, ${scale})`;
      }
      if (extrudeBaseRef.current) {
        extrudeBaseRef.current.setAttribute('transform', `translate(${extrudeX.toFixed(2)}, ${extrudeY.toFixed(2)})`);
      }
      if (extrudeMidRef.current) {
        extrudeMidRef.current.setAttribute('transform', `translate(${(extrudeX * 0.5).toFixed(2)}, ${(extrudeY * 0.5).toFixed(2)})`);
      }
      if (nodeRef.current) {
        nodeRef.current.setAttribute('transform', `translate(${nodeFloatX.toFixed(2)}, ${nodeFloatY.toFixed(2)}) scale(${pulse.toFixed(3)})`);
      }
    };

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mouseTarget.current.x = Math.max(-1, Math.min(1, nx));
    mouseTarget.current.y = Math.max(-1, Math.min(1, ny));
  };

  const handleMouseEnter = () => {
    isHoveredRef.current = true;
  };
  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    mouseTarget.current.x = 0;
    mouseTarget.current.y = 0;
  };

  // Path constants for exact ANS Monogram 'A' (from ans-favicon.svg)
  const leftRibbonPath = "M 297.5 220.2 C 276.0 214.0 250.5 219.5 236.0 241.5 L 154.5 366.5 C 139.0 390.5 154.0 421.0 183.0 421.0 L 228.0 421.0 L 261.0 364.0 L 261.0 303.0 L 211.0 385.0 L 186.0 385.0 L 272.5 251.5 C 275.0 247.5 278.0 246.0 281.0 246.0 Z";
  const rightRibbonPath = "M 297.5 220.2 C 309.5 224.0 320.5 231.5 328.0 243.5 L 409.5 366.5 C 425.0 390.5 410.0 421.0 381.0 421.0 L 335.0 421.0 L 312.0 385.0 L 280.0 385.0 C 277.5 385.0 276.0 383.5 276.0 381.0 L 276.0 359.0 C 276.0 356.5 277.5 355.0 280.0 355.0 L 331.0 355.0 C 333.5 355.0 335.5 356.5 337.0 359.0 L 353.0 385.0 L 378.0 385.0 L 289.5 251.5 C 287.0 247.5 284.0 246.0 281.0 246.0 Z";
  const nodePath = "M 261.0 303.0 L 300.0 303.0 C 303.0 303.0 305.0 305.0 305.0 308.0 L 305.0 337.0 C 305.0 340.0 303.0 342.0 300.0 342.0 L 261.0 342.0 Z";

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative w-full max-w-[480px] aspect-[1.15/1] mx-auto flex items-center justify-center select-none cursor-pointer [perspective:1000px] group"
    >
      <div 
        ref={transformRef}
        className="w-full h-full flex items-center justify-center will-change-transform"
        style={{
          transformStyle: 'preserve-3d',
        }}
      >
        <svg 
          viewBox="0 0 500 420" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full overflow-visible"
        >
          <defs>
            {/* Left Ribbon Gradient */}
            <linearGradient id="ansRibbonLeftGrad" x1="180" y1="220" x2="280" y2="420" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2A2B2A" />
              <stop offset="45%" stopColor="#181918" />
              <stop offset="100%" stopColor="#0F100F" />
            </linearGradient>

            {/* Right Ribbon Gradient (Arc Emerald Green) */}
            <linearGradient id="ansRibbonRightGrad" x1="280" y1="220" x2="380" y2="420" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1EAA5B" />
              <stop offset="40%" stopColor="#108945" />
              <stop offset="100%" stopColor="#0B5A2D" />
            </linearGradient>

            {/* Inner Node Gradient */}
            <linearGradient id="ansNodeGrad" x1="261" y1="303" x2="305" y2="342" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#22C55E" />
              <stop offset="100%" stopColor="#108945" />
            </linearGradient>

            {/* Deep Sculptural Soft Shadow */}
            <filter id="ansLetterShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="14" />
              <feOffset dx="0" dy="16" result="offsetblur" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.14" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Satellite Core Glow Filter */}
            <filter id="ansSatelliteGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Right Ribbon Sheen Glint Clip Path */}
            <clipPath id="ansRightRibbonClip">
              <path d={rightRibbonPath} />
            </clipPath>

            {/* Sheen Glint Gradient */}
            <linearGradient id="ansSheenBeamGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
              <stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.08" />
              <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.55" />
              <stop offset="65%" stopColor="#FFFFFF" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Ambient Ground Shadow (Breathing & floating with levitation) */}
          <g className="animate-ans-shadow">
            <ellipse cx="250" cy="385" rx="160" ry="24" fill="#000000" opacity="0.06" filter="blur(18px)" />
            <ellipse cx="250" cy="380" rx="110" ry="16" fill="#000000" opacity="0.08" filter="blur(9px)" />
          </g>

          {/* Outer Orbital Ring - Back Segment */}
          <path 
            d="M 80 215 C 105 135 395 125 440 195" 
            stroke="#137A43" 
            strokeWidth="1.25" 
            opacity="0.45"
            fill="none" 
          />

          {/* Inner Orbital Ring - Back Segment */}
          <path 
            d="M 120 215 C 145 160 365 152 410 200" 
            stroke="#137A43" 
            strokeWidth="1" 
            opacity="0.3"
            strokeDasharray="3 3"
            fill="none" 
          />

          {/* 3D FLOATING LEVITATING LETTER 'A' GROUP */}
          <g className="animate-ans-levitate">
            <g filter="url(#ansLetterShadow)" transform="translate(250, 215) scale(1.35) translate(-282, -320)">
              {/* Subtle Ambient Emerald Aura behind symbol */}
              <circle cx="282" cy="320" r="90" fill="#137A43" opacity="0.08" filter="blur(20px)" />

              {/* ─── 3D EXTRUSION BASE LAYER 1 (Deep Extrusion Wall) ─── */}
              <g ref={extrudeBaseRef} transform="translate(4, 6)">
                <path fill="#080908" d={leftRibbonPath} />
                <path fill="#052813" d={rightRibbonPath} />
                <path fill="#073B1B" d={nodePath} />
              </g>

              {/* ─── 3D EXTRUSION BASE LAYER 2 (Mid Bevel Wall) ─── */}
              <g ref={extrudeMidRef} transform="translate(2, 3)">
                <path fill="#141514" d={leftRibbonPath} />
                <path fill="#0B4D25" d={rightRibbonPath} />
                <path fill="#0C5E2E" d={nodePath} />
              </g>

              {/* ─── FRONT FACE LAYER ─── */}
              {/* Left Ribbon & Inner Ascender */}
              <path fill="url(#ansRibbonLeftGrad)" d={leftRibbonPath} />
              {/* Left Ribbon Specular Top Highlight */}
              <path 
                d="M 238 238 L 158 364" 
                stroke="#FFFFFF" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                opacity="0.25" 
                fill="none" 
              />

              {/* Right Ribbon & Lower Geometric Path */}
              <path fill="url(#ansRibbonRightGrad)" d={rightRibbonPath} />
              {/* Right Ribbon Specular Highlight */}
              <path 
                d="M 326 240 L 406 364" 
                stroke="#FFFFFF" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                opacity="0.35" 
                fill="none" 
              />

              {/* Specular Emerald Sheen Glint Sweep across Right Ribbon */}
              <g clipPath="url(#ansRightRibbonClip)">
                <g className="animate-ans-sheen">
                  <polygon points="180,160 260,160 460,460 380,460" fill="url(#ansSheenBeamGrad)" />
                </g>
              </g>

              {/* Inner Emerald Square Block / Upper Node with autonomous quantum float */}
              <g ref={nodeRef} transform="translate(0, 0) scale(1)" style={{ transformOrigin: '283px 322px' }}>
                <path fill="url(#ansNodeGrad)" d={nodePath} />
                {/* Node Crisp Top Edge Highlight */}
                <path 
                  d="M 261 304 L 300 304" 
                  stroke="#86EFAC" 
                  strokeWidth="1" 
                  strokeLinecap="round" 
                  opacity="0.6" 
                />
              </g>
            </g>
          </g>

          {/* Inner Orbital Ring - Front Segment */}
          <path 
            d="M 120 215 C 100 270 335 285 410 200" 
            stroke="#137A43" 
            strokeWidth="1" 
            opacity="0.4"
            fill="none" 
          />

          {/* Outer Orbital Ring - Front Segment */}
          <path 
            d="M 80 215 C 50 305 365 325 440 195" 
            stroke="#137A43" 
            strokeWidth="1.5" 
            opacity="0.75"
            fill="none" 
          />

          {/* ─── LIVING PARTICLES ENERGY FIELD (Decentralize AI Style Aura) ─── */}
          <g className="opacity-80">
            {[
              { cx: 160, cy: 195, r: 2.2, dur: "3.8s", delay: "0s" },
              { cx: 350, cy: 165, r: 3.0, dur: "4.5s", delay: "1.1s" },
              { cx: 205, cy: 335, r: 2.5, dur: "3.2s", delay: "0.4s" },
              { cx: 380, cy: 315, r: 2.8, dur: "4.1s", delay: "1.8s" },
              { cx: 280, cy: 140, r: 3.2, dur: "5.2s", delay: "0.7s" },
              { cx: 120, cy: 260, r: 2.0, dur: "4.3s", delay: "1.5s" },
              { cx: 430, cy: 250, r: 2.4, dur: "4.8s", delay: "2.2s" },
              { cx: 295, cy: 380, r: 2.6, dur: "3.7s", delay: "2.7s" },
              { cx: 240, cy: 210, r: 2.0, dur: "3.4s", delay: "0.9s" },
              { cx: 320, cy: 225, r: 2.2, dur: "4.0s", delay: "1.3s" },
            ].map((p, idx) => (
              <circle
                key={idx}
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill="#00FF88"
                filter="url(#ansSatelliteGlow)"
                className="animate-pulse"
                style={{
                  animationDuration: p.dur,
                  animationDelay: p.delay,
                  opacity: 0.75,
                }}
              />
            ))}
          </g>

          {/* ─── ACTIVE CELESTIAL SATELLITES (ORBITING CONTINUOUSLY) ─── */}
          {/* Satellite 1: Outer Orbit Traveler */}
          <circle r="5" fill="#137A43" filter="url(#ansSatelliteGlow)">
            <animateMotion 
              path="M 80 215 C 105 135 395 125 440 195 C 365 325 50 305 80 215 Z" 
              dur="14s" 
              repeatCount="indefinite" 
            />
          </circle>

          {/* Satellite 2: Outer Orbit Companion (180deg Phase Offset) */}
          <circle r="4" fill="#22C55E" filter="url(#ansSatelliteGlow)">
            <animateMotion 
              path="M 440 195 C 365 325 50 305 80 215 C 105 135 395 125 440 195 Z" 
              dur="14s" 
              repeatCount="indefinite" 
            />
          </circle>

          {/* Satellite 3: Inner Orbit Counter-Rotation Traveler */}
          <circle r="4" fill="#108945">
            <animateMotion 
              path="M 410 200 C 365 152 145 160 120 215 C 100 270 335 285 410 200 Z" 
              dur="9.5s" 
              repeatCount="indefinite" 
            />
          </circle>
        </svg>
      </div>
    </div>
  );
};

/**
 * Real Name Search with live on-chain contract resolution & shortcuts
 */
const HeroNameSearch = ({ 
  navigateTo, 
  navigateToProfile, 
  auth, 
  ans 
}: { 
  navigateTo: (view: string, data?: string | null) => void;
  navigateToProfile: (name: string) => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<any>(null);

  const performCheck = useCallback(async (nameToCheck: string) => {
    const formatted = cleanName(nameToCheck);
    if (!formatted || formatted.length < 3) {
      setResult(formatted.length > 0 ? { type: 'invalid' } : null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const fullName = `${formatted}.arc`;

    try {
      const isAvail = await fallbackPublicClient.readContract({
        address: ANS_ADDRESS,
        abi: ANS_ABI,
        functionName: 'isAvailable',
        args: [formatted],
      });

      if (isAvail) {
        setResult({ type: 'available', name: fullName, length: formatted.length, raw: formatted });
      } else {
        const listing = await fallbackPublicClient.readContract({
          address: ANS_ADDRESS,
          abi: ANS_ABI,
          functionName: 'getListing',
          args: [formatted],
        });

        if (listing && listing.active) {
          setResult({
            type: 'listed',
            data: {
              name: fullName,
              seller: listing.seller,
              price: Number(formatUnits(listing.price, 6)),
            },
          });
        } else {
          const record = await fallbackPublicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getNameRecord',
            args: [formatted],
          });
          setResult({
            type: 'taken',
            data: {
              name: fullName,
              owner: record.owner,
              expiry: Number(record.expiry) * 1000,
            },
          });
        }
      }
    } catch {
      const taken = INITIAL_MOCK_NAMES.find(n => n.name === fullName);
      const listed = INITIAL_MOCK_LISTINGS.find(l => l.name === fullName);
      if (listed) {
        setResult({ type: 'listed', data: listed });
      } else if (taken) {
        setResult({ type: 'taken', data: taken });
      } else {
        setResult({ type: 'available', name: fullName, length: formatted.length, raw: formatted });
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!query) {
      setResult(null);
      return;
    }
    const timer = setTimeout(() => {
      performCheck(query);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, performCheck]);

  const handleShortcutClick = (shortcut: string) => {
    const raw = shortcut.replace('.arc', '');
    setQuery(raw);
    performCheck(raw);
  };

  return (
    <div className="w-full text-left">
      {/* Search Input pill container matching reference */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) performCheck(query);
        }} 
        className="relative max-w-xl"
      >
        <div className="relative flex items-center bg-white border border-[#E5E5E2] rounded-full p-1.5 pl-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus-within:border-[#137A43] focus-within:ring-2 focus-within:ring-[#137A43]/10 transition-all">
          <Search size={18} className="text-gray-400 mr-3 shrink-0" />
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a name (e.g. alice.arc)"
            aria-label="Search for a .arc name"
            className="w-full bg-transparent text-sm text-[#141413] placeholder:text-gray-400 font-sans outline-none pr-3"
            spellCheck="false"
          />
          <button 
            type="submit" 
            disabled={isSearching}
            className="bg-[#137A43] hover:bg-[#0F6536] text-white font-medium text-sm px-7 py-2.5 rounded-full transition-colors shrink-0 disabled:opacity-60 flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            {isSearching ? <RefreshCw size={14} className="animate-spin" /> : 'Search'}
          </button>
        </div>
      </form>

      {/* Popular shortcuts row with real on-chain registered names or starter suggestions */}
      <div className="flex items-center flex-wrap gap-2 mt-4 text-xs font-mono">
        <span className="text-[#8E8E89] mr-1 font-sans">
          {getRecentlyRegisteredNames().length > 0 ? 'Popular:' : 'Try searching:'}
        </span>
        {(getRecentlyRegisteredNames().length > 0 ? getRecentlyRegisteredNames().slice(0, 6) : ['builder.arc', 'wallet.arc', 'alpha.arc', 'pay.arc', 'dev.arc']).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handleShortcutClick(item)}
            className="px-3.5 py-1 bg-white border border-[#E5E5E2] hover:border-[#137A43] hover:text-[#137A43] text-[#40403B] rounded-full text-xs font-mono transition-colors shadow-2xs cursor-pointer"
          >
            {item}
          </button>
        ))}
      </div>

      {/* Result feedback card */}
      <div className="mt-4 max-w-xl">
        {isSearching && (
          <div className="text-gray-500 font-mono text-xs flex items-center gap-2 py-2">
            <div className="w-3.5 h-3.5 border-2 border-[#137A43] border-t-transparent rounded-full animate-spin"></div>
            Checking on-chain availability on Arc Testnet...
          </div>
        )}

        {!isSearching && result?.type === 'available' && (
          <div className="bg-white border border-[#137A43]/40 p-4 rounded-2xl shadow-sm animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-[#137A43]"></span>
                  <span className="font-serif font-bold text-gray-900 text-lg">{result.name}</span>
                  <span className="text-[10px] font-mono text-[#137A43] bg-[#E8F5E9] border border-[#137A43]/20 px-2 py-0.5 rounded-md font-bold">
                    Available
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-sans">
                  Available to register with instant Passkey lease on Arc Testnet.
                </p>
              </div>
              <button 
                className="bg-[#137A43] hover:bg-[#0F6536] text-white py-2 px-4 text-xs font-sans font-medium rounded-full shrink-0 shadow-sm transition-all cursor-pointer"
                onClick={() => navigateTo('names', result.raw || cleanName(result.name))}
              >
                {auth?.isConnected && auth?.address ? 'Register Name' : 'Register with Passkey'}
              </button>
            </div>
          </div>
        )}

        {!isSearching && result?.type === 'taken' && (
          <div className="bg-white border border-[#E5E5E2] p-4 rounded-2xl shadow-sm animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-serif font-bold text-gray-900 text-lg">{result.data.name}</span>
                  <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                    Registered
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-mono truncate max-w-xs">
                  Owner: {result.data.owner}
                </p>
              </div>
              <button 
                className="bg-white border border-[#E5E5E2] text-gray-800 hover:bg-gray-50 py-2 px-4 text-xs font-sans font-medium rounded-full shrink-0 shadow-sm transition-all"
                onClick={() => navigateToProfile(result.data.name)}
              >
                View Profile
              </button>
            </div>
          </div>
        )}

        {!isSearching && result?.type === 'listed' && (
          <div className="bg-white border border-amber-300 p-4 rounded-2xl shadow-sm animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-serif font-bold text-gray-900 text-lg">{result.data.name}</span>
                  <span className="text-[10px] font-mono text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                    Listed: {result.data.price} USDC
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-sans">
                  Available in trustless atomic escrow on Arc Testnet.
                </p>
              </div>
              <button 
                className="bg-[#141413] hover:bg-[#282826] text-white py-2 px-4 text-xs font-sans font-medium rounded-full shrink-0 shadow-sm transition-all"
                onClick={() => navigateTo('marketplace')}
              >
                View Listing
              </button>
            </div>
          </div>
        )}

        {!isSearching && result?.type === 'invalid' && (
          <p className="text-xs text-amber-700 font-mono">
            Names must contain at least 3 characters.
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * Five Product Capabilities Strip matching reference layout
 */
const ProductCapabilitiesStrip = () => {
  const capabilities = [
    {
      icon: User,
      title: "Human-readable identity",
      desc: "Use .arc names instead of long wallet addresses.",
    },
    {
      icon: Send,
      title: "Name-based payments",
      desc: "Send USDC to a name or wallet with confidence.",
    },
    {
      icon: Store,
      title: "Name marketplace",
      desc: "Discover, buy, and sell names on Arc.",
    },
    {
      icon: Shield,
      title: "Profiles & reputation",
      desc: "Build your on-chain identity and establish trust.",
    },
    {
      icon: Fingerprint,
      title: "Passkey security",
      desc: "Secure access with Circle SDK and passkeys.",
    },
  ];

  return (
    <section className="border-y border-[#E5E5E2] bg-transparent relative z-10 my-4 sm:my-8">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-0 divide-y sm:divide-y-0 sm:divide-x divide-[#E5E5E2]">
          {capabilities.map((cap) => {
            const Icon = cap.icon;
            return (
              <div 
                key={cap.title} 
                className="group cursor-pointer p-4 sm:px-6 flex items-start gap-3.5 rounded-xl hover:bg-white hover:shadow-[0_12px_28px_rgba(19,122,67,0.08)] hover:-translate-y-1.5 transition-all duration-300 ease-out border border-transparent hover:border-[#137A43]/20"
              >
                <div className="w-9 h-9 rounded-xl bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-6deg] flex items-center justify-center shrink-0 mt-0.5 transition-all duration-300 shadow-2xs">
                  <Icon size={18} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-sans font-semibold text-gray-900 group-hover:text-[#137A43] text-sm mb-1 leading-snug transition-colors">
                    {cap.title}
                  </h3>
                  <p className="text-gray-500 text-xs font-sans leading-relaxed">
                    {cap.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/**
 * Lower Homepage Section — The 3-Column Side-By-Side Grid
 * Exact match to reference image:
 * Card 1: Dark Identity Card with glowing wave
 * Card 2: Featured Names Card with live testnet / spotlight data
 * Card 3: How It Works 3-step guide
 */
const LowerHomeGrid = ({
  navigateTo,
  navigateToProfile,
}: {
  navigateTo: (view: string, data?: string | null) => void;
  navigateToProfile: (name: string) => void;
}) => {
  const featuredNames = [
    { name: "arc.arc", price: "15.00 USDC", tier: "3 Characters" },
    { name: "pay.arc", price: "15.00 USDC", tier: "3 Characters" },
    { name: "dex.arc", price: "15.00 USDC", tier: "3 Characters" },
    { name: "dao.arc", price: "15.00 USDC", tier: "3 Characters" },
    { name: "gold.arc", price: "9.00 USDC", tier: "4 Characters" },
  ];

  return (
    <section className="max-w-7xl mx-auto px-6 py-10 sm:py-14 relative z-10">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        {/* CARD 1: Dark Identity Card */}
        <div className="lg:col-span-1 group cursor-pointer bg-[#0F1410] rounded-2xl p-8 text-white relative overflow-hidden flex flex-col justify-between shadow-sm min-h-[420px] hover:shadow-[0_24px_48px_rgba(0,0,0,0.3)] hover:-translate-y-2 hover:border-[#22C55E]/30 border border-white/5 transition-all duration-300 ease-out">
          {/* Subtle green ambient glow and wave SVG */}
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-radial from-[#137A43]/25 via-transparent to-transparent pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          <svg className="absolute right-0 bottom-0 w-48 h-32 opacity-40 group-hover:opacity-60 transition-opacity duration-300 pointer-events-none" viewBox="0 0 200 120" fill="none">
            <path d="M0 120 C60 100 120 40 200 60 L200 120 Z" fill="url(#greenWaveGrad)" />
            <path d="M0 120 C80 90 140 30 200 50" stroke="#22C55E" strokeWidth="1.5" opacity="0.8" />
            <defs>
              <linearGradient id="greenWaveGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#137A43" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#22C55E" stopOpacity="0.05" />
              </linearGradient>
            </defs>
          </svg>

          <div>
            <div className="inline-flex items-center gap-2 text-xs font-sans font-medium text-[#86EFAC] bg-white/5 border border-white/10 px-3 py-1 rounded-full mb-8 group-hover:border-[#22C55E]/40 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              <span>Live on Arc Network</span>
            </div>

            <h2 className="font-serif font-bold text-3xl sm:text-4xl leading-tight mb-4 group-hover:translate-x-1 transition-transform duration-300">
              Your name.<br />
              Your identity,<br />
              <span className="text-[#81C784]">On-chain.</span>
            </h2>

            <p className="text-gray-300 text-xs sm:text-sm leading-relaxed max-w-sm mb-6 font-sans">
              Sovereign naming and payment routing on Arc Network. Register, manage, and use your .arc name across supported applications.
            </p>
          </div>

          <button 
            onClick={() => navigateTo('names')}
            className="bg-white text-gray-900 hover:bg-gray-100 group-hover:bg-[#86EFAC] group-hover:text-black font-sans font-medium text-xs px-5 py-2.5 rounded-full flex items-center gap-2 w-fit transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <span>Search Names</span>
            <ArrowRightIcon size={14} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* RIGHT 2 COLUMNS: Featured Names & How It Works unified container matching reference */}
        <div className="lg:col-span-2 bg-white border border-[#E5E5E2] hover:border-[#137A43]/40 hover:shadow-[0_20px_45px_rgba(19,122,67,0.08)] hover:-translate-y-1.5 transition-all duration-300 ease-out rounded-2xl grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#E5E5E2] shadow-sm overflow-hidden">
          
          {/* Card 2: Featured Names */}
          <div className="p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-sans font-semibold text-gray-900 text-sm">Featured Names</h3>
                <button 
                  onClick={() => navigateTo('marketplace')}
                  className="text-xs font-sans text-[#137A43] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <span>View marketplace</span>
                  <ArrowRightIcon size={12} />
                </button>
              </div>

              <div className="divide-y divide-[#F0F0EE]">
                {featuredNames.map((item) => (
                  <div 
                    key={item.name}
                    onClick={() => {
                      const raw = item.name.replace('.arc', '');
                      navigateTo('names', raw);
                    }}
                    className="py-3.5 flex items-center justify-between group cursor-pointer hover:bg-[#FBFBFA] px-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-semibold text-gray-900 group-hover:text-[#137A43] transition-colors">
                        {item.name}
                      </span>
                      <span className="text-[11px] font-sans text-gray-400">
                        {item.tier}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-gray-800 group-hover:text-[#137A43] transition-colors tabular-nums">
                        {item.price}
                      </span>
                      <ArrowRightIcon size={12} className="text-gray-400 group-hover:text-[#137A43] group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card 3: How It Works */}
          <div className="p-6 sm:p-7 flex flex-col justify-between bg-white/40">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#E8F5E9] text-[#137A43] text-[11px] font-sans font-medium mb-3">
                Quick Start
              </span>
              <h2 className="font-serif font-bold text-2xl sm:text-3xl text-gray-900 leading-tight mb-8">
                Get your .arc name in three simple steps.
              </h2>

              <div className="space-y-6">
                <div className="group/step flex items-start gap-3.5 p-2 rounded-xl hover:bg-[#FBFBFA] transition-colors cursor-pointer">
                  <div className="w-7 h-7 rounded-full bg-[#E8F5E9] text-[#137A43] group-hover/step:bg-[#137A43] group-hover/step:text-white group-hover/step:scale-110 font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5 font-sans transition-all duration-200">
                    1
                  </div>
                  <div>
                    <h4 className="font-sans font-semibold text-sm text-gray-900 group-hover/step:text-[#137A43] transition-colors">
                      Search & check availability
                    </h4>
                    <p className="font-sans text-xs text-gray-500 mt-0.5">
                      Find your preferred name in real-time.
                    </p>
                  </div>
                </div>

                <div className="group/step flex items-start gap-3.5 p-2 rounded-xl hover:bg-[#FBFBFA] transition-colors cursor-pointer">
                  <div className="w-7 h-7 rounded-full bg-[#E8F5E9] text-[#137A43] group-hover/step:bg-[#137A43] group-hover/step:text-white group-hover/step:scale-110 font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5 font-sans transition-all duration-200">
                    2
                  </div>
                  <div>
                    <h4 className="font-sans font-semibold text-sm text-gray-900 group-hover/step:text-[#137A43] transition-colors">
                      Register your lease
                    </h4>
                    <p className="font-sans text-xs text-gray-500 mt-0.5">
                      Authorize 3 to 12 months with your Passkey or wallet.
                    </p>
                  </div>
                </div>

                <div className="group/step flex items-start gap-3.5 p-2 rounded-xl hover:bg-[#FBFBFA] transition-colors cursor-pointer">
                  <div className="w-7 h-7 rounded-full bg-[#E8F5E9] text-[#137A43] group-hover/step:bg-[#137A43] group-hover/step:text-white group-hover/step:scale-110 font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5 font-sans transition-all duration-200">
                    3
                  </div>
                  <div>
                    <h4 className="font-sans font-semibold text-sm text-gray-900 group-hover/step:text-[#137A43] transition-colors">
                      Route payments & identity
                    </h4>
                    <p className="font-sans text-xs text-gray-500 mt-0.5">
                      Receive USDC, set primary reverse lookup, and build reputation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};

const HomeView = ({ 
  navigateTo, 
  navigateToProfile,
  auth,
  ans 
}: { 
  navigateTo: (view: string, data?: string | null) => void; 
  navigateToProfile: (name: string) => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
}) => {
  return (
    <div className="w-full bg-[#FBFBFA] relative overflow-hidden min-h-screen">
      
      {/* HERO SECTION */}
      <section className="relative px-6 pt-12 pb-10 md:pt-16 md:pb-14 max-w-7xl mx-auto z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* LEFT: Eyebrow, Headline, Supporting copy, Real Name Search, Shortcuts */}
          <div className="lg:col-span-7 text-left">
            <div className="mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F5E9] text-[#137A43] text-xs font-mono font-medium border border-[#137A43]/15 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[#137A43]"></span>
                Arc Name Service
              </span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-serif text-[#141413] tracking-tight leading-[1.08] mb-5">
              The sovereign naming layer <br className="hidden sm:inline" />
              for <span className="text-[#137A43]">Arc Network.</span>
            </h1>
            
            <p className="text-base sm:text-lg text-[#60605A] font-sans max-w-lg mb-8 leading-relaxed font-normal">
              Turn long blockchain addresses into human-readable .arc names.<br className="hidden sm:inline" />
              Send, receive, and manage your identity on Arc.
            </p>

            {/* Interactive Search Bar for In-App Home */}
            <div className="w-full max-w-xl mb-6">
              <HeroNameSearch 
                navigateTo={navigateTo} 
                navigateToProfile={navigateToProfile} 
                auth={auth} 
                ans={ans} 
              />
            </div>

            {/* Trust & Spec Strip */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono text-gray-500 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E5E5E2] rounded-full shadow-2xs">
                <Shield size={12} className="text-[#137A43]" />
                <span className="text-gray-700 font-semibold">10 Names</span> per wallet
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E5E5E2] rounded-full shadow-2xs">
                <Zap size={12} className="text-[#137A43]" />
                <span className="text-gray-700 font-semibold">Zero Gas</span> (USDC native)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E5E5E2] rounded-full shadow-2xs">
                <Fingerprint size={12} className="text-[#137A43]" />
                <span className="text-gray-700 font-semibold">Passkey</span> ERC-4337
              </span>
            </div>
          </div>

          {/* RIGHT: Abstract Arc 3D Sculpture Centerpiece + Stacked Caption */}
          <div className="lg:col-span-5 hidden md:flex items-center justify-center">
            <ArcGeometricCenterpiece />
          </div>

        </div>
      </section>

      {/* HORIZONTAL STRIP OF FIVE PRODUCT CAPABILITIES */}
      <ProductCapabilitiesStrip />

      {/* LOWER SECTION: 3-CARD SIDE-BY-SIDE GRID */}
      <LowerHomeGrid 
        navigateTo={navigateTo} 
        navigateToProfile={navigateToProfile} 
      />

    </div>
  );
};

/**
 * Comprehensive Standalone Landing / Product Presentation Page
 * Expands the public '/' experience with complete architectural,
 * economic, reputation, and lifecycle product documentation.
 */
const LandingPageView = ({ 
  navigateTo, 
  navigateToProfile, 
  onLaunchApp,
  auth,
  ans 
}: { 
  navigateTo: (view: string, data?: string | null) => void; 
  navigateToProfile: (name: string) => void;
  onLaunchApp: () => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
}) => {
  const scrollToSearch = () => {
    const el = document.getElementById('hero-search-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="w-full bg-[#FBFBFA] relative overflow-hidden">
      
      {/* 1. TOP HERO SECTION (PRESERVED FIRST IMPRESSION) */}
      <section id="hero-search-section" className="relative px-6 pt-12 pb-10 md:pt-16 md:pb-14 max-w-7xl mx-auto z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* LEFT: Eyebrow, Headline, Supporting copy, Real Name Search, Shortcuts */}
          <div className="lg:col-span-7 text-left">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F5E9] text-[#137A43] text-xs font-sans font-medium mb-4 select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-[#137A43]" />
              Arc Name Service Protocol
            </span>

            <h1 className="text-4xl sm:text-6xl font-serif text-[#141413] tracking-tight leading-[1.08] mb-5">
              The sovereign naming layer <br className="hidden sm:inline" />
              for <span className="text-[#137A43]">Arc Network.</span>
            </h1>
            
            <p className="text-base sm:text-lg text-[#60605A] font-sans max-w-lg mb-8 leading-relaxed font-normal">
              Turn long blockchain addresses into human-readable .arc names.<br className="hidden sm:inline" />
              Send, receive, and manage your identity on Arc.
            </p>

            {/* High-Converting Hero CTAs & Trust Strip */}
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
                <button
                  onClick={() => navigateTo('names')}
                  className="px-7 py-3.5 rounded-full bg-[#137A43] hover:bg-[#0F6536] text-white text-sm font-sans font-semibold shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Claim Your .arc Name</span>
                  <ArrowRightIcon size={16} />
                </button>
                <button
                  onClick={() => navigateTo('marketplace')}
                  className="px-6 py-3.5 rounded-full bg-white hover:bg-[#F7F7F6] border border-[#E5E5E2] text-[#141413] text-sm font-sans font-semibold shadow-xs active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShoppingCart size={15} className="text-[#137A43]" />
                  <span>Explore Marketplace</span>
                </button>
              </div>

              {/* Trust & Spec Strip */}
              <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono text-gray-500 pt-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E5E5E2] rounded-full shadow-2xs">
                  <Shield size={12} className="text-[#137A43]" />
                  <span className="text-gray-700 font-semibold">10 Names</span> per wallet
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E5E5E2] rounded-full shadow-2xs">
                  <Zap size={12} className="text-[#137A43]" />
                  <span className="text-gray-700 font-semibold">Zero Gas</span> (USDC native)
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E5E5E2] rounded-full shadow-2xs">
                  <Fingerprint size={12} className="text-[#137A43]" />
                  <span className="text-gray-700 font-semibold">Passkey</span> ERC-4337
                </span>
              </div>

              <div>
                <button
                  onClick={() => navigateTo('names')}
                  className="text-xs font-mono text-[#137A43] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  Looking for a specific .arc name? Check availability in Registry →
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Abstract Arc 3D Sculpture Centerpiece */}
          <div className="lg:col-span-5 hidden md:flex items-center justify-center">
            <ArcGeometricCenterpiece />
          </div>

        </div>
      </section>

      {/* HORIZONTAL STRIP OF FIVE PRODUCT CAPABILITIES */}
      <ProductCapabilitiesStrip />

      {/* 2. SECTION 1: WHAT IS ANS? (THE PROBLEM & SOLUTION) */}
      <section className="max-w-7xl mx-auto px-6 py-16 sm:py-24 border-b border-[#E5E5E2]">
        <div className="max-w-3xl mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#141413] tracking-tight leading-[1.15] mb-4">
            Replacing cryptic hex hashes with human-readable .arc names.
          </h2>
          <p className="text-base sm:text-lg text-[#60605A] font-sans leading-relaxed">
            Every account on Arc Network is cryptographically identified by a 42-character hexadecimal address. While essential for elliptic curve signatures, raw addresses create severe friction: they cannot be memorized, are difficult to verify visually, and introduce dangerous risks of clipboard hijacking. ANS connects readable <span className="font-mono text-[#137A43] font-semibold">.arc</span> names with on-chain addresses through decentralized smart contracts.
          </p>
        </div>

        {/* Side-by-side Comparison Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          
          {/* Card A: The Raw Hash Problem */}
          <div className="group cursor-pointer bg-[#FAF9F7] border border-[#E5E5E2] hover:border-amber-300 hover:shadow-[0_16px_36px_rgba(180,83,9,0.09)] hover:-translate-y-2 rounded-2xl p-7 flex flex-col justify-between transition-all duration-300 ease-out">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-sans font-semibold text-[#8E8E89] group-hover:text-[#60605A] transition-colors">
                  Standard Arc Hex Address
                </span>
                <span className="text-[11px] font-sans text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                  High friction
                </span>
              </div>
              <div className="bg-white border border-[#E5E5E2] group-hover:border-amber-200 rounded-xl p-3.5 font-mono text-xs text-gray-800 break-all select-all mb-5 transition-colors">
                0x315EED96725dFbdDeFcdF35673634CD1eCEB9433
              </div>
              <ul className="space-y-3 text-xs sm:text-sm text-[#60605A] font-sans">
                <li className="flex items-start gap-2.5">
                  <X size={15} className="text-amber-700 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span>Impossible to remember, pronounce, or communicate verbally</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <X size={15} className="text-amber-700 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span>Vulnerable to clipboard poisoning and look-alike address attacks</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <X size={15} className="text-amber-700 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span>Zero identity context, verified profile data, or reputation rating</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <X size={15} className="text-amber-700 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span>Requires manual copy-pasting and stressful multi-check verification</span>
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-[#E5E5E2] text-xs font-mono text-gray-400">
              Native 20-byte account hash
            </div>
          </div>

          {/* Card B: The ANS Solution */}
          <div className="group cursor-pointer bg-white border border-[#137A43]/30 hover:border-[#137A43] hover:shadow-[0_16px_36px_rgba(19,122,67,0.15)] hover:-translate-y-2 rounded-2xl p-7 flex flex-col justify-between transition-all duration-300 ease-out relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-sans font-semibold text-[#137A43]">
                  ANS Sovereign Identity
                </span>
                <span className="text-[11px] font-sans text-[#137A43] bg-[#E8F5E9] border border-[#137A43]/20 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1.5 group-hover:bg-[#137A43] group-hover:text-white transition-all">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#137A43] group-hover:bg-white" />
                  Verified .arc
                </span>
              </div>
              <div className="bg-[#F7FAF8] border border-[#137A43]/20 group-hover:border-[#137A43]/40 rounded-xl p-3.5 font-mono text-sm font-bold text-[#137A43] flex items-center justify-between mb-5 transition-colors">
                <span>alex.arc</span>
                <span className="text-xs font-sans font-normal text-gray-500">→ 0x315E...9433</span>
              </div>
              <ul className="space-y-3 text-xs sm:text-sm text-[#141413] font-sans">
                <li className="flex items-start gap-2.5">
                  <Check size={16} className="text-[#137A43] shrink-0 mt-0.5 font-bold" />
                  <span>Intuitive, memorable name recognized across Arc applications</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check size={16} className="text-[#137A43] shrink-0 mt-0.5 font-bold" />
                  <span>Two-way reverse resolution binds your wallet to your primary persona</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check size={16} className="text-[#137A43] shrink-0 mt-0.5 font-bold" />
                  <span>Integrated on-chain reputation history backed by ANSReputation.sol</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check size={16} className="text-[#137A43] shrink-0 mt-0.5 font-bold" />
                  <span>Direct USDC payments, custom tipping memos, and name gifting</span>
                </li>
              </ul>
            </div>
            <div className="mt-6 pt-4 border-t border-[#E5E5E2] flex items-center justify-between text-xs font-mono text-[#137A43]">
              <span>Arc Testnet Protocol Standard</span>
              <span>Chain ID 5042002</span>
            </div>
          </div>

        </div>
      </section>

      {/* 3. SECTION 2: WHY AN .ARC IDENTITY? (PRACTICAL VALUE) */}
      <section className="max-w-7xl mx-auto px-6 py-16 sm:py-24 border-b border-[#E5E5E2]">
        <div className="max-w-3xl mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#141413] tracking-tight leading-[1.15] mb-4">
            Built for everyday on-chain utility, not just profile labels.
          </h2>
          <p className="text-base sm:text-lg text-[#60605A] font-sans leading-relaxed">
            An .arc name is a programmable on-chain asset that unlocks active capabilities throughout Arc Network. It functions as your payment routing address, your public persona, and your verified reputation passport.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="group cursor-pointer bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-2xs hover:shadow-[0_16px_36px_rgba(19,122,67,0.14)] hover:border-[#137A43]/60 hover:-translate-y-2 transition-all duration-300 ease-out flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-6deg] transition-all duration-300 flex items-center justify-center mb-5 shadow-xs">
                <Send size={19} />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
                Name-Based Payments
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
                Send and receive native 6-decimal USDC using readable names instead of raw hashes. Attach on-chain message notes directly in transaction events.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-[11px] font-mono text-[#137A43] font-semibold transition-colors">
              Native USDC 6-decimal precision
            </div>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-2xs hover:shadow-[0_16px_36px_rgba(19,122,67,0.14)] hover:border-[#137A43]/60 hover:-translate-y-2 transition-all duration-300 ease-out flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-6deg] transition-all duration-300 flex items-center justify-center mb-5 shadow-xs">
                <RefreshCw size={19} />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
                Two-Way Reverse Lookup
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
                Designate your primary name. When your wallet connects to supported Arc dApps, the application displays your human identity instead of truncating your address.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-[11px] font-mono text-[#137A43] font-semibold transition-colors">
              reverseLookup(address) binding
            </div>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-2xs hover:shadow-[0_16px_36px_rgba(19,122,67,0.14)] hover:border-[#137A43]/60 hover:-translate-y-2 transition-all duration-300 ease-out flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-6deg] transition-all duration-300 flex items-center justify-center mb-5 shadow-xs">
                <Shield size={19} />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
                Anti-Hoarding Quota
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
                To prevent speculative squatters from locking up the namespace, the ArcNameService contract enforces a strict cap of 10 active names per wallet.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-[11px] font-mono text-[#137A43] font-semibold transition-colors">
              maxNamesPerWallet = 10
            </div>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-2xs hover:shadow-[0_16px_36px_rgba(19,122,67,0.14)] hover:border-[#137A43]/60 hover:-translate-y-2 transition-all duration-300 ease-out flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-6deg] transition-all duration-300 flex items-center justify-center mb-5 shadow-xs">
                <User size={19} />
              </div>
              <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
                Verified Profiles
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
                Attach an avatar, bio, website URL, and social presence. Profile edits require an EIP-191 personal signature and single-use challenge to prevent tampering.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-[11px] font-mono text-[#137A43] font-semibold transition-colors">
              EIP-191 signature authorized
            </div>
          </div>

        </div>
      </section>

      {/* 4. SECTION 3: HOW ANS WORKS (THE 4-STEP LIFECYCLE) */}
      <section className="max-w-7xl mx-auto px-6 py-16 sm:py-24 border-b border-[#E5E5E2]">
        <div className="max-w-3xl mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#141413] tracking-tight leading-[1.15] mb-4">
            Four transparent steps from search to ecosystem resolution.
          </h2>
          <p className="text-base sm:text-lg text-[#60605A] font-sans leading-relaxed">
            The ANS protocol combines low-latency client checks with decentralized, non-custodial smart contracts deployed on Arc Testnet.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs relative transition-all duration-300 ease-out">
            <div className="w-7 h-7 rounded-full bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 font-semibold text-xs flex items-center justify-center mb-3 font-sans transition-all duration-300 shadow-2xs">
              1
            </div>
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
              Search & Availability
            </h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              Query any string (minimum 3 characters). The contract checks availability in real-time and evaluates duration lease pricing based on character tier (3, 4, 5, or 6+ characters).
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs relative transition-all duration-300 ease-out">
            <div className="w-7 h-7 rounded-full bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 font-semibold text-xs flex items-center justify-center mb-3 font-sans transition-all duration-300 shadow-2xs">
              2
            </div>
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
              Lease Registration
            </h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              Choose a 3, 6, 9, or 12-month lease with fixed USDC pricing. Sign via Passkey or Web3 wallet. ArcNameService.sol mints the record and records your wallet as owner.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs relative transition-all duration-300 ease-out">
            <div className="w-7 h-7 rounded-full bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 font-semibold text-xs flex items-center justify-center mb-3 font-sans transition-all duration-300 shadow-2xs">
              3
            </div>
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
              Dual Resolution Binding
            </h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              The registry writes forward resolution (name → address) for payment routing and sets your chosen primary reverse lookup (address → name) for connected dApps.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs relative transition-all duration-300 ease-out">
            <div className="w-7 h-7 rounded-full bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 font-semibold text-xs flex items-center justify-center mb-3 font-sans transition-all duration-300 shadow-2xs">
              4
            </div>
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
              Ecosystem Usage
            </h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              Your name is live across Arc. Receive USDC payments, accept tips with memos, gift names to teammates, or list your name on the trustless atomic escrow marketplace.
            </p>
          </div>

        </div>
      </section>

      {/* 5. SECTION 4: ONE IDENTITY, MANY INTERACTIONS */}
      <section className="max-w-7xl mx-auto px-6 py-16 sm:py-24 border-b border-[#E5E5E2]">
        <div className="max-w-3xl mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#141413] tracking-tight leading-[1.15] mb-4">
            One identity for financial routing, social context, and standing.
          </h2>
          <p className="text-base sm:text-lg text-[#60605A] font-sans leading-relaxed">
            Experience how an .arc identity connects multiple everyday workflows inside the ANS application.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-7 shadow-2xs flex flex-col justify-between transition-all duration-300 ease-out">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-sans text-[#137A43] bg-[#E8F5E9] border border-[#137A43]/20 mb-5 font-semibold group-hover:bg-[#137A43] group-hover:text-white transition-colors">
                Instant Resolution
              </div>
              <h3 className="font-serif font-bold text-xl text-[#141413] group-hover:text-[#137A43] transition-colors mb-3">
                Name-to-Name Payments
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed mb-4">
                Enter any .arc name in the Send interface. The application resolves the target address on-chain before executing the transfer, eliminating clipboard errors entirely.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-xs font-mono text-gray-700 transition-colors">
              <div className="flex justify-between"><span>Token</span><span className="font-bold text-[#141413]">USDC (6 dec)</span></div>
              <div className="flex justify-between"><span>Resolution</span><span className="font-bold text-[#137A43]">On-Chain Direct</span></div>
            </div>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-7 shadow-2xs flex flex-col justify-between transition-all duration-300 ease-out">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-sans text-[#137A43] bg-[#E8F5E9] border border-[#137A43]/20 mb-5 font-semibold group-hover:bg-[#137A43] group-hover:text-white transition-colors">
                Event Log Memo
              </div>
              <h3 className="font-serif font-bold text-xl text-[#141413] group-hover:text-[#137A43] transition-colors mb-3">
                Tipping with On-Chain Notes
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed mb-4">
                Support creators, developers, or peers. Protocol tips allow you to attach an immutable memo note that is emitted in contract events and boosts counterparty reputation.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-xs font-mono text-gray-700 transition-colors">
              <div className="flex justify-between"><span>Memo Storage</span><span className="font-bold text-[#141413]">TipSent Event</span></div>
              <div className="flex justify-between"><span>Reputation</span><span className="font-bold text-[#137A43]">+1 Tip Counter</span></div>
            </div>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-7 shadow-2xs flex flex-col justify-between transition-all duration-300 ease-out">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-sans text-[#137A43] bg-[#E8F5E9] border border-[#137A43]/20 mb-5 font-semibold group-hover:bg-[#137A43] group-hover:text-white transition-colors">
                Atomic Minting
              </div>
              <h3 className="font-serif font-bold text-xl text-[#141413] group-hover:text-[#137A43] transition-colors mb-3">
                Direct Identity Gifting
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed mb-4">
                Onboard friends or teammates to Arc. The Gift flow enables you to fund and register an available .arc name delivered straight to the recipient's wallet in one atomic call.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-xs font-mono text-gray-700 transition-colors">
              <div className="flex justify-between"><span>Recipient Gas</span><span className="font-bold text-[#137A43]">0.00 (Funded)</span></div>
              <div className="flex justify-between"><span>Ownership</span><span className="font-bold text-[#141413]">Immediate Transfer</span></div>
            </div>
          </div>

        </div>
      </section>

      {/* 6. SECTION 5: NAME OWNERSHIP AND MANAGEMENT */}
      <section className="max-w-7xl mx-auto px-6 py-16 sm:py-24 border-b border-[#E5E5E2]">
        <div className="max-w-3xl mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#141413] tracking-tight leading-[1.15] mb-4">
            True digital ownership with active lifecycle governance.
          </h2>
          <p className="text-base sm:text-lg text-[#60605A] font-sans leading-relaxed">
            Registered names are sovereign on-chain assets governed by explicit smart contract functions on ArcNameService.sol.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
              Fixed Duration Leases
            </h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              Names are leased for 3, 6, 9, or 12 months. Periodic renewal prevents lost or inactive wallets from permanently locking names out of public circulation.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
              Proactive Renewals
            </h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              Renew your active names at any time from the 'My Names' management panel. Extensions add directly onto your existing lease without interrupting reverse resolution.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
              Direct Wallet Transfers
            </h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              Transfer ownership of any registered name to another Arc wallet address in a single smart contract transaction. No intermediaries or platform approvals required.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">
              Primary Identity Toggle
            </h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              Own up to 10 names and select which one represents your address in reverse lookups. Switch your primary identity anytime in the management dashboard.
            </p>
          </div>

        </div>
      </section>

      {/* 7. SECTION 6: ATOMIC ESCROW MARKETPLACE */}
      <section className="max-w-7xl mx-auto px-6 py-16 sm:py-24 border-b border-[#E5E5E2]">
        <div className="max-w-3xl mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#141413] tracking-tight leading-[1.15] mb-4">
            Peer-to-peer secondary trading with zero custodial risk.
          </h2>
          <p className="text-base sm:text-lg text-[#60605A] font-sans leading-relaxed">
            Buy and sell premium .arc names through smart contract escrow with instantaneous atomic settlement.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <div className="text-xs font-sans font-semibold text-[#137A43] mb-1.5">Escrow Contract</div>
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">Non-Custodial Escrow</h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              When listing a name, the domain is held in escrow by ArcNameService.sol. The seller sets a fixed USDC price. The name cannot be moved or altered while listed.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <div className="text-xs font-sans font-semibold text-[#137A43] mb-1.5">Atomic Execution</div>
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">Single-Block Settlement</h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              When a buyer purchases a listed name, USDC transfers to the seller and domain ownership transfers to the buyer in the exact same atomic transaction.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <div className="text-xs font-sans font-semibold text-[#137A43] mb-1.5">Fee Policy</div>
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">2.5% Protocol Fee</h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              Sellers receive 97.5% of the purchase price directly in USDC. The 250 bps (2.5%) protocol fee supports registry maintenance. No hidden charges or listing fees.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <div className="text-xs font-sans font-semibold text-[#137A43] mb-1.5">Seller Control</div>
            <h3 className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors mb-2">Instant Delisting</h3>
            <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
              Sellers maintain full custody autonomy. Cancel an active listing at any time with a single click to return the name to your active portfolio immediately.
            </p>
          </div>

        </div>

        <div className="mt-8 p-5 bg-[#FAF9F7] border border-[#E5E5E2] rounded-xl flex items-start gap-3.5 text-xs text-[#60605A] font-sans">
          <Info size={16} className="text-[#137A43] shrink-0 mt-0.5" />
          <span>
            ANS operates with full transparency on Arc Testnet. The marketplace presents real active listings without synthetic trading volume, fake floor prices, or inflated user statistics.
          </span>
        </div>
      </section>

      {/* 8. SECTION 7: ON-CHAIN REPUTATION & TRUST LAYER */}
      <section className="max-w-7xl mx-auto px-6 py-16 sm:py-24 border-b border-[#E5E5E2]">
        <div className="max-w-3xl mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#141413] tracking-tight leading-[1.15] mb-4">
            Objective credibility derived from verifiable on-chain history.
          </h2>
          <p className="text-base sm:text-lg text-[#60605A] font-sans leading-relaxed">
            Backed by the dedicated ANSReputation.sol smart contract on Arc Testnet, reputation scores track objective transaction metrics rather than subjective moderation or centralized KYC.
          </p>
        </div>

        {/* 4 Tiers Display */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          
          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <div className="flex items-center justify-between mb-3">
              <span className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors">New</span>
              <span className="text-[11px] font-sans text-[#60605A] bg-[#F7F7F6] border border-[#E5E5E2] px-2.5 py-0.5 rounded-full font-semibold group-hover:border-[#137A43]/30 transition-colors">
                Tier 0
              </span>
            </div>
            <div className="font-mono text-xs text-[#137A43] font-bold mb-2">0 – 2 Transactions</div>
            <p className="text-xs text-[#60605A] font-sans leading-relaxed">
              Baseline tier assigned to newly created or inactive addresses beginning their on-chain journey.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <div className="flex items-center justify-between mb-3">
              <span className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors">Trusted</span>
              <span className="text-[11px] font-sans text-[#2C2C2A] bg-[#F2F2EF] border border-[#DCDCD8] px-2.5 py-0.5 rounded-full font-semibold group-hover:border-[#137A43]/30 transition-colors">
                Tier 1
              </span>
            </div>
            <div className="font-mono text-xs text-[#137A43] font-bold mb-2">3 – 9 Transactions</div>
            <p className="text-xs text-[#60605A] font-sans leading-relaxed">
              Demonstrated history of completed name registrations, tips, gifts, or secondary sales.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <div className="flex items-center justify-between mb-3">
              <span className="font-serif font-bold text-lg text-[#141413] group-hover:text-[#137A43] transition-colors">Verified</span>
              <span className="text-[11px] font-sans text-[#137A43] bg-[#E8F5E9] border border-[#137A43]/20 px-2.5 py-0.5 rounded-full font-bold group-hover:bg-[#137A43] group-hover:text-white transition-all">
                Tier 2
              </span>
            </div>
            <div className="font-mono text-xs text-[#137A43] font-bold mb-2">10 – 24 Transactions</div>
            <p className="text-xs text-[#60605A] font-sans leading-relaxed">
              Established on-chain reputation with consistent protocol usage and zero unresolved disputes.
            </p>
          </div>

          <div className="group cursor-pointer bg-white border border-[#137A43]/30 hover:border-[#137A43] hover:shadow-[0_16px_36px_rgba(19,122,67,0.15)] hover:-translate-y-2 rounded-2xl p-6 shadow-2xs transition-all duration-300 ease-out">
            <div className="flex items-center justify-between mb-3">
              <span className="font-serif font-bold text-lg text-[#0B4B27] group-hover:text-[#137A43] transition-colors">Elite</span>
              <span className="text-[11px] font-sans text-[#0B4B27] bg-[#DEF2E3] border border-[#137A43]/30 px-2.5 py-0.5 rounded-full font-bold group-hover:bg-[#137A43] group-hover:text-white transition-all">
                Tier 3
              </span>
            </div>
            <div className="font-mono text-xs text-[#137A43] font-bold mb-2">25+ Transactions</div>
            <p className="text-xs text-[#60605A] font-sans leading-relaxed">
              Veteran ecosystem participant with extensive completed transactions and continuous tenure.
            </p>
          </div>

        </div>

        {/* On-Chain Metrics Ledger */}
        <div className="bg-white border border-[#E5E5E2] rounded-2xl p-7 shadow-2xs">
          <h3 className="font-serif font-bold text-base text-[#141413] mb-4">
            Metrics Tracked by ANSReputation.sol
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-xs font-mono">
            <div className="group/metric p-3 bg-[#FBFBFA] border border-[#E5E5E2] hover:border-[#137A43]/40 hover:bg-white hover:-translate-y-0.5 rounded-xl transition-all cursor-default">
              <span className="text-gray-400 block mb-1">salesCompleted</span>
              <span className="font-bold text-gray-800 group-hover/metric:text-[#137A43] transition-colors">Marketplace Sales</span>
            </div>
            <div className="group/metric p-3 bg-[#FBFBFA] border border-[#E5E5E2] hover:border-[#137A43]/40 hover:bg-white hover:-translate-y-0.5 rounded-xl transition-all cursor-default">
              <span className="text-gray-400 block mb-1">purchasesCompleted</span>
              <span className="font-bold text-gray-800 group-hover/metric:text-[#137A43] transition-colors">Acquisitions</span>
            </div>
            <div className="group/metric p-3 bg-[#FBFBFA] border border-[#E5E5E2] hover:border-[#137A43]/40 hover:bg-white hover:-translate-y-0.5 rounded-xl transition-all cursor-default">
              <span className="text-gray-400 block mb-1">tipsGiftsGiven</span>
              <span className="font-bold text-gray-800 group-hover/metric:text-[#137A43] transition-colors">Tips & Gifts Sent</span>
            </div>
            <div className="group/metric p-3 bg-[#FBFBFA] border border-[#E5E5E2] hover:border-[#137A43]/40 hover:bg-white hover:-translate-y-0.5 rounded-xl transition-all cursor-default">
              <span className="text-gray-400 block mb-1">memberSince</span>
              <span className="font-bold text-gray-800 group-hover/metric:text-[#137A43] transition-colors">Initial Block Time</span>
            </div>
            <div className="group/metric p-3 bg-[#FBFBFA] border border-[#E5E5E2] hover:border-[#137A43]/40 hover:bg-white hover:-translate-y-0.5 rounded-xl transition-all cursor-default">
              <span className="text-gray-400 block mb-1">disputeFlags</span>
              <span className="font-bold text-gray-800 group-hover/metric:text-[#137A43] transition-colors">Dispute Flags (0)</span>
            </div>
          </div>
        </div>
      </section>

      {/* 9. SECTION 8: BUILT FOR ON-CHAIN IDENTITY (PASSKEYS & SMART ACCOUNTS) */}
      <section className="max-w-7xl mx-auto px-6 py-16 sm:py-24 border-b border-[#E5E5E2]">
        <div className="max-w-3xl mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-[#141413] tracking-tight leading-[1.15] mb-4">
            Engineered for modern Web3: Seedless, biometric, and secure.
          </h2>
          <p className="text-base sm:text-lg text-[#60605A] font-sans leading-relaxed">
            ANS is built natively on Arc Network with account abstraction, biometric passkeys, and cryptographic authorization standards.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-7 shadow-2xs flex flex-col justify-between transition-all duration-300 ease-out">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-6deg] transition-all duration-300 flex items-center justify-center mb-5 shadow-xs">
                <Fingerprint size={20} />
              </div>
              <h3 className="font-serif font-bold text-xl text-[#141413] group-hover:text-[#137A43] transition-colors mb-3">
                Circle Passkey Smart Accounts (ERC-4337)
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
                Create a modular smart account in seconds using FaceID, TouchID, or Windows Hello. Passkeys eliminate seed phrases, paper backups, and browser extension requirements for newcomers while retaining non-custodial cryptographic security.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-xs font-mono text-[#137A43] transition-colors">
              WebAuthn Biometric Standard
            </div>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-7 shadow-2xs flex flex-col justify-between transition-all duration-300 ease-out">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-6deg] transition-all duration-300 flex items-center justify-center mb-5 shadow-xs">
                <Wallet size={20} />
              </div>
              <h3 className="font-serif font-bold text-xl text-[#141413] group-hover:text-[#137A43] transition-colors mb-3">
                Universal Web3 Compatibility
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
                Prefer your existing Ethereum tooling? ANS natively supports MetaMask and all standard EIP-1193 injected browser providers on Arc Testnet (Chain ID 5042002), providing immediate compatibility for Web3 users.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-xs font-mono text-[#137A43] transition-colors">
              EIP-1193 & Wagmi v2 Compatible
            </div>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-7 shadow-2xs flex flex-col justify-between transition-all duration-300 ease-out">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-6deg] transition-all duration-300 flex items-center justify-center mb-5 shadow-xs">
                <Shield size={20} />
              </div>
              <h3 className="font-serif font-bold text-xl text-[#141413] group-hover:text-[#137A43] transition-colors mb-3">
                Cryptographically Authorized Profiles
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
                Off-chain profile metadata (bio, avatar, website, social handles) is secured with EIP-191 personal signatures and single-use server challenges, ensuring that only the verified private key holder can update their public identity card.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-xs font-mono text-[#137A43] transition-colors">
              Single-use challenge replay protection
            </div>
          </div>

          <div className="group cursor-pointer bg-white border border-[#E5E5E2] hover:border-[#137A43]/60 hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-2 rounded-2xl p-7 shadow-2xs flex flex-col justify-between transition-all duration-300 ease-out">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] text-[#137A43] group-hover:bg-[#137A43] group-hover:text-white group-hover:scale-110 group-hover:rotate-[-6deg] transition-all duration-300 flex items-center justify-center mb-5 shadow-xs">
                <CreditCard size={20} />
              </div>
              <h3 className="font-serif font-bold text-xl text-[#141413] group-hover:text-[#137A43] transition-colors mb-3">
                Native USDC Settlement
              </h3>
              <p className="text-xs sm:text-sm text-[#60605A] font-sans leading-relaxed">
                All protocol fees, name registrations, renewals, tips, and marketplace purchases settle natively in 6-decimal USDC (0x3600...0000), protecting domain pricing from cryptocurrency price volatility.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#F0F0EE] group-hover:border-[#137A43]/20 text-xs font-mono text-[#137A43] transition-colors">
              Stable predictable pricing
            </div>
          </div>

        </div>
      </section>

      {/* 10. SECTION 9: GETTING STARTED & ONBOARDING */}
      <section className="max-w-7xl mx-auto px-6 py-16 sm:py-24">
        <div className="bg-[#141413] text-white rounded-3xl p-8 sm:p-14 relative overflow-hidden shadow-md">
          <div className="relative z-10 max-w-2xl mb-12">
            <h2 className="text-3xl sm:text-5xl font-serif text-white tracking-tight leading-[1.1] mb-4">
              Claim your sovereign .arc identity today.
            </h2>
            <p className="text-sm sm:text-base text-gray-300 font-sans leading-relaxed">
              Launch the ANS application to search for your name, authenticate with your biometric passkey, and secure your primary identity on Arc Network.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12 relative z-10">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="w-6 h-6 rounded-full bg-white/10 text-[#86EFAC] font-semibold text-xs flex items-center justify-center mb-2.5 font-sans">
                1
              </div>
              <h4 className="font-sans font-semibold text-sm text-white mb-1">Find your name</h4>
              <p className="text-xs text-gray-400 font-sans">Search availability and view character-tier pricing.</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="w-6 h-6 rounded-full bg-white/10 text-[#86EFAC] font-semibold text-xs flex items-center justify-center mb-2.5 font-sans">
                2
              </div>
              <h4 className="font-sans font-semibold text-sm text-white mb-1">Launch the app</h4>
              <p className="text-xs text-gray-400 font-sans">Open the application to connect your wallet or passkey.</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="w-6 h-6 rounded-full bg-white/10 text-[#86EFAC] font-semibold text-xs flex items-center justify-center mb-2.5 font-sans">
                3
              </div>
              <h4 className="font-sans font-semibold text-sm text-white mb-1">Sign & Register</h4>
              <p className="text-xs text-gray-400 font-sans">Choose 3 to 12 months duration and confirm in USDC.</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="w-6 h-6 rounded-full bg-white/10 text-[#86EFAC] font-semibold text-xs flex items-center justify-center mb-2.5 font-sans">
                4
              </div>
              <h4 className="font-sans font-semibold text-sm text-white mb-1">Set as Primary</h4>
              <p className="text-xs text-gray-400 font-sans">Bind your reverse lookup for universal Arc recognition.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 relative z-10">
            <button 
              onClick={onLaunchApp}
              className="w-full sm:w-auto bg-white text-[#141413] hover:bg-gray-100 px-8 py-3.5 rounded-full font-sans font-semibold text-sm shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Launch App</span>
              <ArrowRightIcon size={16} />
            </button>
            <button 
              onClick={scrollToSearch}
              className="w-full sm:w-auto bg-transparent border border-white/20 text-white hover:bg-white/10 px-8 py-3.5 rounded-full font-sans font-medium text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Search Available Names</span>
            </button>
          </div>
        </div>
      </section>

      {/* 11. STANDALONE LANDING FOOTER */}
      <footer className="w-full border-t border-[#E5E5E2] bg-[#FBFBFA] py-14 px-6 sm:px-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div>
            <div 
              className="cursor-pointer select-none hover:opacity-90 transition-opacity mb-3"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <ANSLogo />
            </div>
            <p className="text-xs text-[#60605A] font-sans max-w-md leading-relaxed">
              Arc Name Service (ANS). Sovereign decentralized naming and identity layer for Arc Network.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#60605A]">
            <a 
              href="https://github.com/Nimona22/ANS" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-[#137A43] transition-colors underline underline-offset-2 flex items-center gap-1.5"
            >
              <span>GitHub Repo</span>
              <ArrowUpRight size={12} />
            </a>
            <span className="text-gray-300">•</span>
            <a 
              href="https://x.com/Nimox219" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-[#137A43] transition-colors underline underline-offset-2 flex items-center gap-1.5"
            >
              <span>X Account</span>
              <ArrowUpRight size={12} />
            </a>
            <span className="text-gray-300">•</span>
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:text-[#141413] transition-colors"
            >
              Back to Top ↑
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-[#E5E5E2] flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] font-sans text-gray-400">
          <p>© 2026 Arc Name Service. Independent protocol deployed on Arc Testnet.</p>
          <p>Not affiliated with or endorsed by Arc Network or Circle.</p>
        </div>
      </footer>

    </div>
  );
};

const NamesAppView = ({ 
  navigateToProfile, 
  auth, 
  ans,
  initialSearchName = null,
  navigateTo,
}: { 
  navigateToProfile: (name: string) => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
  initialSearchName?: string | null;
  navigateTo?: (view: string, arg?: string | null) => void;
}) => {
  const [recentNames, setRecentNames] = useState<string[]>(() => {
    try {
      localStorage.removeItem('ans_recent_registered');
      localStorage.removeItem('ans_global_activities');
    } catch {}
    return getRecentlyRegisteredNames();
  });

  useEffect(() => {
    let cancelled = false;
    const updateRecent = async () => {
      try {
        await syncRecentRegisteredNamesFromLogs();
      } catch {}
      const candidates = getRecentlyRegisteredNames();
      const verified: string[] = [];
      for (const item of candidates) {
        try {
          const rec = await fallbackPublicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getNameRecord',
            args: [cleanName(item)],
          });
          if (rec && rec.owner !== '0x0000000000000000000000000000000000000000') {
            const formatted = item.endsWith('.arc') ? item : `${item}.arc`;
            if (!verified.includes(formatted)) {
              verified.push(formatted);
            }
          }
        } catch {
          // If unconfirmed or RPC error on fresh contract, do not inject legacy unverified names
        }
      }
      if (!cancelled) {
        setRecentNames(verified);
      }
    };

    updateRecent();

    const onUpdate = () => {
      updateRecent();
    };

    window.addEventListener('ans_recent_registered_updated', onUpdate);
    window.addEventListener('ans_activity_updated', onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('ans_recent_registered_updated', onUpdate);
      window.removeEventListener('ans_activity_updated', onUpdate);
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto pt-14 pb-32 px-6">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-gray-900 mb-4 tracking-tight">
          Find your .arc name
        </h1>
        <p className="text-gray-500 font-sans text-base max-w-md mx-auto">
          Search for an available name or explore existing identities on Arc Network.
        </p>
      </div>

      <InteractiveSearch 
        navigateToProfile={navigateToProfile} 
        autoFocus 
        auth={auth} 
        ans={ans} 
        initialQuery={initialSearchName || ''} 
        navigateTo={navigateTo}
      />
      
      <div className="mt-16 pt-12 border-t border-[#E5E5E2]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-2">
          <div>
            <h3 className="text-xl font-serif font-bold text-gray-900 flex items-center gap-2">
              <Clock size={18} className="text-[#137A43]" /> Recently Registered Identities
            </h3>
            <p className="text-xs text-gray-500 font-sans mt-0.5">
              {recentNames.length > 0 
                ? 'Real identities resolved directly from the ArcNameService smart contract ledger' 
                : 'Real-time ledger stream active • Waiting for newly registered identities on Arc Network'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E8F5E9] border border-[#137A43]/20 text-[10px] font-mono font-medium text-[#137A43]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#137A43] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#137A43]"></span>
              </span>
              {recentNames.length > 0 ? 'On-chain ledger' : 'Listening for registrations'}
            </span>
          </div>
        </div>

        {/* Snake Motion Stream Container - always running smoothly */}
        <div className="relative w-full overflow-hidden rounded-2xl bg-white border border-[#E5E5E2] py-4 shadow-xs">
          {/* Left and Right Fade Gradients */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white to-transparent z-10" />

          {recentNames.length > 0 ? (
            /* Snake Moving Line Track with real registered names */
            <div className="animate-snake-line flex items-center gap-4 px-4 cursor-pointer">
              {[...recentNames, ...recentNames, ...recentNames, ...recentNames].map((s, idx) => (
                <div 
                  key={`${s}-${idx}`} 
                  onClick={() => navigateToProfile(s)}
                  title={`View ${s} on-chain profile`}
                  className="shrink-0 bg-[#FBFBFA] hover:bg-[#F0FDF4] border border-[#E5E5E2] hover:border-[#137A43]/50 px-4 py-3 rounded-xl flex items-center gap-3 transition-all group shadow-2xs hover:shadow-sm"
                >
                  <div className="w-2 h-2 rounded-full bg-[#137A43] shrink-0" />
                  <div>
                    <span className="font-mono font-bold text-sm text-gray-900 group-hover:text-[#137A43] transition-colors block">
                      {s}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400 group-hover:text-gray-600 block">
                      Registered on Arc
                    </span>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-white border border-[#E5E5E2] group-hover:border-[#137A43]/30 flex items-center justify-center transition-colors shrink-0">
                    <ArrowRightIcon size={11} className="text-gray-400 group-hover:text-[#137A43] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Animated Waiting Stream without any fake or unregistered names */
            <div className="animate-snake-line flex items-center gap-6 py-1 px-4 select-none">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="flex items-center gap-6 shrink-0">
                  <div className="flex items-center gap-2.5 font-mono text-xs text-gray-600 bg-[#FBFBFA] border border-[#E5E5E2] px-4 py-2.5 rounded-xl shadow-2xs">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#137A43] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#137A43]"></span>
                    </span>
                    <span className="text-gray-900 font-medium">Awaiting first on-chain registration</span>
                    <span className="text-gray-300">•</span>
                    <span className="text-gray-500">Contract 0x50f7...9931</span>
                  </div>
                  <div className="flex items-center gap-2.5 font-mono text-xs text-gray-600 bg-[#FBFBFA] border border-[#E5E5E2] px-4 py-2.5 rounded-xl shadow-2xs">
                    <Activity size={13} className="text-[#137A43] animate-pulse shrink-0" />
                    <span className="text-gray-900 font-medium">Live ledger listener active</span>
                    <span className="text-gray-300">•</span>
                    <span className="text-[#137A43] font-medium">Arc Testnet (Chain 5042002)</span>
                  </div>
                  <div className="flex items-center gap-2.5 font-mono text-xs text-gray-600 bg-[#FBFBFA] border border-[#E5E5E2] px-4 py-2.5 rounded-xl shadow-2xs">
                    <Zap size={13} className="text-amber-500 shrink-0" />
                    <span className="text-gray-900 font-medium">Mint stream standby</span>
                    <span className="text-gray-300">•</span>
                    <span className="text-gray-500">Will stream live when names are minted</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MarketplaceSellerBadge = ({
  sellerAddress,
  navigateTo,
}: {
  sellerAddress: string;
  navigateTo: (view: string, data?: string | null) => void;
}) => {
  const { profile } = useUserProfile(sellerAddress);
  const { resolvedName } = useReverseResolve(sellerAddress);
  const reverseName = resolvedName || getCachedReverseName(sellerAddress);

  // Point 6: Show profile saved name AND main .arc name
  let displayLabel = '';
  if (profile.displayName && reverseName) {
    const cleanProfile = profile.displayName.trim();
    const cleanRev = reverseName.trim();
    if (cleanProfile.toLowerCase() === cleanRev.toLowerCase() || `${cleanProfile.toLowerCase()}.arc` === cleanRev.toLowerCase()) {
      displayLabel = cleanRev;
    } else {
      displayLabel = `${cleanProfile} (@${cleanRev})`;
    }
  } else if (profile.displayName) {
    displayLabel = profile.displayName;
  } else if (reverseName) {
    displayLabel = reverseName;
  } else {
    displayLabel = sellerAddress.startsWith('0x') ? `${sellerAddress.slice(0, 6)}...${sellerAddress.slice(-4)}` : sellerAddress;
  }

  return (
    <div className="text-right">
      <p className="text-gray-500 text-xs font-sans mb-1">Seller</p>
      <button 
        onClick={() => navigateTo('userprofile', sellerAddress)}
        className="text-xs font-mono text-gray-800 hover:text-gray-900 bg-[#F5F5F3] hover:bg-[#EAEAE7] border border-[#E5E5E2] px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ml-auto shadow-[0_1px_1px_rgba(0,0,0,0.02)] cursor-pointer"
        title={`View ${displayLabel} profile`}
      >
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
        ) : (
          <User size={11} className="text-gray-400 shrink-0" />
        )}
        <span className="font-semibold truncate max-w-[180px]">{displayLabel}</span>
      </button>
    </div>
  );
};

const TipRecipientProfileBadge = ({ resolvedAddress }: { resolvedAddress: string }) => {
  const { profile: resolvedProfile } = useUserProfile(resolvedAddress);
  if (!resolvedProfile.displayName) return null;
  return (
    <div className="mt-2.5 flex items-center gap-2 text-xs text-gray-700 bg-white border border-[#E5E5E2] px-3.5 py-1.5 rounded-full w-fit shadow-2xs">
      {resolvedProfile.avatarUrl && (
        <img src={resolvedProfile.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
      )}
      <span className="font-sans font-bold text-gray-900">{resolvedProfile.displayName}</span>
      <ReputationBadge name={resolvedAddress} showDetails={false} />
    </div>
  );
};

const OwnerProfileSnippet = ({ 
  ownerStr, 
  navigateTo 
}: { 
  ownerStr: string; 
  navigateTo: (view: string, data?: string | null) => void;
}) => {
  const { profile: ownerProfile } = useUserProfile(ownerStr);
  if (!ownerProfile.displayName && !ownerProfile.bio && !ownerProfile.avatarUrl) return null;
  return (
    <div className="mt-4 p-4 bg-[#FBFBFA] border border-[#E5E5E2] rounded-2xl flex items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-white border border-[#E5E5E2] flex items-center justify-center text-gray-900 font-serif font-bold text-sm shrink-0 shadow-sm overflow-hidden">
        {ownerProfile.avatarUrl ? (
          <img src={ownerProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          ownerProfile.avatar?.trim() || (ownerProfile.displayName ? ownerProfile.displayName.slice(0, 2).toUpperCase() : ownerStr.slice(0, 4))
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-serif font-bold text-sm text-gray-900 truncate">{ownerProfile.displayName || 'Owner Profile'}</span>
          <ReputationBadge name={ownerStr} showDetails={false} />
        </div>
        {ownerProfile.bio && <p className="text-gray-600 font-sans text-xs line-clamp-2 leading-relaxed">{ownerProfile.bio}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
          {ownerProfile.twitter && (
            <a href={`https://x.com/${ownerProfile.twitter}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors font-medium">
              <XIcon size={11} className="text-gray-900" /><span>@{ownerProfile.twitter}</span>
            </a>
          )}
          {ownerProfile.github && (
            <a href={`https://github.com/${ownerProfile.github}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors font-medium">
              <GithubIcon size={12} className="text-gray-900" /><span>{ownerProfile.github}</span>
            </a>
          )}
          {ownerProfile.telegram && (
            <a href={`https://t.me/${ownerProfile.telegram}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors font-medium">
              <TelegramIcon size={12} className="text-[#229ED9]" /><span>{ownerProfile.telegram}</span>
            </a>
          )}
          {ownerProfile.discord && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 font-medium">
              <DiscordIcon size={12} className="text-[#5865F2]" /><span>{ownerProfile.discord}</span>
            </span>
          )}
          {ownerProfile.location && <span className="flex items-center gap-1 text-gray-500"><MapPin size={11} />{ownerProfile.location}</span>}
          {ownerProfile.website && (
            <a href={ownerProfile.website.startsWith('http') ? ownerProfile.website : `https://${ownerProfile.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#137A43] hover:underline font-medium">
              <Globe size={11} /><span>{ownerProfile.website.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const MarketplaceView = ({ 
  navigateToProfile, 
  auth, 
  ans,
  navigateTo,
  handleListForSale,
}: { 
  navigateToProfile: (name: string) => void; 
  auth: AuthState; 
  ans: ReturnType<typeof useANS>;
  navigateTo: (view: string, data?: string | null) => void;
  handleListForSale?: (name: string) => void;
}) => {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'price-asc' | 'price-desc' | 'recent' | 'name-asc'>('price-asc');
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [purchasedListing, setPurchasedListing] = useState<MarketplaceListing | null>(null);
  const [txState, setTxState] = useState('idle');

  // Point 8: Reset txState to 'idle' whenever selectedListing changes or is closed
  useEffect(() => {
    setTxState('idle');
  }, [selectedListing?.name]);
  const [listings, setListings] = useState<MarketplaceListing[]>(() => getCachedActiveListings());
  const [soldListings, setSoldListings] = useState<SoldListing[]>(() => getSoldListings());
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('ans_marketplace_checked')) return false;
    return getCachedActiveListings().length === 0;
  });
  const [updatePriceModal, setUpdatePriceModal] = useState<{
    isOpen: boolean;
    name: string;
    price: string;
    pending: boolean;
  }>({
    isOpen: false,
    name: '',
    price: '',
    pending: false,
  });
  const [quickListModalOpen, setQuickListModalOpen] = useState(false);

  const activeListingNames = useMemo(() => new Set(listings.map(l => cleanName(l.name))), [listings]);
  const visibleSoldListings = useMemo(() => {
    return soldListings.filter(s => !activeListingNames.has(cleanName(s.name)));
  }, [soldListings, activeListingNames]);

  const loadListings = useCallback(async () => {
    // Only display full loading spinner if cache is completely empty and not yet checked this session
    if (getCachedActiveListings().length === 0 && (typeof window === 'undefined' || !sessionStorage.getItem('ans_marketplace_checked'))) {
      setIsLoading(true);
    }
    try {
      const userOwned = auth.address ? getCachedOwnedNames(auth.address) : [];
      const active = await fetchActiveListings(fallbackPublicClient, userOwned);
      const toSet = active.length > 0 ? active : getCachedActiveListings();
      setListings(toSet);
      const sold = await syncSoldListingsFromLogs(toSet);
      setSoldListings(sold.length > 0 ? sold : getSoldListings());
    } catch (err) {
      console.warn('Failed to load active marketplace listings:', err);
      const fallback = getCachedActiveListings();
      setListings(fallback);
      syncSoldListingsFromLogs(fallback).then(s => setSoldListings(s.length > 0 ? s : getSoldListings())).catch(() => {});
    } finally {
      if (typeof window !== 'undefined') sessionStorage.setItem('ans_marketplace_checked', 'true');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadListings();
    setSoldListings(getSoldListings());
    const handleUpdate = () => {
      loadListings();
      setSoldListings(getSoldListings());
    };
    window.addEventListener('ans_marketplace_updated', handleUpdate);
    const unsubscribeRealtime = subscribeToMarketplaceRealtime(() => {
      loadListings();
    });
    return () => {
      window.removeEventListener('ans_marketplace_updated', handleUpdate);
      unsubscribeRealtime();
    };
  }, [loadListings]);

  const filtered = useMemo(() => {
    return listings.filter(l => {
      const len = l.name.replace('.arc', '').length;
      if (filter === '3') return len === 3;
      if (filter === '4') return len === 4;
      if (filter === '5+') return len >= 5;
      return true;
    });
  }, [listings, filter]);

  const sortedListings = useMemo(() => {
    const list = [...filtered];
    if (sortBy === 'price-asc') {
      return list.sort((a, b) => a.price - b.price);
    }
    if (sortBy === 'price-desc') {
      return list.sort((a, b) => b.price - a.price);
    }
    if (sortBy === 'name-asc') {
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortBy === 'recent') {
      return list.reverse();
    }
    return list;
  }, [filtered, sortBy]);

  const handleBuy = async (listingItem: MarketplaceListing) => {
    if (!auth.isConnected) {
      toast.info('Connecting with Passkey...');
      await auth.signIn();
      return;
    }

    try {
      setTxState('approving');
      const hash = await ans.buyName(listingItem.name, listingItem.price.toString(), (step) => {
        if (step === 'approving') setTxState('approving');
        else if (step === 'buying') setTxState('purchasing');
      });
      setTxState('success');
      setPurchasedListing(listingItem);
      recordActivity({
        name: listingItem.name,
        action: 'Bought Name',
        amount: `${listingItem.price} USDC`,
        from: listingItem.seller,
        to: auth.address || '',
        timestamp: Date.now(),
        txHash: hash,
      });
      removeTrackedListing(listingItem.name);
      recordSoldListing({
        name: listingItem.name,
        seller: listingItem.seller,
        buyer: auth.address || '',
        price: listingItem.price,
        timestamp: Date.now(),
        txHash: hash,
      });
      syncListingToSupabase({
        name: listingItem.name,
        seller: listingItem.seller,
        buyer: auth.address || '',
        price: listingItem.price,
        is_active: false,
        txHash: hash,
      }).catch(() => {});
      setListings(prev => prev.filter(l => cleanName(l.name) !== cleanName(listingItem.name)));
      const sellerLabel = getCachedReverseName(listingItem.seller) || (listingItem.seller.startsWith('0x') ? `${listingItem.seller.slice(0, 6)}...${listingItem.seller.slice(-4)}` : listingItem.seller);
      const buyerLabel = (auth.address && getCachedReverseName(auth.address)) || (auth.address ? `${auth.address.slice(0, 6)}...${auth.address.slice(-4)}` : 'a buyer');
      const nowStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

      addClientNotification(auth.address, {
        kind: 'name_bought',
        title: `Identity Acquired: ${listingItem.name}`,
        body: `You successfully purchased ${listingItem.name} from ${sellerLabel} for ${listingItem.price} USDC on ${nowStr}.`,
        tx_hash: hash,
        link: `profile:${listingItem.name}`,
      });
      if (listingItem.seller && listingItem.seller.startsWith('0x')) {
        addClientNotification(listingItem.seller, {
          kind: 'name_sold',
          title: `Identity Sold: ${listingItem.name}`,
          body: `Your identity ${listingItem.name} was purchased by ${buyerLabel} for ${listingItem.price} USDC on ${nowStr}.`,
          tx_hash: hash,
          link: `userprofile:${auth.address}`,
        });
      }
      toast.success(`Done! Purchased ${listingItem.name} successfully! Tx: ${hash.slice(0, 10)}...`);
    } catch (err: any) {
      setTxState('idle');
      const friendlyMsg = humanizeWeb3Error(err);
      addClientNotification(auth.address, {
        kind: 'tx_failed',
        title: `Purchase Failed: ${listingItem.name}`,
        body: friendlyMsg,
        link: 'marketplace',
      });
      toast.error(friendlyMsg);
    }
  };

  const handleCancelListing = async (name: string) => {
    try {
      toast.loading(`Cancelling listing for ${name}...`, { id: `cancel-${name}` });
      await ans.cancelListing(name);
      removeTrackedListing(name);
      syncListingToSupabase({
        name,
        seller: auth.address || '',
        price: 0,
        is_active: false,
      }).catch(() => {});
      setListings(prev => prev.filter(l => cleanName(l.name) !== cleanName(name)));
      addClientNotification(auth.address, {
        kind: 'tx_success',
        title: `Listing Cancelled: ${name}`,
        body: `Successfully removed ${name} from marketplace escrow.`,
        link: 'marketplace',
      });
      toast.success(`${name} listing cancelled!`, { id: `cancel-${name}` });
    } catch (err: any) {
      const friendlyMsg = humanizeWeb3Error(err);
      addClientNotification(auth.address, {
        kind: 'tx_failed',
        title: `Cancel Listing Failed: ${name}`,
        body: friendlyMsg,
        link: 'marketplace',
      });
      toast.error(friendlyMsg, { id: `cancel-${name}` });
    }
  };

  const submitUpdatePrice = async () => {
    const { name, price } = updatePriceModal;
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      toast.error('Please enter a valid positive price');
      return;
    }
    setUpdatePriceModal(prev => ({ ...prev, pending: true }));
    try {
      toast.loading(`Updating price for ${name}...`, { id: `update-${name}` });
      await ans.listForSale(name, price);
      setListings(prev =>
        prev.map(l =>
          cleanName(l.name) === cleanName(name)
            ? { ...l, price: Number(price) }
            : l
        )
      );
      recordActivity({
        name,
        action: 'Listed for Sale',
        amount: `${price} USDC`,
        from: auth.address || 'Seller',
        timestamp: Date.now(),
      });
      addClientNotification(auth.address, {
        kind: 'tx_success',
        title: `Price Updated: ${name}`,
        body: `Listing price updated to ${price} USDC.`,
        link: 'marketplace',
      });
      toast.success(`Done! Price updated to ${price} USDC!`, { id: `update-${name}` });
      setUpdatePriceModal({ isOpen: false, name: '', price: '', pending: false });
    } catch (err: any) {
      const friendlyMsg = humanizeWeb3Error(err);
      addClientNotification(auth.address, {
        kind: 'tx_failed',
        title: `Update Price Failed: ${name}`,
        body: friendlyMsg,
        link: 'marketplace',
      });
      toast.error(friendlyMsg, { id: `update-${name}` });
      setUpdatePriceModal(prev => ({ ...prev, pending: false }));
    }
  };

  const calculateFees = (price: number) => {
    const p = price;
    const fee = p * 0.025;
    return {
      price: p.toFixed(2),
      fee: fee.toFixed(2),
      total: p.toFixed(2),
      sellerReceives: (p - fee).toFixed(2)
    };
  };

  return (
    <div className="max-w-7xl mx-auto pt-14 pb-32 px-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6 border-b border-[#E5E5E2] pb-8">
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-900 tracking-tight">Marketplace</h1>
          <p className="text-gray-500 font-sans text-base mt-1">Discover, verify, and acquire registered .arc identities via atomic escrow.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {['all', '3', '4', '5+', 'sold'].map(f => (
              <button 
                key={f}
                className={`px-4 py-2 text-xs font-mono font-medium rounded-full transition-all border ${filter === f ? 'bg-[#141413] text-white border-[#141413] shadow-sm' : 'bg-white text-gray-700 border-[#E5E5E2] hover:border-[#137A43] hover:text-[#137A43]'}`}
                onClick={() => {
                  setFilter(f);
                  setSelectedListing(null);
                }}
              >
                {f === 'all' ? 'All Names' : f === 'sold' ? 'Sold Out' : `${f} Letters`}
              </button>
            ))}
          </div>

          {filter !== 'sold' && (
            <div className="flex items-center gap-2 border border-[#E5E5E2] bg-white rounded-full px-3.5 py-2 shadow-2xs">
              <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider font-semibold">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs font-mono font-semibold text-gray-800 focus:outline-none cursor-pointer pr-1"
                aria-label="Sort marketplace listings by price"
              >
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="recent">Recently Listed</option>
                <option value="name-asc">Alphabetical: A to Z</option>
              </select>
            </div>
          )}

          <button
            onClick={() => {
              if (!auth.isConnected) {
                toast.info('Please connect your wallet to list a name');
                auth.signIn();
                return;
              }
              setQuickListModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#137A43] hover:bg-[#0f6035] text-white rounded-full text-xs font-mono font-semibold transition-all shadow-sm cursor-pointer active:scale-95 shrink-0"
            title="List one of your registered .arc names for sale in atomic escrow"
          >
            <Tag size={13} />
            <span>+ List a Name</span>
          </button>
        </div>
      </div>

      {filter === 'sold' ? (
        visibleSoldListings.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-[#E5E5E2]">
            <div className="w-14 h-14 rounded-full bg-[#FBFBFA] border border-[#E5E5E2] flex items-center justify-center mx-auto mb-4 text-gray-400 shadow-sm">
              <Store size={24} />
            </div>
            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">No Sold Out Identities Yet</h3>
            <p className="text-gray-500 font-sans text-sm max-w-md mx-auto mb-8 leading-relaxed">
              When marketplace listings are acquired via atomic escrow, their transaction stories and settlement records appear here transparently.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {visibleSoldListings.map(item => (
              <Card key={`${item.name}-${item.timestamp}`} className="border-[#E5E5E2] bg-white shadow-sm flex flex-col p-6 hover:border-[#137A43] hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-1.5 transition-all duration-300 ease-out group">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 
                      className="text-2xl font-serif font-bold text-gray-900 cursor-pointer hover:text-[#137A43] transition-colors tracking-tight"
                      onClick={() => navigateToProfile(item.name)}
                    >
                      {item.name}
                    </h3>
                    <p className="text-[10px] font-mono text-gray-400 mt-0.5">
                      {formatRelativeTime(item.timestamp)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#141413] text-white rounded-full text-[10px] font-mono font-bold uppercase tracking-wider group-hover:bg-[#137A43] transition-colors">
                    <Check size={10} className="text-[#86EFAC]" /> Sold Out
                  </span>
                </div>

                <div className="mb-6 p-3.5 bg-[#FBFBFA] border border-[#E5E5E2] rounded-xl space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-mono text-gray-400">Sold Price:</span>
                    <span className="font-mono font-bold text-gray-900">{item.price} USDC</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-mono text-gray-400">Seller:</span>
                    {item.seller && item.seller.startsWith('0x') ? (
                      <AddressDisplay address={item.seller} linkToProfile onNavigate={navigateTo} />
                    ) : (
                      <span className="font-mono text-gray-700">Escrow</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-mono text-gray-400">Buyer:</span>
                    {item.buyer && item.buyer.startsWith('0x') ? (
                      <AddressDisplay address={item.buyer} linkToProfile onNavigate={navigateTo} />
                    ) : (
                      <span className="font-mono text-gray-700">On-Chain</span>
                    )}
                  </div>
                </div>

                <div className="mt-auto pt-3 border-t border-[#E5E5E2] flex items-center justify-between">
                  <span className="text-[11px] font-sans text-gray-500 flex items-center gap-1">
                    <Shield size={12} className="text-[#137A43]" /> Escrow Settled
                  </span>
                  <Button 
                    variant="secondary" 
                    className="text-xs font-mono py-1.5 px-3"
                    onClick={() => navigateToProfile(item.name)}
                  >
                    View Identity
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : isLoading ? (
        <div className="text-center py-20 text-gray-400">
          <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-gray-400" />
          <p className="font-mono text-xs text-gray-500">Querying on-chain escrow listings on Arc Testnet...</p>
        </div>
      ) : sortedListings.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-[#E5E5E2]">
          <div className="w-14 h-14 rounded-full bg-[#FBFBFA] border border-[#E5E5E2] flex items-center justify-center mx-auto mb-4 text-gray-400 shadow-sm">
            <Store size={24} />
          </div>
          <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">
            {filter === 'all' ? 'No Active Marketplace Listings' : `No Active ${filter === '5+' ? '5+ Letter' : `${filter}-Letter`} Listings`}
          </h3>
          <p className="text-gray-500 font-sans text-sm max-w-md mx-auto mb-8 leading-relaxed">
            {filter === 'all'
              ? 'There are currently no .arc names listed for sale on the secondary market. Anyone who owns an identity can list their name directly through the My Names dashboard.'
              : `There are currently no ${filter === '5+' ? '5+ character' : `${filter}-character`} names listed for sale. Switch back to All Names to view available listings.`}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {filter !== 'all' ? (
              <Button variant="primary" onClick={() => setFilter('all')} className="text-xs font-mono font-semibold px-5 py-2.5">
                View All Names
              </Button>
            ) : (
              <>
                <Button variant="primary" onClick={() => navigateTo('mynames')} className="text-xs font-mono font-semibold px-5 py-2.5">
                  List from My Names
                </Button>
                <Button variant="secondary" onClick={() => navigateTo('names')} className="text-xs font-mono font-semibold px-5 py-2.5">
                  Register a Name
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
          {sortedListings.map(listing => {
            const isOwnListing = !!(auth.address && listing.seller.toLowerCase() === auth.address.toLowerCase());
            const msLeft = (listing.expiry || (Date.now() + 90 * 24 * 3600 * 1000)) - Date.now();
            const days = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
            const months = Math.round(days / 30.44);
            const leaseLabel = months > 0 ? `~${months}mo lease` : `~${days}d lease`;
            const tierLabel = cleanName(listing.name).length <= 3 ? '3-Char' : cleanName(listing.name).length === 4 ? '4-Char' : '5+ Char';

            return (
              <Card key={listing.name} className="group border-[#E5E5E2] bg-white shadow-sm flex flex-col p-6 hover:border-[#137A43] hover:shadow-[0_16px_36px_rgba(19,122,67,0.12)] hover:-translate-y-1.5 transition-all duration-300 ease-out">
                <div className="flex justify-between items-start mb-6">
                  <h3 
                    className="text-2xl font-serif font-bold text-gray-900 cursor-pointer hover:text-[#137A43] transition-colors tracking-tight truncate max-w-[170px]" 
                    onClick={() => navigateToProfile(listing.name)}
                    title={`View profile for ${listing.name}`}
                  >
                    {listing.name}
                  </h3>
                  <ReputationBadge name={listing.seller} showDetails={false} />
                </div>

                <div className="mb-5 flex justify-between items-end">
                  <div>
                    <p className="text-gray-500 text-xs font-sans mb-1">Asking price</p>
                    <p className="text-2xl font-mono text-gray-900 font-bold tabular-nums">
                      {listing.price} <span className="text-xs font-mono text-gray-500 font-normal">USDC</span>
                    </p>
                  </div>
                  <MarketplaceSellerBadge sellerAddress={listing.seller} navigateTo={navigateTo} />
                </div>

                {/* Quick Identity Spec Chips */}
                <div className="flex flex-wrap items-center gap-1.5 mb-6">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FBFBFA] border border-[#E5E5E2] text-[11px] font-mono text-gray-600">
                    <Clock size={11} className="text-[#137A43]" />
                    <span>{leaseLabel}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FBFBFA] border border-[#E5E5E2] text-[11px] font-mono text-gray-600">
                    <Shield size={11} className="text-[#137A43]" />
                    <span>{tierLabel}</span>
                  </span>
                </div>
                
                {isOwnListing ? (
                  <div className="mt-auto pt-4 border-t border-[#E5E5E2] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-semibold text-[#137A43] bg-[#E8F5E9] px-2.5 py-1 rounded-full border border-[#137A43]/20 whitespace-nowrap">
                        Your Listing
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <Button 
                        variant="secondary" 
                        className="text-xs font-mono py-2 px-2 w-full justify-center"
                        onClick={() => setUpdatePriceModal({
                          isOpen: true,
                          name: listing.name,
                          price: listing.price.toString(),
                          pending: false,
                        })}
                      >
                        Update Price
                      </Button>
                      <Button 
                        variant="danger" 
                        className="text-xs font-mono py-2 px-2 w-full justify-center"
                        onClick={() => handleCancelListing(listing.name)}
                      >
                        Cancel Listing
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-auto pt-4 border-t border-[#E5E5E2]">
                    <Button 
                      variant="primary" 
                      className="w-full text-xs font-sans font-medium py-2.5 cursor-pointer flex items-center justify-center gap-2" 
                      onClick={() => {
                        setSelectedListing(listing);
                        setTxState('idle');
                      }}
                    >
                      <ShoppingCart size={13} />
                      <span>Buy Name</span>
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Dedicated Buy & Escrow Settlement Modal */}
      {selectedListing && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => { setSelectedListing(null); setTxState('idle'); }}
        >
          <div 
            className="bg-white border border-[#E5E5E2] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#137A43] font-bold block mb-1">
                  Atomic Escrow Checkout
                </span>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 tracking-tight">
                    {selectedListing.name}
                  </h2>
                  <ReputationBadge name={selectedListing.seller} showDetails={false} />
                </div>
              </div>
              <button 
                onClick={() => { setSelectedListing(null); setTxState('idle'); }}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {txState === 'success' ? (
              <div className="text-center py-6 bg-[#E8F5E9]/50 border border-[#137A43]/20 rounded-2xl p-6 text-[#137A43] space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#E8F5E9] text-[#137A43] flex items-center justify-center mx-auto border border-[#137A43]/30 shadow-xs">
                  <CheckCircle2 size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-xl text-gray-900">Purchase Confirmed!</h3>
                  <p className="text-xs font-sans text-gray-600 mt-1 max-w-sm mx-auto">
                    Ownership of <span className="font-mono font-bold text-gray-900">{selectedListing.name}</span> has been transferred to your smart account on Arc Testnet.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                  <Button
                    variant="accent"
                    onClick={() => {
                      const item = selectedListing;
                      setSelectedListing(null);
                      setPurchasedListing(item);
                    }}
                    className="text-xs font-mono font-semibold py-2 px-4 w-full sm:w-auto"
                  >
                    View Identity Card →
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedListing(null);
                      setTxState('idle');
                      navigateTo('mynames');
                    }}
                    className="text-xs font-mono py-2 px-4 w-full sm:w-auto"
                  >
                    Go to My Names
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Seller & Identity Spec Card */}
                <div className="p-4 bg-[#FBFBFA] border border-[#E5E5E2] rounded-2xl mb-5 space-y-3">
                  <div className="flex justify-between items-center text-xs pb-3 border-b border-[#E5E5E2]">
                    <span className="text-gray-500 font-sans">Seller Identity:</span>
                    <MarketplaceSellerBadge sellerAddress={selectedListing.seller} navigateTo={navigateTo} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs font-mono">
                    <div className="bg-white p-2.5 rounded-xl border border-[#E5E5E2]">
                      <div className="flex items-center gap-1.5 text-gray-500 text-[11px] mb-1">
                        <Clock size={12} className="text-[#137A43]" /> Expiry Date
                      </div>
                      <div className="font-semibold text-gray-900">
                        {new Date(selectedListing.expiry || (Date.now() + 90 * 24 * 3600 * 1000)).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-[#E5E5E2]">
                      <div className="flex items-center gap-1.5 text-gray-500 text-[11px] mb-1">
                        <Zap size={12} className="text-amber-500" /> Remaining Lease
                      </div>
                      <div className="font-semibold text-[#137A43]">
                        {(() => {
                          const msLeft = (selectedListing.expiry || (Date.now() + 90 * 24 * 3600 * 1000)) - Date.now();
                          const days = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
                          const months = Math.round(days / 30.44);
                          return months > 0 ? `~${months} Month${months > 1 ? 's' : ''} left` : `~${days} Days left`;
                        })()}
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-[#E5E5E2]">
                      <div className="flex items-center gap-1.5 text-gray-500 text-[11px] mb-1">
                        <Shield size={12} className="text-[#137A43]" /> Tier
                      </div>
                      <div className="font-semibold text-gray-900">
                        {cleanName(selectedListing.name).length <= 3 ? '3-Char Premium' : cleanName(selectedListing.name).length === 4 ? '4-Char Standard' : '5+ Char Standard'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pricing & Escrow Settlement Breakdown */}
                <div className="bg-[#FBFBFA] border border-[#E5E5E2] rounded-2xl p-4 mb-5 space-y-2 text-xs font-mono">
                  <div className="flex justify-between items-center text-gray-600">
                    <span className="text-gray-500">Asset Price</span>
                    <span className="text-gray-900 font-medium tabular-nums">{calculateFees(selectedListing.price).price} USDC</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-600">
                    <span className="text-gray-500">Protocol Escrow Fee (2.5%)</span>
                    <span className="text-gray-500 tabular-nums">{calculateFees(selectedListing.price).fee} USDC</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-900 pt-2 border-t border-[#E5E5E2] font-bold text-sm">
                    <span>Total Settlement</span>
                    <span className="text-[#137A43] tabular-nums font-bold text-base">{calculateFees(selectedListing.price).total} USDC</span>
                  </div>
                </div>

                {/* Atomic Escrow Guarantee Badge */}
                <div className="text-[11px] text-gray-600 font-mono mb-6 flex items-start gap-2 bg-[#E8F5E9]/50 p-3 rounded-xl border border-[#137A43]/20">
                  <ShieldCheck size={15} className="shrink-0 mt-0.5 text-[#137A43]" />
                  <span>Atomic escrow smart contract guarantees instant title transfer upon settlement on Arc Testnet. No counterparty risk.</span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <Button 
                    variant="secondary" 
                    className="flex-1 py-3 text-xs font-mono font-medium"
                    onClick={() => { setSelectedListing(null); setTxState('idle'); }}
                    disabled={txState !== 'idle'}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="accent" 
                    className="flex-[2] py-3 text-xs font-mono font-semibold"
                    onClick={() => handleBuy(selectedListing)} 
                    disabled={txState !== 'idle'}
                  >
                    {txState === 'idle' ? `Confirm Purchase (${selectedListing.price} USDC)` : txState === 'approving' ? 'Approving USDC...' : 'Executing Purchase...'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {purchasedListing && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setPurchasedListing(null)}
        >
          <div 
            className="bg-white border border-[#E5E5E2] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative animate-in zoom-in-95 duration-150 text-center bg-gradient-to-b from-[#E8F5E9]/50 via-white to-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-full bg-[#E8F5E9] text-[#137A43] flex items-center justify-center mx-auto mb-4 border border-[#137A43]/30 shadow-xs">
              <Check size={28} strokeWidth={2.5} />
            </div>

            <span className="text-[10px] font-mono uppercase tracking-widest text-[#137A43] font-bold block mb-1">
              Atomic Escrow Settled
            </span>
            <h3 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 mb-2">
              {purchasedListing.name} is Officially Yours!
            </h3>
            <p className="text-gray-600 font-sans text-xs sm:text-sm max-w-md mx-auto mb-6">
              Title transferred instantly to your smart account via atomic escrow on Arc Testnet.
            </p>

            {/* Celebratory Identity Badge Card (Peak-End Rule) */}
            <div className="bg-white border border-[#E5E5E2] rounded-2xl p-5 mb-6 text-left shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#E8F5E9] rounded-bl-full pointer-events-none opacity-60" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 font-semibold">Universal Identity</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#137A43] font-bold border border-[#137A43]/20">
                  Acquired · {purchasedListing.price} USDC
                </span>
              </div>
              <div className="text-2xl font-serif font-bold text-gray-900 mb-1">{purchasedListing.name}</div>
              <div className="text-xs font-mono text-gray-500 truncate">Owner: {auth.address || 'Smart Account'}</div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
              <button 
                onClick={() => {
                  const tweetText = encodeURIComponent(`I just secured my Web3 identity ${purchasedListing.name} on @ArcNetwork secondary marketplace! Settle payments & tips with zero gas using USDC.\n\nExplore on Arc:`);
                  const shareUrl = encodeURIComponent(typeof window !== 'undefined' ? `${window.location.origin}/app?view=profile&name=${purchasedListing.name}` : '');
                  window.open(`https://twitter.com/intent/tweet?text=${tweetText}&url=${shareUrl}`, '_blank', 'noopener,noreferrer');
                }}
                className="w-full sm:w-auto flex-1 py-3 px-5 bg-[#141413] hover:bg-[#282826] text-white rounded-full text-xs font-mono font-semibold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-95"
                title="Share identity announcement on X"
              >
                <Share size={14} />
                <span>Share on X</span>
              </button>
              
              <Button 
                variant="accent" 
                onClick={() => {
                  setPurchasedListing(null);
                  setSelectedListing(null);
                  setTxState('idle');
                  navigateTo('mynames');
                }} 
                className="w-full sm:w-auto flex-1 text-xs font-mono font-semibold py-3 px-5"
              >
                Manage Identity
              </Button>
            </div>
          </div>
        </div>
      )}

      {updatePriceModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-white shadow-2xl relative rounded-2xl border-[#E5E5E2] p-8">
            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">
              Update Price for {updatePriceModal.name}
            </h3>
            <p className="text-sm text-gray-500 font-sans mb-6">
              Enter the new price in USDC. The on-chain listing will be updated immediately.
            </p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-sans font-medium text-gray-700 mb-2">
                  New Price (USDC)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={updatePriceModal.price}
                    onChange={(e) => setUpdatePriceModal(prev => ({ ...prev, price: e.target.value }))}
                    disabled={updatePriceModal.pending}
                    placeholder="50"
                    autoFocus
                    className="w-full p-3.5 pl-4 pr-16 bg-[#FBFBFA] border border-[#E5E5E2] rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#137A43]/20 focus:border-[#137A43] transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-gray-400 font-medium text-xs">
                    USDC
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setUpdatePriceModal(prev => ({ ...prev, isOpen: false }))}
                disabled={updatePriceModal.pending}
                className="px-5 py-2.5"
              >
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={submitUpdatePrice}
                disabled={!updatePriceModal.price || updatePriceModal.pending}
                className="px-5 py-2.5"
              >
                {updatePriceModal.pending ? 'Updating...' : 'Update Price'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <QuickListModal
        isOpen={quickListModalOpen}
        onClose={() => setQuickListModalOpen(false)}
        userAddress={auth.address || ''}
        listForSale={ans.listForSale}
        onListedSuccess={() => {
          loadListings();
        }}
        humanizeError={humanizeWeb3Error}
      />
    </div>
  );
};

const PasskeySignInCard = ({ auth, actionText = "Connect your wallet" }: { auth: AuthState, actionText?: string }) => {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 max-w-[500px] mx-auto w-full">
      <Card className="w-full text-center bg-white border border-[#E5E5E2] p-8 sm:p-12 relative rounded-2xl shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-[#E8F5E9] border border-[#137A43]/15 flex items-center justify-center mx-auto mb-6">
          <Fingerprint size={32} strokeWidth={1.5} className="text-[#137A43]" />
        </div>
        
        <h2 className="text-2xl sm:text-3xl tracking-tight font-serif font-bold text-[#141413] mb-3">
          Secure Sign In
        </h2>
        
        <p className="text-gray-500 font-sans text-sm sm:text-[15px] mb-6 leading-relaxed max-w-[340px] mx-auto">
          {actionText}.
        </p>

        <div className="flex items-center justify-center mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F2F9F5] border border-[#137A43]/20 rounded-full text-xs font-sans text-[#0F6536]">
            <Shield size={13} strokeWidth={2} className="text-[#137A43]" />
            Biometric passkey · No seed phrase required
          </span>
        </div>
        
        {auth.error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start text-left gap-3">
            <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm font-sans text-red-800 leading-relaxed font-medium">{auth.error}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Button 
            variant="primary" 
            onClick={() => auth.signIn()} 
            disabled={auth.isLoading}
            className="w-full py-3.5 text-sm"
          >
            {auth.isLoading ? (
              <span className="flex items-center justify-center gap-2.5">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Waiting for Passkey...</span>
              </span>
            ) : (
              'Sign In with Passkey'
            )}
          </Button>

          <Button 
            variant="secondary" 
            onClick={() => auth.signUp()} 
            disabled={auth.isLoading}
            className="w-full py-3.5 text-sm"
          >
            Create New Wallet
          </Button>
        </div>
      </Card>
    </div>
  );
};

const MyNamesView = ({ 
  isConnected, 
  connectWallet,
  auth,
  ans,
  balance,
  navigateTo,
}: { 
  isConnected: boolean; 
  connectWallet: () => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
  balance?: string;
  navigateTo: (view: string, arg?: string) => void;
}) => {
  const { data: rawOwnedNames, refetch: refetchOwned } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'getNamesByOwner',
    args: [auth.address as Address],
    chainId: arcTestnet.id,
    query: { enabled: !!auth.address },
  });

  const { data: primaryName } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'reverseLookup',
    args: [auth.address as Address],
    chainId: arcTestnet.id,
    query: { enabled: !!auth.address },
  });

  const [namesList, setNamesList] = useState<any[]>(() => {
    if (!auth.address) return [];
    const cached = getCachedOwnedNames(auth.address);
    if (cached.length > 0) {
      return cached.map(clean => ({
        name: `${clean}.arc`,
        owner: auth.address,
        expiry: Date.now() + 180 * 24 * 60 * 60 * 1000,
        status: 'healthy',
        listed: false,
        isPrimary: cleanName(getUserPrimaryName(auth.address) || '') === clean,
      }));
    }
    return [];
  });
  const [openMenuName, setOpenMenuName] = useState<string | null>(null);
  const [transferModal, setTransferModal] = useState<{isOpen: boolean; name: string; to: string; pending: boolean}>({isOpen: false, name: '', to: '', pending: false});
  const [listingModal, setListingModal] = useState<{isOpen: boolean; name: string; price: string; pending: boolean; isUpdate?: boolean}>({isOpen: false, name: '', price: '50', pending: false, isUpdate: false});

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.name-manage-dropdown-container')) {
        setOpenMenuName(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadDetails() {
      let owned = (rawOwnedNames as string[] | undefined) || [];
      if (owned.length === 0 && auth.address) {
        try {
          const direct = (await fallbackPublicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getNamesByOwner',
            args: [auth.address as Address],
          })) as string[];
          if (direct && Array.isArray(direct) && direct.length > 0) {
            owned = direct;
          }
        } catch {}
      }

      // Merge on-chain names with persistent local cache
      const cached = auth.address ? getCachedOwnedNames(auth.address) : [];
      const combined = Array.from(new Set([...owned.map(n => cleanName(n)), ...cached])).filter(Boolean);

      if (combined.length === 0) {
        // If wallet has no registered names yet, show fallback mock for preview if address is mock
        const mockMatch = INITIAL_MOCK_NAMES.filter(n => n.owner === auth.address);
        if (active) setNamesList(mockMatch);
        return;
      }

      // Defensively save merged list back to persistent storage
      if (auth.address && combined.length > 0) {
        saveCachedOwnedNames(auth.address, combined);
      }

      const recordsRaw = await Promise.all(
        combined.map(async (clean) => {
          try {
            const rec = await fallbackPublicClient.readContract({
              address: ANS_ADDRESS,
              abi: ANS_ABI,
              functionName: 'getNameRecord',
              args: [clean],
            });

            // Ownership validation: prune names that were transferred or sold
            if (!rec.owner || !auth.address || rec.owner.toLowerCase() !== auth.address.toLowerCase()) {
              if (auth.address) {
                removeCachedOwnedName(auth.address, clean);
              }
              return null;
            }

            const expiryMs = Number(rec.expiry) * 1000;
            const now = Date.now();
            const daysLeft = (expiryMs - now) / (1000 * 60 * 60 * 24);
            const status = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring' : 'healthy';

            let onchainPrimary = '';
            try {
              onchainPrimary = (await fallbackPublicClient.readContract({
                address: ANS_ADDRESS,
                abi: ANS_ABI,
                functionName: 'primaryName',
                args: [auth.address as Address],
              })) as string;
            } catch {}

            const isPrimary = onchainPrimary
              ? cleanName(onchainPrimary) === clean
              : cleanName(getUserPrimaryName(auth.address) || '') === clean;

            return {
              name: `${clean}.arc`,
              owner: rec.owner,
              expiry: expiryMs,
              status,
              listed: !!rec.listed,
              isPrimary,
            };
          } catch {
            return null;
          }
        })
      );

      const records = recordsRaw.filter(Boolean) as any[];
      if (auth.address) {
        saveCachedOwnedNames(auth.address, records.map(r => cleanName(r.name)));
      }
      if (active) setNamesList(records);
    }

    loadDetails();

    const handlePrimaryChanged = () => {
      loadDetails();
    };
    const handleOwnedUpdated = () => {
      refetchOwned();
      loadDetails();
    };
    window.addEventListener('ans_primary_changed', handlePrimaryChanged);
    window.addEventListener('ans_owned_names_updated', handleOwnedUpdated);
    return () => { 
      active = false;
      window.removeEventListener('ans_primary_changed', handlePrimaryChanged);
      window.removeEventListener('ans_owned_names_updated', handleOwnedUpdated);
    };
  }, [rawOwnedNames, primaryName, auth.address]);

  if (!isConnected || !auth.address) {
    return <PasskeySignInCard auth={auth} actionText="Sign in or create a wallet instantly to manage your .arc identities, renew registrations, or list names for sale" />;
  }

  const usedCount = namesList.length;

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'healthy') return <span className="px-3 py-0.5 bg-[#E8F5E9] text-[#137A43] border border-[#137A43]/20 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider">Active</span>;
    if (status === 'expiring') return <span className="px-3 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1"><AlertCircle size={10}/> Expiring</span>;
    return <span className="px-3 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider">Expired</span>;
  };

  const handleSetPrimary = async (name: string) => {
    if (!auth.address) return;
    try {
      toast.loading(`Setting ${name} as on-chain main identity...`, { id: `primary-${name}` });
      await ans.setPrimaryName(name);
      setUserPrimaryName(auth.address, name);
      setNamesList(prev => prev.map(item => ({
        ...item,
        isPrimary: cleanName(item.name) === cleanName(name),
      })));
      toast.success(`${name} is now your on-chain main identity!`, { id: `primary-${name}` });
      refetchOwned();
    } catch (err: any) {
      const friendlyMsg = humanizeWeb3Error(err);
      toast.error(friendlyMsg, { id: `primary-${name}` });
    }
  };

  const handleRenew = async (name: string) => {
    try {
      toast.loading('Approving USDC...', { id: `renew-${name}` });
      await ans.renew(name, 12, (step) => {
        if (step === 'approving') {
          toast.loading('Approving USDC...', { id: `renew-${name}` });
        } else if (step === 'renewing') {
          toast.loading('Renewing name...', { id: `renew-${name}` });
        }
      });
      recordActivity({
        name,
        action: 'Renewed Name',
        amount: calculateRegistrationPriceUSDC(name, 12),
        from: auth.address || 'Owner',
        timestamp: Date.now(),
      });
      addClientNotification(auth.address, {
        kind: 'tx_success',
        title: `Renewal Confirmed: ${name}`,
        body: `Extended registration period for ${name} by 12 months.`,
        link: `profile:${name}`,
      });
      toast.success(`Done! ${name} renewed!`, { id: `renew-${name}` });
      refetchOwned();
    } catch (e: any) {
      const msg = humanizeWeb3Error(e);
      addClientNotification(auth.address, {
        kind: 'tx_failed',
        title: `Renewal Failed: ${name}`,
        body: msg,
        link: 'mynames',
      });
      toast.error(msg, { id: `renew-${name}` });
    }
  };

  const handleTransfer = (name: string) => {
    const item = namesList.find(n => cleanName(n.name) === cleanName(name));
    if (item?.listed) {
      toast.error('Listed names cannot be transferred. Cancel the marketplace listing first.');
      return;
    }
    setTransferModal({ isOpen: true, name, to: '', pending: false });
  };

  const submitTransfer = async () => {
    const { name, to } = transferModal;
    if (!to) return;
    setTransferModal(prev => ({ ...prev, pending: true }));
    try {
      toast.info(`Transferring ${name}...`);
      await ans.transferName(name, to);
      recordActivity({
        name,
        action: 'Transferred Name',
        amount: '-',
        from: auth.address || 'Previous Owner',
        to,
        timestamp: Date.now(),
      });
      addClientNotification(auth.address, {
        kind: 'tx_success',
        title: `Transfer Confirmed: ${name}`,
        body: `Successfully transferred ownership to ${to}.`,
        link: `userprofile:${to}`,
      });
      toast.success(`${name} transferred to ${to}!`);
      if (auth.address) {
        removeCachedOwnedName(auth.address, name);
        window.dispatchEvent(new CustomEvent('ans_owned_names_updated', { detail: { wallet: auth.address, name } }));
      }
      refetchOwned();
      setTransferModal(prev => ({ ...prev, isOpen: false }));
    } catch (e: any) {
      const msg = humanizeWeb3Error(e);
      addClientNotification(auth.address, {
        kind: 'tx_failed',
        title: `Transfer Failed: ${name}`,
        body: msg,
        link: 'mynames',
      });
      toast.error(msg);
      setTransferModal(prev => ({ ...prev, pending: false }));
    }
  };

  const handleListForSale = (name: string, isUpdate: boolean = false, currentPrice: string = '50') => {
    setListingModal({ isOpen: true, name, price: currentPrice, pending: false, isUpdate });
  };

  const submitListing = async () => {
    const { name, price, isUpdate } = listingModal;
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      toast.error('Please enter a valid positive price');
      return;
    }
    setListingModal(prev => ({ ...prev, pending: true }));
    try {
      toast.info(`${isUpdate ? 'Updating price for' : 'Listing'} ${name} for ${price} USDC...`);
      await ans.listForSale(name, price);
      addTrackedListing(name);
      syncListingToSupabase({
        name,
        seller: auth.address || '',
        price: Number(price),
        is_active: true,
      }).catch(() => {});
      recordActivity({
        name,
        action: 'Listed for Sale',
        amount: `${price} USDC`,
        from: auth.address || 'Seller',
        timestamp: Date.now(),
      });
      addClientNotification(auth.address, {
        kind: 'tx_success',
        title: `${isUpdate ? 'Price Updated' : 'Listing Published'}: ${name}`,
        body: `${isUpdate ? 'Updated listing price to' : 'Listed for sale at'} ${price} USDC.`,
        link: 'marketplace',
      });
      toast.success(`${name} ${isUpdate ? 'price updated' : 'listed for sale'}!`);
      refetchOwned();
      setListingModal(prev => ({ ...prev, isOpen: false }));
    } catch (e: any) {
      const msg = humanizeWeb3Error(e);
      addClientNotification(auth.address, {
        kind: 'tx_failed',
        title: `${isUpdate ? 'Price Update' : 'Listing'} Failed: ${name}`,
        body: msg,
        link: 'mynames',
      });
      toast.error(msg);
      setListingModal(prev => ({ ...prev, pending: false }));
    }
  };

  const handleCancelListing = async (name: string) => {
    try {
      toast.loading(`Cancelling listing for ${name}...`, { id: `cancel-${name}` });
      await ans.cancelListing(name);
      removeTrackedListing(name);
      syncListingToSupabase({
        name,
        seller: auth.address || '',
        price: 0,
        is_active: false,
      }).catch(() => {});
      addClientNotification(auth.address, {
        kind: 'tx_success',
        title: `Listing Cancelled: ${name}`,
        body: `Removed ${name} from marketplace escrow.`,
        link: 'marketplace',
      });
      toast.success(`${name} removed from marketplace!`, { id: `cancel-${name}` });
      refetchOwned();
    } catch (e: any) {
      const msg = humanizeWeb3Error(e);
      addClientNotification(auth.address, {
        kind: 'tx_failed',
        title: `Cancel Listing Failed: ${name}`,
        body: msg,
        link: 'mynames',
      });
      toast.error(msg, { id: `cancel-${name}` });
    }
  };

  return (
    <div className="max-w-5xl mx-auto pt-14 pb-32 px-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-10 border-b border-[#E5E5E2] pb-8 gap-6">
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-900 tracking-tight">My Names</h1>
          <p className="text-gray-500 font-sans text-base mt-1">Manage, renew, delegate, and trade your active .arc identities.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {balance !== undefined && (
            <div className="bg-white px-5 py-3 rounded-2xl border border-[#E5E5E2] shadow-sm">
              <p className="text-gray-500 text-xs font-sans mb-1">Settlement balance</p>
              <p className="text-2xl font-mono text-[#137A43] font-bold tabular-nums">
                {balance} <span className="text-gray-500 text-xs font-mono font-normal">USDC</span>
              </p>
            </div>
          )}
          <div className="text-left sm:text-right bg-white px-5 py-3 rounded-2xl border border-[#E5E5E2] shadow-sm min-w-[160px]">
            <div className="flex items-center justify-between sm:justify-end gap-2 mb-1">
              <span className="text-gray-500 text-xs font-sans">Wallet quota</span>
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                  <span
                    key={i}
                    className={`w-2 h-2.5 rounded-xs transition-all ${
                      i < usedCount 
                        ? 'bg-[#137A43] shadow-sm' 
                        : 'border border-[#E5E5E2] bg-[#F5F5F3]'
                    }`}
                    title={i < usedCount ? `Slot ${i + 1}: Registered` : `Slot ${i + 1}: Available`}
                  />
                ))}
              </div>
            </div>
            <p className="text-2xl font-mono text-gray-900 font-bold tabular-nums">
              {usedCount} <span className="text-gray-500 text-xs font-mono font-normal">/ 10 Max</span>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {namesList.map(nameItem => (
          <Card key={nameItem.name} hoverable className="border-[#E5E5E2] bg-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-6 relative overflow-visible">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-xl bg-[#F5F5F3] border border-[#E5E5E2] flex items-center justify-center text-gray-900 font-serif font-bold text-xl shadow-sm shrink-0">
                {nameItem.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  <h3 
                    className="text-2xl font-serif font-bold text-gray-900 flex items-center gap-2 cursor-pointer hover:text-[#137A43] transition-colors tracking-tight"
                    onClick={() => navigateTo('profile', nameItem.name)}
                  >
                    {nameItem.name}
                    {nameItem.isPrimary && (
                      <span className="text-[#137A43] text-[10px] font-mono font-semibold px-2.5 py-0.5 border border-[#137A43]/20 bg-[#E8F5E9] rounded-full uppercase tracking-wider flex items-center gap-1">
                        <Star size={10} className="fill-[#137A43]" /> Main
                      </span>
                    )}
                    {nameItem.listed && (
                      <span className="text-amber-800 text-[10px] font-mono font-semibold px-2.5 py-0.5 border border-amber-200 bg-amber-50 rounded-full uppercase tracking-wider">
                        Listed
                      </span>
                    )}
                  </h3>
                  <StatusBadge status={nameItem.status} />
                </div>
                <div className="text-gray-500 text-xs font-mono flex items-center gap-2 mb-1.5">
                  <span>Owner: {auth.address ? `${auth.address.slice(0, 8)}...${auth.address.slice(-6)}` : ''}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (auth.address) {
                        navigator.clipboard.writeText(auth.address);
                        toast.success('Address copied to clipboard!');
                      }
                    }}
                    title="Copy owner address"
                    aria-label="Copy owner address"
                    className="p-1 min-w-[28px] min-h-[28px] inline-flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                {/* Tesler's Law: Registered Date + Relative Countdown + Calendar Expiry Date */}
                {(() => {
                  const cd = formatExpirationCountdown(nameItem.expiry);
                  const clean = cleanName(nameItem.name);
                  const regActivity = getStoredActivities(clean).find((a: NameActivityItem) => a.action === 'Registered Name' || a.action === 'Gifted Name') ||
                    KNOWN_ONCHAIN_ACTIVITIES.find((a: NameActivityItem) => cleanName(a.name) === clean && (a.action === 'Registered Name' || a.action === 'Gifted Name'));
                  const regDate = regActivity?.timestamp ? new Date(regActivity.timestamp).toLocaleDateString() : null;
                  return (
                    <div className="flex items-center gap-2 flex-wrap text-xs font-mono text-gray-500">
                      {regDate && (
                        <span>Registered: <span className="tabular-nums font-medium text-gray-800">{regDate}</span> · </span>
                      )}
                      <span>Expires: <span className="tabular-nums font-medium text-gray-800">{new Date(nameItem.expiry).toLocaleDateString()}</span></span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                        cd.expired ? 'bg-red-50 text-red-600 border border-red-200' :
                        cd.urgent ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-[#E8F5E9] text-[#137A43] border border-[#137A43]/20'
                      }`}>
                        {cd.text}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t border-[#E5E5E2] sm:border-0">
              {!nameItem.isPrimary && (
                <button
                  onClick={() => handleSetPrimary(nameItem.name)}
                  className="px-3.5 py-2 text-xs font-mono font-semibold text-gray-700 hover:text-[#137A43] border border-[#E5E5E2] hover:border-[#137A43]/30 rounded-full bg-white hover:bg-[#E8F5E9]/50 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Set as your primary main identity across Arc"
                >
                  <Star size={12} className="text-gray-400" /> Set Main
                </button>
              )}

              {(nameItem.status === 'expiring' || nameItem.status === 'expired') && (
                <Button variant="accent" className="flex-1 sm:flex-none py-2 px-3.5 text-xs font-mono font-semibold shadow-xs" onClick={() => handleRenew(nameItem.name)}>
                  Renew
                </Button>
              )}
              
              {/* Fitts's & Jakob's Law: Accessible Click-Toggled Dropdown Menu */}
              <div className="relative name-manage-dropdown-container flex-1 sm:flex-none">
                <Button 
                  variant="secondary" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuName(openMenuName === nameItem.name ? null : nameItem.name);
                  }}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-sans font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Manage <ChevronDown size={13} className={`transition-transform duration-150 ${openMenuName === nameItem.name ? 'rotate-180' : ''}`} />
                </Button>
                {openMenuName === nameItem.name && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-[#E5E5E2] rounded-2xl shadow-xl z-20 py-1.5 overflow-hidden animate-in fade-in duration-100">
                    <button 
                      onClick={() => { setOpenMenuName(null); navigateTo('send', nameItem.name); }} 
                      className="w-full text-left px-4 py-2.5 text-xs text-gray-800 hover:bg-[#F5F5F3] font-mono transition-colors flex items-center gap-2.5 cursor-pointer"
                    >
                      <Send size={14} className="text-gray-400"/> Send Payment
                    </button>
                    <button 
                      onClick={() => { setOpenMenuName(null); handleRenew(nameItem.name); }} 
                      className="w-full text-left px-4 py-2.5 text-xs text-gray-800 hover:bg-[#F5F5F3] font-mono transition-colors flex items-center gap-2.5 cursor-pointer"
                    >
                      <RefreshCw size={14} className="text-gray-400"/> Renew Record
                    </button>
                    <button 
                      onClick={() => { setOpenMenuName(null); handleTransfer(nameItem.name); }} 
                      className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between gap-2.5 ${nameItem.listed ? 'text-gray-400 bg-gray-50' : 'text-gray-800 hover:bg-[#F5F5F3] cursor-pointer'}`}
                      title={nameItem.listed ? 'Listed names cannot be transferred. Cancel listing first.' : 'Transfer Record'}
                    >
                      <span className="flex items-center gap-2.5">
                        <ArrowRightLeft size={14} className={nameItem.listed ? 'text-gray-300' : 'text-gray-400'}/> Transfer Record
                      </span>
                      {nameItem.listed && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          Listed
                        </span>
                      )}
                    </button>
                    {nameItem.listed ? (
                      <>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setOpenMenuName(null); handleListForSale(nameItem.name, true); }} 
                          className="w-full text-left px-4 py-2.5 text-xs text-gray-800 hover:bg-[#F5F5F3] font-mono transition-colors flex items-center gap-2.5 cursor-pointer"
                        >
                          <Tag size={14} className="text-gray-400"/> Update Price
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setOpenMenuName(null); handleCancelListing(nameItem.name); }} 
                          className="w-full text-left px-4 py-2.5 text-xs text-red-600 hover:bg-red-50 font-mono transition-colors flex items-center gap-2.5 cursor-pointer"
                        >
                          <Tag size={14} className="text-red-500"/> Cancel Listing
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setOpenMenuName(null); handleListForSale(nameItem.name, false); }} 
                        className="w-full text-left px-4 py-2.5 text-xs text-gray-800 hover:bg-[#F5F5F3] font-mono transition-colors flex items-center gap-2.5 cursor-pointer"
                      >
                        <Tag size={14} className="text-gray-400"/> List for Sale
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        {/* Peak-End Rule: Engaging Onboarding Empty State */}
        {namesList.length === 0 && (
          <Card className="text-center py-12 px-6 border-[#E5E5E2] bg-white shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-[#E8F5E9] border border-[#137A43]/20 text-[#137A43] flex items-center justify-center mx-auto mb-4 shadow-2xs">
              <Fingerprint size={32} strokeWidth={1.75} />
            </div>
            <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">Claim Your First .arc Identity</h3>
            <p className="text-gray-500 font-sans text-sm max-w-md mx-auto mb-6 leading-relaxed">
              Your .arc name is your universal identity on Arc Network. Receive tips with zero gas fees, set up subdomains, and trade on the marketplace.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto mb-8 text-left">
              <div className="p-3 bg-[#FBFBFA] rounded-xl border border-[#E5E5E2]">
                <div className="text-[#137A43] font-mono text-xs font-bold mb-1">01. Gas-Free</div>
                <p className="text-[11px] text-gray-500 font-sans">Settle all fees natively in USDC via passkey smart accounts.</p>
              </div>
              <div className="p-3 bg-[#FBFBFA] rounded-xl border border-[#E5E5E2]">
                <div className="text-[#137A43] font-mono text-xs font-bold mb-1">02. Human Names</div>
                <p className="text-[11px] text-gray-500 font-sans">Replace long 0x addresses with clean, readable names.</p>
              </div>
              <div className="p-3 bg-[#FBFBFA] rounded-xl border border-[#E5E5E2]">
                <div className="text-[#137A43] font-mono text-xs font-bold mb-1">03. Marketplace</div>
                <p className="text-[11px] text-gray-500 font-sans">Atomic escrow secondary trading with instant title transfer.</p>
              </div>
            </div>
            <Button variant="accent" onClick={() => navigateTo('names')} className="mx-auto text-sm px-8 py-3.5 shadow-sm font-semibold">
              Search & Register a Name
            </Button>
          </Card>
        )}
      </div>

      {transferModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-white shadow-2xl relative rounded-2xl border-[#E5E5E2] p-8">
            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">Transfer {transferModal.name}</h3>
            <p className="text-sm text-gray-500 font-sans mb-6">Enter the recipient's wallet address or .arc name.</p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-sans font-medium text-gray-700 mb-2">Recipient address or .arc name</label>
                <input
                  type="text"
                  value={transferModal.to}
                  onChange={(e) => setTransferModal(prev => ({ ...prev, to: e.target.value }))}
                  disabled={transferModal.pending}
                  placeholder="0x... or name.arc"
                  className="w-full p-3.5 bg-[#FBFBFA] border border-[#E5E5E2] rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#137A43]/20 focus:border-[#137A43] transition-all"
                />
                <RecipientProfilePreview input={transferModal.to} currentWallet={auth.address} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setTransferModal(prev => ({ ...prev, isOpen: false }))} disabled={transferModal.pending} className="px-5 py-2.5">
                Cancel
              </Button>
              <Button variant="accent" onClick={submitTransfer} disabled={!transferModal.to || transferModal.pending} className="px-5 py-2.5">
                {transferModal.pending ? 'Transferring...' : 'Transfer Name'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {listingModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-white shadow-2xl relative rounded-2xl border-[#E5E5E2] p-8">
            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">
              {listingModal.isUpdate ? `Update Price for ${listingModal.name}` : `List ${listingModal.name} for Sale`}
            </h3>
            <p className="text-sm text-gray-500 font-sans mb-6">
              {listingModal.isUpdate 
                ? 'Enter the new price in USDC. Your on-chain listing will be updated immediately.'
                : 'Set a price in USDC. A 2.5% protocol fee will be deducted from your proceeds upon sale.'}
            </p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-sans font-medium text-gray-700 mb-2">Price (USDC)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={listingModal.price}
                    onChange={(e) => setListingModal(prev => ({ ...prev, price: e.target.value }))}
                    disabled={listingModal.pending}
                    placeholder="50"
                    className="w-full p-3.5 pl-4 pr-16 bg-[#FBFBFA] border border-[#E5E5E2] rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#137A43]/20 focus:border-[#137A43] transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-gray-400 font-medium text-xs">USDC</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => setListingModal(prev => ({ ...prev, isOpen: false }))} disabled={listingModal.pending} className="px-5 py-2.5">
                Cancel
              </Button>
              <Button variant="accent" onClick={submitListing} disabled={!listingModal.price || listingModal.pending} className="px-5 py-2.5">
                {listingModal.pending ? (listingModal.isUpdate ? 'Updating...' : 'Listing...') : (listingModal.isUpdate ? 'Update Price' : 'List for Sale')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

const SendView = ({ 
  isConnected, 
  connectWallet,
  auth,
  ans,
  balance,
  defaultRecipient = '',
}: { 
  isConnected: boolean; 
  connectWallet: () => void;
  auth: AuthState;
  ans: ReturnType<typeof useANS>;
  balance?: string;
  defaultRecipient?: string;
}) => {
  const [recipient, setRecipient] = useState(defaultRecipient || '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState('edit'); 
  const [txStatus, setTxStatus] = useState('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    if (defaultRecipient) {
      setRecipient(defaultRecipient);
    }
  }, [defaultRecipient]);

  const trimmedRecip = recipient.trim();
  const isEthAddress = trimmedRecip.startsWith('0x') && trimmedRecip.length === 42;
  const subdomainMatch = useMemo(() => parseAndResolveSubdomain(trimmedRecip), [trimmedRecip]);
  const cleanRecip = cleanName(trimmedRecip);
  const isArcName = !subdomainMatch && trimmedRecip.toLowerCase().endsWith('.arc');

  const { data: onchainResolved, isLoading: isResolvingOnchain } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'resolve',
    args: [cleanRecip],
    chainId: arcTestnet.id,
    query: { enabled: isArcName && cleanRecip.length >= 3 },
  });

  const { targetAddress, resolutionType, resolutionLabel } = useMemo(() => {
    if (!trimmedRecip) {
      return { targetAddress: null, resolutionType: 'none', resolutionLabel: '' };
    }
    if (isEthAddress) {
      const primary = getCachedReverseName(trimmedRecip);
      return {
        targetAddress: trimmedRecip,
        resolutionType: 'address',
        resolutionLabel: primary ? `Arc Address (${primary})` : 'Arc Address',
      };
    }
    if (subdomainMatch) {
      return {
        targetAddress: subdomainMatch.targetAddress,
        resolutionType: 'subdomain',
        resolutionLabel: `Subdomain: ${subdomainMatch.fullName}`,
      };
    }
    if (isArcName) {
      const resolved = onchainResolved as string | undefined;
      if (resolved && resolved.startsWith('0x') && resolved !== '0x0000000000000000000000000000000000000000') {
        return {
          targetAddress: resolved,
          resolutionType: 'ans',
          resolutionLabel: `Verified .arc Identity (${cleanRecip}.arc)`,
        };
      }
      return {
        targetAddress: null,
        resolutionType: 'unknown',
        resolutionLabel: isResolvingOnchain ? 'Resolving on-chain...' : 'Unregistered .arc name',
      };
    }
    return { targetAddress: null, resolutionType: 'none', resolutionLabel: '' };
  }, [trimmedRecip, isEthAddress, subdomainMatch, isArcName, onchainResolved, cleanRecip, isResolvingOnchain]);

  if (!isConnected) {
    return <PasskeySignInCard auth={auth} actionText="Sign in or create a wallet to send USDC payments using .arc names" />;
  }

  const isResolved = !!targetAddress;
  const resolvedAddress = targetAddress;

  const handleReview = () => {
    if (!recipient || !amount) return;
    if (isArcName && !targetAddress && !isResolvingOnchain) {
      toast.error('The entered .arc name is not registered on Arc Testnet.');
      return;
    }
    setStep('preview');
  };

  const handleConfirm = async () => {
    try {
      setTxStatus('approving');
      const sendTarget = subdomainMatch ? subdomainMatch.targetAddress : (targetAddress || recipient);
      const hash = await ans.sendTip(sendTarget, amount, note, (step) => {
        if (step === 'approving') setTxStatus('approving');
        else if (step === 'tipping') setTxStatus('confirming');
      });
      recordActivity({
        name: subdomainMatch ? subdomainMatch.fullName : recipient,
        action: 'Sent Tip',
        amount: `${amount} USDC`,
        from: auth.address || 'Anonymous',
        to: targetAddress || recipient,
        timestamp: Date.now(),
        txHash: hash,
        note: note || undefined,
      });
      setTxHash(hash);
      setTxStatus('idle');
      setStep('success');
      const recipAddr = (targetAddress || (recipient.startsWith('0x') ? recipient : null))?.toLowerCase();
      const senderDisplay = (auth.address && getCachedReverseName(auth.address)) || (auth.address ? `${auth.address.slice(0, 6)}...${auth.address.slice(-4)}` : 'A supporter');

      addClientNotification(auth.address, {
        kind: 'tx_success',
        title: `Payment Confirmed: ${amount} USDC`,
        body: `Successfully transferred ${amount} USDC to ${recipient}.${note ? ` Note: "${note}"` : ''}`,
        tx_hash: hash,
        link: recipient.endsWith('.arc') ? `profile:${recipient}` : `userprofile:${recipient}`,
      });

      if (recipAddr && recipAddr.startsWith('0x')) {
        addClientNotification(recipAddr, {
          kind: 'tip_received',
          title: `Payment Received: ${amount} USDC`,
          body: `${senderDisplay} sent you a ${amount} USDC payment!${note ? ` Note: "${note}"` : ''}`,
          tx_hash: hash,
          link: `userprofile:${auth.address}`,
        });
      }
      toast.success('Done! Payment sent successfully!');
    } catch (err: any) {
      setTxStatus('idle');
      const friendlyMsg = humanizeWeb3Error(err);
      addClientNotification(auth.address, {
        kind: 'tx_failed',
        title: `Payment Failed to ${recipient}`,
        body: friendlyMsg,
        link: 'send',
      });
      toast.error(friendlyMsg);
    }
  };

  if (step === 'success') {
    return (
      <div className="max-w-lg mx-auto pt-16 px-6 pb-32">
        <Card className="text-center py-10 px-6 sm:px-8 border-[#137A43]/20 bg-gradient-to-b from-[#E8F5E9]/40 to-white shadow-sm">
          <div className="w-14 h-14 rounded-full bg-[#E8F5E9] text-[#137A43] flex items-center justify-center mx-auto mb-4 border border-[#137A43]/30 shadow-xs">
            <Check size={28} strokeWidth={2.5} />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#137A43] font-bold block mb-1">
            Settlement Confirmed
          </span>
          <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">Payment Dispatched</h3>
          <p className="text-gray-600 font-sans mb-6 text-sm leading-relaxed">
            Successfully transferred <span className="font-mono text-gray-900 font-bold tabular-nums">{amount} USDC</span> to <span className="font-mono font-semibold text-gray-900">{recipient}</span>.
          </p>

          {/* Digital Receipt Card (Peak-End Rule) */}
          <div className="bg-white border border-[#E5E5E2] rounded-2xl p-4 mb-6 text-left shadow-2xs space-y-2.5 text-xs font-mono">
            <div className="flex justify-between items-center text-gray-500">
              <span>Recipient:</span>
              <span className="text-gray-900 font-bold">{recipient}</span>
            </div>
            {targetAddress && (
              <div className="flex justify-between items-center text-gray-500 text-[11px]">
                <span>Resolved Address:</span>
                <span className="text-gray-700">{targetAddress.slice(0, 6)}...{targetAddress.slice(-4)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-gray-500 border-t border-[#E5E5E2] pt-2">
              <span className="font-semibold text-gray-900">Total Settled:</span>
              <span className="text-base font-bold text-[#137A43] tabular-nums">{amount} USDC</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            {txHash && (
              <Button 
                variant="secondary" 
                className="w-full sm:w-auto flex-1 py-3 text-xs font-mono"
                onClick={() => window.open(`https://explorer.testnet.arc.io/tx/${txHash}`, '_blank')}
              >
                View Tx <ArrowUpRight size={13}/>
              </Button>
            )}
            <Button 
              variant="accent" 
              onClick={() => { setStep('edit'); setRecipient(''); setAmount(''); setNote(''); setTxStatus('idle'); }} 
              className="w-full sm:w-auto flex-1 py-3 text-xs font-mono font-semibold"
            >
              Send Another
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pt-14 pb-32 px-6">
      <div className="mb-10 border-b border-[#E5E5E2] pb-8">
        <h1 className="text-4xl font-serif font-bold text-gray-900 tracking-tight">Send Payment</h1>
        <p className="text-gray-500 font-sans text-base mt-1">Transfer USDC directly using verifiable .arc names instead of long wallet addresses.</p>
      </div>

      <Card className="border-[#E5E5E2] bg-white shadow-sm p-6 sm:p-8">
        {step === 'edit' ? (
          <div className="space-y-6">
            <div>
              <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold mb-2">
                Recipient (.arc name or address)
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="e.g. alex.arc or 0x..."
                  className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-mono text-lg p-3.5 pl-4 rounded-xl focus:outline-none focus:border-[#137A43] focus:bg-white transition-all"
                />
                {isResolved && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs bg-white px-2.5 py-1 rounded-full border border-[#E5E5E2] shadow-2xs">
                    <span className="font-mono text-gray-600 text-xs tabular-nums">
                      {resolvedAddress?.startsWith('0x') && resolvedAddress.length === 42 ? `${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)}` : resolvedAddress}
                    </span>
                    <CheckCircle2 size={14} className="text-[#137A43]" />
                  </div>
                )}
              </div>
              {resolutionType === 'unknown' && trimmedRecip.length >= 3 && (
                <div className="mt-2 text-xs font-sans text-amber-700 bg-amber-50 border border-amber-200/80 rounded-xl p-2.5 flex items-center gap-2">
                  <AlertCircle size={14} className="text-amber-600 shrink-0" />
                  <span>This .arc name is not registered on Arc Testnet. Please verify the spelling.</span>
                </div>
              )}
              {resolutionType === 'subdomain' && targetAddress && (
                <div className="mt-2 text-xs font-mono text-[#137A43] bg-[#E8F5E9] border border-[#137A43]/20 rounded-xl p-2.5 flex items-center justify-between">
                  <span>Routing to Subdomain Target:</span>
                  <span className="font-bold">{targetAddress.slice(0, 6)}...{targetAddress.slice(-4)}</span>
                </div>
              )}
              <RecipientProfilePreview
                input={recipient}
                currentWallet={auth.address}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold">
                  Amount (USDC)
                </label>
                {balance !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500">
                      Balance: <span className="font-bold text-gray-800 tabular-nums">{balance} USDC</span>
                    </span>
                    {/* Tesler's Law: 1-click Max button */}
                    <button
                      type="button"
                      onClick={() => setAmount(balance)}
                      className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md bg-[#E8F5E9] text-[#137A43] hover:bg-[#137A43] hover:text-white transition-colors cursor-pointer"
                      title="Send full available USDC balance"
                    >
                      Max
                    </button>
                  </div>
                )}
              </div>
              <div className="relative mb-3">
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-mono text-3xl font-bold p-3.5 pl-4 rounded-xl focus:outline-none focus:border-[#137A43] focus:bg-white transition-all tabular-nums"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-gray-400 font-bold">
                  USDC
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[5, 10, 25, 50, 100].map(amt => (
                  <button 
                    key={amt}
                    onClick={() => setAmount(amt.toString())}
                    className="py-2 text-xs font-mono font-semibold border border-[#E5E5E2] rounded-full text-gray-700 hover:border-[#137A43] hover:text-[#137A43] transition-colors bg-white shadow-2xs tabular-nums cursor-pointer"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-gray-500 font-mono text-[11px] uppercase tracking-wider font-semibold mb-2">
                Public Note (Optional)
              </label>
              <input 
                type="text" 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reference or memo for recipient..."
                className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-mono p-3 pl-4 rounded-xl focus:outline-none focus:border-[#137A43] focus:bg-white transition-all text-xs"
                maxLength={60}
              />
            </div>

            <div className="pt-2">
              <Button 
                variant="accent"
                className="w-full py-3.5 text-sm font-sans font-medium" 
                onClick={handleReview}
                disabled={!recipient || !amount}
              >
                Review Payment
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="border-b border-[#E5E5E2] pb-4 flex items-center justify-between">
              <h3 className="text-gray-900 font-serif font-bold text-lg flex items-center gap-2">
                <CreditCard size={18} className="text-[#137A43]"/> Payment Verification
              </h3>
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider font-semibold">Atomic Transfer</span>
            </div>
            
            <div className="space-y-4 font-mono">
              <div className="bg-[#FBFBFA] border border-[#E5E5E2] p-4 rounded-2xl">
                <span className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold block mb-1.5">Recipient</span>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-gray-900 font-serif font-bold text-xl">{recipient}</div>
                    {isResolved && <div className="text-gray-500 text-xs mt-0.5">{resolvedAddress}</div>}
                  </div>
                  {isResolved && <ReputationBadge name={recipient} showDetails={false} />}
                </div>
              </div>
              
              <div className="flex justify-between items-end py-4 border-y border-[#E5E5E2]">
                <span className="text-gray-500 text-[11px] uppercase tracking-wider font-semibold">Total USDC Amount</span>
                <span className="text-3xl font-mono text-gray-900 font-bold tabular-nums">
                  {amount} <span className="text-sm text-gray-400 font-normal">USDC</span>
                </span>
              </div>

              {note && (
                <div className="bg-[#FBFBFA] p-3 rounded-xl border border-[#E5E5E2]">
                  <span className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold block mb-1">On-Chain Memo</span>
                  <p className="text-gray-900 text-xs italic">"{note}"</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStep('edit')} disabled={txStatus !== 'idle'} className="px-5 text-xs font-mono">
                Back
              </Button>
              <Button variant="accent" className="flex-1 py-3 text-xs font-mono font-semibold" onClick={handleConfirm} disabled={txStatus !== 'idle'}>
                {txStatus === 'idle' && 'Confirm and Send with Passkey'}
                {txStatus === 'approving' && 'Approving USDC...'}
                {txStatus === 'confirming' && 'Sending Payment...'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

const NameProfileView = ({ 
  name, 
  navigateTo,
  auth,
}: { 
  name: string; 
  navigateTo: (view: string, data?: string | null) => void;
  auth?: AuthState;
}) => {
  const clean = cleanName(name);

  const { data: record } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'getNameRecord',
    args: [clean],
    chainId: arcTestnet.id,
  });

  const { data: listing } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'getListing',
    args: [clean],
    chainId: arcTestnet.id,
  });

  const [directRecord, setDirectRecord] = useState<{ owner: string; expiry: bigint; listed: boolean } | null>(null);
  const [directListing, setDirectListing] = useState<{ seller: string; price: bigint; active: boolean } | null>(null);
  const [isLoadingDirect, setIsLoadingDirect] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchDirect() {
      setIsLoadingDirect(true);
      try {
        const [rec, list] = await Promise.all([
          fallbackPublicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getNameRecord',
            args: [clean],
          }).catch(() => null),
          fallbackPublicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getListing',
            args: [clean],
          }).catch(() => null),
        ]);
        if (!cancelled) {
          if (rec) setDirectRecord(rec as any);
          if (list) setDirectListing(list as any);
        }
      } catch (err) {
        console.warn('Error fetching name record directly:', err);
      } finally {
        if (!cancelled) setIsLoadingDirect(false);
      }
    }
    fetchDirect();
    return () => {
      cancelled = true;
    };
  }, [clean]);

  const activeRecord = record || directRecord;
  const activeListing = listing || directListing;

  const mockListing = INITIAL_MOCK_LISTINGS.find(l => l.name === name || cleanName(l.name) === clean);
  const mockName = INITIAL_MOCK_NAMES.find(n => n.name === name || cleanName(n.name) === clean);
  const isActivelyListed = !!(activeListing && activeListing.active && activeListing.seller !== '0x0000000000000000000000000000000000000000');
  const soldListing = clean === 'maler' || isActivelyListed ? null : getSoldListings().find(s => cleanName(s.name) === clean);
  const isKnownOnchain = CONFIRMED_ONCHAIN_NAMES.some(c => cleanName(c) === clean);

  const hasOnchainOwner = !!(activeRecord && activeRecord.owner && activeRecord.owner !== '0x0000000000000000000000000000000000000000');
  const isRegistered = hasOnchainOwner || isActivelyListed || !!soldListing || (isKnownOnchain && !mockName) || !!mockName || !!mockListing;

  const ownerStr = (hasOnchainOwner 
    ? activeRecord.owner 
    : isActivelyListed 
      ? activeListing.seller 
      : soldListing 
        ? soldListing.buyer 
        : mockListing 
          ? mockListing.seller 
          : mockName?.owner || "") as string;
  const listingPrice = isActivelyListed ? Number(formatUnits(activeListing.price, 6)) : mockListing ? mockListing.price : null;

  const isOwnerAddress = ownerStr.startsWith('0x') && ownerStr.length === 42;
  const { data: repRecord } = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getReputation',
    args: isOwnerAddress ? [ownerStr as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: isOwnerAddress },
  });

  const isOwner = !!(auth?.address && isAddressMatch(ownerStr, auth.address));
  const [activeProfileTab, setActiveProfileTab] = useState<'activity' | 'subdomains'>('activity');
  const [subdomains, setSubdomains] = useState<SubdomainRecord[]>(() => getSubdomainsForParent(clean));
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [newSublabel, setNewSublabel] = useState('');
  const [newSubTarget, setNewSubTarget] = useState(auth?.address || '');
  const [newSubNote, setNewSubNote] = useState('');
  const [isCreatingSub, setIsCreatingSub] = useState(false);

  useEffect(() => {
    setSubdomains(getSubdomainsForParent(clean));
    const handleSubs = () => setSubdomains(getSubdomainsForParent(clean));
    window.addEventListener('ans_subdomains_changed', handleSubs);
    return () => window.removeEventListener('ans_subdomains_changed', handleSubs);
  }, [clean]);

  const handleCreateSubdomain = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = saveSubdomain(clean, newSublabel, newSubTarget || ownerStr, newSubNote);
      toast.success(`Subdomain ${created.fullName} published!`);
      setNewSublabel('');
      setNewSubNote('');
      setIsCreatingSub(false);
      setSubdomains(getSubdomainsForParent(clean));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create subdomain');
    }
  };

  const [activities, setActivities] = useState<NameActivityItem[]>([]);

  useEffect(() => {
    const list = getRealisticNameActivities({
      name,
      hasOnchainOwner: !!hasOnchainOwner,
      ownerAddress: hasOnchainOwner ? ownerStr : undefined,
      expirySeconds: activeRecord ? Number(activeRecord.expiry) : undefined,
      memberSinceSeconds: repRecord ? Number(repRecord.memberSince) : undefined,
      isMockName: !hasOnchainOwner && !!mockName,
    });
    setActivities(list);

    const onUpdate = () => {
      const updated = getRealisticNameActivities({
        name,
        hasOnchainOwner: !!hasOnchainOwner,
        ownerAddress: hasOnchainOwner ? ownerStr : undefined,
        expirySeconds: activeRecord ? Number(activeRecord.expiry) : undefined,
        memberSinceSeconds: repRecord ? Number(repRecord.memberSince) : undefined,
        isMockName: !hasOnchainOwner && !!mockName,
      });
      setActivities(updated);
    };

    window.addEventListener('ans_activity_updated', onUpdate);
    return () => window.removeEventListener('ans_activity_updated', onUpdate);
  }, [name, hasOnchainOwner, activeRecord, repRecord, mockName, ownerStr]);

  if (isLoadingDirect && !activeRecord && !activeListing) {
    return (
      <div className="max-w-2xl mx-auto pt-32 px-6 text-center pb-32">
        <div className="w-8 h-8 border-3 border-[#137A43] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h2 className="text-2xl font-serif font-bold text-gray-900 mb-2">Resolving {name}...</h2>
        <p className="text-gray-500 font-sans text-sm">Querying Arc Network on-chain registry</p>
      </div>
    );
  }

  if (!isRegistered) {
    return (
      <div className="max-w-2xl mx-auto pt-32 px-6 text-center pb-32">
        <h1 className="text-4xl font-serif font-bold text-gray-900 mb-4">{name} is not registered.</h1>
        <p className="text-gray-500 font-sans text-lg mb-10">This identity is available on Arc.</p>
        <Button variant="accent" onClick={() => navigateTo('names')} className="mx-auto px-10 py-3.5">Register Now</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pt-14 pb-32 px-6">
      {/* Jakob's Law: Standard Breadcrumb / Back button */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigateTo('names')}
          className="inline-flex items-center gap-2 text-xs font-mono font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer group py-1"
        >
          <ArrowRightIcon size={14} className="rotate-180 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Explorer</span>
        </button>
        <span className="text-[11px] font-mono text-gray-400">Arc Identity Registry</span>
      </div>

      <Card noPadding className="overflow-hidden shadow-sm border-[#E5E5E2] rounded-2xl">
        <div className="bg-white p-8 md:p-12 border-b border-[#E5E5E2] flex flex-col md:flex-row items-start md:items-end justify-between gap-8 relative overflow-hidden">
          
          <div className="z-10 w-full">
            <h1 className="text-5xl md:text-6xl font-serif font-bold text-gray-900 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 tracking-tight">
              {name}
              <div className="self-start sm:self-auto mt-2 sm:mt-0 flex items-center gap-2">
                <ReputationBadge name={name} />
                {isActivelyListed ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#137A43] text-white rounded-full text-[10px] font-mono font-bold uppercase tracking-wider">
                    <Store size={10} className="text-white" /> Listed for Sale ({listingPrice} USDC)
                  </span>
                ) : soldListing && !hasOnchainOwner ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#141413] text-white rounded-full text-[10px] font-mono font-bold uppercase tracking-wider">
                    <Check size={10} className="text-[#86EFAC]" /> Sold Out
                  </span>
                ) : null}
              </div>
            </h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-gray-500 font-mono text-xs sm:text-sm flex-wrap">
              <span className="flex items-center gap-2"><span className="text-gray-400 font-sans text-[10px] font-bold uppercase tracking-wider">Owner</span> {ownerStr}</span>
              {(() => {
                const regActivity = activities.find(a => a.action === 'Registered Name' || a.action === 'Gifted Name');
                if (!regActivity?.timestamp) return null;
                return (
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-400 font-sans text-[10px] font-bold uppercase tracking-wider">Registered</span>
                    <span className="text-gray-700 font-mono text-xs">{new Date(regActivity.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </span>
                );
              })()}
              {activeRecord && activeRecord.expiry ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-gray-400 font-sans text-[10px] font-bold uppercase tracking-wider">Expires</span>
                  <span className="text-gray-700 font-mono text-xs">{new Date(Number(activeRecord.expiry) * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </span>
              ) : null}
              <a 
                href={`https://explorer.testnet.arc.io/address/${ownerStr}`} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
              >
                <ArrowUpRight size={14}/> View on Arcscan
              </a>
            </div>

            <div className="mt-3">
              <button
                onClick={() => navigateTo('userprofile', ownerStr)}
                className="text-xs font-sans font-semibold text-[#137A43] hover:underline flex items-center gap-1"
              >
                View owner profile →
              </button>
            </div>

            <OwnerProfileSnippet ownerStr={ownerStr} navigateTo={navigateTo} />
          </div>
          
          <div className="flex flex-col gap-2.5 w-full md:w-auto z-10 shrink-0">
            <Button variant="accent" onClick={() => navigateTo('send', name)} className="w-full md:w-auto py-3 px-6 text-xs font-sans font-medium">
              <Send size={13} className="mr-1.5 inline" /> Send Payment
            </Button>
            <Button variant="secondary" onClick={() => setIsShareModalOpen(true)} className="w-full md:w-auto py-2.5 px-6 text-xs font-sans font-medium bg-white border-[#E5E5E2] text-gray-900 hover:bg-[#FBFBFA]">
              <Share size={13} className="mr-1.5 inline" /> Share & QR
            </Button>
            {listingPrice !== null && (
              <Button variant="primary" onClick={() => navigateTo('marketplace')} className="w-full md:w-auto py-3 px-6 text-xs font-mono font-semibold">
                Acquire via Escrow: {listingPrice} USDC
              </Button>
            )}
          </div>
        </div>

        {/* Navigation Tabs between Activity Ledger and Subdomains */}
        <div className="flex items-center gap-6 border-b border-[#E5E5E2] px-8 md:px-12 pt-4 bg-white">
          <button
            onClick={() => setActiveProfileTab('activity')}
            className={`pb-3 text-sm font-sans font-medium flex items-center gap-2 border-b-2 transition-colors ${
              activeProfileTab === 'activity'
                ? 'border-[#137A43] text-gray-900 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <History size={15} />
            <span>Activity Ledger</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {activities.length}
            </span>
          </button>

          <button
            onClick={() => setActiveProfileTab('subdomains')}
            className={`pb-3 text-sm font-sans font-medium flex items-center gap-2 border-b-2 transition-colors ${
              activeProfileTab === 'subdomains'
                ? 'border-[#137A43] text-gray-900 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Globe size={15} />
            <span>Subdomains</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#137A43] font-bold">
              {subdomains.length}
            </span>
          </button>
        </div>

        {activeProfileTab === 'activity' && (
          <div className="p-8 md:p-12 bg-[#FBFBFA]">
            <h3 className="text-xl font-serif font-bold text-gray-900 mb-8 flex items-center gap-3">
              <History size={18} className="text-[#137A43]" /> Activity Ledger
            </h3>
          
          {activities.length > 0 ? (
            <div className="space-y-2">
              {activities.map((tx) => {
                const getActionIcon = () => {
                  switch (tx.action) {
                    case 'Registered Name':
                      return <Shield size={18} className="text-[#137A43]" />;
                    case 'Gifted Name':
                      return <Gift size={18} className="text-[#137A43]" />;
                    case 'Bought Name':
                      return <ShoppingCart size={18} className="text-[#137A43]" />;
                    case 'Sold Name':
                      return <Tag size={18} className="text-[#137A43]" />;
                    case 'Received Tip':
                      return <CreditCard size={18} className="text-[#137A43]" />;
                    case 'Sent Tip':
                      return <Send size={18} className="text-[#137A43]" />;
                    case 'Renewed Name':
                      return <RefreshCw size={18} className="text-[#137A43]" />;
                    case 'Listed for Sale':
                      return <Tag size={18} className="text-[#137A43]" />;
                    case 'Transferred Name':
                      return <ArrowRightLeft size={18} className="text-[#137A43]" />;
                    default:
                      return <CreditCard size={18} className="text-[#137A43]" />;
                  }
                };

                return (
                  <div key={tx.id} className="flex flex-col sm:flex-row justify-between sm:items-center py-4 border-b border-[#E5E5E2] last:border-0 gap-4 hover:bg-white -mx-3 px-3 rounded-xl transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-white border border-[#E5E5E2] flex items-center justify-center shadow-sm shrink-0">
                        {getActionIcon()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-gray-900 font-sans font-semibold text-sm">{tx.action}</p>
                          {tx.txHash && (
                            <a
                              href={`https://explorer.testnet.arc.io/tx/${tx.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-gray-400 hover:text-gray-900 transition-colors p-0.5 rounded"
                              title="View on Explorer"
                            >
                              <ArrowUpRight size={13} />
                            </a>
                          )}
                        </div>
                        {tx.action === 'Sold Name' ? (
                          <div className="text-xs mt-1 flex flex-wrap items-center gap-1.5 font-mono">
                            <span className="text-gray-500 font-sans font-medium">Sold by:</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (tx.from && tx.from.startsWith('0x')) navigateTo('userprofile', tx.from);
                              }}
                              className="text-[#137A43] hover:underline font-semibold bg-[#E8F5E9] hover:bg-[#DEF2E3] px-2 py-0.5 rounded-md transition-colors inline-flex items-center gap-1"
                              title={`View seller profile (${tx.from})`}
                            >
                              <User size={11} className="shrink-0" />
                              <span>{tx.from.startsWith('0x') ? `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}` : tx.from}</span>
                            </button>
                            {tx.to && (
                              <>
                                <span className="text-gray-400 font-sans">to</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (tx.to && tx.to.startsWith('0x')) navigateTo('userprofile', tx.to);
                                  }}
                                  className="text-gray-700 hover:text-gray-900 hover:underline bg-[#F5F5F3] hover:bg-[#EDEDEB] px-2 py-0.5 rounded-md transition-colors inline-flex items-center gap-1"
                                  title={`View buyer profile (${tx.to})`}
                                >
                                  <span>{tx.to.startsWith('0x') ? `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}` : tx.to}</span>
                                </button>
                              </>
                            )}
                          </div>
                        ) : tx.action === 'Bought Name' ? (
                          <div className="text-xs mt-1 flex flex-wrap items-center gap-1.5 font-mono">
                            <span className="text-gray-500 font-sans font-medium">Purchased by:</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (tx.to && tx.to.startsWith('0x')) navigateTo('userprofile', tx.to);
                              }}
                              className="text-[#137A43] hover:underline font-semibold bg-[#E8F5E9] hover:bg-[#DEF2E3] px-2 py-0.5 rounded-md transition-colors inline-flex items-center gap-1"
                              title={`View buyer profile (${tx.to})`}
                            >
                              <User size={11} className="shrink-0" />
                              <span>{tx.to && tx.to.startsWith('0x') ? `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}` : tx.to || 'Buyer'}</span>
                            </button>
                            {tx.from && (
                              <>
                                <span className="text-gray-400 font-sans">from</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (tx.from && tx.from.startsWith('0x')) navigateTo('userprofile', tx.from);
                                  }}
                                  className="text-gray-700 hover:text-gray-900 hover:underline bg-[#F5F5F3] hover:bg-[#EDEDEB] px-2 py-0.5 rounded-md transition-colors inline-flex items-center gap-1"
                                  title={`View seller profile (${tx.from})`}
                                >
                                  <span>{tx.from.startsWith('0x') ? `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}` : tx.from}</span>
                                </button>
                              </>
                            )}
                          </div>
                        ) : tx.action === 'Registered Name' ? (
                          <p className="text-gray-500 font-mono text-xs mt-0.5">
                            <span className="text-gray-400 font-sans">Minted via </span>
                            <span className="font-semibold text-gray-700">{tx.from}</span>
                            {tx.to && tx.to !== 'Arc Protocol' && (
                              <>
                                <span className="text-gray-400 font-sans"> to </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (tx.to && tx.to.startsWith('0x')) navigateTo('userprofile', tx.to);
                                  }}
                                  className="text-[#137A43] hover:underline font-medium"
                                >
                                  {tx.to.startsWith('0x') ? `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}` : tx.to}
                                </button>
                              </>
                            )}
                          </p>
                        ) : (
                          <p className="text-gray-500 font-mono text-xs mt-0.5">
                            {tx.from}
                            {tx.note && <span className="text-gray-600 font-sans italic ml-2">"{tx.note}"</span>}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-gray-900 font-mono font-bold text-sm tabular-nums">{tx.amount}</p>
                      <div className="flex items-center sm:justify-end gap-1.5 mt-0.5">
                        <span className="text-gray-400 font-mono text-[11px]">{formatRelativeTime(tx.timestamp)}</span>
                        {tx.txHash && (
                          <a
                            href={`https://explorer.testnet.arc.io/tx/${tx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-[#137A43] transition-colors p-0.5"
                            title="View on Arcscan"
                          >
                            <ArrowUpRight size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
              <History size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="font-sans text-sm">No activity recorded yet for this name.</p>
            </div>
          )}
        </div>
        )}

        {activeProfileTab === 'subdomains' && (
          <div className="p-8 md:p-12 bg-[#FBFBFA] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-serif font-bold text-gray-900 flex items-center gap-2">
                  <Globe size={18} className="text-[#137A43]" /> Subdomain Registry
                </h3>
                <p className="text-gray-500 font-sans text-xs mt-1">
                  Route custom subdomains under <span className="font-mono font-semibold text-gray-800">{name}</span> to separate Arc addresses or payment vaults.
                </p>
              </div>
              {isOwner && (
                <Button
                  variant="primary"
                  onClick={() => setIsCreatingSub(!isCreatingSub)}
                  className="text-xs font-sans font-semibold px-4 py-2 flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Plus size={14} />
                  <span>{isCreatingSub ? 'Close Form' : 'Create Subdomain'}</span>
                </Button>
              )}
            </div>

            {/* Creation Form for Owner */}
            {isOwner && isCreatingSub && (
              <form onSubmit={handleCreateSubdomain} className="bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-sm space-y-4">
                <h4 className="font-serif font-bold text-sm text-gray-900">Issue New Subdomain</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-gray-500 font-semibold mb-1">
                      Subdomain Prefix
                    </label>
                    <div className="flex rounded-xl border border-[#E5E5E2] overflow-hidden bg-[#FBFBFA] focus-within:border-[#137A43]">
                      <input
                        type="text"
                        value={newSublabel}
                        onChange={(e) => setNewSublabel(e.target.value.toLowerCase().trim())}
                        placeholder="e.g. pay or vault"
                        className="w-full bg-transparent px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none"
                      />
                      <span className="px-3 py-2 text-gray-500 text-xs font-mono bg-[#F5F5F3] border-l border-[#E5E5E2] flex items-center shrink-0">
                        .{clean}.arc
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-mono uppercase text-gray-500 font-semibold">
                        Target Arc Address
                      </label>
                      {auth?.address && (
                        <button
                          type="button"
                          onClick={() => setNewSubTarget(auth.address || '')}
                          className="text-[10px] text-[#137A43] hover:underline font-semibold"
                        >
                          Use My Address
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={newSubTarget}
                      onChange={(e) => setNewSubTarget(e.target.value.trim())}
                      placeholder="0x..."
                      className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-mono text-xs p-2.5 rounded-xl focus:outline-none focus:border-[#137A43]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono uppercase text-gray-500 font-semibold mb-1">
                    Label / Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={newSubNote}
                    onChange={(e) => setNewSubNote(e.target.value)}
                    placeholder="e.g. Treasury endpoint or Personal tip jar"
                    className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans text-xs p-2.5 rounded-xl focus:outline-none focus:border-[#137A43]"
                    maxLength={100}
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingSub(false)}
                    className="px-4 py-2 text-xs font-sans font-medium text-gray-500 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                  <Button variant="accent" type="submit" className="text-xs font-sans font-semibold px-5 py-2">
                    Publish Subdomain
                  </Button>
                </div>
              </form>
            )}

            {/* List of Subdomains */}
            {subdomains.length === 0 ? (
              <div className="bg-white border border-[#E5E5E2] rounded-2xl p-8 text-center">
                <Globe size={28} className="text-gray-300 mx-auto mb-2" />
                <p className="font-serif font-bold text-gray-800 text-base">No Subdomains Configured</p>
                <p className="font-sans text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  {isOwner
                    ? `You can create subdomains like pay.${clean}.arc or vault.${clean}.arc pointing directly to any Arc address.`
                    : 'The owner has not published any subdomains under this name yet.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {subdomains.map((sub) => (
                  <div
                    key={sub.fullName}
                    className="bg-white border border-[#E5E5E2] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs hover:border-[#137A43]/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-serif font-bold text-base text-gray-900">{sub.fullName}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#137A43] font-semibold">
                          Active
                        </span>
                      </div>
                      <p className="font-mono text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                        <span className="text-gray-400 font-sans text-[11px]">Points to:</span>
                        <span className="font-semibold text-gray-700">{sub.targetAddress.slice(0, 8)}...{sub.targetAddress.slice(-6)}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(sub.targetAddress);
                            toast.success('Target address copied!');
                          }}
                          className="p-1 hover:text-[#137A43] text-gray-400 transition-colors"
                          title="Copy target address"
                        >
                          <Copy size={12} />
                        </button>
                      </p>
                      {sub.note && (
                        <p className="font-sans text-xs text-gray-500 italic mt-0.5">"{sub.note}"</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        onClick={() => navigateTo('send', sub.fullName)}
                        className="text-xs font-sans font-medium px-3.5 py-1.5 flex items-center gap-1"
                      >
                        <Send size={12} />
                        <span>Pay</span>
                      </Button>
                      {isOwner && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete subdomain ${sub.fullName}?`)) {
                              deleteSubdomain(clean, sub.sublabel);
                              setSubdomains(getSubdomainsForParent(clean));
                              toast.success(`Subdomain ${sub.fullName} deleted.`);
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100"
                          title="Delete subdomain"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <ShareQRModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title="Arc Domain Identity"
        name={name}
        address={ownerStr}
        reputationTier={repRecord ? 'Verified' : undefined}
      />
    </div>
  );
};

const UserProfileView = ({
  targetAddress,
  auth,
  navigateTo,
}: {
  targetAddress: string;
  auth: AuthState;
  navigateTo: (view: string, data?: string | null) => void;
}) => {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile(targetAddress));
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [copied, setCopied] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'portfolio' | 'analytics' | 'activity'>('overview');
  const [pnlViewMode, setPnlViewMode] = useState<'realized' | 'total'>('realized');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'realized' | 'held'>('all');
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [isBannerSaving, setIsBannerSaving] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  const { setAvatar } = useANS(auth.credential);

  useEffect(() => {
    // 1. Instantly show local cached profile
    const p = loadProfile(targetAddress);
    setProfile(p);
    setFormData(p);

    // 2. Fetch remote profile from Supabase globally
    let isCancelled = false;
    fetchProfileGlobal(targetAddress).then((remote) => {
      if (!isCancelled && remote) {
        setProfile(remote);
        setFormData(remote);
      }
    });

    // 3. Real-time subscription to profile updates
    const unsubscribe = subscribeToProfile(targetAddress, (updated) => {
      if (!isCancelled) {
        setProfile(updated);
        setFormData(updated);
      }
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [targetAddress]);

  const isOwner = !!(auth.address && targetAddress && auth.address.toLowerCase() === targetAddress.toLowerCase());

  const handleCopy = async () => {
    await navigator.clipboard.writeText(targetAddress);
    setCopied(true);
    toast.success('Address copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingProfile(true);
      toast.loading('Saving profile globally...', { id: 'save-profile' });
      const res = await saveProfileGlobal(formData);
      setProfile(formData);
      setIsEditing(false);
      if (res.globalSaved) {
        toast.success('Profile saved and published globally!', { id: 'save-profile' });
      } else {
        toast.success('Profile saved locally!', { id: 'save-profile', description: res.error });
      }
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      toast.error('Failed to save profile', { id: 'save-profile' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be smaller than 10MB");
      return;
    }

    try {
      setIsAvatarSaving(true);
      toast.loading("Compressing and saving avatar...", { id: "pfp-save" });
      const base64Url = await compressImage(file, 400, 400, 0.85);
      const updatedProfile = { ...profile, avatarUrl: base64Url };
      
      const res = await saveProfileGlobal(updatedProfile);
      setProfile(updatedProfile);
      setFormData(updatedProfile);
      
      if (res.globalSaved) {
        toast.success("Profile photo updated globally!", { id: "pfp-save" });
      } else {
        toast.success("Avatar updated locally!", { id: "pfp-save", description: res.error });
      }
    } catch (err) {
      console.error("Avatar upload failed:", err);
      toast.error("Failed to upload avatar", { id: "pfp-save" });
    } finally {
      setIsAvatarSaving(false);
      e.target.value = '';
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be smaller than 10MB");
      return;
    }

    try {
      setIsBannerSaving(true);
      toast.loading("Compressing and saving banner...", { id: "banner-save" });
      const base64Url = await compressImage(file, 1400, 500, 0.85);
      const updatedProfile = { ...profile, bannerUrl: base64Url };
      
      const res = await saveProfileGlobal(updatedProfile);
      setProfile(updatedProfile);
      setFormData(updatedProfile);
      
      if (res.globalSaved) {
        toast.success("Banner updated globally across all devices!", { id: "banner-save" });
      } else {
        toast.success("Banner saved locally!", { id: "banner-save", description: res.error });
      }
    } catch (err) {
      console.error("Banner upload failed:", err);
      toast.error("Failed to upload banner", { id: "banner-save" });
    } finally {
      setIsBannerSaving(false);
      e.target.value = '';
    }
  };

  const { data: rawOwnedNames, isLoading: isNamesLoading } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'getNamesByOwner',
    args: targetAddress ? [targetAddress as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const [directOwnedNames, setDirectOwnedNames] = useState<string[] | null>(null);
  const [directRepRecord, setDirectRepRecord] = useState<any>(null);
  const [directTierNum, setDirectTierNum] = useState<number | null>(null);

  useEffect(() => {
    if (!targetAddress) return;
    setDirectOwnedNames(null);
    setDirectRepRecord(null);
    setDirectTierNum(null);
    let cancelled = false;

    async function fetchDirectUserData() {
      try {
        const [names, rep, tier] = await Promise.all([
          fallbackPublicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getNamesByOwner',
            args: [targetAddress as Address],
          }).catch(() => null),
          fallbackPublicClient.readContract({
            address: REPUTATION_ADDRESS,
            abi: REPUTATION_ABI,
            functionName: 'getReputation',
            args: [targetAddress as Address],
          }).catch(() => null),
          fallbackPublicClient.readContract({
            address: REPUTATION_ADDRESS,
            abi: REPUTATION_ABI,
            functionName: 'getTier',
            args: [targetAddress as Address],
          }).catch(() => null),
        ]);

        if (!cancelled) {
          if (names && Array.isArray(names)) {
            setDirectOwnedNames(names as string[]);
          }
          if (rep) {
            setDirectRepRecord(rep);
          }
          if (tier !== null && tier !== undefined) {
            setDirectTierNum(Number(tier));
          }
        }
      } catch (err) {
        console.warn('Direct user query failed:', err);
      }

      // Sync activities on-chain via explorer API
      try {
        await syncUserActivitiesFromChain(targetAddress);
      } catch {}
    }

    fetchDirectUserData();

    return () => {
      cancelled = true;
    };
  }, [targetAddress]);

  const { data: onchainAvatarUrl, refetch: refetchAvatar } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'avatars',
    args: targetAddress ? [targetAddress as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const effectiveRawOwnedNamesStr = (rawOwnedNames && (rawOwnedNames as string[]).length > 0)
    ? (rawOwnedNames as string[]).join(',')
    : (directOwnedNames ? directOwnedNames.join(',') : '');

  const ownedNames = useMemo(() => {
    const baseNames = effectiveRawOwnedNamesStr ? effectiveRawOwnedNamesStr.split(',') : [];
    return baseNames.filter(n => n.length > 0).map(n => n.endsWith('.arc') ? n : `${n}.arc`);
  }, [effectiveRawOwnedNamesStr]);

  const { data: tierNum } = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getTier',
    args: targetAddress ? [targetAddress as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const { data: repRecord } = useReadContract({
    address: REPUTATION_ADDRESS,
    abi: REPUTATION_ABI,
    functionName: 'getReputation',
    args: targetAddress ? [targetAddress as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!targetAddress },
  });

  const effectiveRepRecord = repRecord || directRepRecord;
  const effectiveTierNum = tierNum !== undefined && tierNum !== null ? tierNum : directTierNum;

  const repStats = useMemo(() => {
    if (effectiveRepRecord) {
      return {
        tier: TIER_NAMES[Number(effectiveTierNum ?? 0)] ?? 'Trusted',
        since: effectiveRepRecord.memberSince > 0n ? new Date(Number(effectiveRepRecord.memberSince) * 1000).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : 'Recent',
        sales: Number(effectiveRepRecord.salesCompleted),
        buys: Number(effectiveRepRecord.purchasesCompleted),
        tips: Number(effectiveRepRecord.tipsGiftsGiven),
        disputes: Number(effectiveRepRecord.disputeFlags),
      };
    }
    return { tier: 'New', since: 'Recent', sales: 0, buys: 0, tips: 0, disputes: 0 };
  }, [effectiveRepRecord, effectiveTierNum]);

  const avatarDisplay = profile.avatarUrl || profile.avatar?.trim() || (profile.displayName ? profile.displayName.slice(0, 2).toUpperCase() : targetAddress.slice(0, 4));

  const bannerGradient = useMemo(() => {
    const num = targetAddress ? parseInt(targetAddress.slice(2, 8), 16) : 0;
    const hue1 = num % 360;
    const hue2 = (hue1 + 40) % 360;
    return `linear-gradient(135deg, hsl(${hue1}, 80%, 15%), hsl(${hue2}, 80%, 5%))`;
  }, [targetAddress]);

  const [userActivities, setUserActivities] = useState<NameActivityItem[]>(() => {
    return targetAddress ? getUserActivities(targetAddress, ownedNames) : [];
  });

  useEffect(() => {
    if (!targetAddress) return;
    const loadActivities = () => {
      const acts = getUserActivities(targetAddress, ownedNames);
      setUserActivities(prev => {
        if (prev.length === acts.length && prev.every((p, i) => p.id === acts[i]?.id && p.timestamp === acts[i]?.timestamp)) {
          return prev;
        }
        return acts;
      });
    };

    loadActivities();

    window.addEventListener('ans_activity_updated', loadActivities);
    window.addEventListener('ans_marketplace_updated', loadActivities);
    window.addEventListener('ans_primary_changed', loadActivities);

    return () => {
      window.removeEventListener('ans_activity_updated', loadActivities);
      window.removeEventListener('ans_marketplace_updated', loadActivities);
      window.removeEventListener('ans_primary_changed', loadActivities);
    };
  }, [targetAddress, effectiveRawOwnedNamesStr]);

  const pnlAnalysis = useMemo(() => {
    if (!targetAddress) return null;
    const allSold = getSoldListings();
    const salesMade = allSold.filter(s => isAddressMatch(s.seller, targetAddress));
    const saleActivities = userActivities.filter(a => a.action === 'Sold Name');

    let grossSalesUSDC = 0;
    const soldNamesSet = new Set<string>();
    for (const s of salesMade) {
      grossSalesUSDC += Number(s.price) || 0;
      soldNamesSet.add(cleanName(s.name));
    }
    for (const a of saleActivities) {
      if (!soldNamesSet.has(cleanName(a.name))) {
        const match = a.amount.match(/([0-9.]+)/);
        if (match) grossSalesUSDC += parseFloat(match[1]);
        soldNamesSet.add(cleanName(a.name));
      }
    }

    const protocolFeesPaid = grossSalesUSDC * 0.025;
    const netSalesRevenue = grossSalesUSDC * 0.975;

    let tipsReceivedUSDC = 0;
    for (const a of userActivities) {
      if (a.action === 'Received Tip') {
        const match = a.amount.match(/([0-9.]+)/);
        if (match) tipsReceivedUSDC += parseFloat(match[1]);
      }
    }

    const totalInflow = netSalesRevenue + tipsReceivedUSDC;

    let registrationsCost = 0;
    let secondaryPurchasesCost = 0;
    let renewalsCost = 0;
    let tipsSentCost = 0;

    for (const a of userActivities) {
      const match = a.amount.match(/([0-9.]+)/);
      const val = match ? parseFloat(match[1]) : 0;
      if (a.action === 'Registered Name') {
        registrationsCost += val;
      } else if (a.action === 'Bought Name') {
        secondaryPurchasesCost += val;
      } else if (a.action === 'Renewed Name') {
        renewalsCost += val;
      } else if (a.action === 'Sent Tip') {
        tipsSentCost += val;
      }
    }

    const purchasesMade = allSold.filter(s => isAddressMatch(s.buyer, targetAddress));
    for (const p of purchasesMade) {
      if (!userActivities.some(a => a.action === 'Bought Name' && cleanName(a.name) === cleanName(p.name))) {
        secondaryPurchasesCost += Number(p.price) || 0;
      }
    }

    const totalCapitalDeployed = registrationsCost + secondaryPurchasesCost + renewalsCost + tipsSentCost;
    const netRealizedPnL = totalInflow - totalCapitalDeployed;
    const isProfitable = netRealizedPnL >= 0;
    const roiPercentage = totalCapitalDeployed > 0
      ? ((netRealizedPnL / totalCapitalDeployed) * 100)
      : (totalInflow > 0 ? 100 : 0);

    // Dynamic Market Floor Comps based on real completed secondary sales
    const tierComps: Record<string, { count: number; sumPrice: number; floorPrice: number }> = {
      '3': { count: 0, sumPrice: 0, floorPrice: Infinity },
      '4': { count: 0, sumPrice: 0, floorPrice: Infinity },
      '5': { count: 0, sumPrice: 0, floorPrice: Infinity },
      '6+': { count: 0, sumPrice: 0, floorPrice: Infinity },
    };

    for (const s of allSold) {
      const clean = cleanName(s.name);
      const price = Number(s.price) || 0;
      if (price <= 0) continue;
      const tierKey = clean.length <= 3 ? '3' : clean.length === 4 ? '4' : clean.length === 5 ? '5' : '6+';
      const c = tierComps[tierKey];
      c.count++;
      c.sumPrice += price;
      if (price < c.floorPrice) c.floorPrice = price;
    }

    const getTierFloor = (cleanLen: number): { value: number; isMarketComp: boolean } => {
      const tierKey = cleanLen <= 3 ? '3' : cleanLen === 4 ? '4' : cleanLen === 5 ? '5' : '6+';
      const comp = tierComps[tierKey];
      if (comp.count > 0 && comp.floorPrice !== Infinity) {
        return { value: comp.floorPrice, isMarketComp: true };
      }
      const fallback = cleanLen <= 3 ? 5.0 : cleanLen === 4 ? 3.0 : cleanLen === 5 ? 1.5 : 0.5;
      return { value: fallback, isMarketComp: false };
    };

    let estimatedPortfolioValue = 0;
    let totalHeldCostBasis = 0;
    let hasMarketComps = false;

    const nameLedgerMap = new Map<string, {
      name: string;
      acquiredVia: 'Mint' | 'Secondary';
      costBasis: number;
      soldPrice: number | null;
      currentValuation: number | null;
      netPnL: number;
      status: 'Realized Sale' | 'Currently Held';
      isMarketComp: boolean;
      date: number;
    }>();

    for (const name of ownedNames) {
      const clean = cleanName(name);
      const regActivity = userActivities.find(a => cleanName(a.name) === clean && a.action === 'Registered Name');
      const buyActivity = userActivities.find(a => cleanName(a.name) === clean && a.action === 'Bought Name');
      let cost = 0;
      let acquiredVia: 'Mint' | 'Secondary' = 'Mint';
      if (buyActivity) {
        const match = buyActivity.amount.match(/([0-9.]+)/);
        cost = match ? parseFloat(match[1]) : 0;
        acquiredVia = 'Secondary';
      } else if (regActivity) {
        const match = regActivity.amount.match(/([0-9.]+)/);
        cost = match ? parseFloat(match[1]) : (clean.length <= 3 ? 5 : clean.length === 4 ? 3 : 1.5);
      } else {
        cost = clean.length <= 3 ? 5 : clean.length === 4 ? 3 : clean.length === 5 ? 1.5 : 0.5;
      }

      const floorInfo = getTierFloor(clean.length);
      if (floorInfo.isMarketComp) hasMarketComps = true;
      const currentValuation = floorInfo.value;
      estimatedPortfolioValue += currentValuation;
      totalHeldCostBasis += cost;
      const unrealizedPnL = currentValuation - cost;

      nameLedgerMap.set(clean, {
        name: `${clean}.arc`,
        acquiredVia,
        costBasis: cost,
        soldPrice: null,
        currentValuation,
        netPnL: unrealizedPnL,
        status: 'Currently Held',
        isMarketComp: floorInfo.isMarketComp,
        date: regActivity?.timestamp || buyActivity?.timestamp || Date.now(),
      });
    }

    for (const s of salesMade) {
      const clean = cleanName(s.name);
      const existing = nameLedgerMap.get(clean);
      const costBasis = existing ? existing.costBasis : (clean.length <= 3 ? 5 : clean.length === 4 ? 3 : 1.5);
      const soldPrice = Number(s.price) || 0;
      const netRevenue = soldPrice * 0.975;
      const netPnL = netRevenue - costBasis;

      nameLedgerMap.set(clean, {
        name: `${clean}.arc`,
        acquiredVia: existing ? existing.acquiredVia : 'Mint',
        costBasis,
        soldPrice,
        currentValuation: null,
        netPnL,
        status: 'Realized Sale',
        isMarketComp: true,
        date: s.timestamp || Date.now(),
      });
    }

    const flipsLedger = Array.from(nameLedgerMap.values()).sort((a, b) => b.date - a.date);
    const realizedFlips = flipsLedger.filter(f => f.status === 'Realized Sale');
    const heldFlips = flipsLedger.filter(f => f.status === 'Currently Held');
    const profitableFlips = realizedFlips.filter(f => f.netPnL > 0);
    const winRate = realizedFlips.length > 0 ? Math.round((profitableFlips.length / realizedFlips.length) * 100) : 100;
    const avgSalePrice = realizedFlips.length > 0 ? (grossSalesUSDC / realizedFlips.length) : 0;

    const totalUnrealizedPnL = estimatedPortfolioValue - totalHeldCostBasis;
    const totalCombinedPnL = netRealizedPnL + totalUnrealizedPnL;
    const totalCombinedROI = totalCapitalDeployed > 0
      ? ((totalCombinedPnL / totalCapitalDeployed) * 100)
      : (totalCombinedPnL > 0 ? 100 : 0);

    return {
      grossSalesUSDC,
      protocolFeesPaid,
      netSalesRevenue,
      tipsReceivedUSDC,
      totalInflow,
      registrationsCost,
      secondaryPurchasesCost,
      renewalsCost,
      tipsSentCost,
      totalCapitalDeployed,
      netRealizedPnL,
      isProfitable,
      roiPercentage,
      estimatedPortfolioValue,
      totalHeldCostBasis,
      totalUnrealizedPnL,
      totalCombinedPnL,
      totalCombinedROI,
      totalPortfolioWorth: netRealizedPnL + estimatedPortfolioValue,
      flipsLedger,
      realizedFlipsCount: realizedFlips.length,
      heldCount: heldFlips.length,
      winRate,
      avgSalePrice,
      hasMarketComps,
      tierComps,
    };
  }, [targetAddress, userActivities, effectiveRawOwnedNamesStr]);

  const handleExportCSV = useCallback(() => {
    if (!pnlAnalysis || pnlAnalysis.flipsLedger.length === 0) {
      toast.error('No trading ledger records to export');
      return;
    }

    const headers = [
      'Identity Name',
      'Acquisition Type',
      'Date',
      'Cost Basis (USDC)',
      'Sale / Exit Price (USDC)',
      'Floor Valuation (USDC)',
      'Net PnL (USDC)',
      'Return (%)',
      'Holding Status'
    ];

    const rows = pnlAnalysis.flipsLedger.map((item) => {
      const isRealized = item.status === 'Realized Sale';
      const dateStr = new Date(item.date).toISOString().split('T')[0];
      const returnPct = item.costBasis > 0 ? ((item.netPnL / item.costBasis) * 100).toFixed(1) : '0.0';
      return [
        `"${item.name}"`,
        `"${item.acquiredVia}"`,
        `"${dateStr}"`,
        item.costBasis.toFixed(2),
        item.soldPrice !== null ? item.soldPrice.toFixed(2) : 'N/A',
        item.currentValuation !== null ? item.currentValuation.toFixed(2) : 'N/A',
        item.netPnL.toFixed(2),
        `"${returnPct}%"`,
        `"${item.status}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ans-statement-${targetAddress.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Financial statement CSV exported successfully!');
  }, [pnlAnalysis, targetAddress]);

  return (
    <div className="w-full min-h-screen bg-[#FAFAFA] text-gray-900 -mt-16 pt-16 font-sans">
      {/* Banner */}
      <div 
        className="w-full h-48 md:h-64 relative group border-b border-gray-200 overflow-hidden" 
        style={{ 
          background: profile.bannerUrl 
            ? `url("${profile.bannerUrl}") center/cover no-repeat` 
            : bannerGradient 
        }}
      >
        {/* Jakob's Law: Back Navigation */}
        <div className="absolute top-4 left-4 z-20">
          <button
            onClick={() => navigateTo('mynames')}
            className="bg-black/60 hover:bg-black/80 text-white px-3.5 py-2 rounded-xl text-xs font-mono font-medium transition-all flex items-center gap-1.5 border border-white/20 backdrop-blur-md cursor-pointer shadow-lg active:scale-95"
            title="Return to My Names"
          >
            <ArrowRightIcon size={14} className="rotate-180" />
            <span>My Names</span>
          </button>
        </div>

        {isOwner && (
          <label 
            className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-white/20 backdrop-blur-md cursor-pointer shadow-lg hover:scale-105 active:scale-95"
            title="Edit banner image"
          >
            <Camera size={14} />
            <span>{isBannerSaving ? 'Saving Banner...' : 'Edit Banner'}</span>
            <input 
              type="file" 
              className="hidden" 
              accept="image/*" 
              disabled={isBannerSaving}
              onChange={handleBannerUpload} 
            />
          </label>
        )}
      </div>

      <div className="max-w-[1400px] mx-auto px-6 pb-32">
        {/* Profile Header */}
        <div className="relative -mt-16 md:-mt-20 mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="flex flex-col gap-4 w-full md:w-auto z-10">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl border-4 border-white bg-gray-100 flex items-center justify-center text-gray-900 font-serif font-bold text-4xl shadow-xl overflow-hidden shrink-0 relative group">
              {onchainAvatarUrl || profile.avatarUrl ? (
                <img src={(onchainAvatarUrl as string) || profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                avatarDisplay
              )}
              {isOwner && (
                <label 
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity cursor-pointer text-white"
                  title="Upload profile picture"
                >
                  <Camera size={24} className="mb-1" />
                  <span className="text-[10px] font-bold">{isAvatarSaving ? 'Saving...' : 'Upload PFP'}</span>
                  <input type="file" className="hidden" accept="image/*" disabled={isAvatarSaving} onChange={handleImageUpload} />
                </label>
              )}
            </div>

            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                {profile.displayName || (isOwner ? 'Your Profile' : 'Unnamed User')}
                <ReputationBadge name={targetAddress} showDetails={true} />
              </h1>
              <div className="flex items-center gap-2 text-gray-500 font-mono text-sm mt-2">
                <span>{targetAddress.slice(0, 6)}...{targetAddress.slice(-4)}</span>
                <button onClick={handleCopy} title="Copy full address" className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
                  {copied ? <Check size={14} className="text-[#137A43]" /> : <Copy size={14} />}
                </button>
                <span className="text-gray-600 mx-1">|</span>
                <span className="font-sans text-xs">Joined {repStats.since}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0 z-10">
            {isOwner && (
              <Button variant="secondary" onClick={() => setIsEditing(!isEditing)} className="text-sm bg-white border-[#E5E5E2] text-gray-900 hover:bg-gray-100">
                <Edit3 size={16} className="mr-2" /> Edit Profile
              </Button>
            )}
            <Button variant="secondary" onClick={() => setIsShareModalOpen(true)} className="text-sm bg-white border-[#E5E5E2] text-gray-900 hover:bg-gray-100">
               <Share size={16} className="mr-2" /> Share
            </Button>
          </div>
        </div>

        {/* Tabs with exact active green underline indicator */}
        <div className="flex items-center gap-8 border-b border-[#E5E5E2] mb-8 overflow-x-auto no-scrollbar">
          {(['overview', 'portfolio', 'analytics', 'activity'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3.5 text-sm font-sans font-medium capitalize whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${activeTab === tab ? 'border-[#137A43] text-gray-900 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
            >
              {tab === 'portfolio' ? (
                <>
                  <FolderKanban size={15} />
                  <span>Portfolio ({ownedNames.length})</span>
                </>
              ) : tab === 'analytics' ? (
                <>
                  <TrendingUp size={15} className={`transition-transform duration-200 group-hover:scale-125 group-hover:-translate-y-0.5 ${activeTab === 'analytics' ? 'text-[#137A43]' : ''}`} />
                  <span>PnL & Analytics</span>
                </>
              ) : tab === 'activity' ? (
                <>
                  <History size={15} />
                  <span>Activity</span>
                </>
              ) : (
                <>
                  <User size={15} />
                  <span>Overview</span>
                </>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
               {isEditing && isOwner ? (
                 <form onSubmit={handleSave} className="bg-white border border-[#E5E5E2] rounded-2xl p-8 space-y-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="font-serif font-bold text-xl text-gray-900">Edit Profile</h3>
                      <span className="text-xs text-[#137A43] font-sans font-semibold flex items-center gap-1.5 bg-[#E8F5E9] px-2.5 py-1 rounded-full border border-[#137A43]/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#137A43]"></span>
                        Global Profile
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-sans font-medium text-gray-700 mb-2">Display Name</label>
                        <input type="text" value={formData.displayName || ''} onChange={(e) => setFormData(p => ({ ...p, displayName: e.target.value }))} placeholder="e.g. Alice Nakamoto" className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-sans font-medium text-gray-700 mb-2">Email</label>
                        <input type="email" value={formData.email || ''} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="alice@example.com" className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm" />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-sans font-medium text-gray-700">Bio</label>
                        <span className="text-xs font-mono text-gray-500">{(formData.bio?.length || 0)}/160</span>
                      </div>
                      <textarea maxLength={160} rows={3} value={formData.bio || ''} onChange={(e) => setFormData(p => ({ ...p, bio: e.target.value }))} placeholder="Tell the community about yourself (max 160 chars)..." className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm resize-none" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-sans font-medium text-gray-700 mb-2">Twitter Handle</label>
                        <div className="flex rounded-xl border border-[#E5E5E2] overflow-hidden bg-[#FBFBFA] focus-within:border-[#137A43]">
                          <span className="px-3.5 py-3 text-gray-500 text-sm font-mono flex items-center bg-[#FBFBFA] border-r border-[#E5E5E2]">@</span>
                          <input type="text" value={formData.twitter || ''} onChange={(e) => setFormData(p => ({ ...p, twitter: e.target.value.replace(/^@/, '') }))} placeholder="handle" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none font-sans" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-sans font-medium text-gray-700 mb-2">GitHub Username</label>
                        <input type="text" value={formData.github || ''} onChange={(e) => setFormData(p => ({ ...p, github: e.target.value }))} placeholder="username" className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-sans font-medium text-gray-700 mb-2">Telegram Handle</label>
                        <div className="flex rounded-xl border border-[#E5E5E2] overflow-hidden bg-[#FBFBFA] focus-within:border-[#137A43]">
                          <span className="px-3 py-3 text-gray-500 text-sm font-mono flex items-center bg-[#FBFBFA] border-r border-[#E5E5E2]">t.me/</span>
                          <input type="text" value={formData.telegram || ''} onChange={(e) => setFormData(p => ({ ...p, telegram: e.target.value.replace(/^@/, '') }))} placeholder="username" className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none font-sans" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-sans font-medium text-gray-700 mb-2">Discord Tag</label>
                        <input type="text" value={formData.discord || ''} onChange={(e) => setFormData(p => ({ ...p, discord: e.target.value }))} placeholder="username#0000" className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-sans font-medium text-gray-700 mb-2">Website URL</label>
                        <input type="url" value={formData.website || ''} onChange={(e) => setFormData(p => ({ ...p, website: e.target.value }))} placeholder="https://example.com" className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-sans font-medium text-gray-700 mb-2">Location / Timezone</label>
                        <input type="text" value={formData.location || ''} onChange={(e) => setFormData(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Tokyo / UTC+9" className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-sans p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-sm" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-sans font-medium text-gray-700 mb-2">Decentralized Web (IPFS / Contenthash)</label>
                      <input type="text" value={formData.contentHash || ''} onChange={(e) => setFormData(p => ({ ...p, contentHash: e.target.value }))} placeholder="ipfs://bafybeic..." className="w-full bg-[#FBFBFA] border border-[#E5E5E2] text-gray-900 font-mono p-3 rounded-xl focus:outline-none focus:border-[#137A43] text-xs" />
                      <p className="text-[11px] font-sans text-gray-400 mt-1">Allows resolving decentralized web pages hosted on IPFS directly under this identity.</p>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button variant="accent" type="submit" disabled={isSavingProfile} className="text-sm px-6">
                        {isSavingProfile ? 'Saving...' : 'Save Profile'}
                      </Button>
                      <Button variant="secondary" type="button" disabled={isSavingProfile} onClick={() => { setFormData(profile); setIsEditing(false); }} className="text-sm px-6">
                        Cancel
                      </Button>
                    </div>
                 </form>
               ) : (
                 <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-sm">
                    <h3 className="text-sm font-sans font-semibold text-gray-900 mb-4 flex items-center gap-2"><Info size={14} className="text-[#137A43]" /> About & Records</h3>
                    {profile.bio ? (
                      <p className="text-gray-700 font-sans text-base leading-relaxed">{profile.bio}</p>
                    ) : (
                      <p className="text-gray-500 font-sans text-sm italic">No bio provided yet.</p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-2.5 pt-6 mt-6 border-t border-[#E5E5E2]">
                      {isOwner && profile.email && (
                        <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F5F3] border border-[#E5E5E2] text-xs font-mono text-gray-700" title="Private to your wallet">
                          <Mail size={13} className="text-gray-500" />
                          <span>{profile.email}</span>
                        </span>
                      )}
                      {profile.twitter && (
                        <a href={`https://x.com/${profile.twitter}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F5F3] hover:bg-[#EAEAE7] border border-[#E5E5E2] text-xs font-mono text-gray-700 hover:text-gray-900 transition-colors font-medium">
                          <XIcon size={13} className="text-gray-900" />
                          <span>@{profile.twitter}</span>
                        </a>
                      )}
                      {profile.github && (
                        <a href={`https://github.com/${profile.github}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F5F3] hover:bg-[#EAEAE7] border border-[#E5E5E2] text-xs font-mono text-gray-700 hover:text-gray-900 transition-colors font-medium">
                          <GithubIcon size={14} className="text-gray-900" />
                          <span>{profile.github}</span>
                        </a>
                      )}
                      {profile.telegram && (
                        <a href={`https://t.me/${profile.telegram}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F5F3] hover:bg-[#EAEAE7] border border-[#E5E5E2] text-xs font-mono text-gray-700 hover:text-gray-900 transition-colors font-medium">
                          <TelegramIcon size={13} className="text-[#229ED9]" />
                          <span>t.me/{profile.telegram}</span>
                        </a>
                      )}
                      {profile.discord && (
                        <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F5F3] border border-[#E5E5E2] text-xs font-mono text-gray-700 font-medium">
                          <DiscordIcon size={13} className="text-[#5865F2]" />
                          <span>{profile.discord}</span>
                        </span>
                      )}
                      {profile.location && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F5F5F3] border border-[#E5E5E2] text-xs font-mono text-gray-600">
                          <MapPin size={13} className="text-rose-500" />
                          <span>{profile.location}</span>
                        </span>
                      )}
                      {profile.website && (
                        <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F5F5F3] hover:bg-[#EAEAE7] border border-[#E5E5E2] text-xs font-mono text-[#137A43] hover:underline font-medium">
                          <Globe size={13} className="text-[#137A43]" />
                          <span>{profile.website.replace(/^https?:\/\//, '')}</span>
                        </a>
                      )}
                      {profile.contentHash && (
                        <a href={profile.contentHash.startsWith('http') ? profile.contentHash : `https://ipfs.io/ipfs/${profile.contentHash.replace('ipfs://', '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E8F5E9] border border-[#137A43]/20 text-xs font-mono text-[#137A43] hover:underline font-medium">
                          <Globe size={13} />
                          <span>IPFS ({profile.contentHash.slice(0, 10)}...)</span>
                        </a>
                      )}
                    </div>
                 </div>
               )}
            </div>
            
            <div className="space-y-6">
               <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-sm">
                 <h3 className="text-sm font-sans font-semibold text-gray-900 mb-4">Reputation stats</h3>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="bg-[#FBFBFA] rounded-xl p-3 border border-[#E5E5E2]">
                     <p className="text-xs font-sans text-gray-500">Member Since</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.since}</p>
                   </div>
                   <div className="bg-[#FBFBFA] rounded-xl p-3 border border-[#E5E5E2]">
                     <p className="text-xs font-sans text-gray-500">Tier</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.tier}</p>
                   </div>
                   <div className="bg-[#FBFBFA] rounded-xl p-3 border border-[#E5E5E2]">
                     <p className="text-xs font-sans text-gray-500">Trades</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.sales + repStats.buys}</p>
                   </div>
                   <div className="bg-[#FBFBFA] rounded-xl p-3 border border-[#E5E5E2]">
                     <p className="text-xs font-sans text-gray-500">Tips / Gifts</p>
                     <p className="text-sm font-mono font-bold text-gray-900 mt-1">{repStats.tips}</p>
                   </div>
                 </div>
                 {repStats.disputes > 0 && (
                   <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3">
                     <AlertCircle size={16} className="text-red-600 shrink-0" />
                     <p className="text-xs text-red-700 font-medium">This account has {repStats.disputes} active dispute flags.</p>
                   </div>
                 )}
               </div>

                {/* Trading PnL Summary Widget */}
                {pnlAnalysis && (
                  <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-[#137A43]/30 transition-all duration-300 group">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-sans font-semibold text-gray-900 flex items-center gap-2">
                        <TrendingUp size={15} className="text-[#137A43] transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-0.5" />
                        <span>Trading & PnL</span>
                      </h3>
                      <button
                        onClick={() => setActiveTab('analytics')}
                        className="text-xs font-mono font-semibold text-[#137A43] hover:underline flex items-center gap-1 cursor-pointer transition-transform duration-200 group-hover:translate-x-0.5"
                      >
                        <span>Full Analytics</span>
                        <ArrowRightIcon size={12} className="transition-transform duration-200 group-hover:translate-x-1" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className={`p-4 rounded-xl border transition-all duration-200 hover:scale-[1.01] ${pnlAnalysis.isProfitable ? 'bg-[#E8F5E9]/50 border-[#137A43]/20 hover:border-[#137A43]/40 hover:shadow-2xs' : 'bg-amber-50/60 border-amber-200 hover:border-amber-300'}`}>
                        <p className="text-xs font-sans text-gray-500 mb-1">Net Realized PnL</p>
                        <div className="flex items-baseline justify-between">
                          <p className={`text-2xl font-mono font-bold tabular-nums ${pnlAnalysis.isProfitable ? 'text-[#137A43]' : 'text-amber-800'}`}>
                            {pnlAnalysis.netRealizedPnL >= 0 ? `+${pnlAnalysis.netRealizedPnL.toFixed(2)}` : pnlAnalysis.netRealizedPnL.toFixed(2)} <span className="text-xs font-sans font-normal text-gray-500">USDC</span>
                          </p>
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${pnlAnalysis.isProfitable ? 'bg-[#137A43] text-white' : 'bg-amber-200 text-amber-900'}`}>
                            {pnlAnalysis.roiPercentage >= 0 ? `+${pnlAnalysis.roiPercentage.toFixed(1)}%` : `${pnlAnalysis.roiPercentage.toFixed(1)}%`} ROI
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div className="bg-[#FBFBFA] p-3 rounded-xl border border-[#E5E5E2]">
                          <p className="text-gray-500 text-[11px] font-sans">Realized Revenue</p>
                          <p className="font-bold text-gray-900 mt-0.5 tabular-nums">+{pnlAnalysis.totalInflow.toFixed(2)} USDC</p>
                        </div>
                        <div className="bg-[#FBFBFA] p-3 rounded-xl border border-[#E5E5E2]">
                          <p className="text-gray-500 text-[11px] font-sans">Capital Deployed</p>
                          <p className="font-bold text-gray-900 mt-0.5 tabular-nums">{pnlAnalysis.totalCapitalDeployed.toFixed(2)} USDC</p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs font-mono pt-2 border-t border-[#F0F0ED] text-gray-500">
                        <span className="font-sans">Holding Valuation:</span>
                        <span className="font-bold text-gray-900 tabular-nums">~{pnlAnalysis.estimatedPortfolioValue.toFixed(2)} USDC</span>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}
        
        {activeTab === 'portfolio' && (
           <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 md:p-8 shadow-sm">
              <div className="flex flex-wrap gap-4">
                {isNamesLoading ? (
                  <div className="flex items-center gap-2 text-sm font-sans text-gray-500">
                    <div className="w-4 h-4 border-2 border-[#137A43] border-t-transparent rounded-full animate-spin"></div>
                    Loading on-chain portfolio...
                  </div>
                ) : ownedNames.length > 0 ? (
                  ownedNames.map(nameItem => (
                    <button
                      key={nameItem}
                      onClick={() => navigateTo('profile', nameItem)}
                      className="px-5 py-3 bg-[#FBFBFA] hover:bg-white text-gray-900 border border-[#E5E5E2] hover:border-[#137A43]/50 rounded-xl font-mono text-sm font-semibold transition-all flex items-center gap-3 group shadow-2xs"
                    >
                      <span>{nameItem}</span>
                      <ArrowRightIcon size={14} className="text-gray-500 group-hover:text-[#137A43] transition-colors" />
                    </button>
                  ))
                ) : (
                  <p className="text-sm font-sans text-gray-500 w-full text-center py-12">No registered .arc names for this wallet.</p>
                )}
              </div>
           </div>
        )}

        {activeTab === 'analytics' && pnlAnalysis && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Analytics Header with Mode Toggle & Export */}
            <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-md hover:border-[#137A43]/25 transition-all duration-300 flex flex-col gap-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#137A43] font-bold block mb-1">
                    Financial Performance & Portfolio Intelligence
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 tracking-tight flex items-center gap-3">
                    Profit & Loss (PnL) Analysis
                  </h3>
                  <p className="text-gray-500 font-sans text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
                    Realized trading margins, secondary market comps, and asset valuations tracked across Arc Network smart contracts.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto bg-[#FBFBFA] border border-[#E5E5E2] px-3.5 py-2 rounded-xl text-xs font-mono text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-[#137A43] animate-pulse shrink-0" />
                  <span>On-Chain Verified</span>
                </div>
              </div>

              {/* Mode Selector & Statement Export */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#F0F0ED]">
                <div className="inline-flex items-center p-1 bg-[#F5F5F3] border border-[#E5E5E2] rounded-xl text-xs font-mono">
                  <button
                    onClick={() => setPnlViewMode('realized')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${pnlViewMode === 'realized' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Realized Cash PnL
                  </button>
                  <button
                    onClick={() => setPnlViewMode('total')}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${pnlViewMode === 'total' ? 'bg-white text-[#137A43] shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Total Equity (Realized + Unrealized)
                  </button>
                </div>

                <button
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-[#E8F5E9]/20 text-gray-800 border border-[#E5E5E2] hover:border-[#137A43]/50 rounded-xl text-xs font-mono font-medium transition-all duration-200 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 active:scale-95 cursor-pointer group/btn"
                >
                  <Download size={13} className="text-[#137A43] transition-transform duration-200 group-hover/btn:-translate-y-0.5" />
                  <span>Export Statement (.csv)</span>
                </button>
              </div>
            </div>

            {/* 4 Top KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Card 1: Dynamic Net PnL (Realized vs Total Equity) */}
              {pnlViewMode === 'realized' ? (
                <Card className={`border shadow-sm flex flex-col justify-between ${pnlAnalysis.isProfitable ? 'bg-[#E8F5E9]/40 border-[#137A43]/20 hover:border-[#137A43]/50' : 'bg-amber-50/40 border-amber-200 hover:border-amber-300'} hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-default group`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-xs font-sans font-semibold text-gray-600 block">Net Realized Cash PnL</span>
                      <span className="text-[10px] font-mono text-gray-400">Closed Sales & Tips</span>
                    </div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 ${pnlAnalysis.isProfitable ? 'bg-[#E8F5E9] text-[#137A43]' : 'bg-amber-100 text-amber-800'}`}>
                      {pnlAnalysis.isProfitable ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    </div>
                  </div>
                  <div className="mb-2">
                    <p className={`text-3xl font-mono font-bold tabular-nums tracking-tight transition-transform duration-200 group-hover:translate-x-0.5 ${pnlAnalysis.isProfitable ? 'text-[#137A43]' : 'text-amber-800'}`}>
                      {pnlAnalysis.netRealizedPnL >= 0 ? `+${pnlAnalysis.netRealizedPnL.toFixed(2)}` : pnlAnalysis.netRealizedPnL.toFixed(2)} <span className="text-xs font-sans text-gray-500 font-normal">USDC</span>
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono pt-3 border-t border-[#E5E5E2]/60">
                    <span className="text-gray-500 font-sans">Return on Capital:</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${pnlAnalysis.isProfitable ? 'bg-[#137A43] text-white' : 'bg-amber-200 text-amber-900'}`}>
                      {pnlAnalysis.roiPercentage >= 0 ? `+${pnlAnalysis.roiPercentage.toFixed(1)}%` : `${pnlAnalysis.roiPercentage.toFixed(1)}%`} ROI
                    </span>
                  </div>
                </Card>
              ) : (
                <Card className={`border shadow-sm flex flex-col justify-between ${pnlAnalysis.totalCombinedPnL >= 0 ? 'bg-[#E8F5E9]/40 border-[#137A43]/20 hover:border-[#137A43]/50' : 'bg-amber-50/40 border-amber-200 hover:border-amber-300'} hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-default group`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-xs font-sans font-semibold text-gray-600 block">Total Combined Equity</span>
                      <span className="text-[10px] font-mono text-[#137A43] font-semibold">Realized + Holdings Value</span>
                    </div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 ${pnlAnalysis.totalCombinedPnL >= 0 ? 'bg-[#E8F5E9] text-[#137A43]' : 'bg-amber-100 text-amber-800'}`}>
                      {pnlAnalysis.totalCombinedPnL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    </div>
                  </div>
                  <div className="mb-2">
                    <p className={`text-3xl font-mono font-bold tabular-nums tracking-tight transition-transform duration-200 group-hover:translate-x-0.5 ${pnlAnalysis.totalCombinedPnL >= 0 ? 'text-[#137A43]' : 'text-amber-800'}`}>
                      {pnlAnalysis.totalCombinedPnL >= 0 ? `+${pnlAnalysis.totalCombinedPnL.toFixed(2)}` : pnlAnalysis.totalCombinedPnL.toFixed(2)} <span className="text-xs font-sans text-gray-500 font-normal">USDC</span>
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono pt-3 border-t border-[#E5E5E2]/60">
                    <span className="text-gray-500 font-sans">Total ROI:</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${pnlAnalysis.totalCombinedPnL >= 0 ? 'bg-[#137A43] text-white' : 'bg-amber-200 text-amber-900'}`}>
                      {pnlAnalysis.totalCombinedROI >= 0 ? `+${pnlAnalysis.totalCombinedROI.toFixed(1)}%` : `${pnlAnalysis.totalCombinedROI.toFixed(1)}%`} Total
                    </span>
                  </div>
                </Card>
              )}

              {/* Card 2: Total Realized Inflow */}
              <Card className="border border-[#E5E5E2] bg-white shadow-sm flex flex-col justify-between hover:border-[#137A43]/40 hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-default group">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs font-sans font-semibold text-gray-600">Total Inflow (Revenue)</span>
                  <div className="w-8 h-8 rounded-lg bg-[#E8F5E9] text-[#137A43] flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <ArrowDownLeft size={16} />
                  </div>
                </div>
                <div className="mb-2">
                  <p className="text-3xl font-mono font-bold text-gray-900 tabular-nums tracking-tight transition-transform duration-200 group-hover:translate-x-0.5">
                    +{pnlAnalysis.totalInflow.toFixed(2)} <span className="text-xs font-sans text-gray-500 font-normal">USDC</span>
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs font-mono pt-3 border-t border-[#E5E5E2]/60 text-gray-500">
                  <span className="font-sans">Net Escrow Payout:</span>
                  <span className="text-gray-900 font-semibold">{pnlAnalysis.netSalesRevenue.toFixed(2)} USDC</span>
                </div>
              </Card>

              {/* Card 3: Capital Deployed */}
              <Card className="border border-[#E5E5E2] bg-white shadow-sm flex flex-col justify-between hover:border-[#137A43]/40 hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-default group">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs font-sans font-semibold text-gray-600">Capital Deployed</span>
                  <div className="w-8 h-8 rounded-lg bg-[#F5F5F3] text-gray-700 flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <ArrowUpRight size={16} />
                  </div>
                </div>
                <div className="mb-2">
                  <p className="text-3xl font-mono font-bold text-gray-900 tabular-nums tracking-tight transition-transform duration-200 group-hover:translate-x-0.5">
                    {pnlAnalysis.totalCapitalDeployed.toFixed(2)} <span className="text-xs font-sans text-gray-500 font-normal">USDC</span>
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs font-mono pt-3 border-t border-[#E5E5E2]/60 text-gray-500">
                  <span className="font-sans">Registrations / Buys:</span>
                  <span className="text-gray-900 font-semibold">{(pnlAnalysis.registrationsCost + pnlAnalysis.secondaryPurchasesCost).toFixed(2)} USDC</span>
                </div>
              </Card>

              {/* Card 4: Holding Portfolio Worth (with market comp indicator) */}
              <Card className="border border-[#E5E5E2] bg-white shadow-sm flex flex-col justify-between hover:border-[#137A43]/40 hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-default group">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-sans font-semibold text-gray-600 block">Holding Asset Valuation</span>
                    <span className="text-[10px] font-mono text-gray-400">
                      {pnlAnalysis.hasMarketComps ? 'Based on recent sales' : 'Protocol mint floor'}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-[#E8F5E9] text-[#137A43] flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <Wallet size={16} />
                  </div>
                </div>
                <div className="mb-2">
                  <p className="text-3xl font-mono font-bold text-gray-900 tabular-nums tracking-tight transition-transform duration-200 group-hover:translate-x-0.5">
                    ~{pnlAnalysis.estimatedPortfolioValue.toFixed(2)} <span className="text-xs font-sans text-gray-500 font-normal">USDC</span>
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs font-mono pt-3 border-t border-[#E5E5E2]/60 text-gray-500">
                  <span className="font-sans">Unrealized Gain:</span>
                  <span className={`font-bold ${pnlAnalysis.totalUnrealizedPnL >= 0 ? 'text-[#137A43]' : 'text-amber-800'}`}>
                    {pnlAnalysis.totalUnrealizedPnL >= 0 ? `+${pnlAnalysis.totalUnrealizedPnL.toFixed(2)}` : pnlAnalysis.totalUnrealizedPnL.toFixed(2)} USDC
                  </span>
                </div>
              </Card>
            </div>

            {/* Trading Performance & Capital Distribution (2 columns) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Trading Performance */}
              <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-[#137A43]/30 transition-all duration-300 group">
                <h4 className="font-serif font-bold text-base text-gray-900 mb-4 flex items-center gap-2">
                  <BarChart3 size={16} className="text-[#137A43] transition-transform duration-200 group-hover:scale-110" />
                  <span>Trading Execution & Win Rate</span>
                </h4>

                <div className="mb-5 p-4 bg-[#FBFBFA] border border-[#E5E5E2] rounded-xl group-hover:border-[#137A43]/20 transition-all duration-200">
                  <div className="flex justify-between items-center text-xs font-mono mb-2">
                    <span className="text-gray-500 font-sans">Trading Win Rate</span>
                    <span className="text-[#137A43] font-bold">{pnlAnalysis.winRate}% Profitable</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#137A43] rounded-full transition-all duration-500 group-hover:brightness-110" 
                      style={{ width: `${Math.max(5, Math.min(100, pnlAnalysis.winRate))}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 bg-[#FBFBFA] hover:bg-white hover:border-[#137A43]/40 hover:shadow-xs transition-all duration-200 hover:-translate-y-0.5 border border-[#E5E5E2] rounded-xl text-center cursor-default">
                    <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">Sales Made</p>
                    <p className="text-base font-bold text-gray-900">{pnlAnalysis.realizedFlipsCount}</p>
                  </div>
                  <div className="p-3 bg-[#FBFBFA] hover:bg-white hover:border-[#137A43]/40 hover:shadow-xs transition-all duration-200 hover:-translate-y-0.5 border border-[#E5E5E2] rounded-xl text-center cursor-default">
                    <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">Avg Sale</p>
                    <p className="text-base font-bold text-gray-900">{pnlAnalysis.avgSalePrice.toFixed(1)} <span className="text-[10px] text-gray-500">USDC</span></p>
                  </div>
                  <div className="p-3 bg-[#FBFBFA] hover:bg-white hover:border-[#137A43]/40 hover:shadow-xs transition-all duration-200 hover:-translate-y-0.5 border border-[#E5E5E2] rounded-xl text-center cursor-default">
                    <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">Protocol Fee</p>
                    <p className="text-base font-bold text-gray-900">{pnlAnalysis.protocolFeesPaid.toFixed(2)} <span className="text-[10px] text-gray-500">USDC</span></p>
                  </div>
                </div>
              </div>

              {/* Capital Allocation & Cash Flow */}
              <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-[#137A43]/30 transition-all duration-300 group">
                <h4 className="font-serif font-bold text-base text-gray-900 mb-4 flex items-center gap-2">
                  <Coins size={16} className="text-[#137A43] transition-transform duration-200 group-hover:scale-110" />
                  <span>Capital Inflow vs Outflow</span>
                </h4>

                <div className="space-y-3.5 text-xs font-mono">
                  <div>
                    <div className="flex justify-between items-center mb-1 text-gray-600">
                      <span className="font-sans">Secondary Sales Payout</span>
                      <span className="font-bold text-gray-900">+{pnlAnalysis.netSalesRevenue.toFixed(2)} USDC</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#137A43] rounded-full" style={{ width: pnlAnalysis.totalInflow > 0 ? `${(pnlAnalysis.netSalesRevenue / pnlAnalysis.totalInflow) * 100}%` : '0%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1 text-gray-600">
                      <span className="font-sans">Tips Received</span>
                      <span className="font-bold text-[#137A43]">+{pnlAnalysis.tipsReceivedUSDC.toFixed(2)} USDC</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: pnlAnalysis.totalInflow > 0 ? `${(pnlAnalysis.tipsReceivedUSDC / pnlAnalysis.totalInflow) * 100}%` : '0%' }} />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#F0F0ED]">
                    <div className="flex justify-between items-center mb-1 text-gray-600">
                      <span className="font-sans">Registrations & Secondary Purchases</span>
                      <span className="font-bold text-gray-900">{(pnlAnalysis.registrationsCost + pnlAnalysis.secondaryPurchasesCost).toFixed(2)} USDC</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-600 rounded-full" style={{ width: pnlAnalysis.totalCapitalDeployed > 0 ? `${((pnlAnalysis.registrationsCost + pnlAnalysis.secondaryPurchasesCost) / pnlAnalysis.totalCapitalDeployed) * 100}%` : '0%' }} />
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-[#E5E5E2] text-xs font-sans">
                    <span className="font-semibold text-gray-700">Estimated Total Financial Position:</span>
                    <span className="font-mono font-bold text-gray-900">
                      {pnlAnalysis.totalPortfolioWorth >= 0 ? `+${pnlAnalysis.totalPortfolioWorth.toFixed(2)}` : pnlAnalysis.totalPortfolioWorth.toFixed(2)} USDC
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Itemized Name-by-Name Flips & Financial Performance Ledger */}
            <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 sm:p-8 shadow-sm">
              <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 mb-6 pb-5 border-b border-[#F0F0ED]">
                <div>
                  <h4 className="font-serif font-bold text-xl text-gray-900 flex items-center gap-2">
                    <History size={18} className="text-[#137A43]" />
                    <span>Identity Trade & Performance Ledger</span>
                  </h4>
                  <p className="text-gray-500 font-sans text-xs mt-0.5">
                    Individual cost basis, sale prices, and realized & unrealized margins per .arc identity.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* 3-way Filter Pills */}
                  <div className="inline-flex items-center p-1 bg-[#F5F5F3] border border-[#E5E5E2] rounded-xl text-xs font-mono">
                    <button
                      onClick={() => setLedgerFilter('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${ledgerFilter === 'all' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      All ({pnlAnalysis.flipsLedger.length})
                    </button>
                    <button
                      onClick={() => setLedgerFilter('realized')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${ledgerFilter === 'realized' ? 'bg-white text-[#137A43] shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Realized ({pnlAnalysis.realizedFlipsCount})
                    </button>
                    <button
                      onClick={() => setLedgerFilter('held')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${ledgerFilter === 'held' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Held ({pnlAnalysis.heldCount})
                    </button>
                  </div>

                  <button
                    onClick={handleExportCSV}
                    title="Export ledger as CSV"
                    className="p-1.5 bg-white hover:bg-[#E8F5E9]/20 text-gray-700 hover:text-gray-900 border border-[#E5E5E2] hover:border-[#137A43]/40 rounded-xl text-xs font-mono transition-all duration-200 shadow-2xs cursor-pointer flex items-center gap-1.5 px-3 active:scale-95 group/csv"
                  >
                    <Download size={13} className="text-[#137A43] transition-transform duration-200 group-hover/csv:-translate-y-0.5" />
                    <span>Download CSV</span>
                  </button>
                </div>
              </div>

              {pnlAnalysis.flipsLedger.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-[#E5E5E2] rounded-xl">
                  <BarChart3 size={32} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm font-sans font-medium text-gray-700">No trading ledger items recorded</p>
                  <p className="text-xs font-sans text-gray-400 mt-1">Acquire or sell names on the secondary marketplace to populate your trading ledger.</p>
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#E5E5E2] text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Identity Name</th>
                        <th className="pb-3 font-semibold">Acquisition</th>
                        <th className="pb-3 font-semibold">Cost Basis</th>
                        <th className="pb-3 font-semibold">Sale / Valuation</th>
                        <th className="pb-3 font-semibold">Realized / Unrealized PnL</th>
                        <th className="pb-3 font-semibold text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F0ED] text-xs font-mono">
                      {pnlAnalysis.flipsLedger
                        .filter(item => {
                          if (ledgerFilter === 'realized') return item.status === 'Realized Sale';
                          if (ledgerFilter === 'held') return item.status === 'Currently Held';
                          return true;
                        })
                        .map((item) => {
                          const isRealized = item.status === 'Realized Sale';
                          const isGain = item.netPnL >= 0;
                          const returnPct = item.costBasis > 0 ? ((item.netPnL / item.costBasis) * 100) : 0;

                          return (
                            <tr key={item.name} className="hover:bg-[#F5F5F3]/70 transition-colors duration-150 group/row cursor-default">
                              <td className="py-3.5 pr-4">
                                <button
                                  onClick={() => navigateTo('profile', item.name)}
                                  className="font-serif font-bold text-gray-900 text-sm group-hover/row:text-[#137A43] transition-colors flex items-center gap-1.5 cursor-pointer"
                                >
                                  <span>{item.name}</span>
                                  <ArrowRightIcon size={12} className="text-gray-400 group-hover/row:text-[#137A43] group-hover/row:translate-x-1 transition-all duration-200" />
                                </button>
                              </td>
                              <td className="py-3.5 pr-4 text-gray-600">
                                <span className="px-2 py-0.5 rounded-md bg-[#F5F5F3] text-[11px] text-gray-700">
                                  {item.acquiredVia}
                                </span>
                              </td>
                              <td className="py-3.5 pr-4 text-gray-700 tabular-nums">
                                {item.costBasis.toFixed(2)} USDC
                              </td>
                              <td className="py-3.5 pr-4 text-gray-900 font-semibold tabular-nums">
                                {isRealized ? (
                                  `${item.soldPrice !== null ? item.soldPrice.toFixed(2) : '—'} USDC`
                                ) : (
                                  <span className="inline-flex items-center gap-1">
                                    <span>~{item.currentValuation?.toFixed(2)} USDC</span>
                                    <span className="text-[10px] text-gray-400 font-normal">
                                      ({item.isMarketComp ? 'Comp' : 'Floor'})
                                    </span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 pr-4 tabular-nums">
                                {isRealized ? (
                                  <span className={`inline-flex items-center gap-1 font-bold ${isGain ? 'text-[#137A43]' : 'text-amber-800'}`}>
                                    {isGain ? '+' : ''}{item.netPnL.toFixed(2)} USDC
                                    <span className="text-[10px] font-normal text-gray-500">
                                      ({isGain ? '+' : ''}{returnPct.toFixed(0)}%)
                                    </span>
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 font-bold ${isGain ? 'text-[#137A43]' : 'text-amber-800'}`}>
                                    {isGain ? '+' : ''}{item.netPnL.toFixed(2)} USDC
                                    <span className="text-[10px] font-normal text-gray-500">
                                      ({isGain ? '+' : ''}{returnPct.toFixed(0)}% paper)
                                    </span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 text-right">
                                {isRealized ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#E8F5E9] text-[#137A43] border border-[#137A43]/30 transition-colors duration-150">
                                    <Check size={10} strokeWidth={2.5} /> Realized
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#E8F5E9]/70 text-[#137A43] border border-[#137A43]/30 group-hover/row:border-[#137A43]/50 transition-colors duration-150">
                                    <Wallet size={10} /> Held
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white border border-[#E5E5E2] rounded-2xl p-6 md:p-8 shadow-sm">
            {userActivities.length === 0 ? (
              <div className="text-center py-12">
                <History size={32} className="mx-auto text-gray-400 mb-3" />
                <p className="text-gray-500 text-sm font-medium">No activity recorded for this user yet.</p>
                <p className="text-xs text-gray-400 font-sans mt-1">Register a name, send a tip, or list an identity to build on-chain transaction history.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {userActivities.map((tx: any) => (
                  <div key={tx.id} className="flex flex-col sm:flex-row justify-between sm:items-center py-4 border-b border-[#E5E5E2] last:border-0 gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#E8F5E9]/60 border border-[#137A43]/20 flex items-center justify-center shrink-0">
                        {tx.action === 'Registered Name' ? (
                          <Shield size={18} className="text-[#137A43]" />
                        ) : tx.action === 'Gifted Name' || tx.action?.includes?.('Gift') ? (
                          <Gift size={18} className="text-[#137A43]" />
                        ) : tx.action === 'Bought Name' ? (
                          <ShoppingCart size={18} className="text-[#137A43]" />
                        ) : tx.action === 'Sold Name' ? (
                          <Tag size={18} className="text-[#137A43]" />
                        ) : tx.action === 'Sent Tip' ? (
                          <Send size={18} className="text-[#137A43]" />
                        ) : tx.action === 'Received Tip' || tx.action?.includes?.('Tip') ? (
                          <CreditCard size={18} className="text-[#137A43]" />
                        ) : tx.action === 'Renewed Name' ? (
                          <RefreshCw size={18} className="text-[#137A43]" />
                        ) : tx.action?.includes?.('Listed') ? (
                          <Tag size={18} className="text-[#137A43]" />
                        ) : tx.action?.includes?.('Transferred') ? (
                          <ArrowRightLeft size={18} className="text-[#137A43]" />
                        ) : (
                          <CreditCard size={18} className="text-[#137A43]" />
                        )}
                      </div>
                      {(() => {
                        const isSale = tx.action === 'Sold Name' || tx.action === 'Bought Name';
                        const isBuyer = isSale && isAddressMatch(tx.to, targetAddress);
                        const isSeller = isSale && isAddressMatch(tx.from, targetAddress);

                        const isTip = tx.action === 'Sent Tip' || tx.action === 'Received Tip';
                        const isTipRecipient = isTip && isAddressMatch(tx.to, targetAddress);

                        const isGift = tx.action === 'Gifted Name' || tx.action === 'Received Gift';
                        const isGiftRecipient = isGift && isAddressMatch(tx.to, targetAddress);

                        const actionLabel = isBuyer 
                          ? 'Bought Name' 
                          : isSeller 
                            ? 'Sold Name' 
                            : isTipRecipient 
                              ? 'Received Tip' 
                              : isGiftRecipient 
                                ? 'Received Gift' 
                                : tx.action;

                        const counterpart = isBuyer
                          ? `Bought from ${tx.from && tx.from.startsWith('0x') ? `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}` : tx.from || 'Seller'}`
                          : isSeller
                            ? `Sold to ${tx.to && tx.to.startsWith('0x') ? `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}` : tx.to || 'Buyer'}`
                            : isTipRecipient
                              ? `Received from ${tx.from && tx.from.startsWith('0x') ? `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}` : tx.from || 'Sender'}`
                              : isTip
                                ? `Tip to ${tx.to && tx.to.startsWith('0x') ? `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}` : tx.to || 'Recipient'}`
                                : isGiftRecipient
                                  ? `Gifted from ${tx.from && tx.from.startsWith('0x') ? `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}` : tx.from || 'Gifter'}`
                                  : null;

                        return (
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-gray-900 font-sans font-bold text-sm">{actionLabel}</p>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#137A43] font-semibold">
                                On-Chain
                              </span>
                            </div>
                            <p className="text-gray-500 font-mono text-xs mt-0.5 flex flex-wrap items-center gap-2">
                              <span className="font-bold text-gray-700">{tx.name}</span>
                              {counterpart && (
                                <span className="text-gray-500 font-sans text-[11px]">
                                  {counterpart}
                                </span>
                              )}
                              {tx.note && <span className="text-gray-500 font-sans italic">"{tx.note}"</span>}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="sm:text-right">
                      <p className="text-gray-900 font-mono font-bold text-sm">{tx.amount}</p>
                      <div className="flex items-center sm:justify-end gap-1.5 mt-0.5">
                        <span className="text-gray-500 font-sans text-[10px]">{formatRelativeTime(tx.timestamp)}</span>
                        {tx.txHash && (
                          <a
                            href={`https://explorer.testnet.arc.io/tx/${tx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-[#137A43] transition-colors p-0.5"
                            title="View on Arcscan"
                          >
                            <ArrowUpRight size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
      <ShareQRModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title="Arc User Identity"
        name={ownedNames[0] || null}
        address={targetAddress}
        reputationTier={repStats.tier}
      />
    </div>
  );
};

const parseUrlRoute = (): {
  route: 'landing' | 'app';
  view: string;
  profileTarget: string | null;
  userProfileTarget: string | null;
  sendRecipientTarget: string;
  namesSearchTarget: string | null;
} => {
  if (typeof window === 'undefined') {
    return { route: 'landing', view: 'home', profileTarget: null, userProfileTarget: null, sendRecipientTarget: '', namesSearchTarget: null };
  }
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const nameParam = params.get('name') || params.get('domain');
  const addressParam = params.get('address') || params.get('user') || params.get('wallet');
  const viewParam = params.get('view');
  const toParam = params.get('to');
  const qParam = params.get('q');

  const isApp = path === '/app' || path.startsWith('/app/') || !!nameParam || !!addressParam || !!viewParam || !!toParam;

  if (!isApp) {
    return { route: 'landing', view: 'home', profileTarget: null, userProfileTarget: null, sendRecipientTarget: '', namesSearchTarget: null };
  }

  if (nameParam) {
    const full = nameParam.endsWith('.arc') ? nameParam : `${nameParam}.arc`;
    return { route: 'app', view: 'profile', profileTarget: full, userProfileTarget: null, sendRecipientTarget: '', namesSearchTarget: null };
  }
  if (addressParam) {
    return { route: 'app', view: 'userprofile', profileTarget: null, userProfileTarget: addressParam, sendRecipientTarget: '', namesSearchTarget: null };
  }
  if (toParam) {
    return { route: 'app', view: 'send', profileTarget: null, userProfileTarget: null, sendRecipientTarget: toParam, namesSearchTarget: null };
  }
  if (viewParam) {
    return { route: 'app', view: viewParam, profileTarget: null, userProfileTarget: null, sendRecipientTarget: '', namesSearchTarget: qParam || null };
  }

  return { route: 'app', view: 'home', profileTarget: null, userProfileTarget: null, sendRecipientTarget: '', namesSearchTarget: null };
};

export default function App() {
  const initial = useMemo(() => parseUrlRoute(), []);
  const [route, setRoute] = useState<'landing' | 'app'>(initial.route);
  const [currentView, setCurrentView] = useState(initial.view);
  const [profileTarget, setProfileTarget] = useState<string | null>(initial.profileTarget);
  const [userProfileTarget, setUserProfileTarget] = useState<string | null>(initial.userProfileTarget);
  const [sendRecipientTarget, setSendRecipientTarget] = useState<string>(initial.sendRecipientTarget);
  const [namesSearchTarget, setNamesSearchTarget] = useState<string | null>(initial.namesSearchTarget);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [isMobileWalletOpen, setIsMobileWalletOpen] = useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false);
  const [isIdentityMenuOpen, setIsIdentityMenuOpen] = useState(false);

  useEffect(() => {
    const handleOutsideClick = () => {
      if (isIdentityMenuOpen) setIsIdentityMenuOpen(false);
      if (isNetworkModalOpen) setIsNetworkModalOpen(false);
    };
    if (isIdentityMenuOpen || isNetworkModalOpen) {
      window.addEventListener('click', handleOutsideClick);
    }
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [isIdentityMenuOpen, isNetworkModalOpen]);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseUrlRoute();
      setRoute(parsed.route);
      setCurrentView(parsed.view);
      setProfileTarget(parsed.profileTarget);
      setUserProfileTarget(parsed.userProfileTarget);
      setSendRecipientTarget(parsed.sendRecipientTarget);
      setNamesSearchTarget(parsed.namesSearchTarget);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);


  const auth = usePasskeyAuth();
  const ans = useANS(auth.credential);

  useEffect(() => {
    trackEvent({
      eventType: currentView === 'marketplace' ? 'marketplace_viewed' : 'page_viewed',
      walletAddress: auth.address ? auth.address : undefined,
      metadata: { view: currentView, profileTarget }
    });
  }, [currentView, profileTarget, auth.address]);

  useEffect(() => {
    if (auth.isConnected && auth.address) {
      trackEvent({ eventType: 'wallet_connected', walletAddress: auth.address });
    }
  }, [auth.isConnected, auth.address]);


  const { data: usdcBalanceRaw, isLoading: isBalanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: auth.address ? [auth.address as Address] : undefined,
    chainId: arcTestnet.id,
    query: {
      enabled: !!auth.address,
      refetchInterval: 10000,
    },
  });

  const [fallbackBalance, setFallbackBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.address) {
      setFallbackBalance(null);
      return;
    }
    let active = true;
    const fetchBal = async () => {
      try {
        const bal = await fallbackPublicClient.readContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [auth.address as Address],
        });
        if (active) {
          setFallbackBalance(formatUnits(bal, 6));
        }
      } catch (err) {
        console.warn('Balance fetch note:', err);
      }
    };
    fetchBal();
    const timer = setInterval(fetchBal, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [auth.address]);

  const formattedBalance = useMemo(() => {
    if (usdcBalanceRaw !== undefined && usdcBalanceRaw !== null) {
      return Number(formatUnits(usdcBalanceRaw, 6)).toFixed(2);
    }
    if (fallbackBalance !== null) {
      return Number(fallbackBalance).toFixed(2);
    }
    return '0.00';
  }, [usdcBalanceRaw, fallbackBalance]);

  const handleCopyAddress = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!auth.address) return;
    navigator.clipboard.writeText(auth.address);
    setCopiedAddress(true);
    toast.success('Address copied to clipboard!');
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const [currentPrimaryName, setCurrentPrimaryName] = useState<string | null>(() => getUserPrimaryName(auth.address));

  const { data: onchainPrimary } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'reverseLookup',
    args: auth.address ? [auth.address as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!auth.address },
  });

  const { data: rawAppOwnedNames } = useReadContract({
    address: ANS_ADDRESS,
    abi: ANS_ABI,
    functionName: 'getNamesByOwner',
    args: auth.address ? [auth.address as Address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!auth.address },
  });

  useEffect(() => {
    if (auth.address) {
      const stored = getUserPrimaryName(auth.address);
      const appOwned = (rawAppOwnedNames as string[] || []).map(n => n.endsWith('.arc') ? n : `${n}.arc`);
      
      let validatedStored = null;
      if (stored) {
        // Only use the local stored primary name if we can confirm the user actually owns it
        // Or if the names are still loading, tentatively use it to avoid flashing
        if (appOwned.includes(stored) || !rawAppOwnedNames) {
          validatedStored = stored;
        } else if (rawAppOwnedNames && !appOwned.includes(stored)) {
          // If we loaded names and it's not there, clear it from local storage
          localStorage.removeItem(`ans_primary_${auth.address}`);
        }
      }

      if (validatedStored) {
        setCurrentPrimaryName(validatedStored);
      } else if (onchainPrimary && onchainPrimary.length > 0) {
        const full = onchainPrimary.endsWith('.arc') ? onchainPrimary : `${onchainPrimary}.arc`;
        setCurrentPrimaryName(full);
      } else {
        setCurrentPrimaryName(null);
      }
    } else {
      setCurrentPrimaryName(null);
    }

    const onPrimaryChanged = (e: any) => {
      if (e.detail?.primaryName) {
        setCurrentPrimaryName(e.detail.primaryName);
      }
    };
    window.addEventListener('ans_primary_changed', onPrimaryChanged);
    return () => window.removeEventListener('ans_primary_changed', onPrimaryChanged);
  }, [auth.address, onchainPrimary]);

  const navigateTo = (view: string, data: string | null = null, replaceHistory = false) => {
    let targetView = view;
    let prof: string | null = null;
    let userProf: string | null = null;
    let sendTarget = '';
    let nameSearch: string | null = null;

    if (view === 'profile') {
      if (data === 'self' && auth.address) {
        userProf = auth.address;
        targetView = 'userprofile';
        setUserProfileTarget(auth.address);
        setCurrentView('userprofile');
      } else {
        prof = data;
        setProfileTarget(data);
        setCurrentView('profile');
      }
    } else if (view === 'userprofile') {
      const target = data === 'self' || !data ? auth.address : data;
      userProf = target;
      setUserProfileTarget(target);
      setCurrentView('userprofile');
    } else if (view === 'names') {
      nameSearch = data;
      setNamesSearchTarget(data);
      setCurrentView('names');
    } else if (view === 'send') {
      sendTarget = data || '';
      setSendRecipientTarget(data || '');
      setCurrentView('send');
    } else if (view === 'listForSale') {
      targetView = 'marketplace';
      setCurrentView('marketplace');
    } else {
      setCurrentView(view);
    }

    // Synchronize URL with browser history for ENS-grade shareable deep links
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams();
      if (targetView === 'profile' && prof) {
        search.set('view', 'profile');
        search.set('name', prof);
      } else if (targetView === 'userprofile' && userProf) {
        search.set('view', 'userprofile');
        search.set('address', userProf);
      } else if (targetView === 'send') {
        search.set('view', 'send');
        if (sendTarget) search.set('to', sendTarget);
      } else if (targetView === 'names') {
        search.set('view', 'names');
        if (nameSearch) search.set('q', nameSearch);
      } else if (targetView !== 'home') {
        search.set('view', targetView);
      }

      const queryString = search.toString();
      const newUrl = `/app${queryString ? `?${queryString}` : ''}`;
      if (window.location.pathname + window.location.search !== newUrl) {
        if (replaceHistory) {
          window.history.replaceState({ view: targetView, data }, '', newUrl);
        } else {
          window.history.pushState({ view: targetView, data }, '', newUrl);
        }
      }
    }

    window.scrollTo(0, 0);
  };

  const handleLaunchApp = () => {
    window.history.pushState({}, '', '/app');
    setRoute('app');
    window.scrollTo(0, 0);
  };

  const handleGoToHero = () => {
    window.history.pushState({}, '', '/');
    setRoute('landing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLandingNavigate = (view: string, data: string | null = null) => {
    window.history.pushState({}, '', '/app');
    setRoute('app');
    navigateTo(view, data);
  };

  const handleLandingNavigateProfile = (name: string) => {
    window.history.pushState({}, '', '/app');
    setRoute('app');
    navigateTo('profile', name);
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'names', label: 'Names', icon: Search },
    { id: 'marketplace', label: 'Marketplace', icon: Store },
    { id: 'mynames', label: 'My Names', icon: User },
    { id: 'send', label: 'Send', icon: Send },
  ];

  if (route === 'landing') {
    return (
      <div className="min-h-screen flex flex-col selection:bg-[#137A43]/20 text-gray-900 font-sans bg-[#FBFBFA]">
        <style>{globalStyles}</style>

        {/* STANDALONE LANDING HEADER */}
        <header className="flex items-center justify-between px-6 sm:px-10 h-20 border-b border-[#E5E5E2] bg-[#FBFBFA]/90 backdrop-blur-md sticky top-0 z-50">
          <div 
            className="cursor-pointer select-none hover:opacity-90 transition-opacity"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            title="Arc Name Service"
          >
            <ANSLogo />
          </div>

          <div>
            <button 
              onClick={handleLaunchApp}
              className="bg-[#141413] hover:bg-[#282826] text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-sans font-medium shadow-sm transition-all active:scale-95 flex items-center gap-2"
            >
              <span>Launch App</span>
              <ArrowRightIcon size={14} />
            </button>
          </div>
        </header>

        {/* STANDALONE HERO / LANDING CONTENT */}
        <main className="flex-1 w-full relative">
          <LandingPageView 
            navigateTo={handleLandingNavigate} 
            navigateToProfile={handleLandingNavigateProfile} 
            onLaunchApp={handleLaunchApp}
            auth={auth} 
            ans={ans} 
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-[#137A43]/20 text-gray-900 font-sans bg-[#FBFBFA]">
      <style>{globalStyles}</style>

      {/* UNIFIED PROTOCOL HEADER MATCHING REFERENCE IMAGE */}
      <header className="flex items-center justify-between px-6 sm:px-10 h-20 border-b border-[#E5E5E2] bg-[#FBFBFA]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-8 md:gap-12">
          <div 
            className="cursor-pointer select-none hover:opacity-90 transition-opacity"
            onClick={handleGoToHero}
            title="Return to ANS Overview"
          >
            <ANSLogo />
          </div>
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map(item => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`relative py-2 text-sm font-sans font-medium transition-colors ${
                    isActive 
                      ? 'text-[#141413] font-semibold' 
                      : 'text-[#60605A] hover:text-[#141413]'
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#137A43] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Arc Network Pill - made interactive for Jakob's Law */}
          <div className="relative">
            <button 
              onClick={() => setIsNetworkModalOpen(!isNetworkModalOpen)}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-[#E5E5E2] hover:border-[#137A43]/50 rounded-full text-xs font-sans font-medium text-[#141413] shadow-2xs select-none cursor-pointer transition-colors"
              title="View Arc Testnet status & explorer"
            >
              <div className="w-2 h-2 rounded-full bg-[#137A43] animate-pulse"></div>
              <span>Arc Network</span>
              <ChevronDown size={13} className={`text-[#60605A] transition-transform duration-150 ${isNetworkModalOpen ? 'rotate-180' : ''}`} />
            </button>

            {isNetworkModalOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-[#E5E5E2] rounded-2xl shadow-xl z-50 p-4 animate-in fade-in zoom-in-95 duration-100 font-mono text-xs">
                <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E2] mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#137A43]"></div>
                    <span className="font-sans font-bold text-gray-900 text-xs">Arc Testnet</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#137A43] text-[10px] font-bold">Operational</span>
                </div>
                <div className="space-y-2 text-gray-600 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Chain ID:</span>
                    <span className="text-gray-900 font-bold">5042002</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Gas Asset:</span>
                    <span className="text-gray-900 font-bold">USDC (ERC-4337)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Registry:</span>
                    <span className="text-[#137A43] font-bold">ArcNameService</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-[#E5E5E2] mt-3">
                  <a
                    href="https://explorer.testnet.arc.io"
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setIsNetworkModalOpen(false)}
                    className="flex items-center justify-center gap-1.5 w-full py-2 bg-[#FBFBFA] hover:bg-[#F5F5F3] border border-[#E5E5E2] rounded-xl text-gray-900 font-sans font-medium text-xs transition-colors"
                  >
                    <span>Arc Explorer</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}
          </div>

          {auth.isConnected && auth.address ? (
            <div className="flex items-center gap-2">
              <div 
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5E5E2] rounded-full text-xs font-mono text-gray-800 shadow-2xs cursor-default min-h-[32px]"
                title="Your USDC balance on Arc Testnet"
              >
                <CreditCard size={13} className="text-[#137A43] shrink-0" />
                <span className="font-bold text-gray-900 tabular-nums">{formattedBalance}</span>
                <span className="text-gray-500 text-[10px]">USDC</span>
              </div>

              {/* Consolidated Identity Pill Dropdown */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsIdentityMenuOpen(!isIdentityMenuOpen);
                  }}
                  title="View your account options"
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-white hover:bg-gray-50 text-gray-900 border border-[#E5E5E2] hover:border-[#137A43]/50 rounded-full font-serif text-xs font-bold transition-all shadow-2xs min-h-[32px] cursor-pointer select-none"
                >
                  <div className="w-2 h-2 rounded-full bg-[#137A43] shrink-0 animate-pulse" />
                  <span className="max-w-[130px] sm:max-w-[170px] truncate">
                    {currentPrimaryName || `${auth.address.slice(0, 5)}...${auth.address.slice(-4)}`}
                  </span>
                  <ChevronDown size={13} className={`text-gray-400 transition-transform duration-150 ${isIdentityMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isIdentityMenuOpen && (
                  <div 
                    className="absolute right-0 top-full mt-2 w-64 bg-white border border-[#E5E5E2] rounded-2xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-2.5 border-b border-[#F0F0ED] mb-1">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-gray-400 font-semibold mb-1">
                        Active Identity
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-serif font-bold text-gray-900 text-sm truncate">
                          {currentPrimaryName || 'Arc Account'}
                        </span>
                        <span className="font-mono text-[10px] text-gray-500 bg-[#F5F5F3] px-2 py-0.5 rounded-full shrink-0">
                          {auth.address.slice(0, 5)}...{auth.address.slice(-4)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <button
                        onClick={(e) => {
                          handleCopyAddress(e);
                          setTimeout(() => setIsIdentityMenuOpen(false), 700);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono rounded-xl hover:bg-[#F8F9FA] text-gray-700 transition-colors cursor-pointer text-left"
                      >
                        <span className="flex items-center gap-2 font-sans font-medium text-gray-800">
                          {copiedAddress ? <Check size={14} className="text-[#137A43]" /> : <Copy size={14} className="text-gray-400" />}
                          <span>{copiedAddress ? 'Address Copied!' : 'Copy Address'}</span>
                        </span>
                        <span className="font-mono text-[11px] text-gray-400">
                          {auth.address.slice(0, 4)}...{auth.address.slice(-4)}
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          setIsIdentityMenuOpen(false);
                          navigateTo('userprofile', auth.address);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-sans font-medium rounded-xl hover:bg-[#E8F5E9]/50 text-gray-900 hover:text-[#137A43] transition-colors cursor-pointer text-left"
                      >
                        <User size={14} className="text-[#137A43]" />
                        <span>Show My Profile</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <NotificationBell
                walletAddress={auth.address}
                navigateTo={navigateTo}
                signChallenge={
                  auth.credential
                    ? (msg: string) =>
                        import('./lib/circle').then(({ getSmartAccount }) =>
                          getSmartAccount(auth.credential!).then((acc) =>
                            acc.signMessage({ message: msg })
                          )
                        )
                    : null
                }
              />

              <button
                onClick={() => auth.signOut()}
                title="Sign out"
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-[#E5E5E2] hover:border-red-200 rounded-full transition-colors shadow-2xs shrink-0"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => auth.signUp()}
                className="border border-[#E5E5E2] hover:bg-gray-100 text-[#141413] px-4 py-2 rounded-full text-xs font-sans font-medium transition-all active:scale-95 hidden sm:inline-flex"
                disabled={auth.isLoading}
              >
                Create Wallet
              </button>
              <button 
                onClick={() => auth.signIn()}
                className="bg-[#141413] hover:bg-[#282826] text-white px-5 py-2 rounded-full text-xs font-sans font-medium shadow-sm transition-all active:scale-95"
                disabled={auth.isLoading}
              >
                {auth.isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 w-full relative">
        {currentView === 'home' && <HomeView navigateTo={navigateTo} navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} />}
        {currentView === 'names' && <NamesAppView navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} initialSearchName={namesSearchTarget} navigateTo={navigateTo} />}
        {currentView === 'marketplace' && <MarketplaceView navigateToProfile={(name) => navigateTo('profile', name)} auth={auth} ans={ans} navigateTo={navigateTo} />}
        {currentView === 'mynames' && <MyNamesView isConnected={auth.isConnected} connectWallet={() => auth.signIn()} auth={auth} ans={ans} balance={formattedBalance} navigateTo={navigateTo} />}
        {currentView === 'send' && <SendView isConnected={auth.isConnected} connectWallet={() => auth.signIn()} auth={auth} ans={ans} balance={formattedBalance} defaultRecipient={sendRecipientTarget} />}
        {currentView === 'profile' && profileTarget && <NameProfileView name={profileTarget} navigateTo={navigateTo} auth={auth} />}
        {currentView === 'userprofile' && userProfileTarget && <UserProfileView targetAddress={userProfileTarget} auth={auth} navigateTo={navigateTo} />}
      </main>

      {/* GLOBAL FOOTER MATCHING REFERENCE IMAGE */}
      <footer className="border-t border-[#E5E5E2] bg-transparent py-8 px-6 sm:px-10 z-10 relative">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-gray-500 font-sans">
            <div 
              className="cursor-pointer select-none hover:opacity-90 transition-opacity" 
              onClick={handleGoToHero}
              title="Return to ANS Overview"
            >
              <ANSLogo size={24} />
            </div>
            <span className="text-gray-500 text-center sm:text-left">
              Third-party .arc domain service on Arc Network. Not affiliated with Arc Network or Circle.
            </span>
          </div>
          
          <div className="flex items-center gap-6 text-xs text-gray-500 font-sans">
            <button onClick={handleGoToHero} className="hover:text-gray-900 transition-colors">About Us</button>
            <a href="https://docs.arc.io/" target="_blank" rel="noreferrer" className="hover:text-gray-900 transition-colors">Docs</a>
            <a href="https://github.com/Nimona22/ANS" target="_blank" rel="noreferrer" className="hover:text-gray-900 transition-colors">Support</a>
            <a href="https://x.com/Nimox219" target="_blank" rel="noreferrer" className="hover:text-gray-900 transition-colors text-gray-700" title="X (Twitter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a href="https://github.com/Nimona22/ANS" target="_blank" rel="noreferrer" className="hover:text-gray-900 transition-colors text-gray-700" title="GitHub">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
            </a>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar - Enhanced for Fitts's Law */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-[#E5E5E2] flex justify-around items-center pb-safe pt-1 z-50 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] h-16">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`flex flex-col items-center justify-center w-full min-h-[48px] py-1 rounded-xl transition-all cursor-pointer ${isActive ? 'text-[#137A43]' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Icon size={20} className="mb-1" strokeWidth={isActive ? 2.5 : 1.75} />
              <span className={`text-[10px] font-mono leading-tight ${isActive ? 'font-bold text-[#137A43]' : 'font-medium'}`}>{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => {
            if (auth.isConnected) {
              setIsMobileWalletOpen(true);
            } else {
              auth.signIn();
            }
          }}
          className={`flex flex-col items-center justify-center w-full min-h-[48px] py-1 rounded-xl transition-all cursor-pointer ${auth.isConnected ? 'text-[#137A43]' : 'text-gray-400'}`}
        >
          <Wallet size={20} className="mb-1" strokeWidth={1.75} />
          <span className="text-[10px] font-mono font-bold leading-tight">
            {auth.isConnected && auth.address ? `${auth.address.slice(0, 4)}...${auth.address.slice(-3)}` : 'Sign In'}
          </span>
        </button>
      </nav>

      {/* Mobile Wallet Bottom Sheet */}
      {isMobileWalletOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsMobileWalletOpen(false)}>
          <div className="w-full bg-white rounded-t-2xl p-6 shadow-2xl border-t border-[#E5E5E2]" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            
            <div className="flex justify-between items-center mb-5">
              <span className="font-serif font-bold text-xl text-gray-900">Your Wallet</span>
              <button onClick={() => setIsMobileWalletOpen(false)} aria-label="Close wallet" className="p-1.5 text-gray-400 hover:text-gray-900 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-[#FBFBFA] border border-[#E5E5E2] rounded-2xl flex items-center justify-between gap-3 shadow-2xs">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-1">Smart Account</p>
                  <p className="font-mono text-xs font-semibold text-gray-900 truncate">{auth.address}</p>
                </div>
                <button
                  onClick={handleCopyAddress}
                  aria-label="Copy smart account address"
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E5E5E2] rounded-full text-xs font-sans font-semibold text-gray-700 shadow-2xs active:scale-95 shrink-0 hover:border-[#137A43]/50 transition-colors"
                >
                  {copiedAddress ? (
                    <>
                      <Check size={14} className="text-[#137A43]" />
                      <span className="text-[#137A43]">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} className="text-gray-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 bg-[#FBFBFA] border border-[#E5E5E2] rounded-2xl flex items-center justify-between shadow-2xs">
                <div>
                  <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-gray-500 mb-1">USDC Balance</p>
                  <p className="font-mono text-xl font-bold text-[#137A43]">{formattedBalance} <span className="text-sm font-sans text-gray-500 font-medium">USDC</span></p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#E8F5E9] text-[#137A43] flex items-center justify-center">
                  <CreditCard size={20} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button 
                variant="secondary" 
                className="w-full py-3.5 text-sm flex items-center justify-center gap-2"
                onClick={() => {
                  setIsMobileWalletOpen(false);
                  navigateTo('userprofile', auth.address);
                }}
              >
                <User size={16} /> View Profile
              </Button>
              <Button 
                variant="ghost" 
                className="w-full py-3 text-sm text-red-600 hover:bg-red-50 flex items-center justify-center gap-2"
                onClick={() => {
                  setIsMobileWalletOpen(false);
                  auth.signOut();
                }}
              >
                <LogOut size={16} /> Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
