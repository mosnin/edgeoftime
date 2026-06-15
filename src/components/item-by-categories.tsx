import { Component } from 'preact'
// SOLANA: NFT image resolution is retargeted from OpenSea/Ethereum to Solana
// Metaplex via the DAS API. The OpenSea proxy helpers (opensea / readOpenseaUrl)
// are dropped in favour of getDasAsset, which fetches a Metaplex NFT by mint
// from a DAS-capable Solana RPC (endpoint from getActiveChain().rpcUrl).
import { getDasAsset } from '../ui/gui/opensea-asset-helper'
import { SingleParcelRecord } from '../../common/messages/parcel'
import { FeatureCommon, FeatureType } from '../../common/messages/feature'
import { imageUrlViaProxy, tidyURL } from '../utils/helpers'

interface Props {
  items: FeatureCommon[]
  callback?: (url: string) => void
}

interface State {
  items: FeatureCommon[]
  category: null
  imgUrls: Record<string, string>
  loaded: boolean
}

export class ItemsByCategories extends Component<Props, State> {
  constructor(props: any) {
    super()

    this.state = {
      items: props.items || [],
      category: null,
      imgUrls: {},
      loaded: true,
    }
  }

  componentDidMount = () => this.refresh()

  setStateAsync = (state: Partial<State>): Promise<void> => new Promise((resolve) => this.setState(state, resolve))

  refresh() {
    this.setState({ loaded: false })
    const imgUrls: Record<string, string> = {}

    // @todo(stojg) run this with promise all
    this.onlyFeaturesWithUrl().forEach(async (feature) => {
      if (!feature.uuid) {
        return
      }
      const u = await this.getImage(feature)
      if (u) imgUrls[feature.uuid] = imageUrlViaProxy(u, 55)
    })

    this.setState({ imgUrls: imgUrls, loaded: true })
  }

  async componentDidUpdate(prevProps: Props) {
    if (prevProps.items != this.props.items) {
      await this.setStateAsync({ items: this.props.items || [] })
      this.refresh()
    }
  }

  onClick(url: any) {
    this.props.callback?.(url)
  }

  onlyFeaturesWithUrl() {
    return this.state.items.filter((f: FeatureCommon) => tidyURL(f.url))
  }

  // SOLANA: resolve the NFT image/animation for a feature whose URL references a
  // Metaplex NFT. We extract the mint (base58) from the feature URL and fetch the
  // asset via DAS getAsset, then pick the media URL from content.links/files.
  async nftImage(feature: FeatureCommon) {
    const url = tidyURL(feature.url)
    if (!url) return ''
    const mint = this.parseSolanaMint(url)
    if (!mint) return ''
    try {
      const asset = await getDasAsset(mint)
      const links = asset.content?.links
      if (links?.animation_url) return links.animation_url
      if (links?.image) return links.image
      const file = asset.content?.files?.[0]
      return file?.cdn_uri || file?.uri || ''
    } catch (e) {
      console.error(`Failed to load Solana NFT ${mint}`, e)
      return ''
    }
  }

  // SOLANA: extract a Metaplex mint address from a feature URL. Supports a Solana
  // explorer URL (.../address/<mint> or .../token/<mint>) or a bare base58 mint.
  // base58 is case-sensitive — do NOT lower-case. SOLANA TODO: tighten this once
  // the canonical NFT-link format for parcels/features is finalised.
  parseSolanaMint(url: string): string {
    const base58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/
    let candidate = url.trim()
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean)
      const idx = parts.findIndex((p) => p === 'address' || p === 'token')
      candidate = idx >= 0 ? parts[idx + 1] ?? '' : parts[parts.length - 1] ?? ''
    } catch {
      // not a URL — treat the whole string as a possible bare mint
    }
    const m = candidate.match(base58)
    return m ? m[0] : ''
  }

  async getImage(item: FeatureCommon) {
    switch (item.type) {
      case 'image':
      case 'cube':
        return tidyURL(item.url)
      case 'nft-image':
        return tidyURL(await this.nftImage(item))
      case 'vox-model':
        return `${process.env.ASSET_PATH}/icons/vox-model.png`
      case 'audio':
        return `${process.env.ASSET_PATH}/icons/audio.png`
      default:
        return ''
    }
  }

  shortenDropboxUrl(url: string | undefined) {
    if (!url) return ''
    const u = url
    if (!!u.match(/(https?:\/\/(.+?\.)?dropbox\.com(\/[A-Za-z0-9\-\._~:\/\?#\[\]@!$&'\(\)\*\+,;\=]*)?)/gim)) {
      const path = u.substring(u.lastIndexOf('/') + 1)
      return `dropbox/.../${path}`
    }
    return url
  }

  render() {
    const items = this.state.imgUrls
      ? this.onlyFeaturesWithUrl().map((feature: FeatureCommon) => {
          if (!feature.uuid) return
          const imgUrl = this.state.imgUrls[feature.uuid]
          const url = tidyURL(feature.url)
          const name = 'id' in feature ? `id: ${feature.id}` : this.shortenDropboxUrl(url)
          return (
            <a onClick={() => this.onClick(url)} style="overflow: hidden;display: inline-flex; max-width: 100%;">
              <img width={20} height={20} src={imgUrl} alt={url} />
              <p>{name}</p>
            </a>
          )
        })
      : null

    return (
      <div className="category-models">
        {this.onlyFeaturesWithUrl().length > 0 ? (
          items
        ) : (
          <a>
            <p>{this.state.loaded ? 'No features to show.' : 'Loading...'}</p>
          </a>
        )}
      </div>
    )
  }
}

interface categoryProps {
  category: SingleParcelRecord
  type: FeatureType
  callback?: (url: string) => void
}

interface categoryState {
  collapsed: boolean
  features: Record<FeatureType, FeatureCommon[]>
}

export default class CategorizedItemsComponent extends Component<categoryProps, categoryState> {
  constructor(props: categoryProps) {
    super()

    const perType: Record<string, FeatureCommon[]> = {}

    if (props.category.features) {
      props.category.features.forEach((f) => {
        if (!perType[f.type]) perType[f.type] = []
        perType[f.type].push(f)
      })
    }
    this.state = { collapsed: true, features: perType }
  }

  get isCategoryAParcel() {
    return !!this.props.category.address && !!this.props.category.features
  }

  get categoryObject(): SingleParcelRecord {
    return this.props.category
  }

  render() {
    return (
      <div>
        <div className="category-name" onClick={() => this.setState({ collapsed: !this.state.collapsed })}>
          <h5>
            {this.state.collapsed ? '+ ' : '- '}
            {this.isCategoryAParcel ? this.categoryObject.name || this.categoryObject.address : this.categoryObject.name}
          </h5>
        </div>
        <div className={`collapsible ${this.state.collapsed ? 'collapsed' : ''}`}>
          <ItemsByCategories items={this.state.features[this.props.type]} callback={this.props.callback} />
        </div>
      </div>
    )
  }
}
