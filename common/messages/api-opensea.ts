////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Types for img.crvox.com messages
//
// SOLANA: these were OpenSea (Ethereum) API shapes. They are retargeted to
// Metaplex / DAS (Digital Asset Standard) equivalents while keeping the same
// exported type names so existing imports keep compiling. Field semantics:
//   - "address"/"contract"  -> a base58 mint or collection mint (NOT 0x hex)
//   - "token_id"/identifier -> the asset mint (Solana has no per-collection id)
//   - "image_url"/uri       -> off-chain metadata image / json uri
//   - "traits"/attributes   -> Metaplex JSON metadata attributes
// Types are kept permissive (unions with undefined/null) so server + client
// compile against both legacy and DAS-sourced data during the migration.

import * as t from 'io-ts'

import { NullableNum, NullableStr } from './feature'

// SOLANA: was ContractRecord (an ERC contract). Now describes a Metaplex
// collection: `address` is the collection mint (base58); fee/proxy fields are
// retained but optional/unused on Solana.
export const ContractRecord = t.type(
  {
    address: t.string, // SOLANA: collection mint (base58)
    asset_contract_type: t.string,
    created_date: t.string,
    name: t.string,
    nft_version: t.string,
    opensea_version: NullableStr,
    owner: t.number,
    schema_name: t.string,
    symbol: t.string,
    total_supply: t.string,
    description: NullableStr,
    external_link: NullableStr,
    image_url: NullableStr,
    defautl_to_fiat: t.boolean,
    dev_buyer_fee_basis_points: t.number,
    dev_seller_fee_basis_points: t.number,
    only_proxied_transfers: t.boolean,
    opensea_buyer_fee_basis_points: t.number,
    opensea_seller_fee_basis_points: t.number,
    buyer_fee_basis_points: t.number,
    seller_fee_basis_points: t.number,
    payout_address: t.string,
    chain: t.union([t.string, t.undefined]),
  },
  'ContractRecord',
)
export type ContractRecord = t.TypeOf<typeof ContractRecord>

export const MinimalContractRecord = t.type(
  {
    address: ContractRecord.props.address,
    chain: ContractRecord.props.chain,
    asset_contract_type: ContractRecord.props.asset_contract_type,
    name: ContractRecord.props.name,
    schema_name: ContractRecord.props.schema_name,
    symbol: ContractRecord.props.symbol,
  },
  'MinimalContractRecord',
)

export type MinimalContractRecord = t.TypeOf<typeof MinimalContractRecord>

export const OwnerRecord = t.type(
  {
    user: t.union([
      t.type({
        username: NullableStr,
      }),
      t.null,
    ]),
    profile_img_url: t.string,
    address: t.string,
    config: t.string,
  },
  'OwnerRecord',
)
export type OwnerRecord = t.TypeOf<typeof OwnerRecord>

export const OwnershipRecord = t.type(
  {
    owner: OwnerRecord,
    quantity: t.string,
  },
  'OwnershipRecord',
)
export type OwnershipRecord = t.TypeOf<typeof OwnershipRecord>

export const TraitRecord = t.type(
  {
    trait_type: t.string,
    value: t.union([t.string, t.number]),
    display_type: t.union([t.string, t.null, t.undefined]),
    max_value: t.union([t.string, t.null, t.undefined]),
    trait_count: t.union([t.number, t.null, t.undefined]),
    order: t.union([t.number, t.string, t.null, t.undefined]),
  },
  'TraitRecord',
)
export type TraitRecord = t.TypeOf<typeof TraitRecord>

