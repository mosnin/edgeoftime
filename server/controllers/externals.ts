// SOLANA: this controller was Ethereum-only (OpenSea v2 + Alchemy NFT APIs over
// ETH/Polygon). It now reads NFTs/metadata from Solana via the Metaplex DAS RPC
// (getAssetsByOwner / getAsset) against getActiveChain().rpcUrl. ethers /
// @metamask / OpenSea / Alchemy / Etherscan imports and usages are removed.
import { Express, Request, Response } from 'express'
import { PassportStatic } from 'passport'
import { getActiveChain } from '../../common/helpers/solana-chain-helpers'
import { isSolanaAddress } from '../lib/solana-helpers'
import { OpenseaListingsV2Configs } from '../../common/helpers/apis'
import { OpenSeaNFTV2Extended, OrderRecordV2 } from '../../common/messages/api-opensea'
import cache from '../cache'
import { encryptPoapEditCode, redeemPoapForWallet } from '../handlers/poap-handler'
import log from '../lib/logger'
import { Db } from '../pg'
import { VoxelsUser } from '../user'

// SOLANA: low-level DAS JSON-RPC call against the active cluster's RPC.
// Requires a DAS-capable RPC (Helius/Triton/QuickNode) in production.
const dasRpc = async (method: string, params: Record<string, any>): Promise<any> => {
  const response = await fetch(getActiveChain().rpcUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
  })
  if (!response.ok) {
    throw new Error(`DAS ${method} failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

// SOLANA: enumerate every NFT a wallet holds via DAS getAssetsByOwner, paging
// until exhausted. Returns the raw DAS asset list for the caller to shape.
const getAssetsByOwner = async (wallet: string): Promise<any[]> => {
  const LIMIT = 1000
  const items: any[] = []
  let page = 1
  // Guard against runaway paging on misbehaving RPCs.
  for (let guard = 0; guard < 50; guard++) {
    const json = await dasRpc('getAssetsByOwner', { ownerAddress: wallet, page, limit: LIMIT })
    const pageItems: any[] = json?.result?.items ?? []
    items.push(...pageItems)
    if (pageItems.length < LIMIT) break
    page++
  }
  return items
}

// External APIs
export default function ExternalsController(db: Db, passport: PassportStatic, app: Express) {
  // SOLANA: was OpenSea v2 (per-EVM-chain account NFTs). Now lists the
  // authenticated wallet's Solana NFTs via DAS getAssetsByOwner.
  app.get('/api/externals/opensea/nfts.json', passport.authenticate('jwt', { session: false }), async (req, res) => {
    const wallet = (req.user as VoxelsUser | null)?.wallet
    if (!wallet || !isSolanaAddress(wallet)) {
      return res.status(401).send({ success: false })
    }

    let assets: any[]
    try {
      assets = await getAssetsByOwner(wallet)
    } catch (e) {
      log.info('There was a problem with the DAS getAssetsByOwner fetch!', e)
      return res.status(503).send({ success: false })
    }

    const explorer = getActiveChain().explorerUrl
    const nfts: OpenSeaNFTV2Extended[] = assets.map((a: any) => ({
      ...a,
      chain: 'solana',
      owner: wallet,
      // SOLANA: deep-link to the mint on the Solana explorer instead of OpenSea.
      permalink: `${explorer}/address/${a?.id}`,
    }))

    res.setHeader('Cache-Control', 'private, max-age=60')
    res.send({ success: true, nfts })
  })

  // SOLANA: was Alchemy getNFTs over ETH + Polygon (paged via pageKey). Now a
  // single DAS getAssetsByOwner call against the Solana cluster. The eth/matic
  // page cursors no longer apply (one wallet, one cluster) and return null.
  app.get('/api/externals/alchemy/nfts.json', cache('60 seconds'), passport.authenticate('jwt', { session: false }), async (req, res) => {
    const wallet = (req.user as VoxelsUser | null)?.wallet
    if (!wallet || !isSolanaAddress(wallet)) {
      return res.status(401).send({ success: false })
    }

    let nfts: any[] = []
    let error: string | undefined = undefined
    try {
      nfts = await getAssetsByOwner(wallet)
    } catch {
      error = 'Could not reach API, please try again later'
    }

    res.json({ success: !error, totalCount: nfts.length, nfts, newMaticPage: null, newEthPage: null, error })
  })

  // SOLANA: was Alchemy getNFTMetadata. Now resolves a single mint's metadata
  // via DAS getAsset. The mint id replaces the (contract, tokenId) pair.
  app.get('/api/externals/alchemy/metadata.json', cache('30 seconds'), async (req, res) => {
    const info = validateMetadataQueryAndReturn(req)
    if (!info) {
      res.status(403).json({ success: false })
      return
    }
    const { mint } = info

    let json: { result?: any; error?: any }
    try {
      json = await dasRpc('getAsset', { id: mint })
    } catch {
      res.json({ success: false, error: 'Could not reach the Solana RPC' })
      return
    }

    if (!json?.result || json.error) {
      res.json({ success: false, error: 'Could not resolve metadata for mint' })
      return
    }

    res.json({ success: true, ...json.result })
  })

  // Poap
  app.post('/api/poap/encrypt', passport.authenticate('jwt', { session: false }), encryptPoapEditCode)
  app.post('/api/poap/redeem', passport.authenticate('jwt', { session: false }), redeemPoapForWallet)

  app.post('/api/externals/opensea/listings', cache('30 seconds'), async (req: Request, res: Response) => {
    const config = req.body as OpenseaListingsV2Configs
    const result = await fetchOpenseaListingsV2(config)
    switch (result.type) {
      case 'success':
        res.json({ success: true, orders: result.orders })
        break
      case 'serverError':
        res.sendStatus(500)
        break
      case 'possibleClientErrorNotSureLol':
        res.sendStatus(400)
        break
      default:
        const n: never = result
        log.error('Unhandled result', { result: n })
        res.sendStatus(500)
    }
  })
}

// SOLANA: a Solana asset is fully identified by its mint (base58 pubkey). The
// former (contract address, hex/decimal tokenId, chain_id) triple is gone — the
// hex tokenId branch (parseInt(..., 16)) is dropped since isStringHex is now a
// base58 check, not a 0x-hex check. Accept `mint` (or legacy `contract`) as the
// base58 mint to look up.
const validateMetadataQueryAndReturn = (req: Request): { mint: string } | null => {
  const raw = req.query.mint ?? req.query.contract ?? req.query.tokenId
  if (typeof raw !== 'string' || !isSolanaAddress(raw)) {
    return null
  }
  return { mint: raw }
}

type FetchOpenseaListingsResult =
  | {
      type: 'serverError'
    }
  | {
      type: 'possibleClientErrorNotSureLol'
    }
  | {
      type: 'success'
      orders: OrderRecordV2[]
    }

// SOLANA TODO: was the OpenSea v2 Seaport listings API (EVM, keyed by contract
// address + token_ids). Solana marketplaces (Magic Eden, Tensor) expose their
// own listing APIs keyed by collection/mint. Until a Solana marketplace
// integration exists, return no listings. Map a marketplace response →
// OrderRecordV2[] here when wired.
const fetchOpenseaListingsV2 = async (_config: OpenseaListingsV2Configs): Promise<FetchOpenseaListingsResult> => {
  return {
    type: 'success',
    orders: [],
  }
}
