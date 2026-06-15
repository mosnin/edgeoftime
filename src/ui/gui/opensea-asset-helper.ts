// SOLANA: This file was the OpenSea/Ethereum asset wrapper. It has been
// retargeted to Solana Metaplex NFTs fetched via the DAS API (getAsset /
// getAssetsByOwner). The filename, class name (OpenseaAssetHelper) and default
// export are kept STABLE so existing importers don't break — only the
// implementation changed. Ethers / OpenSea imports have been removed.
import { getActiveChain } from '../../../common/helpers/solana-chain-helpers'
import { tidyInt } from '../../utils/helpers'

interface ownerData {
  username: string | null
  address: string
}

// SOLANA: Minimal shape of a Metaplex DAS asset (as returned by getAsset /
// getAssetsByOwner). Only the fields this helper consumes are typed.
export interface DasAsset {
  id: string // the NFT mint address (base58)
  content?: {
    metadata?: { name?: string; description?: string; attributes?: { trait_type: string; value: string | number }[] }
    files?: { uri?: string; cdn_uri?: string; mime?: string }[]
    links?: { image?: string; animation_url?: string; external_url?: string }
    json_uri?: string
  }
  ownership?: { owner?: string; frozen?: boolean }
  grouping?: { group_key: string; group_value: string }[]
  interface?: string // e.g. 'V1_NFT', 'ProgrammableNFT'
  token_info?: { supply?: number }
}

// SOLANA: client-side JSON-RPC call to a DAS-capable Solana RPC. Endpoint comes
// from the active chain config (getActiveChain().rpcUrl, driven by SOLANA_RPC_URL
// / SOLANA_CLUSTER env). Note: the public mainnet/devnet endpoints do NOT support
// DAS — a Helius/Triton/QuickNode RPC is required for getAsset/getAssetsByOwner.
async function dasRpc<T>(method: string, params: unknown): Promise<T> {
  const rpcUrl = getActiveChain().rpcUrl
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'cv-das', method, params }),
  })
  if (!res.ok) throw new Error(`DAS ${method} failed: ${res.status} ${res.statusText}`)
  const json = await res.json()
  if (json.error) throw new Error(`DAS ${method} error: ${JSON.stringify(json.error)}`)
  return json.result as T
}

// SOLANA: fetch a single Metaplex NFT by mint via DAS getAsset.
export async function getDasAsset(mint: string): Promise<DasAsset> {
  return dasRpc<DasAsset>('getAsset', { id: mint })
}

// SOLANA: enumerate a wallet's Metaplex NFTs via DAS getAssetsByOwner. Replaces
// OpenSea's "assets by owner" listing used for NFT browsing.
export async function getDasAssetsByOwner(ownerAddress: string, page = 1, limit = 1000): Promise<DasAsset[]> {
  const result = await dasRpc<{ items: DasAsset[] }>('getAssetsByOwner', {
    ownerAddress, // base58 ed25519 pubkey — never lower-cased
    page,
    limit,
  })
  return result?.items ?? []
}

// SOLANA: pull the best image URL out of a DAS asset (content.links.image first,
// then the first image file's cdn_uri/uri).
function dasImage(asset: DasAsset): string | null {
  const linkImg = asset.content?.links?.image
  if (linkImg) return linkImg
  const file = asset.content?.files?.find((f) => (f.mime ?? '').startsWith('image') || f.uri)
  return file?.cdn_uri || file?.uri || null
}

// SOLANA: pull an animation/media URL (video/audio/gif) from DAS content.
function dasAnimation(asset: DasAsset): string | null {
  const linkAnim = asset.content?.links?.animation_url
  if (linkAnim) return linkAnim
  const media = asset.content?.files?.find((f) => {
    const m = f.mime ?? ''
    return m.startsWith('video') || m.startsWith('audio') || m.includes('gif')
  })
  return media?.uri || media?.cdn_uri || null
}