// SOLANA: was an OpenSea asset. Now a Metaplex/DAS asset. `token_id` carries
// the asset mint (base58); `asset_contract.address` carries the collection
// mint; `image_url`/`animation_url` come from the off-chain metadata uri;
// `traits` are Metaplex attributes. `id` made permissive since DAS has no
// numeric id.
export const ApiAssetOpensea = t.type(
  {
    id: t.union([t.number, t.string]), // SOLANA: numeric id absent on DAS
    token_id: t.string, // SOLANA: asset mint (base58)
    num_sales: t.number,
    background_color: NullableStr,
    image_url: NullableStr,
    image_preview_url: t.union([NullableStr, t.undefined]),
    image_original_url: t.union([NullableStr, t.undefined]),
    animation_url: NullableStr,
    animation_original_url: NullableStr,
    name: NullableStr,
    description: NullableStr,
    external_link: NullableStr,
    asset_contract: t.union([ContractRecord, MinimalContractRecord]),
    permalink: t.string,
    collection: t.type({ name: t.string }),
    decimals: NullableNum,
    token_metadata: t.union([t.string, t.null]),
    owner: t.unknown,
    sell_orders: t.unknown,
    creator: t.unknown,
    traits: t.union([t.array(TraitRecord), t.null]),
    last_sale: t.unknown,
    top_bid: t.unknown,
    listing_date: t.unknown,
    is_presale: t.boolean,
    transfer_fee_payment_token: t.unknown,
    transfer_fee: t.unknown,
    related_assets: t.unknown,
    order: t.unknown,
    auctions: t.unknown,
    supports_wyvern: t.boolean,
    top_ownerships: t.union([t.array(OwnershipRecord), t.undefined]),
    ownership: t.union([OwnershipRecord, t.null, t.undefined]),
    highest_buyer_commitment: t.unknown,

    // Error detail
    detail: t.union([t.string, t.undefined]),
  },
  'ApiAssetOpensea',
)
export type ApiAssetOpensea = t.TypeOf<typeof ApiAssetOpensea>

export const MinimalAssetOpensea = t.type(
  {
    token_id: ApiAssetOpensea.props.token_id,
    traits: ApiAssetOpensea.props.traits,
    image_url: ApiAssetOpensea.props.image_url,
    animation_url: ApiAssetOpensea.props.animation_url,
    name: ApiAssetOpensea.props.name,
    description: ApiAssetOpensea.props.description,
    external_link: ApiAssetOpensea.props.external_link,
    asset_contract: ApiAssetOpensea.props.asset_contract,
    owner: ApiAssetOpensea.props.owner,
    creator: ApiAssetOpensea.props.creator,
  },
  'MinimalAssetOpensea',
)

export type MinimalAssetOpensea = t.TypeOf<typeof MinimalAssetOpensea>

export const ProxyAssetOpensea = t.type(
  {
    token_id: ApiAssetOpensea.props.token_id,
    image_url: ApiAssetOpensea.props.image_url,
    animation_url: ApiAssetOpensea.props.animation_url,
    name: ApiAssetOpensea.props.name,
    description: ApiAssetOpensea.props.description,
    external_link: ApiAssetOpensea.props.external_link,
    asset_contract: ApiAssetOpensea.props.asset_contract,
    owner: ApiAssetOpensea.props.owner,
    creator: ApiAssetOpensea.props.creator,
    ownership: ApiAssetOpensea.props.ownership,
    image_original_url: ApiAssetOpensea.props.image_original_url,
    image_preview_url: ApiAssetOpensea.props.image_preview_url,
    top_ownerships: ApiAssetOpensea.props.top_ownerships,
    permalink: ApiAssetOpensea.props.permalink,
  },
  'ImageAssetOpensea',
)

export type ProxyAssetOpensea = t.TypeOf<typeof ProxyAssetOpensea>

export const OrderRecordV1 = t.type(
  {
    approved_on_chain: t.boolean,
    asset_bundle: t.any,
    base_price: NullableStr,
    bounty_multiple: NullableStr,
    calldata: t.string,
    cancelled: t.boolean,
    closing_date: t.string,
    closing_extendable: t.boolean,
    created_date: t.string,
    current_bounty: NullableStr,
    current_price: t.string,
    exchange: t.string,
    expiration_time: t.number,
    extra: NullableStr,
    fee_method: t.number,
    finalized: t.boolean,
    id: t.number,
    listing_time: t.number,
    marked_invalid: t.boolean,
    order_hash: t.string,
    payment_token: NullableStr,
    quantity: t.string,
    sale_kind: t.number,
    side: t.number,
    target: t.string,
    maker: t.type({
      address: t.string,
      user: NullableNum,
      profile_img_url: t.string,
      config: t.string,
    }),
    taker: t.type({
      address: t.string,
      user: NullableNum,
      profile_img_url: t.string,
      config: t.string,
    }),
    asset: ApiAssetOpensea,
  },
  'OrderRecordV1',
)
export type OrderRecordV1 = t.TypeOf<typeof OrderRecordV1>

