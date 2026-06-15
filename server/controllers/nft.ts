import cache from '../cache'
import { Express } from 'express'
import { Db } from '../pg'
import { PassportStatic } from 'passport'
// SOLANA: dropped ethers/Alchemy(OpenSea) imports; resolve NFTs via Solana DAS + Metaplex.
import { isSolanaAddress } from '../lib/solana-helpers'
import { getActiveChain } from '../../common/helpers/solana-chain-helpers'

function spammy(nft: any) {
  let score = 0

  if (nft.rawMetadata?.description?.match(/claim reward/)) {
    score += 0.4
  }

  if (nft.rawMetadata?.name?.match(/^visit /i)) {
    score += 0.4
  }

  if (nft.rawMetadata?.name?.match(/\bairdrop\b/i)) {
    score += 0.2
  }

  if (!nft.rawMetadata?.name && !nft.rawMetadata?.description) {
    score += 0.6
  }

  return score
}

// SOLANA: extract a displayable image url from a DAS asset (content.files / links / json_uri image).
function dasImage(asset: any): string {
  const files = asset?.content?.files ?? []
  const fileImg = files.find((f: any) => typeof f?.uri === 'string' && (f?.mime?.startsWith?.('image') ?? true))?.uri
  return asset?.content?.links?.image || fileImg || asset?.content?.json_uri || ''
}

// SOLANA: normalize a Metaplex DAS asset into the legacy NFT shape the client/spam
// filter expects (keeps `rawMetadata.{name,description}` + media/metadata fields stable).
function fromDasAsset(asset: any) {
  const md = asset?.content?.metadata ?? {}
  const name: string = md?.name ?? ''
  const description: string = md?.description ?? ''
  const image = dasImage(asset)
  const attributes = md?.attributes ?? []
  const collection = (asset?.grouping ?? []).find((g: any) => g.group_key === 'collection')?.group_value ?? ''

  return {
    // mint address is the Solana analogue of contract+tokenId
    contract: { address: collection },
    id: { tokenId: asset?.id },
    title: name,
    description,
    tokenUri: { raw: asset?.content?.json_uri ?? '', gateway: asset?.content?.json_uri ?? '' },
    media: image ? [{ raw: image, gateway: image }] : [],
    metadata: { name, description, image, attributes },
    rawMetadata: { name, description, image, attributes },
    timeLastUpdated: new Date().toISOString(),
  }
}

// SOLANA: fetch one asset's metadata via the Metaplex DAS `getAsset` RPC.
export async function getDasAsset(mint: string): Promise<any | null> {
  if (!isSolanaAddress(mint)) return null
  try {
    const res = await fetch(getActiveChain().rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'das-getAsset', method: 'getAsset', params: { id: mint } }),
    })
    const json: any = await res.json()
    return json?.result ?? null
  } catch {
    return null
  }
}

// SOLANA: enumerate every NFT a wallet holds via DAS `getAssetsByOwner`.
async function getAssetsByOwner(wallet: string): Promise<any[]> {
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
    return json?.result?.items ?? []
  } catch {
    return []
  }
}

export default function NftController(db: Db, passport: PassportStatic, app: Express) {
  app.get('/api/nfts/:wallet', cache('1 minute'), async (req, res) => {
    const wallet = req.params.wallet

    // SOLANA: reject non-Solana pubkeys (base58, never lowercased) instead of hex addresses.
    if (!isSolanaAddress(wallet)) {
      return res.json({ nfts: [], total: 0 })
    }

    // SOLANA: list the wallet's NFTs via Metaplex DAS instead of Alchemy/OpenSea.
    const assets = await getAssetsByOwner(wallet)
    let nfts = assets.map(fromDasAsset)
    nfts = nfts.filter((nft) => spammy(nft) < 0.5)

    res.json({ nfts, total: nfts.length })
  })

  // SOLANA: metadata for a single NFT by mint, via Metaplex DAS `getAsset`.
  app.get('/api/nft/:mint', cache('1 minute'), async (req, res) => {
    const mint = req.params.mint
    const asset = await getDasAsset(mint)
    if (!asset) {
      return res.status(404).json({ error: 'not found' })
    }
    res.json(fromDasAsset(asset))
  })
}