export default class OpenseaAssetHelper {
  public description: string | null
  // SOLANA: the Metaplex collection mint (DAS grouping group_value) replaces the
  // Ethereum asset_contract address. Kept under an asset_contract-shaped field so
  // consumers reading `.address`/`.schema_name` keep working.
  private asset_contract: { address: string; schema_name: string }
  private readonly traits: { trait_type: string; value: string | number }[] = []
  private readonly top_ownerships: never[] = []
  private ownership: { owner: { address: string } } | null = null
  private readonly image_url: string | null
  private readonly image_preview_url: string | null = null
  private readonly image_original_url: string | null = null
  private creator: any
  private owner: any
  private readonly name: string | null
  private animation_url: any
  private readonly mint: string = ''

  // SOLANA: constructor now accepts a DAS asset (or a pre-mapped DAS-shaped
  // object). It maps DAS fields → the wrapper's expected shape.
  constructor(obj: DasAsset) {
    this.mint = obj.id
    const collectionMint = obj.grouping?.find((g) => g.group_key === 'collection')?.group_value ?? ''
    // SOLANA: Metaplex tokens are not ERC721/1155. We label fungible-supply NFTs
    // (supply > 1, akin to wearables/editions) as 'ERC1155' so the legacy
    // isERC1155/isWearable branches keep their existing semantics.
    const supply = obj.token_info?.supply ?? 1
    this.asset_contract = {
      address: collectionMint,
      schema_name: supply > 1 ? 'ERC1155' : 'ERC721',
    }

    this.traits = obj.content?.metadata?.attributes ?? []

    const ownerAddr = obj.ownership?.owner ?? ''
    if (ownerAddr) {
      this.ownership = { owner: { address: ownerAddr } }
      this.owner = { address: ownerAddr, user: null }
    }

    this.image_url = dasImage(obj)
    this.animation_url = dasAnimation(obj)
    this.name = obj.content?.metadata?.name ?? null
    this.description = obj.content?.metadata?.description ?? null
    // SOLANA TODO: DAS exposes creators on the full asset (asset.creators[]);
    // populate `this.creator` from there once the creator UI is wired up.
    this.creator = undefined
  }

  /**
   * {boolean} SOLANA: true for multi-supply Metaplex editions (mapped from ERC1155).
   */
  get isERC1155() {
    if (!this.asset_contract.schema_name) {
      return false
    }
    return this.asset_contract.schema_name === 'ERC1155'
  }

  /**
   * SOLANA: true if this NFT belongs to the wearable (CV) Metaplex collection.
   * WEARABLE_CONTRACT_ADDRESS now holds the wearable collection mint (base58).
   */
  get isWearable() {
    return this.isERC1155 && this.asset_contract.address === process.env.WEARABLE_CONTRACT_ADDRESS
  }

  /**
   * return true if asset has animation
   */
  get isAnimated() {
    if (!this.animation_url) return false

    // ipfs/arweave URLs generally do not have an extension, so we return true just in case.
    if (this.animation_url.match(/ipfs|arweave/g)) return true

    let url: URL
    try {
      url = new URL(this.animation_url)
    } catch {
      return false
    }
    if (!url.pathname) return false

    const extension = url.pathname.split('.').pop()?.trim() ?? ''
    return ['mp3', 'wav', 'mp4', 'mv4', 'gif', 'mov', 'webm', 'ogg', 'oga'].includes(extension.toLowerCase())
  }

  /**
   * return image
   */
  get getImage(): string {
    return this.image_url || this.image_preview_url || this.image_original_url || `${process.env.ASSET_PATH}/images/error-could_not_fetch_nft.png`
  }

  /**
   * return issues from traits (only editions/erc1155)
   */
  get getIssues(): number | undefined {
    const rarityTrait = this.traits && this.traits.filter((f) => f.trait_type === 'issues')
    return rarityTrait ? tidyInt(rarityTrait?.[0]?.value, 1000) : undefined
  }

  /**
   * SOLANA: DAS does not return a top-ownership leaderboard for editions, so this
   * is always empty. See getTopOwner for the fallback to the single holder.
   */
  get topOwnership() {
    return this.top_ownerships || []
  }

