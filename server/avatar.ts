// SOLANA: dropped `ethers`; validate wallets with isSolanaAddress (base58 ed25519 pubkeys)
import { getERC20Balance, getParcelsCount, getWalletBalance } from './lib/ethereum-helpers'
import { isCVTeam, isMod } from './lib/helpers'
import { isSolanaAddress } from './lib/solana-helpers'
import { TokenAddress } from './lib/utils'
import db from './pg'

export interface SuspendedAvatar {
  wallet: string
  expires_at: Date
  reason: string
}

export default class Avatar {
  static async suspend(wallet: string, reason: string, days: number) {
    const daysStr = days + ' days'
    const res = await db.query(
      'embedded/suspend-avater',
      `
      insert into
        banned_users (wallet, reason, expires_at)
      values
        ($1, $2, now() + $3::interval)
      returning
        wallet, reason, expires_at
    `,
      [wallet, reason, daysStr],
    )

    return res.rows[0] as SuspendedAvatar
  }

  // SOLANA: wallet is a case-sensitive base58 pubkey — match exactly, no lower()
  static async unsuspend(wallet: string) {
    const res = await db.query(
      'embedded/unsuspend-avatar',
      `
      update
        banned_users
      set
        expires_at = now()
      where
        wallet = $1 and expires_at>now()
      returning
        wallet,
        reason,
        expires_at
    `,
      [wallet],
    )

    return (res.rows[0] as SuspendedAvatar) || null
  }

  static async getSuspended(wallet: string): Promise<SuspendedAvatar | null> {
    const res = await db.query(
      'embedded/get-suspeneded-avatars',
      `
      select
        * from banned_users
      where
        wallet=$1 and expires_at>now()
      limit
        1
    `,
      [wallet],
    )

    return (res.rows[0] as SuspendedAvatar) || null
  }

  static async fetchNames(wallet: string) {
    // SOLANA: validate base58 Solana pubkey instead of 0x EVM address
    if (!isSolanaAddress(wallet)) {
      throw new Error(`${wallet}' is not a valid wallet address`)
    }

    // SOLANA TODO: no ENS/name-service resolution yet; no off-chain names are sourced.
    const names: string[] = []

    let name = null

    if (names.length > 0) {
      // SOLANA: owner is a case-sensitive base58 pubkey — compare exactly, no lower()
      await db.query('embedded/set-avatar-name', `update avatars set names=$1 where owner=$2`, [names, wallet])

      const result = await db.query('embedded/get-avatar-name', `select name from avatars where owner=$1 limit 1;`, [wallet])
      if (result.rows && result.rows[0]) {
        name = result.rows[0].name
      }

      if (!name) {
        name = names[0]

        await db.query('embedded/set-avatar-name', `update avatars set name=$1 where name=null and owner=$2 returning name`, [name, wallet])
      }
    }

    return { name, names }
  }

  // SOLANA: ENS has no Solana analogue here — stubbed to a no-op returning null.
  // Kept export name + signature so importers still compile.
  static async setENSNameIfAny(wallet: string): Promise<string | null> {
    // SOLANA TODO: resolve a Solana name service (e.g. SNS/Bonfida .sol) if desired.
    return null
  }

  static async getNameByWalletOrDefault(wallet: string): Promise<string> {
    // SOLANA: owner is a case-sensitive base58 pubkey — compare exactly, no lower()
    const result = await db.query('embedded/get-avatar-name', `select name from avatars where owner=$1 limit 1`, [wallet])
    return (result.rows && result.rows[0]?.name) || wallet.slice(0, 10)
  }

  static async getParcelsCount(wallet: string): Promise<{
    parcels: number
  }> {
    return await getParcelsCount(wallet)
  }

  static async getBalance(
    wallet: string,
    chain?: number,
  ): Promise<{
    balance: number
  }> {
    return await getWalletBalance(wallet, chain)
  }

  static async getERC20Balance(
    wallet: string,
    address: TokenAddress,
    chain?: number,
  ): Promise<{
    balance: number
  }> {
    return await getERC20Balance(wallet, address, chain!)
  }

  static async isAdmin(wallet: string | undefined) {
    return !!isCVTeam(wallet)
  }

  static async isModerator(wallet: string | undefined) {
    const req = { user: { wallet } }
    return !!isMod(req)
  }
}
