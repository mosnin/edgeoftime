/**
 * solana-mint-parcels.ts — Metaplex tooling for the Solana land port.
 *
 * This is OFF-CHAIN OPERATOR TOOLING, not application code. It is never imported
 * by the server or client; you run it by hand (e.g. with `tsx`) to:
 *
 *   (a) create the "Voxels Land" Metaplex collection NFT once (if
 *       PARCEL_COLLECTION_MINT is unset), and
 *   (b) mint an individual parcel NFT INTO that collection for a given parcel
 *       id/address, printing the new mint pubkey so an operator can record it in
 *       the parcel's `properties.solana_mint` column.
 *
 * Ownership model (see SOLANA.md): a parcel is owned by whoever holds its
 * Metaplex NFT. The mint produced here is what `properties.solana_mint` points
 * at; `properties.owner` then tracks the current base58 holder of that mint.
 *
 * It is intentionally NOT run in this environment (no pnpm install, no RPC, no
 * funded keypair here). Treat the steps below as a recipe to run on a machine
 * with a funded mint-authority wallet and a DAS-capable RPC.
 *
 * Dependencies (install before running):
 *   pnpm add @metaplex-foundation/umi \
 *            @metaplex-foundation/umi-bundle-defaults \
 *            @metaplex-foundation/mpl-token-metadata \
 *            @solana/web3.js
 *
 * Usage:
 *   # 1. Create the collection NFT (do this once). Copy the printed mint into
 *   #    PARCEL_COLLECTION_MINT for all subsequent runs.
 *   tsx scripts/solana-mint-parcels.ts create-collection
 *
 *   # 2. Mint a parcel NFT into the collection. PARCEL_ID identifies the parcel
 *   #    in the DB; PARCEL_NAME / PARCEL_URI customize the on-chain metadata.
 *   PARCEL_COLLECTION_MINT=<collMint> \
 *   tsx scripts/solana-mint-parcels.ts mint-parcel --parcel 1234
 *
 * Environment:
 *   SOLANA_RPC_URL              RPC endpoint (DAS-capable in prod, e.g. Helius)
 *   SOLANA_CLUSTER              mainnet-beta | devnet (default: devnet)
 *   SOLANA_MINT_AUTHORITY_SECRET  base58 OR JSON-array secret key of the funded
 *                                 wallet that pays + signs (collection update
 *                                 authority / parcel minter)
 *   PARCEL_COLLECTION_MINT      base58 collection mint; if set, mint-parcel uses
 *                                 it; if unset, run create-collection first
 *   PARCEL_BASE_URI             base URL for parcel metadata JSON (optional)
 */

import {
  createNft,
  mplTokenMetadata,
  verifyCollectionV1,
  findMetadataPda,
} from '@metaplex-foundation/mpl-token-metadata'
import {
  createUmi,
} from '@metaplex-foundation/umi-bundle-defaults'
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey,
} from '@metaplex-foundation/umi'

// ---------------------------------------------------------------------------
// Config from the environment (mirrors common/helpers/solana-chain-helpers.ts).
// ---------------------------------------------------------------------------

