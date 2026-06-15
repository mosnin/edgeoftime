-- SOLANA: Reset land ownership for the Solana relaunch.
-- Retargets parcel ownership from Ethereum to Solana and ships fully reset:
-- every parcel becomes UNOWNED (owner = '' sentinel, no NFT mint, unminted).
-- Idempotent: safe to run multiple times.

ALTER TABLE public.properties ALTER COLUMN owner SET DEFAULT '';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS solana_mint text;

-- Reset ownership so nobody owns anything.
UPDATE public.properties
   SET owner = '',
       solana_mint = NULL,
       minted = false,
       minted_at = NULL,
       token = NULL;
