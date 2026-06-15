// SOLANA: was ethers/MetaMask ERC-721/1155 transfers via on-chain contracts.
// On Solana an "NFT transfer" is an SPL-token transfer of a 1-supply Metaplex
// mint: move the token from the sender's Associated Token Account (ATA) to the
// recipient's ATA, signed by the Phantom wallet (window.solana). The collectible
// model carries the SPL mint in `collection_address` and the holder pubkey lives
// in app.state.wallet (a base58 ed25519 pubkey, NEVER 0x-hex, NEVER lowercased).
//
// Note: @solana/spl-token is not a dependency of this client, so the SPL Token
// program instructions (Transfer / CreateAssociatedTokenAccount) and the ATA
// derivation are constructed by hand on top of @solana/web3.js below.
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { getActiveChain } from '../../../common/helpers/solana-chain-helpers'
import { isSolanaAddress } from '../../../common/helpers/utils'
import { getPhantomProvider } from '../auth/login-helper'
import { app } from '../state'

// SOLANA: canonical SPL program ids (constants, no extra dependency needed).
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

// SOLANA: derive the Associated Token Account (ATA) for (owner, mint). This is
// the PDA the SPL associated-token program would create/use.
function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)
  return ata
}

// SOLANA: build the "create ATA (idempotent)" instruction so a transfer to a
// recipient that has never held this mint still succeeds. Layout matches the
// associated-token program's CreateIdempotent (instruction discriminator 1).
function createAtaIdempotentIx(payer: PublicKey, ata: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]), // CreateIdempotent
  })
}

// SOLANA: build an SPL Token `Transfer` (instruction index 3) moving `amount`
// base units from `source` ATA to `destination` ATA, authorized by `owner`.
function splTransferIx(source: PublicKey, destination: PublicKey, owner: PublicKey, amount: number): TransactionInstruction {
  const data = Buffer.alloc(9)
  data.writeUInt8(3, 0) // Transfer
  data.writeBigUInt64LE(BigInt(amount), 1)
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  })
}

// SOLANA: kept the type name; states map onto the Solana flow (confirm in
// Phantom, then wait for confirmation). 'network-switching'/'approving-contract'
// are unused on Solana but retained so the shared TransactionStatus UI compiles.
export type NFTTransferState = {
  state: 'network-switching' | 'approving-contract' | 'confirming' | 'transferring' | 'transferred'
  step: number
  totalSteps: number
  hash?: string
}

// SOLANA: `collection_address` now carries the SPL mint (base58). `chain_id` is
// vestigial here (cluster is fixed by deployment config) but kept for callers.
export type TransferableNFT = {
  token_id?: string | number
  collection_address?: string | null
  chain_id?: number
}

function getConnection(): Connection {
  return new Connection(getActiveChain().rpcUrl, 'confirmed')
}

export class TransferCollectibleHelper {
  protected _balance: number | null = null

  /* SOLANA: balance is the SPL token balance of the mint for the wallet. */
  async getBalance(collectible: TransferableNFT, cacheBust = false) {
    this._balance = null
    if (app?.signedIn && collectible.collection_address) {
      let url = `/api/collectibles/w/solana/${collectible.collection_address}/${collectible.token_id}/balanceof/${app.state.wallet}`
      if (cacheBust) url += `?cb=${Date.now()}`
      const r = await fetch(url, { credentials: 'include' }).then((r) => r.json())
      if (r.success && r.balance) this._balance = r.balance
    }
    return this._balance
  }

