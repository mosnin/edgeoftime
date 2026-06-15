import { ExponentialBackoff, handleAll, retry } from 'cockatiel'
// SOLANA: dropped `import { parseUnits } from 'ethers'` (unused; ethers removed).
import type { AlchemyNFTWithMetadata } from '../messages/api-alchemy'
import { OrderRecordV2 } from '../messages/api-opensea'
import { getActiveChain } from './solana-chain-helpers'
// Create a retry policy that'll try whatever function we execute 2 times with a randomized exponential backoff.
const retryPolicy = retry(handleAll, { maxAttempts: 2, backoff: new ExponentialBackoff() })

export const fetchJSON = (url: string, init: RequestInit): Promise<Record<string, any>> => {
  return retryPolicy.execute(async () => {
    const p = await fetch(url, init)
    if (p.ok) {
      return p.json()
    } else {
      throw new Error(`${p.status} ${p.statusText}`)
    }
  })
}

// SOLANA: `address` is now the Metaplex mint (base58 pubkey). `chain`/`tokenId`/
// `erc20` retained for importer compatibility but are no longer meaningful on
// Solana — a mint fully identifies the asset.
export type tokenBasicInfo = {
  address: string // SOLANA: Metaplex mint address (base58)
  chain: number // SOLANA: legacy EVM chain id; unused for Solana lookups
  erc20?: boolean
  tokenId?: string // SOLANA: legacy; a mint has no token id
}

// SOLANA: was Alchemy NFT metadata. Now fetch metadata via the DAS getAsset RPC
// for the given mint. Returns the asset shaped (loosely) as the legacy type so
// callers keep compiling; map the DAS asset → AlchemyNFTWithMetadata at the
// server boundary if richer fields are needed.
export const fetchMetadataViaAlchemy = async (token: tokenBasicInfo): Promise<(AlchemyNFTWithMetadata & { success: boolean }) | undefined> => {
  if (!token.address) {
    throw Error('Fetching metadata requires a mint address')
  }
  let p
  try {
    p = await fetch(getActiveChain().rpcUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      // DAS read API; requires a DAS-capable RPC (Helius/Triton) in production.
      body: JSON.stringify({ jsonrpc: '2.0', id: 'getAsset', method: 'getAsset', params: { id: token.address } }),
    })
  } catch {}

  if (!p) {
    return
  }

  let r
  try {
    const json = (await p.json()) as { result?: any; error?: any }
    // SOLANA: shape the DAS result into the legacy success wrapper.
    r = { ...(json.result ?? {}), success: !!json.result } as AlchemyNFTWithMetadata & { success: boolean }
  } catch {}

  return r
}

export type ParcelEvent = {
  parcel_id: string
  avatar: { wallet?: string | null; uuid: string }
  event_type: 'playerleave' | 'playerenter' | 'click'
  feature: { type?: string | null; id?: string | null; uuid: string } | null
  metadata: Record<string, any> | null
}

export type ParcelEventResult = ParcelEvent & { time: string }

const key = process.env.SURVEYOR_KEY
export const SURVEYOR_URL = 'https://surveyor.crvox.com'
export const recordParcelEvent = (event: ParcelEvent) => {
  if (!key) {
    return
  }

  const init = { method: 'PUT', headers: { 'cv-surveyor-auth': key, Accept: 'application/json', 'Content-Type': 'application/json', priority: 'low' }, body: JSON.stringify(event) }
  fetch(`${SURVEYOR_URL}/`, init)
    .then((res) => {
      if (!res.ok) {
        console.error(`surveyor failed record an parcel event ${res.status} - ${res.statusText}`)
      }
    })
    .catch((err) => {
      console.error('failed sending parcel event to surveyor', err)
    })
}

// SOLANA: ownership is "does this wallet hold this mint?". `mint` is the
// Metaplex mint (base58); `wallet` is the holder pubkey. The `chain` arg is
// retained for signature compatibility but ignored (single Solana cluster).
export const doesUserOwnNFT = async (mint: string, wallet: string, _chain: 'eth' | 'matic' = 'eth') => {
  if (!mint || !wallet) {
    return false
  }
  let result: { success: boolean; ownsToken?: boolean }
  try {
    const p = await fetch(`/api/avatar/owns/solana/${wallet}/${mint}`)
    result = await p.json()
  } catch (e) {
    return false
  }

  if (result.success) {
    return result.ownsToken
  } else {
    return false
  }
}

