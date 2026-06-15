# Solana Land Port

This repo's land ownership has been retargeted from Ethereum to **Solana**, and
ships fully **reset** — nobody owns any parcel yet. Upstream is BSL-1.1 (see
LICENSE); this port is the operator's directive.

## Ownership model

- A **wallet** is a base58 ed25519 public key (32 bytes), not a `0x` hex
  address. Solana base58 is **case-sensitive** — never `.toLowerCase()` it.
- A **parcel** (`properties` row) is owned by whoever holds the parcel's
  **Metaplex NFT**. `properties.solana_mint` stores the NFT mint;
  `properties.owner` stores the current holder pubkey.
- **Reset / UNOWNED:** every parcel ships unowned — `owner = ''` (the `UNOWNED`
  sentinel), `solana_mint = NULL`, `minted = false`. Until a parcel is minted
  and claimed, ownership checks return false for everyone.

Canonical helpers (import, don't reinvent):
`common/helpers/solana-chain-helpers.ts` (`getActiveChain`, `activeCluster`,
`UNOWNED`, `isUnowned`) and `server/lib/solana-helpers.ts` (`isSolanaAddress`,
`verifySolanaSignature`, `getNftHolder`, `ownsNft`, `getSplTokenBalance`,
`countNftsFromCollection`).

## Sign-in (Phantom ed25519)

The client connects a Solana wallet (Phantom via the wallet adapter), signs the
login message with ed25519, and posts `{ wallet, message, signature }` to
`/sign-in`. The server verifies it with `verifySolanaSignature` — there is no
EIP-191-style address recovery; the signature is checked directly against the
claimed pubkey. A parcel is owned by a wallet iff `ownsNft(wallet, solana_mint)`.

## Environment config

| Var | Purpose |
| --- | --- |
| `SOLANA_RPC_URL` | RPC endpoint. **DAS-capable** (Helius/Triton/QuickNode) in prod — needed by `countNftsFromCollection` / wallet NFT enumeration. |
| `SOLANA_CLUSTER` | `mainnet-beta` or `devnet` (default `devnet`). |
| `SOLANA_DEVNET_RPC_URL` | Optional devnet override. |
| `SOLANA_MINT_AUTHORITY_SECRET` | base58 or JSON-array secret key of the funded minter (tooling only — never ship to clients). |
| `PARCEL_COLLECTION_MINT` | base58 mint of the "Voxels Land" collection NFT. |

## Deploy: collection + mint + claim

Tooling lives in `scripts/solana-mint-parcels.ts` (see `scripts/README-solana.md`).

1. **Install Solana deps** (not installed here):
   `pnpm add @metaplex-foundation/umi @metaplex-foundation/umi-bundle-defaults @metaplex-foundation/mpl-token-metadata @solana/web3.js`
2. **Run the DB migration:** `db/migrations/20260615-solana-reset-ownership.sql`
   — adds `solana_mint`, defaults `owner` to `''`, resets all parcels to UNOWNED.
3. **Create the collection** (once):
   `tsx scripts/solana-mint-parcels.ts create-collection` → copy the printed
   `PARCEL_COLLECTION_MINT` into the server env.
4. **Mint a parcel:**
   `PARCEL_COLLECTION_MINT=<mint> tsx scripts/solana-mint-parcels.ts mint-parcel --parcel <id>`
   → record the printed mint in `properties.solana_mint` (and `minted=true`).
5. **Claim:** a user connects Phantom, signs in, and the NFT is transferred to
   their wallet; the server resolves `owner` via `getNftHolder` /
   `countNftsFromCollection`.

## Known limitations / TODO

- Requires `pnpm install` of the Solana deps above; none are installed in this
  environment and nothing here was compiled or run.
- Requires a **DAS-capable RPC** for collection enumeration; the public
  endpoints only support basic ownership lookups (`getTokenLargestAccounts`).
- **Client wallet adapter** flow (Phantom connect + sign-in transfer) needs
  end-to-end testing with a real wallet on devnet.
- The mint script does not write to Postgres — it prints the SQL to run; wire an
  automated mint→DB step if bulk-minting all parcels.
- Royalty / metadata URIs in the script are placeholders; point `PARCEL_BASE_URI`
  at real hosted metadata JSON before mainnet.