// -------------------- OPENSEA API V2 (seaport) -----------------------------------

export const OpenseaAccountV2 = t.type(
  {
    user: t.string,
    profile_img_url: t.string,
    address: t.string,
    config: t.string,
  },
  'OpenseaAccountV2',
)
export type OpenseaAccountV2 = t.TypeOf<typeof OpenseaAccountV2>

export const OpenseaFeesV2 = t.type(
  {
    account: OpenseaAccountV2,
    basis_points: t.string,
  },
  'OpenseaFeesV2',
)
export type OpenseaFeesV2 = t.TypeOf<typeof OpenseaFeesV2>

export const OpenseaOfferItemV2 = t.type(
  {
    item_type: t.number,
    token: t.string,
    identifierOrCriteria: t.string,
    startAmount: t.number,
    endAmount: t.number,
  },
  'OpenseaOfferItemV2',
)
export type OpenseaOfferItemV2 = t.TypeOf<typeof OpenseaOfferItemV2>

export const OpenseaConsiderationItem = t.type(
  {
    item_type: t.number,
    token: t.string,
    identifier_or_criteria: t.string,
    startAmount: t.number,
    endAmount: t.number,
    recipient: t.string,
  },
  'OpenseaConsiderationItem',
)
export type OpenseaConsiderationItem = t.TypeOf<typeof OpenseaConsiderationItem>

export const OpenseaOrderParametersV2 = t.type(
  {
    parameters: t.type({
      offerer: t.string,
      zone: t.string,
      zone_hash: t.string,
      start_time: t.number,
      end_time: t.number,
      order_type: t.number,
      salt: t.string,
      conduitKey: t.string,
      nonce: t.string,
      offer: t.array(OpenseaOfferItemV2),
      consideration: t.array(OpenseaConsiderationItem),
    }),
    signature: t.string,
  },
  'OpenseaOrderParametersV2',
)
export type OpenseaOrderParametersV2 = t.TypeOf<typeof OpenseaOrderParametersV2>

export const OrderRecordV2 = t.type(
  {
    created_date: t.string,
    closing_date: t.string,
    listing_time: t.number,
    expiration_time: t.number,
    order_hash: NullableStr,
    protocol_data: OpenseaOrderParametersV2,
    protocol_address: t.string,
    maker: OpenseaAccountV2,
    taker: OpenseaAccountV2,
    current_price: t.string,
    maker_fees: t.array(OpenseaFeesV2),
    taker_fees: t.array(OpenseaFeesV2),
    side: t.number,
    order_type: t.number,
    canceled: t.boolean,
    finalized: t.boolean,
    marked_invalid: t.boolean,
    client_signature: NullableStr,
    maker_asset_bundle: t.union([t.undefined, OrderRecordV1]),
    taker_asset_bundle: t.union([t.undefined, OrderRecordV1]),
  },
  'OrderRecordV2',
)
export type OrderRecordV2 = t.TypeOf<typeof OrderRecordV2>

export const OpenseaListingsResponseV2 = t.type(
  {
    next: t.union([t.string, t.null]),
    previous: t.union([t.string, t.null]),
    orders: t.array(OrderRecordV2),
  },
  'OpenseaListingsResponseV2',
)
export type OpenseaListingsResponseV2 = t.TypeOf<typeof OpenseaListingsResponseV2>