// SOLANA: there are no ERC contract types. A mint is either a Metaplex NFT or
// an SPL token. Keep the export name; classify via the Solana helper route.
export const typeOfContract = async (address: string, _chain: 'eth' | 'matic' = 'eth') => {
  if (!address) {
    return null
  }
  let result: { success: boolean; type: 'metaplex' | 'spl' | null }
  try {
    const p = await fetch(`/api/helper/typeOfMint/solana/${address}`)
    result = await p.json()
  } catch (e) {
    return null
  }

  return result.type
}

export const getRenterOfParcel = async (parcelId: number) => {
  if (!parcelId) {
    return null
  }
  let result: { success: boolean; renter: string }
  try {
    const p = await fetch(`/api/parcels/${parcelId}/getRenter`)
    result = await p.json()
  } catch (e) {
    return null
  }

  return result.renter
}

// SOLANA TODO: parcel renting was powered by LandWorks (an EVM/thegraph subgraph
// keyed on a 0x metaverse registry). There is no Solana renting backend yet, so
// no parcel is considered rentable. Reintroduce via an on-chain rental program
// or off-chain DB lookup when that feature is ported.
export const getPropertyIdIfParcelRentable = async (_parcelId: number): Promise<{ id: string; isRented: boolean } | null> => {
  return null
}

/**
 * Checks if the wallet holds a token for a specific event
 * @param wallet the string
 * @returns
 */
export const checkWalletOwnsPOAP = async (event_id: string, wallet: string) => {
  if (!event_id) {
    return false
  }
  if (!wallet) {
    return false
  }
  // SOLANA TODO: POAP is an Ethereum protocol (api.poap.tech). The Solana
  // analogue is a proof-of-attendance compressed NFT / collection membership
  // check via DAS (countNftsFromCollection). Until that is wired, no wallet is
  // considered to hold the POAP.
  return false
}

/**
 * Grab the display name for that wallet.
 * SOLANA: ENS does not exist on Solana. A name service equivalent (SNS / .sol)
 * could resolve here, but the in-app avatar name is the source of truth, so we
 * just hit the internal avatar-name route. The ETH burn-address special-case is
 * removed (base58 pubkeys, no 0x sentinel).
 */
export const getAvatarNameFromWallet = async (wallet: string, cachebust = false) => {
  const url = `/api/avatar/${wallet}/name.json` + (cachebust ? `?cb=${Date.now()}` : '')

  try {
    const r = await fetchJSON(url, { method: 'GET', headers: { Accept: 'application/json' } })
    return r.name.name // lol
  } catch {
    return null
  }
}

/// OPENSEA WRAPPERS --------------------------------------------------------------------------------
// OPENSEA WRAPPER CAUSE HOLY SHIT
type openseaOrdersFetchConfigs = {
  asset_contract_address?: string
  token_id?: string
  token_ids?: string[]
  maker?: string
  taker?: string
  owner?: string
  is_english?: boolean
  bundled?: boolean
  include_bundled?: boolean
  listed_after?: number
  listed_before?: number
  side: 1 | 0 //1= sell;0=buy
  sale_kind?: 0 | 1 // 0 = fixed-price; 1 = Dutch
  only_english?: boolean
  limit: number
  offset: number
  order_by: 'created_date' | 'eth_price'
  order_direction: 'asc' | 'desc'
}

export const defaultOpenseaConfig: openseaOrdersFetchConfigs = {
  is_english: false,
  bundled: false,
  include_bundled: false,
  side: 1,
  limit: 30,
  offset: 0,
  order_by: 'created_date',
  order_direction: 'desc',
}

export type OpenseaListingsV2Configs = {
  asset_contract_address: string
  limit?: string
  token_ids: string[]
}

// SOLANA TODO: was the OpenSea v2 listings API. Solana marketplaces (Magic Eden,
// Tensor) expose their own listing APIs keyed by collection/mint, not by EVM
// contract address. Until a Solana marketplace integration is built, return no
// listings. Map a Solana marketplace response → OrderRecordV2[] when wired.
export const fetchListingsV2 = async (_config: OpenseaListingsV2Configs, _signal?: AbortSignal): Promise<OrderRecordV2[]> => {
  return []
}

// SOLANA: EVM gas/fee shapes. Solana fees are a flat lamports-per-signature plus
// optional priority fee (microlamports/CU). Types kept for importer
// compatibility; not used for Solana fee estimation.
type gasData = {
  maxPriorityFee: number
  maxFee: number
}
type GasResponse = {
  safeLow: gasData
  standard: gasData
  fast: gasData
  estimatedBaseFee: number
  blockTime: number
}

export interface gasFeeDataResponse {
  maxFeePerGas: any
  maxPriorityFeePerGas: any
}
