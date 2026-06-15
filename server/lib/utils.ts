// SOLANA: This file was the Ethereum/ERC utils layer (ethers contracts for
// ERC-20/721/1155, Alchemy providers). It has been retargeted to Solana.
// Export names + signature shapes are preserved so existing importers keep
// compiling, but the implementations now delegate to server/lib/solana-helpers.ts
// (SPL tokens + Metaplex NFTs). The `chain` parameters no longer apply and are
// accepted and ignored.
import { tokensToEnter } from '../../common/messages/parcel'
// SOLANA: import canonical Solana primitives instead of ethers contracts.
import { getSplTokenBalance, getNftHolder, isSolanaAddress, countNftsFromCollection } from './solana-helpers'

// SOLANA: previously Alchemy ETH/Polygon providers. Kept as named exports so
// importers don't break, but they are no longer real providers — nothing on
// Solana uses them. Reference the Solana connection() if a provider is needed.
export const ethAlchemy: any = null
export const polygonAlchemy: any = null

// SOLANA: contract ABIs are an Ethereum concept and have no Solana analogue.
// These remain exported as null so any importer still resolves the symbol.
export const ParcelContractABI: any = null
export const NameContractABI: any = null
export const ColorContractABI: any = null
export const tokenContractABI: any = null

export const erc721ABI: any = null
export const erc1155ABI: any = null
export const collectibleContractABI: any = null
export const parcelInterface: any = null

// SOLANA: TokenAddress kept for type compatibility. On Solana a "token address"
// is an SPL mint (base58 pubkey); these ETH hex values are placeholders only so
// existing references resolve. Token-gating should be configured with real
// Solana mints.
export enum TokenAddress {
  WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  MATIC = '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
  WETH_ON_MATIC = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
}

// SOLANA: legacy Ethereum contract addresses retained as exports for importers.
const NAME_ADDRESS = '0x684Cd10B02CdADE20f1858C6315052d66D1Eafc2'
const PARCEL_ADDRESS = '0x79986aF15539de2db9A5086382daEdA917A9CF0C'
const RINKEBY_PARCEL_ADDRESS = '0x13dBD857f5513C0d65a3a0690cF1e58a44D6a79e'

export const ADDRESSES = {
  PARCEL_ADDRESS,
  NAME_ADDRESS,
  RINKEBY_PARCEL_ADDRESS,
}

// SOLANA: there are no on-chain "contracts" to instantiate. getContract is kept
// as an export but returns null — callers should use solana-helpers directly.
// SOLANA TODO: parcel-count / name lookups need a Metaplex/DAS implementation.
export const getContract = async (_label: 'parcel' | 'name', _chainId: any = 0): Promise<any> => {
  return null
}

// SOLANA: no provider-per-chain concept; returns the (null) Solana placeholder.
export const getProviderGivenChain = async (_chain = 1): Promise<any> => {
  return null
}

// SOLANA: an "ERC-20 contract" maps to an SPL mint. We don't return a contract
// object anymore; balance lookups go through getSplTokenBalance. Kept returning
// null to preserve the export; callers in ethereum-helpers were updated.
export const erc20Contract = async (_address: TokenAddress, _chain = 1): Promise<any | null> => {
  return null
}

export const erc721Contract = async (_address: string, _chain = 1): Promise<any | null> => {
  return null
}

export const erc1155Contract = async (_address: string, _chain = 1): Promise<any | null> => {
  return null
}

export const collectibleContract = async (_address: string, _chain = 1): Promise<any | null> => {
  return null
}

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function numberOfQuarterOfDaySinceGenesis(): number {
  // NOTE: all dates must be in UNIX timestamp, i.e. no timezone / UTC
  // timestamp when the traffic started to be recorded
  const since = Date.parse('2019-05-15T06:00:00.000Z')
  const seconds = (Date.now() - since) / 1000
  const hours = seconds / 60 / 60
  // we record the traffic per quarter day, not day as the database column might hint at
  return Math.floor(hours / 6)
}

// SOLANA: "how many NFTs from collection X does this wallet own?" — the ERC-721
// balanceOf(owner) becomes a DAS collection count. `address` is the collection
// mint; `chain` is ignored.
export const countOwnedTokens_ERC721Contract = async (owner: string, address: string, _chain = 1): Promise<number> => {
  if (!isSolanaAddress(address) || !isSolanaAddress(owner)) {
    return 0
  }
  return await countNftsFromCollection(owner, address)
}

// SOLANA: ERC-721 ownerOf(tokenId) becomes "who holds this NFT mint?". On Solana
// the NFT is identified by its mint address (here `address`), not a numeric
// tokenId, so we resolve the holder of the mint. `tokenId` / `chain` are
// accepted for signature compatibility but the mint is the source of truth.
export const getOwnerOfToken_ERC721Contract = async (_tokenId: string, address: string, _chain = 1): Promise<string | null> => {
  if (!isSolanaAddress(address)) {
    return null
  }
  return await getNftHolder(address)
}

// SOLANA: ERC-1155 balanceOf(owner, tokenId) becomes an SPL token balance for
// the wallet. `address` is the SPL mint; `tokenId` / `chain` are ignored.
export const getBalanceOfToken_ERC1155Contract = async (owner: string, address: string, _tokenId: string, _chain = 1): Promise<number> => {
  if (!isSolanaAddress(address) || !isSolanaAddress(owner)) {
    return 0
  }
  return await getSplTokenBalance(owner, address)
}

// SOLANA: ERC interface detection (supportsInterface) has no Solana analogue.
// On Solana the gating config should declare the type explicitly. We classify
// based on whether the address is a valid Solana mint and default to 'erc721'
// (NFT collection) which is the common case for parcel/collection gating.
// SOLANA TODO: distinguish fungible SPL ('erc20') from NFT ('erc721') via mint
// supply/decimals if richer detection is needed.
export const getTypeOfContract = async (address: string, _chain = 1): Promise<'erc721' | 'erc1155' | 'erc20' | null> => {
  if (!isSolanaAddress(address)) {
    return null
  }
  return 'erc721'
}

// SOLANA: a gating token is valid if its address is a Solana mint. The numeric
// `chain` requirement is dropped (Solana has no ETH/MATIC chain ids).
export const validateTokenType = (token: tokensToEnter): boolean => {
  if (!token.address || !isSolanaAddress(token.address)) {
    return false
  }
  return true
}