const CLUSTER = (process.env.SOLANA_CLUSTER || 'devnet') as
  | 'mainnet-beta'
  | 'devnet'

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  (CLUSTER === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com')

const MINT_AUTHORITY_SECRET = process.env.SOLANA_MINT_AUTHORITY_SECRET || ''
const COLLECTION_MINT = process.env.PARCEL_COLLECTION_MINT || ''
const BASE_URI = process.env.PARCEL_BASE_URI || 'https://www.voxels.com/api/parcel'

// Royalty on secondary sales (basis points / percent). Adjust to taste.
const SELLER_FEE_PERCENT = 5

// ---------------------------------------------------------------------------
// Build a Umi instance signed by the mint-authority wallet.
// ---------------------------------------------------------------------------

// Accepts either a base58-encoded secret key or a JSON array of bytes
// (the two formats `solana-keygen` / Phantom export commonly produce).
function loadSecretKey(secret: string): Uint8Array {
  const trimmed = secret.trim()
  if (!trimmed) {
    throw new Error('SOLANA_MINT_AUTHORITY_SECRET is not set')
  }
  if (trimmed.startsWith('[')) {
    return Uint8Array.from(JSON.parse(trimmed))
  }
  // base58 — decode lazily to avoid a hard dep when JSON form is used.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bs58 = require('bs58')
  return bs58.decode ? bs58.decode(trimmed) : bs58.default.decode(trimmed)
}

function makeUmi() {
  const umi = createUmi(RPC_URL).use(mplTokenMetadata())
  const secret = loadSecretKey(MINT_AUTHORITY_SECRET)
  const keypair = umi.eddsa.createKeypairFromSecretKey(secret)
  umi.use(keypairIdentity(keypair))
  return umi
}

// ---------------------------------------------------------------------------
// (a) Create the "Voxels Land" collection NFT.
// ---------------------------------------------------------------------------

async function createCollection() {
  const umi = makeUmi()
  const collectionMint = generateSigner(umi)

  console.log(`Creating "Voxels Land" collection NFT on ${CLUSTER}...`)
  await createNft(umi, {
    mint: collectionMint,
    name: 'Voxels Land',
    uri: `${BASE_URI}/collection.json`,
    sellerFeeBasisPoints: percentAmount(SELLER_FEE_PERCENT),
    isCollection: true, // marks this NFT as a Metaplex Collection
  }).sendAndConfirm(umi)

  const mint = collectionMint.publicKey.toString()
  console.log('\nCollection created.')
  console.log(`PARCEL_COLLECTION_MINT=${mint}`)
  console.log('\nSet PARCEL_COLLECTION_MINT to the value above for all parcel mints,')
  console.log('and store it in the server env (used by countNftsFromCollection).')
  return mint
}

// ---------------------------------------------------------------------------
// (b) Mint a single parcel NFT into the collection.
// ---------------------------------------------------------------------------

async function mintParcel(parcelId: string) {
  if (!COLLECTION_MINT) {
    throw new Error(
      'PARCEL_COLLECTION_MINT is unset. Run `create-collection` first, then export it.'
    )
  }
  const umi = makeUmi()
  const parcelMint = generateSigner(umi)
  const collection = publicKey(COLLECTION_MINT)

  console.log(`Minting parcel #${parcelId} NFT into collection ${COLLECTION_MINT}...`)
  await createNft(umi, {
    mint: parcelMint,
    name: `Voxels Parcel #${parcelId}`,
    uri: `${BASE_URI}/${parcelId}.json`,
    sellerFeeBasisPoints: percentAmount(SELLER_FEE_PERCENT),
    // Attach to the collection (unverified until verifyCollectionV1 below).
    collection: { key: collection, verified: false },
  }).sendAndConfirm(umi)

  // Verify the collection so wallets/marketplaces/DAS trust the grouping. This
  // requires the mint authority to also be the collection's update authority.
  console.log('Verifying collection membership...')
  await verifyCollectionV1(umi, {
    metadata: findMetadataPda(umi, { mint: parcelMint.publicKey }),
    collectionMint: collection,
    authority: umi.identity,
  }).sendAndConfirm(umi)

  const mint = parcelMint.publicKey.toString()
  console.log('\nParcel minted.')
  console.log(`parcel_id=${parcelId}`)
  console.log(`solana_mint=${mint}`)
  console.log('\nRecord this in the DB, e.g.:')
  console.log(
    `  UPDATE public.properties SET solana_mint='${mint}', minted=true WHERE id=${parcelId};`
  )
  return mint
}

// ---------------------------------------------------------------------------
// CLI entrypoint.
// ---------------------------------------------------------------------------

function parseParcelArg(argv: string[]): string {
  const i = argv.findIndex((a) => a === '--parcel' || a === '-p')
  if (i >= 0 && argv[i + 1]) return argv[i + 1]
  throw new Error('Pass the parcel id with --parcel <id>')
}

async function main() {
  const [, , cmd, ...rest] = process.argv
  switch (cmd) {
    case 'create-collection':
      await createCollection()
      break
    case 'mint-parcel':
      await mintParcel(parseParcelArg(rest))
      break
    default:
      console.error('Usage:')
      console.error('  tsx scripts/solana-mint-parcels.ts create-collection')
      console.error('  tsx scripts/solana-mint-parcels.ts mint-parcel --parcel <id>')
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
