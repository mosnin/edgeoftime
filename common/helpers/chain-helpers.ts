// SOLANA: This module formerly defined Ethereum/Polygon (EVM) chain config and a
// ChainIdentifier of 'eth' | 'polygon' | 'off-chain'. It now re-exports the
// Solana chain config from solana-chain-helpers.ts. Back-compat export names are
// kept (supportedChains, SUPPORTED_CHAINS, getChainIdByName, ChainIdentifier...)
// so existing importers still compile, but they return Solana cluster values.

// SOLANA: Re-export the canonical Solana chain config (single source of truth).
export {
  mainnetChain,
  devnetChain,
  supportedChains,
  activeCluster,
  getActiveChain,
  UNOWNED,
  isUnowned,
  SUPPORTED_CHAINS_KEYS,
} from './solana-chain-helpers'
export type { SolanaCluster, SolanaChainParameter } from './solana-chain-helpers'

import { activeCluster, devnetChain, mainnetChain } from './solana-chain-helpers'
import type { SolanaChainParameter, SolanaCluster } from './solana-chain-helpers'

// SOLANA: ChainIdentifier is now a Solana cluster id, not 'eth' | 'polygon'.
export type ChainIdentifier = SolanaCluster

// SOLANA TODO: On Solana there is no numeric EVM chainId. We keep the
// SUPPORTED_CHAINS / ChainID shape as a thin back-compat shim so importers that
// referenced numeric ids still compile. Clusters map to arbitrary stable codes
// (these are NOT real chain ids and should not be sent on-chain).
export const Mainnet = 101 // SOLANA: stand-in code for mainnet-beta
export const Devnet = 103 // SOLANA: stand-in code for devnet
export const Testnet = 102 // SOLANA: stand-in code for testnet
export const OffChain = 0

export const supportedChainsIds = [Mainnet, Devnet] as const
export type ChainID = typeof Mainnet | typeof Devnet | typeof Testnet | typeof OffChain

// SOLANA: cluster name -> stand-in numeric code (back-compat for SUPPORTED_CHAINS).
export const SUPPORTED_CHAINS: Record<string, number> = {
  'mainnet-beta': Mainnet,
  devnet: Devnet,
  testnet: Testnet,
  'off-chain': OffChain,
}

// SOLANA: reverse map from stand-in code -> cluster identifier.
export const SUPPORTED_CHAINS_BY_ID: Record<string, ChainIdentifier> = {
  '101': 'mainnet-beta',
  '103': 'devnet',
  '102': 'testnet',
  '0': 'off-chain',
}

// SOLANA: returns the stand-in numeric code for a cluster (was EVM chainId).
export const getChainIdByName = (key: ChainIdentifier): number => {
  switch (key) {
    case 'mainnet-beta':
      return Mainnet
    case 'devnet':
      return Devnet
    case 'testnet':
      return Testnet
    case 'off-chain':
      return OffChain
    default:
      return Devnet
  }
}

// SOLANA: the cluster this deployment targets, as a ChainIdentifier.
export const activeChainIdentifier: ChainIdentifier = activeCluster

// SOLANA: back-compat aliases. Old code imported `Ethereum` / `Polygon` constants
// and `maticChain` / `ethChain` objects; map them to Solana equivalents so
// importers compile. Prefer the Solana names above going forward.
export const Ethereum = Mainnet // SOLANA TODO: rename importers to Mainnet
export const Polygon = Devnet // SOLANA TODO: rename importers to Devnet
export const ethChain: SolanaChainParameter = mainnetChain // SOLANA TODO: rename importers to mainnetChain
export const maticChain: SolanaChainParameter = devnetChain // SOLANA TODO: rename importers to devnetChain
