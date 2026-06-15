// SOLANA: collectible message/types retargeted from Ethereum (numeric chain_id,
// 0x contract addresses) to Metaplex/DAS: chain_id is a cluster tag,
// collection_address is a collection mint, solana_mint is the asset mint, and
// attributes/image come from Metaplex off-chain metadata. Existing exported
// type names are preserved; new fields are optional so server + client compile.

import * as t from 'io-ts'
import { NullableNum, NullableStr } from './feature'
import { avatarRefCodec } from './avatar-ref'

export const Optional = <T extends t.Mixed>(type: T) => t.union([type, t.null, t.undefined])

export const TraitRecord = t.type(
  {
    trait_type: t.string,
    value: t.union([t.number, t.string, t.null, t.undefined]),
    display_type: NullableStr,
    ignore: t.union([t.boolean, t.undefined]),
  },
  'TraitRecord',
)

export enum TraitDisplayTypes {
  StringTrait = 'string_trait',
  Number = 'number',
  BoostPercentage = 'boost_percentage',
  BoostNumber = 'boost_number',
}

export const TRAIT_DISPLAY_TYPES = [
  { type: null, name: '' },
  { type: TraitDisplayTypes.StringTrait, name: 'Text' },
  { type: TraitDisplayTypes.Number, name: 'Number' },
  { type: TraitDisplayTypes.BoostPercentage, name: 'Boost Percentage' },
  { type: TraitDisplayTypes.BoostNumber, name: 'Boost Number' },
]

export const CollectibleRecord = t.intersection(
  [
    t.type({
      id: NullableStr,
      token_id: t.number,
      collection_id: t.number,
      name: t.string,
      description: NullableStr,
      created_at: t.union([NullableStr, t.undefined]),
      rejected_at: t.union([NullableStr, t.undefined]),
      updated_at: t.union([NullableStr, t.undefined]),
      issues: t.union([NullableNum, t.undefined]),
      hash: t.string,
      category: NullableStr,
      author: avatarRefCodec,
    }),
    t.partial({
      quantity: t.number,
      // SOLANA: chain_id is now the cluster tag (string) rather than an EVM
      // numeric chain id; kept as a permissive union for back-compat.
      chain_id: t.union([t.number, t.string]),
      // SOLANA: collection_address is the Metaplex collection mint (base58).
      collection_address: NullableStr,
      collection_name: NullableStr,
      // SOLANA: asset mint (base58) of this collectible's NFT, if minted.
      solana_mint: t.union([NullableStr, t.undefined]),
      // SOLANA: image/uri from the off-chain Metaplex metadata json.
      image: NullableStr,
      uri: t.union([NullableStr, t.undefined]), // SOLANA: metadata json uri (DAS)
      collection_attributes_names: t.union([t.array(TraitRecord), t.null]), // Metaplex attributes definition by collection
      custom_attributes: t.union([t.array(TraitRecord), t.null]), // Metaplex attributes for that specific collectible
    }),
  ],
  'CollectibleRecord',
)
export type CollectibleRecord = t.TypeOf<typeof CollectibleRecord>

// subgraphs.crvox.com/api/assets/complete/{wallet}.json
export const ApiAssetMessage = t.type(
  {
    success: t.boolean,
    assets: t.array(CollectibleRecord),
  },
  'ApiAssetMessage',
)
export type ApiAssetMessage = t.TypeOf<typeof ApiAssetMessage>

// {"token_id":1,"chain_id":"137","collection_address":"0x9306af3f24f54a5000d1fd9eb740fcc699bb12e1","collection_id":67,"quantity":1}
export const CollectibleInfoRecord = t.type(
  {
    id: t.string, // UUID
    name: Optional(t.string),
    description: Optional(t.string),
    author: Optional(t.string),
    issues: Optional(t.number),
    token_id: Optional(t.number),
    created_at: Optional(t.string), // ISO timestamp
    updated_at: Optional(t.string), // ISO timestamp
    hash: t.string,
    rejected_at: Optional(t.string),
    offer_prices: Optional(t.array(t.string)), // numeric[] as strings from JSON
    collection_id: t.number,
    custom_attributes: Optional(t.array(t.UnknownRecord)), // json[]
    suppressed: Optional(t.boolean),
    category: Optional(t.string),
    default_settings: Optional(t.UnknownRecord), // json
    // Required for CollectibleInfoRecord base
    quantity: t.number,
    chain_id: t.string, // SOLANA: cluster tag (e.g. 'mainnet-beta'/'devnet')
    collection_address: t.string, // SOLANA: Metaplex collection mint (base58)
    solana_mint: Optional(t.string), // SOLANA: asset mint (base58)
  },
  'CollectibleInfoRecord',
)
export type CollectibleInfoRecord = t.TypeOf<typeof CollectibleInfoRecord>

// subgraphs.crvox.com/api/assets/{wallet}.json
export const AssetInfoMessage = t.type(
  {
    success: t.boolean,
    assets: t.array(CollectibleInfoRecord),
  },
  'ApiAssetMessage',
)
export type ApiAssetInfoMessage = t.TypeOf<typeof ApiAssetMessage>

// /api/collections/:chain_identifier/:address/collectibles.json
export const CollectibleBatchRecord = t.type(
  {
    id: NullableStr,
    token_id: t.number,
    name: t.string,
    description: NullableStr,
    collection_id: t.number,
    category: NullableStr,
    author: NullableStr,
    hash: t.string,
    suppressed: t.boolean, // ?
    // SOLANA: cluster tag rather than EVM chain id; permissive for back-compat.
    chain_id: t.union([t.number, t.string]),
    collection_address: NullableStr, // SOLANA: Metaplex collection mint (base58)
    collection_name: NullableStr,
    solana_mint: t.union([NullableStr, t.undefined]), // SOLANA: asset mint (base58)
  },
  'CollectibleBatchRecord',
)
export type CollectibleBatchRecord = t.TypeOf<typeof CollectibleBatchRecord>

export const CollectibleBatchMessage = t.type(
  {
    success: t.boolean,
    collectibles: t.array(CollectibleBatchRecord),
  },
  'CollectibleBatchMessage',
)
export type CollectibleBatchMessage = t.TypeOf<typeof CollectibleBatchMessage>
