import { useState } from 'preact/hooks'
import { imageUrlViaProxy } from '../utils/helpers'

// SOLANA: NFT browsing is retargeted from OpenSea/Ethereum to Solana Metaplex
// (DAS API). The OpenSeaNFTV2Extended import has been dropped in favour of a
// small DAS-derived display shape. A "collection" is a Metaplex collection
// (DAS grouping group_value) rather than an OpenSea collection slug.

// SOLANA: minimal display shape mapped from a DAS asset:
//   name        <- content.metadata.name
//   image_url   <- content.links.image / first image file
//   permalink   <- explorer URL for the mint (used as the click target / id)
//   mint        <- the NFT mint address (base58)
export type DisplayNft = {
  mint: string
  name: string
  image_url: string | null
  permalink: string
}

export type Collection = { collection: string; items: DisplayNft[] }

interface NFTCollectionProps {
  collection: Collection
  callback?: (url?: string) => void
}

export default function NftCollectionsComponent(props: NFTCollectionProps) {
  const [collapsed, setCollapsed] = useState<boolean>(true)
  return (
    <div>
      <div className="category-name" onClick={() => setCollapsed(!collapsed)}>
        <h5>
          {collapsed ? '+ ' : '- '} {props.collection.collection}
        </h5>
      </div>
      <div className={`collapsible ${collapsed ? 'collapsed' : ''}`}>
        <NftsByCollections items={props.collection.items} callback={props.callback} />
      </div>
    </div>
  )
}

interface NftsByCollectionsProps {
  items: DisplayNft[]
  callback?: (url?: string) => void
}

function NftsByCollections(props: NftsByCollectionsProps) {
  // SOLANA: render Metaplex NFTs. image_url is the DAS-resolved media URL
  // (IPFS/Arweave/CDN); we still proxy it to avoid CSP issues and to resize.
  const nftItems = props.items.map((nft: DisplayNft) => {
    let preview
    if (nft.image_url) {
      const resized = imageUrlViaProxy(nft.image_url, 55)
      preview = <img src={resized} width={55} height={55} title={nft.name || nft.permalink} alt={nft.name || nft.permalink} />
    } else {
      preview = <div style="color:#fff">{nft.name || nft.permalink}</div>
    }
    return <a onClick={() => props.callback?.(nft.permalink)}>{preview}</a>
  })
  return <div className="category-models">{nftItems}</div>
}
