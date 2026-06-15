// Solana chain configuration. Replaces the Ethereum/Polygon chain config in
// chain-helpers.ts for the Solana retarget of land ownership.
//
// On Solana a "wallet" is a base58-encoded ed25519 public key (32 bytes), not a
// 0x-prefixed hex address. Parcel (land) ownership is determined by who holds
// the parcel's NFT (a Metaplex token), and the holder's pubkey is stored in
// properties.owner.

export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet' | 'off-chain'

export interface SolanaChainParameter {
  cluster: SolanaCluster
  name: string
  rpcUrl: string
  explorerUrl: string
}

// RPC endpoints. A dedicated RPC (Helius/Triton/QuickNode) is recommended in
// production for the DAS API (getAssetsByOwner) used to enumerate a wallet's
// NFTs; the public endpoints below work for basic ownership lookups.
const RPC_MAINNET = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
const RPC_DEVNET = process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com'

export const mainnetChain: SolanaChainParameter = {
  cluster: 'mainnet-beta',
  name: 'Solana Mainnet',
  rpcUrl: RPC_MAINNET,
  explorerUrl: 'https://explorer.solana.com',
}

export const devnetChain: SolanaChainParameter = {
  cluster: 'devnet',
  name: 'Solana Devnet',
  rpcUrl: RPC_DEVNET,
  explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
}

export const supportedChains: SolanaChainParameter[] = [mainnetChain, devnetChain]

// Which cluster the deployment targets (set SOLANA_CLUSTER in the environment).
export const activeCluster: SolanaCluster = (process.env.SOLANA_CLUSTER as SolanaCluster) || 'devnet'

export function getActiveChain(): SolanaChainParameter {
  return activeCluster === 'mainnet-beta' ? mainnetChain : devnetChain
}

export type ChainIdentifier = SolanaCluster
export const SUPPORTED_CHAINS_KEYS: ChainIdentifier[] = ['mainnet-beta', 'devnet', 'testnet', 'off-chain']

// Sentinel stored in properties.owner for a parcel that nobody owns yet.
// (The project ships fully reset — every parcel is UNOWNED until it is minted
// and claimed as a Solana NFT.)
export const UNOWNED = ''

export function isUnowned(owner: string | null | undefined): boolean {
  return !owner || owner.trim() === UNOWNED
}