// SOLANA: was an OpenSea V2 NFT. Now a Metaplex/DAS asset.
export const OpenSeaNftModelV2 = t.type(
  {
    identifier: t.string, // SOLANA: the asset mint (base58)
    collection: t.string, // SOLANA: collection mint or grouping key
    contract: t.string, // SOLANA: collection mint (base58); no smart-contract address
    token_standard: t.string, // SOLANA: 'metaplex' / 'spl-token' / 'compressed'
    name: t.string, // Name of the asset (from Metaplex metadata)
    description: t.string, // Description of the asset
    image_url: t.union([t.string, t.undefined]), // SOLANA: image from metadata uri
    metadata_url: t.union([t.string, t.undefined]), // SOLANA: off-chain metadata json uri
    created_at: t.union([t.string, t.undefined]), // Deprecated Field
    updated_at: t.string, // Last metadata update
    is_disabled: t.boolean,
    is_nsfw: t.boolean,
  },
  'OpenSeaNftModelV2',
)
export type OpenSeaNftModelV2 = t.TypeOf<typeof OpenSeaNftModelV2>

// combination of OpenseaNFTModelV2 and our own fields
export const OpenSeaNFTV2Extended = t.intersection([
  OpenSeaNftModelV2,
  t.type({
    // Our own fields
    owner: t.string, // SOLANA: holder base58 pubkey
    // SOLANA: accept the Solana cluster as the chain tag; keep 'ethereum'
    // permitted for back-compat with cached/legacy data.
    chain: t.union([t.literal('solana'), t.literal('mainnet-beta'), t.literal('devnet'), t.literal('ethereum'), t.string]),
    permalink: t.string, // SOLANA: explorer.solana.com asset url
  }),
])

export type OpenSeaNFTV2Extended = t.TypeOf<typeof OpenSeaNFTV2Extended>

const CreatedAtEnum = t.union([t.string, t.undefined])

const OwnerModel = t.type({
  address: t.string,
  quantity: t.number,
})

const RankingFeatures = t.type({
  // deprecated
  unique_attribute_count: t.number,
})

const RarityDataModel = t.union([
  t.type({
    rank: t.number,
  }),
  t.partial({
    strategy_id: t.literal('openrarity'),
    strategy_version: t.string,
    score: t.number,
    calculated_at: t.string,
    max_rank: t.number,
    total_supply: t.number,
    ranking_features: RankingFeatures,
  }),
])

// SOLANA: detailed Metaplex/DAS asset. identifier=asset mint, contract=collection
// mint, traits=Metaplex attributes, owners derived from DAS ownership.
export const OpenSeaNftModelDetailedV2 = t.type(
  {
    identifier: t.string, // SOLANA: asset mint (base58)
    collection: t.string, // SOLANA: collection mint / grouping
    contract: t.string, // SOLANA: collection mint (base58)
    token_standard: t.string, // SOLANA: 'metaplex' / 'spl-token' / 'compressed'
    name: NullableStr,
    description: NullableStr,
    updated_at: t.string,
    is_disabled: t.boolean,
    is_nsfw: t.boolean,
    is_suspicious: t.boolean,
    creator: t.string,
    traits: t.union([t.array(TraitRecord), t.null]),
    //  The owners field will be null if the NFT has more than 50 owners..
    owners: t.union([t.array(OwnerModel), t.null]),

    rarity: t.union([RarityDataModel, t.null]),
    // optional fields

    image_url: t.union([t.string, t.undefined]),
    metadata_url: NullableStr,
    created_at: CreatedAtEnum,
    animation_url: t.union([t.string, t.null]),

    // Additional fields from actual API responses
    display_image_url: t.union([t.string, t.null, t.undefined]),
    display_animation_url: t.union([t.string, t.null, t.undefined]),
    opensea_url: t.union([t.string, t.undefined]),
  },
  'OpenSeaNftModelDetailedV2',
)

export type OpenSeaNftModelDetailedV2 = t.TypeOf<typeof OpenSeaNftModelDetailedV2>

export const OpenSeaNftModelDetailedV2Extended = t.intersection([
  OpenSeaNftModelDetailedV2,
  t.type({
    // Our own fields
    // SOLANA: chain tag is the active cluster; legacy EVM literals kept for
    // back-compat so cached data still validates.
    chain: t.union([t.literal('solana'), t.literal('mainnet-beta'), t.literal('devnet'), t.literal('ethereum'), t.literal('matic'), t.literal('base'), t.string]),
  }),
])

export type OpenSeaNftModelDetailedV2Extended = t.TypeOf<typeof OpenSeaNftModelDetailedV2Extended>
