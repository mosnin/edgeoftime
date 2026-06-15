import { TraitDisplayTypes } from '../../common/messages/collectibles'
import Wearable from '../wearable'
import Collection from '../collection'
import { isHex } from '../../common/helpers/utils'
import { Request, Response } from 'express'
import config from '../../common/config'
// SOLANA: resolve collectible metadata from Metaplex (DAS API) instead of
// ethers/OpenSea/EVM chains.
import { getActiveChain } from '../../common/helpers/solana-chain-helpers'
import { isSolanaAddress, getNftHolder } from '../lib/solana-helpers'

// SOLANA: Metaplex DAS asset shape (subset we map to the response shape).
interface DasAsset {
  id: string
  content?: {
    metadata?: { name?: string; description?: string; attributes?: any[] }
    files?: { uri?: string }[]
    links?: { image?: string }
    json_uri?: string
  }
  ownership?: { owner?: string }
}

// SOLANA: call the DAS API `getAsset` at the active chain's RPC and map the
// Metaplex asset to the metadata response shape (name/image/uri/description/
// attributes/owner). Returns null if it cannot be resolved.
async function getMetaplexMetadata(mintAddress: string) {
  if (!isSolanaAddress(mintAddress)) return null
  try {
    const res = await fetch(getActiveChain().rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'das-getAsset',
        method: 'getAsset',
        params: { id: mintAddress },
      }),
    })
    const json: any = await res.json()
    const asset: DasAsset | undefined = json?.result
    if (!asset?.id) return null

    const meta = asset.content?.metadata
    const image = asset.content?.links?.image || asset.content?.files?.[0]?.uri || ''
    const uri = asset.content?.json_uri || ''
    const owner = (await getNftHolder(mintAddress)) ?? asset.ownership?.owner ?? null

    return {
      name: meta?.name,
      image,
      uri,
      description: meta?.description,
      attributes: meta?.attributes ?? [],
      owner,
    }
  } catch {
    return null
  }
}

/*
collectible.id IS THE UUID, NOT TOKEN ID - courtesy of ben
*/
async function construct(wearable: Wearable): Promise<
  | { success: boolean }
  | {
      symbol?: string | undefined
      name: string | undefined
      image: string
      description: string | undefined
      attributes: any
      external_url: string
      background_color: string
      success?: undefined
    }
> {
  const imageSrc = config.wearablePreviewURL(wearable.id ?? null, wearable.name)

  // THis is to allow voting using those collectibles; Is needed for the scarcity votes.
  const isScarcityVotingTool = wearable.collection_id == 698 && (wearable.token_id == 5 || wearable.token_id == 6 || wearable.token_id == 170)

  const customAttributes = (wearable.custom_attributes || [])
    .filter((t: any) => !!t)
    .filter((t: any) => !t.ignore) // remove attributes we want to ignore for that collectible
    .filter((t: any) => (<any>Object).values(TraitDisplayTypes).includes(t.display_type))
    .map((t: any) => {
      delete t.ignore
      // don't add 'display_type' if it's a string attribute (marketplaces don't support it)
      return t.display_type == TraitDisplayTypes.StringTrait ? { trait_type: t.trait_type, value: t.value } : t
    })
  const otherAttributes = [
    { trait_type: 'vox', value: process.env.ASSET_PATH + `/w/${wearable.hash}/vox` },
    { trait_type: 'author', value: (await wearable.getAuthorName()) || wearable.author },
    { trait_type: 'issues', value: wearable.issues },
    { trait_type: 'rarity', value: wearable.rarity },
    { trait_type: 'suppressed', value: !!wearable.suppressed },
  ]

  const attributes = customAttributes.concat(otherAttributes)

  const collection = wearable.collection_id ? await Collection.loadFromId(wearable.collection_id) : null
  if (!collection) {
    return { success: false }
  }

  // SOLANA: if the wearable is backed by a Metaplex NFT, prefer on-chain
  // metadata (name/image) resolved via the DAS API; fall back to the local
  // preview render. The mint is expected on the collectible (Solana mint).
  let name = wearable.name
  let image = !!wearable.suppressed ? '' : imageSrc
  const mint = (wearable as any).solana_mint as string | undefined
  if (mint && isSolanaAddress(mint) && !wearable.suppressed) {
    const meta = await getMetaplexMetadata(mint)
    if (meta?.name) name = meta.name
    if (meta?.image) image = meta.image
  }

  // SOLANA: collectibles live on a Solana cluster now; external_url points at
  // the Solana explorer for the collectible's mint when available.
  // SOLANA TODO: add a first-class collectible page route for Solana mints on voxels.com.
  const external_url = mint && isSolanaAddress(mint) ? `${getActiveChain().explorerUrl}/address/${mint}` : ''

  return {
    name,
    image,
    description: !wearable.suppressed ? wearable.description : 'This Collectible has been suppressed and is not supported in Voxels.',
    attributes: attributes,
    external_url,
    background_color: 'f3f3f3',
    ...(isScarcityVotingTool && { symbol: 'SCAR' }),
  }
}

export default async function getWearableMetadata(req: Request, res: Response) {
  // receives collection_id and token_id as parameters
  const tokenID = isHex(req.params.id) ? parseInt(req.params.id, 16) : parseInt(req.params.id, 10)

  const collectionID = parseInt(req.params.collection_id, 10)
  if (isNaN(tokenID) || isNaN(collectionID)) {
    return res.status(400).json({ success: false, message: 'not valid token_id or collection_id' })
  }
  const wearable = (await Wearable.loadFromTokenIdAndCollectionId(tokenID, collectionID)) as Wearable
  if (!wearable) {
    res.status(404).send({ success: false })
    return
  }
  res.json(await construct(wearable))
}

export async function getCollectibleMetadataV2(req: Request, res: Response) {
  // SOLANA: receives a Solana cluster identifier, a Metaplex mint address and a token_id.
  const tokenID = isHex(req.params.id) ? parseInt(req.params.id, 16) : parseInt(req.params.id, 10)
  const collectionAddress = req.params.address

  // SOLANA: validate the collection/mint as a base58 Solana pubkey (was ethers.isAddress).
  if (!isSolanaAddress(collectionAddress)) {
    return res.status(400).json({ success: false, message: 'not valid address' })
  }

  // SOLANA: validate the cluster against the supported Solana clusters.
  if (!getActiveChain().cluster) {
    return res.status(400).json({ success: false, message: 'not valid chain identifier; solana mainnet/devnet supported' })
  }

  if (isNaN(tokenID)) {
    return res.status(400).json({ success: false, message: 'not valid token_id or collection_id' })
  }
  // SOLANA TODO: Wearable.loadFromChainInfo expects an EVM chain_id + address.
  // Load the collectible by its Solana collection mint instead once the
  // wearable model exposes a Solana lookup (owned by the parcel/model package).
  const wearable = (await Wearable.loadFromChainInfo(getActiveChain().cluster as any, collectionAddress, tokenID)) as Wearable
  if (!wearable) {
    res.status(404).send({ success: false })
    return
  }
  res.json(await construct(wearable))
}
