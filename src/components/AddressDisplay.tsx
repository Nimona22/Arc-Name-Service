import React from 'react';
import { useReverseResolve } from '../lib/reverseResolver';

export interface AddressDisplayProps {
  address?: string | null;
  className?: string;
  linkToProfile?: boolean;
  onNavigate?: (view: string, data?: any) => void;
  showBadge?: boolean;
  fallbackLength?: number;
}

/**
 * Universal component that displays the primary .arc name if registered,
 * with fallback to short hex address.
 */
export const AddressDisplay: React.FC<AddressDisplayProps> = ({
  address,
  className = '',
  linkToProfile = false,
  onNavigate,
  showBadge = false,
  fallbackLength = 4,
}) => {
  const { resolvedName } = useReverseResolve(address);

  if (!address) return <span className={className}>Unknown</span>;
  if (!address.startsWith('0x')) return <span className={className}>{address}</span>;

  const shortAddr = `${address.slice(0, fallbackLength + 2)}...${address.slice(-fallbackLength)}`;
  const displayLabel = resolvedName || shortAddr;
  const isResolved = !!resolvedName;

  const content = (
    <span className={`inline-flex items-center gap-1.5 font-mono ${className}`}>
      {isResolved && showBadge && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#108945] shrink-0" />
      )}
      <span className={isResolved ? 'font-semibold text-[#137A43]' : ''}>{displayLabel}</span>
    </span>
  );

  if (linkToProfile && onNavigate) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNavigate('userprofile', address);
        }}
        className="hover:underline cursor-pointer inline-flex items-center text-left"
        title={`View Profile for ${resolvedName || address}`}
      >
        {content}
      </button>
    );
  }

  return content;
};
