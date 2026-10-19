import React, { useState, useEffect } from 'react';
// @ts-ignore
import QRCode from 'qrcode';
import { X, Copy, Check, Share2, ExternalLink, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface ShareQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  name?: string | null;
  address?: string | null;
  reputationTier?: string;
}

export const ShareQRModal: React.FC<ShareQRModalProps> = ({
  isOpen,
  onClose,
  title,
  name,
  address,
  reputationTier,
}) => {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Determine share URL
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/app?${name ? `name=${encodeURIComponent(name)}` : `address=${encodeURIComponent(address || '')}`}`
    : '';

  // Generate QR code for the address or share URL
  useEffect(() => {
    if (!isOpen) return;
    const targetPayload = address ? `ethereum:${address}` : shareUrl;

    QRCode.toString(
      targetPayload,
      {
        type: 'svg',
        margin: 2,
        color: {
          dark: '#141413',
          light: '#FFFFFF',
        },
      },
      (err: any, svg?: string) => {
        if (!err && svg) {
          setSvgMarkup(svg);
        }
      }
    );
  }, [isOpen, address, shareUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    toast.success('Share link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedAddress(true);
    toast.success('Wallet address copied!');
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${name || 'Web3 Identity'} on Arc Name Service`,
          text: `Check out ${name || 'this Web3 identity'} on Arc Name Service`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or unsupported
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm bg-white border border-[#E5E5E2] rounded-2xl p-6 shadow-xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-[#137A43]" />
            <h3 className="font-serif font-bold text-lg text-gray-900">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-4 bg-[#FBFBFA] border border-[#E5E5E2] rounded-xl">
          {svgMarkup ? (
            <div
              className="w-48 h-48 bg-white p-2 rounded-lg shadow-2xs border border-[#E5E5E2]"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          ) : (
            <div className="w-48 h-48 flex items-center justify-center text-xs text-gray-400 font-mono">
              Generating QR...
            </div>
          )}

          <div className="mt-3 text-center">
            {name && (
              <p className="font-serif font-bold text-base text-gray-900">{name}</p>
            )}
            {address && (
              <p className="font-mono text-xs text-gray-500 mt-0.5">
                {address.slice(0, 6)}...{address.slice(-4)}
              </p>
            )}
            {reputationTier && (
              <span className="inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#137A43] font-semibold">
                {reputationTier}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#141413] text-white hover:bg-[#282826] text-xs font-sans font-semibold transition-colors shadow-2xs"
          >
            {copiedLink ? <Check size={14} className="text-[#137A43]" /> : <Share2 size={14} />}
            <span>{copiedLink ? 'Link Copied!' : 'Copy Shareable Profile Link'}</span>
          </button>

          {address && (
            <button
              onClick={handleCopyAddress}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white border border-[#E5E5E2] hover:bg-[#FBFBFA] text-gray-700 text-xs font-sans font-semibold transition-colors"
            >
              {copiedAddress ? <Check size={14} className="text-[#137A43]" /> : <Copy size={14} />}
              <span>{copiedAddress ? 'Address Copied!' : 'Copy Arc Address'}</span>
            </button>
          )}

          {typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function' && (
            <button
              onClick={handleNativeShare}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-sans font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ExternalLink size={13} />
              <span>More sharing options</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
