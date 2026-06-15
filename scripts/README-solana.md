# scripts/solana-mint-parcels.ts

Operator tooling for the Solana land port. Not imported by the app; run by hand.
Full context in [`../SOLANA.md`](../SOLANA.md).

## Install

```sh
pnpm add @metaplex-foundation/umi \
         @metaplex-foundation/umi-bundle-defaults \
         @metaplex-foundation/mpl-token-metadata \
         @solana/web3.js
```

## Env

```sh
export SOLANA_RPC_URL=...                 # DAS-capable in prod
export SOLANA_CLUSTER=devnet              # or mainnet-beta
export SOLANA_MINT_AUTHORITY_SECRET=...   # base58 or JSON-array secret key
export PARCEL_COLLECTION_MINT=...         # set after create-collection
```

## Run

```sh
# Once: create the "Voxels Land" collection NFT, then copy the printed mint.
tsx scripts/solana-mint-parcels.ts create-collection

# Per parcel: mint an NFT into the collection and record solana_mint in the DB.
PARCEL_COLLECTION_MINT=<mint> \
  tsx scripts/solana-mint-parcels.ts mint-parcel --parcel <id>
```

The script prints the new mint pubkey and a ready-to-run
`UPDATE public.properties SET solana_mint=... WHERE id=<id>;` statement.
