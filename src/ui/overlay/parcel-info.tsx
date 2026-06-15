import ParcelHelper from '../../../common/helpers/parcel-helper'
import ParcelEventItem from '../../../web/src/components/parcel-event'
import { app } from '../../../web/src/state'
import FavoriteButton from '../../../web/src/components/favorite-button'
import { isMobile } from '../../../common/helpers/detector'
import { toggleParcelAdminOverlay } from '../parcel-admin'
import { ParcelDetails } from '../../../web/src/components/parcels/parcel-details'
import LoadingIcon from '../../../web/src/components/loading-icon'
import type Parcel from '../../parcel'
import { copyTextToClipboard } from '../../../common/helpers/utils'
import { PanelType } from '../../../web/src/components/panel'
// SOLANA: chain config + unowned sentinel for Solana ownership display
import { getActiveChain, isUnowned, UNOWNED } from '../../../common/helpers/solana-chain-helpers'

// SOLANA: helpers to render Solana ownership/marketplace info for a parcel.
// owner is a base58 ed25519 pubkey; the parcel's NFT mint lives in summary.solana_mint.
function shortPubkey(pubkey: string): string {
  // SOLANA: base58 is case-sensitive — never lowercase. Just truncate for display.
  return pubkey.length > 12 ? `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}` : pubkey
}

function solanaExplorerAddressUrl(addr: string): string {
  // getActiveChain().explorerUrl already carries the ?cluster=devnet query on devnet,
  // so append the cluster query (if any) after the /address path segment.
  const base = getActiveChain().explorerUrl
  const [origin, query] = base.split('?')
  return `${origin}/address/${addr}${query ? `?${query}` : ''}`
}

// SOLANA: Magic Eden item link for an NFT mint (mainnet). Devnet has no public ME,
// so we fall back to the Solana explorer there.
function magicEdenUrl(mint: string): string {
  return getActiveChain().cluster === 'mainnet-beta' ? `https://magiceden.io/item-details/${mint}` : solanaExplorerAddressUrl(mint)
}

interface Props {
  parcel: Parcel | null
  scene: BABYLON.Scene
}

