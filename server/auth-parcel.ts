import { ParcelAuthResult } from '../common/messages/parcel'
import Avatar from './avatar'
// SOLANA: token-gating now uses Solana SPL/Metaplex helpers instead of ERC-20/721/1155
import { isSolanaAddress, getSplTokenBalance, ownsNft, countNftsFromCollection } from './lib/solana-helpers'
import ParcelUserRight from './parcel-user-right'
import { isCampusParcels, isCommonParcel, isCVTeam, isTestIsland } from './lib/helpers'
import db from './pg'
import Parcel, { ParcelAuthRef, ParcelRef } from './parcel'
import { VoxelsUser } from './user'
import { FeatureRecord } from '../common/messages/feature'

export default async function authParcel(parcel: ParcelAuthRef, user: VoxelsUser | null): Promise<ParcelAuthResult> {
  const isOwnerSuspended = await Avatar.getSuspended(parcel.owner)

  let wallet: string | null = null
  // SOLANA: validate as a base58 ed25519 pubkey; do NOT lowercase (case-sensitive)
  if (user && user.wallet && isSolanaAddress(user.wallet)) {
    wallet = user.wallet
  }

  let parcelUser: ParcelUserRight | null = null // the v2 of contributors

  if (!user) {
    return false
  }

  if (user?.suspended) {
    return false
  } else if (!!isOwnerSuspended && !user.moderator) {
    return false
    // SOLANA: exact match — Solana pubkeys are case-sensitive (owner==='' when unowned matches nobody)
  } else if (parcel.owner === wallet) {
    return 'Owner'
  } else if (wallet) {
    // none of the above, load parce user's right before continuing
    parcelUser = await ParcelUserRight.loadRoleFromParcelIdAndWallet(parcel.id, wallet)
  }

  const isSandbox = parcel.settings?.sandbox === true

  if (parcelUser?.role == 'owner') {
    return 'Owner'
  } else if (isCVTeam(wallet ?? undefined)) {
    return 'Owner'
  } else if (parcelUser?.role == 'contributor') {
    // user is a standard contributor
    return 'Collaborator'
  } else if (parcelUser?.role == 'excluded') {
    // user is not allowed inside parcel
    // this should be a special thing
    return false
  } else if (isCommonParcel(parcel)) {
    const canEdit = !!user.moderator || (await ownsParcelInSuburb(parcel, user))
    return canEdit ? 'Suburb' : false
  } else if (user.moderator) {
    return 'Moderator'
  } else if (isSandbox) {
    return 'Sandbox'
  } else {
    return false
  }
}

export async function authSpace(space: ParcelAuthRef, user: VoxelsUser | null): Promise<ParcelAuthResult> {
  let wallet: string | null = null
  // SOLANA: validate base58 pubkey instead of 42-char 0x address; no lowercasing
  if (user && typeof user.wallet === 'string' && isSolanaAddress(user.wallet)) {
    wallet = user.wallet
  }

  // SOLANA: exact case-sensitive match on owner pubkey
  if (space.owner === wallet) {
    return 'Owner'
  } else if (!!user?.moderator) {
    return 'Moderator'
  } else if (space.settings.sandbox === true) {
    // anons are now able to edit sandbox
    return 'Sandbox'
  } else {
    return false
  }
}

export type AuthFeatureResultSuccess = {
  moderator: boolean
  feature?: FeatureRecord
  currentParcel?: Parcel
  parcel?: Parcel
}

export type AuthFeatureResult = AuthFeatureResultSuccess | false

export async function authFeature(parcelId: number, featureUuid: string, currentParcelId: number, user: VoxelsUser | null): Promise<AuthFeatureResult> {
  const parcel = await Parcel.load(parcelId)
  if (!parcel || !user) {
    return false
  }
  const feature = parcel?.getFeatureByUuid(featureUuid)

  if (!feature) return false
  if (user.moderator) {
    return { moderator: true, parcel, feature }
  }

  const currentParcel = await Parcel.load(currentParcelId)
  if (!currentParcel) {
    return false
  }
  const authResult = await authParcel(currentParcel, user)

  // must be allowed to edit the currentParcel
  if (!authResult) return false

  const absolutePosition = featureAbsolutePosition(parcel, feature) // Check position relative to Parcel

  // is feature inside of parcel that we are editing?
  const currentParcelResult = checkInsideParcel(currentParcel, absolutePosition)

  // is feature inside of parcel that contains the JSON of the feature?
  const parentParcelResult = checkInsideParcel(parcel, absolutePosition)

  if (parentParcelResult !== RelativePosition.Inside && currentParcelResult !== RelativePosition.Outside) {
    return { feature, currentParcel, parcel, moderator: false }
  } else {
    return false
  }
}

