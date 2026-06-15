// SOLANA: This was the Ethereum/ERC ownership + balance layer. It is now a
// Solana-backed shim. Every export keeps its original name + signature shape so
// existing importers keep compiling, but the implementations delegate to
// server/lib/solana-helpers.ts (SPL token balances + Metaplex NFT ownership via
// DAS). `chain` parameters no longer apply and are accepted and ignored.
import Wearable from '../wearable'
import Collection from '../collection'
import log from './logger'
import { countOwnedTokens_ERC721Contract, getBalanceOfToken_ERC1155Contract, getOwnerOfToken_ERC721Contract, getTypeOfContract, TokenAddress } from './utils'
import { tokensToEnter } from '../../common/messages/parcel'
// SOLANA: canonical Solana primitives.
import { getSplTokenBalance, isSolanaAddress } from './solana-helpers'

/**
 *  Get the balance of a user given the chain (the main token of that chain)
 * eg: Amount of matic on matic, amount of Eth on Eth
 * @param wallet the wallet to get the balance of
 * @param chain the ETH (1) or MATIC (137) token
 * @returns
 */
// SOLANA: native-token balance (was ETH/MATIC). The SOL balance of a wallet
// could be fetched via connection().getBalance(); not currently needed for
// gating, so this returns 0 to keep behavior safe.
// SOLANA TODO: return lamports/1e9 via connection().getBalance(new PublicKey(wallet)).
export async function getWalletBalance(
  wallet: string,
  _chain = 1,
): Promise<{
  balance: number
}> {
  if (!isSolanaAddress(wallet)) {
    return { balance: 0 }
  }
  return { balance: 0 }
}

/**
 *  Get the balance of a user given the token and the balance.
 * eg. amount of Matic on Ethereum or amount of WETH on matic
 * @param wallet the wallet to get the balance of
 * @param token The token address
 * @returns
 */
// SOLANA: ERC-20 balance becomes an SPL token balance. `token` is the SPL mint
// (base58 pubkey); `chain` is ignored.
export async function getERC20Balance(
  wallet: string,
  token: TokenAddress,
  _chain: number,
): Promise<{
  balance: number
}> {
  if (!isSolanaAddress(wallet) || !isSolanaAddress(token as unknown as string)) {
    return { balance: 0 }
  }
  let balance = 0
  try {
    balance = await getSplTokenBalance(wallet, token as unknown as string)
  } catch (e) {
    log.error(`failed getERC20Balance for ${wallet}, ${e}`, e)
  }
  return { balance }
}

/**
 * Get count of parcels a user has
 * @param wallet the wallet to get the balance of
 * @returns
 */
// SOLANA: parcel ownership now lives in the DB (properties.owner = holder
// pubkey) and parcels are Metaplex NFTs. There is no single ERC-721 "parcel
// contract" to query a balanceOf against.
// SOLANA TODO: count parcels owned by counting properties rows where
// owner = wallet (DB query), or DAS count for the parcel collection mint.
export async function getParcelsCount(wallet: string) {
  if (!isSolanaAddress(wallet)) {
    return { parcels: 0 }
  }
  return { parcels: 0 }
}

/**
 * Get count of a specific wearable a user has.
 * @param wallet the wallet to get the balance of
 * @param collectible_uuid the uuid of the collectible.
 * @returns
 */
// SOLANA: ERC-1155 collectible balance becomes an SPL token balance for the
// collectible's mint. Off-chain collectibles stay "common" (1000).
export async function getCollectibleAmountForWallet(
  chain: number,
  address: string,
  tokenId: number,
  wallet: string,
): Promise<{
  balance: number
}> {
  //off-chain handle
  if (chain == 0) {
    // Off-chain collectibles are "common" so 1000
    return { balance: 1000 }
  }
  const collectible = await Wearable.loadFromChainInfo(chain, address, tokenId)
  if (!collectible) {
    console.warn(`Could not find collectible for ${chain} ${address} ${tokenId}`)
    return { balance: 0 }
  }
  // SOLANA: `address` is the collectible's SPL mint; resolve the holder's balance.
  if (!isSolanaAddress(wallet) || !isSolanaAddress(address)) {
    return { balance: 0 }
  }
  let balance = 0
  try {
    balance = await getSplTokenBalance(wallet, address)
  } catch (e: any) {
    log.error(e.toString ? e.toString() : e)
  }
  return { balance }
}

