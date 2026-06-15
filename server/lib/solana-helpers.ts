// Solana ownership + signature helpers. This is the Solana counterpart to
// server/lib/ethereum-helpers.ts — it answers "who owns this parcel NFT?",
// "does this wallet hold a token from collection X?", and verifies the
// wallet-signature used at sign-in.
//
// Land model: each parcel is a Metaplex NFT. The parcel's mint address is
// stored on the parcel (properties.solana_mint); the current holder of that
// mint is the parcel owner. With the project reset, parcels have no mint and
// no owner until they are minted + claimed.

import { Connection, PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { getActiveChain } from '../../common/helpers/solana-chain-helpers'

let _conn: Connection | null = null
export function connection(): Connection {
  if (!_conn) {
    _conn = new Connection(getActiveChain().rpcUrl, 'confirmed')
  }
  return _conn
}

// ---- Address validation ----------------------------------------------------

export function isSolanaAddress(addr: string | null | undefined): boolean {
  if (!addr || typeof addr !== 'string') return false
  try {
    const decoded = bs58.decode(addr)
    return decoded.length === 32
  } catch {
    return false
  }
}

// ---- Wallet signature verification (sign-in) -------------------------------
// A Solana wallet (e.g. Phantom) signs the login message with ed25519. There is
// no address "recovery" like EIP-191 — we verify the signature directly against
// the claimed public key. `signature` may be a base58 string or raw bytes.

export function verifySolanaSignature(wallet: string, message: string, signature: string | Uint8Array | number[]): boolean {
  try {
    const pub = bs58.decode(wallet)
    if (pub.length !== 32) return false

    const msgBytes = new TextEncoder().encode(message)

    let sigBytes: Uint8Array
    if (typeof signature === 'string') {
      sigBytes = bs58.decode(signature)
    } else if (signature instanceof Uint8Array) {
      sigBytes = signature
    } else {
      sigBytes = Uint8Array.from(signature)
    }
    if (sigBytes.length !== 64) return false

    return nacl.sign.detached.verify(msgBytes, sigBytes, pub)
  } catch {
    return false
  }
}

// ---- NFT ownership ---------------------------------------------------------

// Returns the base58 pubkey of the wallet currently holding `mintAddress`
// (an NFT, supply 1), or null if it cannot be resolved / is unminted.
export async function getNftHolder(mintAddress: string): Promise<string | null> {
  if (!isSolanaAddress(mintAddress)) return null
  try {
    const mint = new PublicKey(mintAddress)
    const largest = await connection().getTokenLargestAccounts(mint)
    const holderTokenAccount = largest.value.find((a) => a.uiAmount && a.uiAmount > 0)
    if (!holderTokenAccount) return null

    const info = await connection().getParsedAccountInfo(holderTokenAccount.address)
    const data: any = info.value?.data
    const owner = data?.parsed?.info?.owner
    return typeof owner === 'string' ? owner : null
  } catch {
    return null
  }
}

// Does `wallet` hold the NFT with mint `mintAddress`? (parcel ownership check)
export async function ownsNft(wallet: string, mintAddress: string): Promise<boolean> {
  const holder = await getNftHolder(mintAddress)
  return !!holder && holder === wallet
}

// Balance of a given SPL token (fungible) for a wallet. Used for token-gated
// parcel entry (the Solana analogue of an ERC-20 balance check).
export async function getSplTokenBalance(wallet: string, mintAddress: string): Promise<number> {
  if (!isSolanaAddress(wallet) || !isSolanaAddress(mintAddress)) return 0
  try {
    const owner = new PublicKey(wallet)
    const mint = new PublicKey(mintAddress)
    const res = await connection().getParsedTokenAccountsByOwner(owner, { mint })
    let total = 0
    for (const { account } of res.value) {
      const amt = (account.data as any)?.parsed?.info?.tokenAmount?.uiAmount
      if (typeof amt === 'number') total += amt
    }
    return total
  } catch {
    return 0
  }
}

// Count NFTs a wallet holds from a given Metaplex collection, via the DAS API
// (getAssetsByOwner). Requires an RPC that supports DAS (Helius/Triton/etc.).
// Used for collection-gated parcel entry (analogue of "owns any ERC-721 from
// contract X"). Returns 0 if DAS is unavailable.
export async function countNftsFromCollection(wallet: string, collectionMint: string): Promise<number> {
  if (!isSolanaAddress(wallet) || !isSolanaAddress(collectionMint)) return 0
  try {
    const res = await fetch(getActiveChain().rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'das-getAssetsByOwner',
        method: 'getAssetsByOwner',
        params: { ownerAddress: wallet, page: 1, limit: 1000 },
      }),
    })
    const json: any = await res.json()
    const items: any[] = json?.result?.items ?? []
    return items.filter((it) => (it?.grouping ?? []).some((g: any) => g.group_key === 'collection' && g.group_value === collectionMint)).length
  } catch {
    return 0
  }
}
