# Solana Port Plan — single source of truth

Goal: retarget the Cryptovoxels "retro" client's **land ownership** from Ethereum
to **Solana**, and ship it fully **reset** (nobody owns any parcel yet).

> Upstream is BSL-1.1 licensed (see LICENSE). This port is the user's directive.

## Ownership model (the contract every agent builds to)
- A **wallet** is a base58 ed25519 public key (32 bytes), NOT a `0x` hex address.
  Solana base58 is **case-sensitive** — never `.toLowerCase()` a Solana pubkey.
- A **parcel** (DB table `properties`) is owned by whoever holds the parcel's
  **Metaplex NFT**. The parcel stores the NFT mint in `properties.solana_mint`
  and the current holder pubkey in `properties.owner`.
- Reset state: every parcel ships **UNOWNED** — `properties.owner = ''`
  (sentinel `UNOWNED`), `solana_mint = NULL`, `minted = false`. Until a parcel is
  minted and claimed, ownership checks return false for everyone.

## Canonical primitives (ALREADY WRITTEN — import these, don't reinvent)
- `common/helpers/solana-chain-helpers.ts`
  - `getActiveChain()`, `activeCluster`, `SolanaCluster`, `UNOWNED`, `isUnowned(owner)`
- `server/lib/solana-helpers.ts`
  - `isSolanaAddress(addr): boolean`
  - `verifySolanaSignature(wallet, message, signature): boolean`  (ed25519 / Phantom)
  - `getNftHolder(mint): Promise<string|null>`
  - `ownsNft(wallet, mint): Promise<boolean>`
  - `getSplTokenBalance(wallet, mint): Promise<number>`
  - `countNftsFromCollection(wallet, collectionMint): Promise<number>`  (DAS API)
- `server/handlers/sign-in.ts` — already verifies Solana signatures.

## Rules for every agent
1. Build to the model + primitives above. Import the canonical helpers.
2. Edit ONLY the files your package lists. If you need a change in a file owned
   by another package (e.g. `server/server.ts` route/job wiring, a shared type),
   DO NOT edit it — describe the exact change in your final report under a
   "WIRING NEEDED" heading so it can be applied during integration.
3. Match existing code style/types. Keep edits surgical; don't rewrite unrelated
   logic. Leave a `// SOLANA:` comment at each change so seams are greppable.
4. Replace Ethereum concepts (ethers, MetaMask, ERC-20/721/1155, OpenSea,
   Polygon/ETH chains, ENS) with the Solana equivalents (web3.js, Phantom/wallet
   adapter, SPL tokens, Metaplex NFTs, DAS). Where a feature has no clean Solana
   analogue yet, stub it to a safe default and note it.
5. You cannot run `pnpm`/`tsc`/Postgres here. Be careful and correct; flag
   anything you couldn't verify.

## Work packages (disjoint file ownership)
1. server/auth-parcel.ts — ownership + token-gated entry on Solana
2. server/lib/ethereum-helpers.ts, server/lib/utils.ts — ERC fns → Solana shims (keep export names)
3. server/jobs/ethereum-listener.ts → server/jobs/solana-listener.ts — sync NFT ownership into properties
4. server/controllers/nft.ts — NFT metadata via Metaplex
5. server/controllers/parcels.ts — mint/claim parcel endpoints on Solana
6. server/controllers/collections.ts, server/collection.ts — collections → Metaplex
7. server/handlers/get-token-metadata.ts, server/handlers/get-collectible-metadata.ts — Metaplex metadata
8. server/parcel.ts, server/parcel-builder.ts — parcel model: owner=pubkey, solana_mint
9. server/handlers/build-parcel.ts, update-parcel.ts, query-parcel.ts — handler ownership checks
10. db/schema.sql + db/migrations/*.sql — reset owners, add solana_mint, default UNOWNED
11. common/helpers/chain-helpers.ts, common/helpers/parcel-helper.ts — chain config → Solana
12. common/messages/parcel.ts, api-opensea.ts, collectibles.ts — message/types → Solana
13. common/helpers/collections-helpers.ts, apis.ts, utils.ts — chain refs → Solana
14. client wallet connect — replace MetaMask/ethers provider with Solana wallet adapter (Phantom)
15. client sign-in — sign login message with Phantom, post to /sign-in
16. src/ui/overlay/parcel-info.tsx, src/parcel-bouncer.tsx — show Solana owner, client gating
17. src/ui/gui/opensea-asset-helper.ts, src/components/nft-images-by-collections.tsx, src/components/item-by-categories.tsx — NFT display via DAS/Metaplex
18. package.json + .env.example + .env.production — Solana deps & config; drop ethers/metamask
19. scripts/solana-mint-parcels.ts + SOLANA.md — Metaplex collection + parcel mint/claim tooling & docs
20. server/server.ts — integration: wire solana-listener job + any renamed routes (sole owner of server.ts)
