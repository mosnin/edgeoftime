// SOLANA: Solana counterpart of the old Ethereum event listener. Instead of
// subscribing to on-chain Transfer events, we poll on an interval: load every
// parcel that has a minted NFT (properties.solana_mint NOT NULL), ask the chain
// who currently holds that mint, and write the holder pubkey into
// properties.owner when it changed. Owner is set to UNOWNED ('') if the mint
// has no resolvable holder.

import { named } from '../lib/logger'
import db from '../pg'
import { getNftHolder } from '../lib/solana-helpers'
import { UNOWNED } from '../../common/helpers/solana-chain-helpers'

const logger = named('SolanaListener')

// How often to reconcile on-chain holders into the DB.
const POLL_INTERVAL_MS = 1000 * 60 // 1 minute

let _timer: NodeJS.Timeout | null = null

// One reconciliation pass. Defensive throughout: a single bad parcel/mint must
// never abort the whole sweep, and any error keeps the interval running.
export const syncSolanaOwners = async (): Promise<void> => {
  let rows: { id: number; solana_mint: string; owner: string | null }[]
  try {
    const res = await db.query<{ id: number; solana_mint: string; owner: string | null }>(
      'embedded/solana-minted-parcels',
      `SELECT id, solana_mint, owner FROM properties WHERE solana_mint IS NOT NULL`,
    )
    rows = res.rows
  } catch (e) {
    logger.error(`Failed to load minted parcels: ${e}`)
    return
  }

  let updated = 0
  for (const row of rows) {
    try {
      const holder = await getNftHolder(row.solana_mint)
      // No resolvable holder => treat as unowned (sentinel '').
      const newOwner = holder ?? UNOWNED
      const currentOwner = row.owner ?? UNOWNED
      // Solana pubkeys are case-sensitive — compare exactly, never lowercase.
      if (newOwner === currentOwner) continue

      await db.query('embedded/solana-update-owner', `UPDATE properties SET owner = $1 WHERE id = $2`, [newOwner, row.id])
      updated++
      logger.info(`parcel ${row.id} owner ${currentOwner || '(unowned)'} -> ${newOwner || '(unowned)'} (mint ${row.solana_mint})`)
    } catch (e) {
      logger.error(`Error syncing parcel ${row.id} (mint ${row.solana_mint}): ${e}`)
    }
  }

  if (updated > 0) logger.info(`synced ${updated} parcel owner(s)`)
}

// Matches the old EthereumListener export shape: a start function with no args
// that kicks off background syncing. Wire this in place of EthereumListener().
export const SolanaListener = (): void => {
  if (_timer) {
    logger.info('already started')
    return
  }
  logger.info(`polling parcel NFT holders every ${POLL_INTERVAL_MS / 1000}s`)
  // Run once immediately, then on the interval. Errors are swallowed inside
  // syncSolanaOwners; the .catch here is a belt-and-suspenders guard.
  void syncSolanaOwners().catch((e) => logger.error(`initial sync failed: ${e}`))
  _timer = setInterval(() => {
    void syncSolanaOwners().catch((e) => logger.error(`scheduled sync failed: ${e}`))
  }, POLL_INTERVAL_MS)
}

export default SolanaListener