export default function ParcelInfoTab(props: Props) {
  const parcel = props.parcel

  if (!parcel) {
    return (
      <section className="parcel-information-overlay">
        <header>
          <h2>{`Loading...`}</h2>
        </header>
        <div className="scrollContainer">
          <div className="parcels-details">
            <h2>
              <span></span>
            </h2>
          </div>
          <section className="overlay-parcel-info-content">
            <div className="Center">
              <LoadingIcon className="very-large" />
            </div>
          </section>
        </div>
      </section>
    )
  }

  const helper = new ParcelHelper(parcel)

  // SOLANA: ownership/NFT info. owner='' (UNOWNED) means nobody has claimed the
  // parcel NFT yet; solana_mint is the parcel's Metaplex mint once minted.
  const owner = (parcel.owner as string) || UNOWNED
  const parcelUnowned = isUnowned(owner)
  const solanaMint = (parcel.summary?.solana_mint as string | null | undefined) || null
  const mintExplorerUrl = solanaMint ? solanaExplorerAddressUrl(solanaMint) : null

  const name = parcel.name
  const address = parcel.address
  const description = parcel.description
  const suburbSlug = parcel.suburb.toLowerCase().replace(/\s+/, '-')
  const islandSlug = parcel.island.toLowerCase().replace(/\s+/, '-')

  const scores = parcel.performanceScores()

  const copyParcelLinkToClipboard = () => {
    copyTextToClipboard(
      `${process.env.ASSET_PATH}/parcels/${parcel.id}/visit`,
      () => {
        app.showSnackbar('Link copied to clipboard', PanelType.Success)
      },
      () => {
        app.showSnackbar('Failed to copy link', PanelType.Danger)
      },
    )
  }

  // On mobile, the scrollContainer doesn't scroll. I couldn't figure out how to fix it,
  // So we render a component dedicated to mobile (smaller)
  if (isMobile()) {
    return (
      <section className="parcel-information-overlay">
        <header>
          <h2>{`${name || address}`}</h2>
        </header>
        <div className="scrollContainer">
          <div className="parcels-details">
            <h2>
              {name ? `At ${address}, near` : 'Near'}&nbsp;
              <span>
                <a href={`/neighborhoods/${suburbSlug}`}>{parcel.suburb}</a> in <a href={`/islands/${islandSlug}`}>{parcel.island}</a>
              </span>
            </h2>
          </div>
          <ul className="actions">
            <li>
              <a target="_top" href={`/parcels/${parcel.id}`}>
                Parcel page
              </a>
            </li>
            {/* SOLANA: replaced OpenSea with Solana explorer / Magic Eden links to the parcel NFT mint */}
            {mintExplorerUrl && (
              <li>
                <a href={mintExplorerUrl} target="_blank">
                  Explorer
                </a>
              </li>
            )}
            {solanaMint && (
              <li>
                <a href={magicEdenUrl(solanaMint)} target="_blank">
                  Magic Eden
                </a>
              </li>
            )}
            {app.signedIn && !window.config.isSpace && (
              <li>
                <FavoriteButton parcelId={parcel.id} />
              </li>
            )}
            <li>
              <a title="Share parcel visit link" href="#" onClick={copyParcelLinkToClipboard}>
                Share
              </a>
            </li>
          </ul>
          <section className="overlay-parcel-info-content">
            {/* SOLANA: show truncated base58 owner pubkey linked to the Solana explorer, or claimable state when UNOWNED */}
            <div className="is-flex">
              <div>
                Owner:{' '}
                {parcelUnowned ? (
                  <span>Unowned / claimable</span>
                ) : (
                  <span>
                    <a title="View owner on Solana explorer" href={solanaExplorerAddressUrl(owner)} target="_blank">
                      {shortPubkey(owner)}
                    </a>
                  </span>
                )}
              </div>
            </div>
            <div className="overlay-parcel-info-content">
              <h4>Event</h4>
              <ParcelEventItem parcel={parcel} noevent={true} />
            </div>
          </section>
        </div>
      </section>
    )
  }

  // is not mobile

  return (
    <section className="parcel-information-overlay">
      <header>
        <h2>{`${name || address}`}</h2>
      </header>
      <div className="scrollContainer">
        <div className="parcels-details">
          <h2>
            {name ? `At ${address}, near` : 'Near'}&nbsp;
            <span>
              <a href={`/neighborhoods/${suburbSlug}`}>{parcel.suburb}</a> in <a href={`/islands/${islandSlug}`}>{parcel.island}</a>
            </span>
          </h2>
        </div>
        <ul className="actions">
          {!window.config.isSpace && (
            <li>
              <a onClick={() => toggleParcelAdminOverlay(parcel.summary, props.scene)} title="Admin panel">
                Admin
              </a>
            </li>
          )}
          <li>
            <a target="_top" href={`/parcels/${parcel.id}`}>
              Parcel page
            </a>
          </li>
          {/* SOLANA: replaced OpenSea with Solana explorer / Magic Eden links to the parcel NFT mint */}
          {mintExplorerUrl && (
            <li>
              <a href={mintExplorerUrl} target="_blank">
                Explorer
              </a>
            </li>
          )}
          {solanaMint && (
            <li>
              <a href={magicEdenUrl(solanaMint)} target="_blank">
                Magic Eden
              </a>
            </li>
          )}
          {app.signedIn && !window.config.isSpace && (
            <li>
              <FavoriteButton parcelId={parcel.id} />
            </li>
          )}
          <li>
            <a title="Share parcel visit link" href="#" onClick={copyParcelLinkToClipboard}>
              Share
            </a>
          </li>
        </ul>
        <section className="overlay-parcel-info-content">
          {/* SOLANA: owner pubkey (truncated, base58) -> Solana explorer; UNOWNED shows claimable */}
          <div className="is-flex">
            <div>
              Owner:{' '}
              {parcelUnowned ? (
                <span>Unowned / claimable</span>
              ) : (
                <span>
                  <a title="View owner on Solana explorer" href={solanaExplorerAddressUrl(owner)} target="_blank">
                    {shortPubkey(owner)}
                  </a>
                </span>
              )}
            </div>
          </div>
          <div>
            <p>{description}</p>
          </div>
        </section>
        <div className="overlay-parcel-info-content">
          <h4>Event</h4>
          <ParcelEventItem parcel={parcel} noevent={true} showEventManager={true} />
        </div>
        <div className="overlay-parcel-info-content">
          <ParcelDetails parcel={parcel.summary} />
        </div>

        <section className="overlay-parcel-info-content">
          <div className="ParcelDetailsComponent">
            <h4>3D performance</h4>
            <dl class="deets">
              <dt title="# of voxels and features 3D triangles">Triangles</dt>
              <dd>{scores.triangles.toLocaleString()}</dd>
              <dt title="# of features that are animated">Animated</dt>
              <dd>{scores.animated.toLocaleString()}</dd>
              <dt title="# of features that are collidable">Collidable</dt>
              <dd>{scores.collidables.toLocaleString()}</dd>
              <dt title="# of groups">Groups</dt>
              <dd>{scores.groups.toLocaleString()}</dd>
              <dt title="# of features, loaded vs total">Features</dt>
              <dd>
                {scores.features.active} / {scores.features.total}
              </dd>
            </dl>
          </div>
        </section>
      </div>
    </section>
  )
}