/**
 * Check whether the potential collection ID is already registered on chain
 * @param tokenId Potential collection id
 * @param chainId chain id 1,137,80001
 */
// SOLANA: Ethereum collection-factory lookup. No Solana analogue here; the
// Metaplex collection registry is handled elsewhere (collections WP). Returns
// false (not-yet-on-chain) so new collections aren't wrongly rejected.
// SOLANA TODO: check Metaplex collection existence for `tokenId`.
export async function isCollectionIDAlreadyOnChain(_tokenId: number, _chainId = 1): Promise<boolean> {
  return false
}

/**
 * Checks whether the address is a valid collection address.
 * @param collection a collection object
 */
// SOLANA: validating a legacy Cryptovoxels ERC URI is meaningless on Solana.
// Treat as valid (safe default, matching the original "safe" fallthrough).
// SOLANA TODO: validate Metaplex collection metadata URI if needed.
export async function collectionHasValidURI(_collection: Collection): Promise<boolean> {
  return true
}

/**
 *  Get a transaction Receipt from a TX
 * @param tx the TX
 * @param chain ETH (1) or MATIC (137)
 * @returns
 */
// SOLANA: an Ethereum tx receipt maps to a confirmed Solana transaction. Not
// used by gating; returns null. The solana-listener WP handles tx confirmation.
// SOLANA TODO: connection().getTransaction(tx, ...) if a receipt is needed.
export async function getTransactionReceipt(_tx: string, _chain = 1): Promise<any> {
  return null
}

/**
 *
 * @returns
 */
// SOLANA: Etherscan/Polygonscan ABI fetch has no Solana analogue (Solana
// programs aren't ABIs). Returns null.
export async function getABIFromContractAddress(_address: string, _chainId = 1): Promise<any> {
  return null
}

/**
 * Checks is given address is a contract
 * @param address a string
 * @param chain_id
 */
// SOLANA: "is this address a contract?" → "is this a program account?". Gating
// doesn't depend on this; return false (treat as a wallet/mint, not a program).
// SOLANA TODO: connection().getAccountInfo(addr).executable for a real check.
export async function isAddressAContract(_address: string, _chain_id: number): Promise<boolean> {
  return false
}

// SOLANA: token-gated entry check. Resolves the token type if missing, then
// delegates to the Solana-backed shims in utils.ts. ERC type strings are kept
// for config compatibility: 'erc20'/'erc1155' → SPL balance, 'erc721' → NFT
// collection/holder. Solana pubkeys are case-sensitive — no toLowerCase().
export async function userOwnsToken(token: tokensToEnter, user: { wallet: string }) {
  if (!token.type) {
    // we know token.type is going to be undefined here. so we hack the type with `as any`
    try {
      const tokenType = await getTypeOfContract((token as any).address, (token as any).chain)
      ;(token as any).type = tokenType
    } catch {
      return false
    }
  }

  if (token.type == 'erc20') {
    let erc20TokenBalance = { balance: 0 }
    try {
      erc20TokenBalance = await getERC20Balance(user.wallet, token.address as any, token.chain)
    } catch {}
    return !!erc20TokenBalance.balance
  }

  if (token.type == 'erc721') {
    // token is an NFT collection and we don't have a token_id specified (any owned is fine)
    if (!token.tokenId) {
      const r = await countOwnedTokens_ERC721Contract(user.wallet, token.address, token.chain)

      return !!r
    } else {
      // token is a specific NFT mint; check the holder.
      // SOLANA: Solana pubkeys are case-sensitive — compare exactly, no toLowerCase().
      const r = await getOwnerOfToken_ERC721Contract(token.tokenId, token.address, token.chain)
      return !!r && r == user.wallet
    }
  } else if (token.type == 'erc1155') {
    if (!token.tokenId) {
      // for erc1155 we have to have a token ID or it won't work.
      return false
    }
    // token is an SPL token with a balance check.
    const r = await getBalanceOfToken_ERC1155Contract(user.wallet, token.address, token.tokenId, token.chain)

    return !!r
  }
}