export const ownsParcelInSuburb = async (parcel: Parcel | ParcelRef, user: VoxelsUser | null) => {
  if (user && user.wallet) {
    let ownsParcelInSuburb = false

    const r = await db.query('embedded/owns-parcel-in-suburb', `select id,address,owner from properties where lower(owner) = lower($1) and (select suburbs.name from suburbs where suburbs.id =properties.suburb_id) = $2`, [
      user.wallet,
      parcel.suburb,
    ])

    if (r.rows && r.rows.length > 0) {
      ownsParcelInSuburb = true
    }
    return ownsParcelInSuburb
  }

  return false
}

export enum RelativePosition {
  Inside,
  OutsideTolerated,
  Outside,
  NonApplicable,
}

export function checkInsideParcel(
  parcel: Parcel,
  point: {
    x: number
    y: number
    z: number
  },
): RelativePosition {
  if (!parcel) {
    return RelativePosition.NonApplicable
  }

  if (!parcel.x1 || !parcel.x2 || !parcel.y1 || !parcel.y2 || !parcel.z1 || !parcel.z2) {
    return RelativePosition.NonApplicable
  }

  const { x, y, z } = point

  const streetWidth = 0.25

  if (parcel.x1 <= x && x <= parcel.x2 && parcel.y1 <= y && y <= parcel.y2 && parcel.z1 <= z && z <= parcel.z2) {
    return RelativePosition.Inside
  }

  if (parcel.x1 - streetWidth <= x && x <= parcel.x2 + streetWidth && parcel.y1 <= y && y <= parcel.y2 && parcel.z1 - streetWidth <= z && z <= parcel.z2 + streetWidth) {
    return RelativePosition.OutsideTolerated
  }

  return RelativePosition.Outside
}

function parcelCenter(parcel: Parcel) {
  if (parcel.geometry) {
    let x = 0
    let y = 0
    const coords = parcel.geometry.coordinates[0]

    coords.forEach((tuple: any) => {
      x += tuple[0]
      y += tuple[1]
    })

    return [x / coords.length, y / coords.length]
  }

  return [(parcel.x2 + parcel.x1) / 200, (parcel.z2 + parcel.z1) / 200]
}

export function featureAbsolutePosition(parcel: Parcel, feature: any) {
  const featurePosition = feature.position

  const center = parcelCenter(parcel)

  const z = roundHalf(center[1] * 100 + parseFloat(featurePosition[2]))
  const x = roundHalf(center[0] * 100 + parseFloat(featurePosition[0]))
  const y = roundHalf(parcel.y1 + (parseFloat(featurePosition[1]) - 0.25)) // for some reason the spawn is centered wrong

  return { x, y, z }
}

function roundHalf(value: number) {
  return Math.round(value * 2) / 2
}

export async function authParcelByNFT(parcel: Parcel | ParcelRef, user: VoxelsUser | null): Promise<boolean> {
  const p = parcel

  if (!p.settings.tokensToEnter?.length) {
    // no token is needed to enter the parcel, return true
    return true
  }

  // token is needed to enter the parcel and the user is not logged in
  if (!user || !user.wallet) {
    return false
  }

  let pass = false

  // SOLANA: token-gating retargeted to Solana. token.type 'spl' => fungible SPL
  // balance gate; 'nft'/'collection' => Metaplex ownership gate. Each branch is
  // defensive (try/catch, defaults to not-passing).
  for (const token of p.settings.tokensToEnter) {
    if (token.type == 'spl') {
      // SOLANA: fungible SPL token gate — any positive balance passes
      try {
        const balance = await getSplTokenBalance(user.wallet, token.address)
        if (balance > 0) {
          pass = true
          break
        }
      } catch {}
      continue
    }

    if (token.type == 'nft' || token.type == 'collection') {
      // SOLANA: Metaplex NFT/collection gate. If tokenId holds a specific mint,
      // check direct ownership of that mint; otherwise count NFTs the wallet
      // holds from the given collection mint (token.address).
      try {
        if (token.tokenId) {
          const owns = await ownsNft(user.wallet, token.tokenId)
          if (owns) {
            pass = true
            break
          }
        } else {
          const count = await countNftsFromCollection(user.wallet, token.address)
          if (count > 0) {
            pass = true
            break
          }
        }
      } catch {}
      continue
    }
  } //end of loop
  return pass
}