  get creatorWallet() {
    return this.creator?.address
  }

  /**
   * SOLANA: author/creator. For wearables, read from traits; otherwise fall back
   * to the DAS creator (when populated) or 'Unknown'.
   */
  get getCreator() {
    if (this.isWearable) {
      return this.getAuthor
    }
    if (!this.creator) {
      return 'Unknown'
    }
    return this.creator.user && this.creator.user.username ? this.creator.user.username : this.creator.address
  }

  /**
   * SOLANA: a parcel/asset is "unowned" when its holder pubkey is empty. There is
   * no Ethereum null address on Solana.
   */
  get isOwnerNullAddress() {
    return !this.getOwner.address || this.getOwner.address === 'unknown'
  }

  /**
   * Returns name of the asset
   */
  get getName() {
    return this.name ? this.name : 'Unknown item'
  }

  /**
   * return author from traits (only editions/erc1155)
   */
  private get getAuthor() {
    const authorTrait = this.traits && this.traits.filter((f) => f.trait_type === 'author')
    return authorTrait?.[0] ? String(authorTrait[0].value) : 'unknown'
  }

  private get getOwner(): ownerData {
    return this.owner
      ? {
          username: this.owner.user && this.owner.user.username ? this.owner.user.username : null,
          address: this.owner.address,
        }
      : { username: 'unknown', address: 'unknown' }
  }

  getTypeOfContent = async (): Promise<'image' | 'audio' | 'video'> => {
    if (!this.animation_url) return 'image'

    const mimeTypeToType = (s: string | void | null) => {
      if (s?.startsWith('audio')) return 'audio'
      if (s?.startsWith('video')) return 'video'
      return undefined
    }

    // first try to use the content type in a HEAD request instead of doing a GET request
    const contentType = await fetch(this.animation_url, { method: 'HEAD' })
      .then((r) => (r.ok ? r.headers.get('content-type') : ''))
      .catch(console.error)

    const type = mimeTypeToType(contentType)
    if (type) return type

    // if that didn't work, we better download the thing and check it's magic mime type
    const response = await fetch(this.animation_url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} - ${r.statusText} | ${this.animation_url}`)
        return r
      })
      .catch(console.error)

    if (!response?.body) return 'image'

    return 'image'
  }

  // SOLANA: OpenSea served pre-resized images (w=500) we could re-request larger.
  // Metaplex/IPFS/Arweave images are not size-parameterized, so we return the URL
  // as-is (only honoring an existing `w=` query param if a CDN provides one).
  getBiggerImage(size = 1024): string {
    const url = this.image_url || this.image_preview_url || this.image_original_url
    if (!url) {
      return `${process.env.ASSET_PATH}/images/error-could_not_fetch_nft.png`
    }

    if (!url.includes('w=')) {
      return url
    }

    let u: URL
    try {
      u = new URL(url)
    } catch (e) {
      console.error(`NFT URL ${url} is not a valid URL`)
      return `${process.env.ASSET_PATH}/images/error-could_not_fetch_nft.png`
    }
    u.searchParams.set('w', `${size}`)
    return u.toString()
  }

  /**
   * SOLANA: Metaplex NFTs have a single current holder (DAS ownership.owner), so
   * "top owner" is simply that holder. base58 pubkeys are case-sensitive — we do
   * NOT lower-case them when matching parcelOwner.
   */
  getTopOwner(parcelOwner?: string): ownerData | null {
    const owner = this.getOwner
    if (parcelOwner) {
      // SOLANA: exact (case-sensitive) base58 compare.
      if (owner.address === parcelOwner) return owner
      return owner
    }
    return owner
  }

  // SOLANA: holder check. Solana pubkeys are case-sensitive base58 — exact match,
  // no toLowerCase().
  isOwner(wallet: string) {
    if (!wallet) return false
    return this.ownership?.owner?.address === wallet
  }
}