  // SOLANA: build an SPL transfer of the mint and sign+send via Phantom.
  async *startTransfer(collectible: TransferableNFT, receiver: string, amount = 1): AsyncIterableIterator<NFTTransferState> {
    if (!this._balance) await this.getBalance(collectible)

    const { address, receivers, quantity } = await this.validate(collectible, [receiver], amount)

    const provider = getPhantomProvider() as any
    if (!provider) throw new Error('Phantom wallet not found')

    const sender = new PublicKey(app.state.wallet)
    const mint = new PublicKey(address)
    const recipient = new PublicKey(receivers[0])
    const sourceAta = getAssociatedTokenAddress(mint, sender)
    const destAta = getAssociatedTokenAddress(mint, recipient)

    const connection = getConnection()

    let step = 1
    const totalSteps = 2

    const tx = new Transaction()
    tx.add(createAtaIdempotentIx(sender, destAta, recipient, mint))
    tx.add(splTransferIx(sourceAta, destAta, sender, quantity))
    tx.feePayer = sender
    tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash

    yield { state: 'confirming', step: step++, totalSteps }
    const { signature } = await provider.signAndSendTransaction(tx)

    yield { state: 'transferring', hash: signature, step: step++, totalSteps }
    const conf = await connection.confirmTransaction(signature, 'confirmed')
    if (conf.value.err) throw new Error('Error, transaction failed')

    if (this._balance) this._balance -= quantity

    yield { state: 'transferred', step: step++, totalSteps }
  }

  protected async validate(collectible: TransferableNFT, receivers: string[], quantity: number) {
    // SOLANA: the SPL mint lives in collection_address; token_id is unused on
    // Solana (a Metaplex NFT is a single 1-supply mint) but kept for callers.
    if (!collectible.collection_address || !isSolanaAddress(collectible.collection_address)) {
      throw new Error('Collectible mint address is invalid')
    }

    // SOLANA: recipients must be base58 ed25519 pubkeys (never 0x-hex, never lowercased).
    const toAddresses = receivers.filter((p) => isSolanaAddress(p))
    if (toAddresses.length !== receivers.length) {
      throw new Error(`${receivers.length - toAddresses.length} of the addresses entered is invalid`)
    }

    if (this._balance === null) {
      throw new Error("Can't find balance")
    }

    if (!quantity || quantity <= 0 || quantity > this._balance) {
      throw new Error(`Can't transfer bad quantity ${quantity}`)
    }

    return {
      chainID: collectible.chain_id ?? 0,
      address: collectible.collection_address,
      tokenID: collectible.token_id,
      receivers: toAddresses,
      quantity: Number(quantity),
    }
  }
}

// SOLANA: the Ethereum "batch transfer" used a dedicated multi-transfer smart
// contract (one tx, many recipients). On Solana there is no such deployed
// contract here; a 1-supply NFT can only go to one recipient anyway. We send a
// separate SPL transfer per recipient, reusing the single-transfer flow. Kept
// the class name and `transfer()` signature so the batch UI compiles.
export class BatchTransferWrapper extends TransferCollectibleHelper {
  async *transfer(collectible: TransferableNFT, toAddresses: string[]): AsyncIterableIterator<NFTTransferState> {
    if (!this._balance) await this.getBalance(collectible)
    // SOLANA: validate all recipients up front; a 1-supply NFT realistically
    // transfers to a single recipient, but we loop to preserve batch semantics.
    const { receivers } = await this.validate(collectible, toAddresses, 1)

    let step = 1
    const totalSteps = receivers.length * 2

    for (const receiver of receivers) {
      for await (const s of this.startTransfer(collectible, receiver, 1)) {
        yield { ...s, step: step++, totalSteps }
      }
    }
  }

  // SOLANA: SPL transfers need no per-contract "approval" step. These are no-ops
  // kept so the batch UI's approve/revoke affordances compile.
  async isApproved(_collectible: TransferableNFT): Promise<boolean> {
    return true
  }

  approveContract = async (_collectible: TransferableNFT): Promise<void> => {
    // SOLANA: no-op — SPL transfers are signed directly by the wallet.
  }

  revokeApproval = async (_collectible: TransferableNFT): Promise<void> => {
    // SOLANA: no-op — nothing to revoke.
  }
}
