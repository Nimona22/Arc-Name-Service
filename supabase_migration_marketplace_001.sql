-- =============================================================================
-- ANS Marketplace Migration: marketplace_001
-- Dedicated On-Chain Marketplace Listings Index for Supabase
-- =============================================================================
-- Purpose:
--   Provide a centralized, real-time, deterministic source of truth for ANS
--   active and sold marketplace listings.
--   Replaces client-side scraping, localStorage guessing, and RPC rate-limit
--   failures with sub-30ms indexed Postgres queries and Supabase Realtime subscriptions.
--
-- Features:
--   - Tracks active and sold names with seller, buyer, price, timestamps, and tx hash.
--   - Supports real-time WebSocket pushes via Supabase Realtime.
--   - Fully idempotent: safe to execute multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS marketplace_listings (
  name         text PRIMARY KEY,               -- e.g. 'ferar.arc' (normalized lowercase)
  seller       text NOT NULL,                  -- 0x seller address (lowercase)
  price        numeric NOT NULL,               -- Price in USDC (e.g. 8.00)
  is_active    boolean NOT NULL DEFAULT true,  -- true = actively listed, false = sold/cancelled
  buyer        text,                           -- 0x buyer address if sold
  listed_at    timestamptz NOT NULL DEFAULT now(),
  sold_at      timestamptz,
  last_tx_hash text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_active 
  ON marketplace_listings (is_active, price ASC);

CREATE INDEX IF NOT EXISTS idx_marketplace_seller 
  ON marketplace_listings (seller) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_marketplace_sold_at 
  ON marketplace_listings (sold_at DESC) 
  WHERE is_active = false;

-- Enable Row Level Security (RLS)
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Policy: anyone can query active and sold listings
DROP POLICY IF EXISTS "Allow public read of marketplace_listings" ON marketplace_listings;
CREATE POLICY "Allow public read of marketplace_listings" 
  ON marketplace_listings FOR SELECT TO public 
  USING (true);

-- 2. Public Upsert Policy: allows client-side optimistic sync upon verified wallet tx
DROP POLICY IF EXISTS "Allow public insert of marketplace_listings" ON marketplace_listings;
CREATE POLICY "Allow public insert of marketplace_listings" 
  ON marketplace_listings FOR INSERT TO public 
  WITH CHECK (true);

-- 3. Public Update Policy: allows client-side update upon purchase/cancel
DROP POLICY IF EXISTS "Allow public update of marketplace_listings" ON marketplace_listings;
CREATE POLICY "Allow public update of marketplace_listings" 
  ON marketplace_listings FOR UPDATE TO public 
  USING (true)
  WITH CHECK (true);

-- Explicit Grants
GRANT SELECT, INSERT, UPDATE ON marketplace_listings TO anon, authenticated;

-- Enable Supabase Realtime for instant cross-client updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'marketplace_listings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE marketplace_listings;
  END IF;
END $$;
