import { noCache } from '../cache'
import Parcel from '../parcel'
import { queryAndCallback } from '../lib/query-helpers'
import db from '../pg'
import ParcelHelper from '../../common/helpers/parcel-helper'
import { Request, Response } from 'express'
// SOLANA: resolve parcel NFT metadata from Metaplex (DAS API) instead of OpenSea/Ethereum.
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
// Metaplex asset to the existing metadata response shape (name/image/uri/
// description/attributes/owner). Returns null if it cannot be resolved.
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

function getLocation(parcel: Parcel) {
  const x = Math.round((parcel.x1 + parcel.x2) / 2)
  const z = Math.round((parcel.z1 + parcel.z2) / 2)

  const e = x < 0 ? `${Math.abs(x)}W` : `${x}E`
  const n = z < 0 ? `${Math.abs(z)}S` : `${z}N`
  const u = parcel.y1 > 0 ? `${parcel.y1}U` : ''

  return [e, n, u].join(',')
}

export default function getTokenMetadata(req: Request, res: Response) {
  const construct = async (parcel: Parcel) => {
    const external_url = `https://www.voxels.com/parcels/${parcel.id}`

    const loc = getLocation(parcel)
    const animationUrl = `https://www.voxels.com/play?coords=${loc}&embedded=true&mode=orbit&isolate=true`

    const helper = new ParcelHelper(parcel)
    const isWaterfront = helper.isWaterFront

    const description_footer = `
[Visit Voxels for more info.](${external_url})`

    const parcelDescription = () => {
      if (parcel.kind == 'inner') {
        return (
          `${isWaterfront ? 'Waterfront ' : ''}Pre-built parcel with uneditable external layer near ${parcel.suburb} in ${parcel.island}, ${Math.floor(
            parcel.distance_to_center,
          )}m from the origin, with a ${Math.floor(parcel.height)}m build height. ` + description_footer
        )
      }

      if (parcel.y1 <= 0) {
        return (
          `${isWaterfront ? 'Waterfront ' : ''}Parcel ${parcel.y1 < 0 ? 'with basement ' : ''}near ${parcel.suburb} in ${parcel.island}, ${Math.floor(
            parcel.distance_to_center,
          )}m from the origin, with a ${Math.floor(parcel.height)}m build height. ` + description_footer
        )
      } else {
        return (
          `${isWaterfront ? 'Waterfront ' : ''}Parcel near ${parcel.suburb} in ${parcel.island}, ${Math.floor(parcel.distance_to_center)}m from the origin, with a ${Math.floor(
            parcel.height,
          )}m build height and floor is at ${parcel.y1}m elevation. ` + description_footer
        )
      }
    }

    const getMapUrl = (parcel: Parcel): string => {
      const slug = parcel.address.toLowerCase().replace(/ /g, '-')
      return `https://map.voxels.com/parcel/${parcel.id}-${slug}.png`
    }

    let image = getMapUrl(parcel)

    // SOLANA: if the parcel has a Metaplex mint, prefer the on-chain Metaplex
    // image/name resolved via the DAS API; fall back to the computed map image.
    const mint = (parcel as any).solana_mint as string | undefined
    if (mint && isSolanaAddress(mint)) {
      const meta = await getMetaplexMetadata(mint)
      if (meta?.image) image = meta.image
    }

    return {
      name: parcel.address,
      image,
      animation_url: animationUrl,
      description: parcelDescription(),
      attributes: {
        width: parcel.x2 - parcel.x1,
        depth: parcel.z2 - parcel.z1,
        height: parcel.height,
        elevation: parcel.y1 < 0 ? 0 : parcel.y1,
        suburb: parcel.suburb,
        island: parcel.island,
        has_basement: parcel.y1 < 0 ? 'yes' : 'no',
        title: parcel.kind,
        'pre-built': parcel.kind == 'inner',
        waterfront: isWaterfront ? 'yes' : 'no',
        'closest-common': helper.closestCommon,
      },
      external_url,
      background_color: 'f3f3f3',
    }
  }

  const id = Number(req.params.id)

  if (isNaN(id)) {
    noCache(res)
    res.status(404).send('Not found')
    return
  }

  if (!Number.isInteger(id)) {
    noCache(res)
    res.status(400).send('parcel token id is not valid')
    return
  }
  if (!Number.isSafeInteger(id)) {
    noCache(res)
    res.status(400).send('parcel token id is not valid')
    return
  }

  queryAndCallback<Parcel>(db, 'get-parcel', 'parcel', [id, false], async (result) => {
    if (!result.success) {
      const parcel = await Parcel.load(id)

      if (!parcel?.id) {
        noCache(res)
        res.status(404).send('Not found')
        return
      }

      try {
        // SOLANA: parcel.queryContract() now resolves the NFT holder from the
        // Metaplex mint (see server/parcel.ts / solana-helpers) instead of the
        // Ethereum land contract.
        await parcel.queryContract()
        if (!parcel.minted) throw new Error('Parcel not minted')
        res.json(await construct(parcel))
      } catch {
        res.json({ success: false, error: 'not minted' })
      }

      return
    }

    const parcel = result.parcel
    res.json(await construct(parcel))
  })
}
