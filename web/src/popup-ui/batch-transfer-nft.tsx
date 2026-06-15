import { createRef, render } from 'preact'
import { app } from '../state'
import Panel, { PanelType } from '../components/panel'
import { useEffect, useState } from 'preact/hooks'
// SOLANA: recipients are base58 ed25519 pubkeys validated with isSolanaAddress
// (was ethers isAddress for 0x-hex). getTransactionLink kept.
import { getTransactionLink } from '../helpers/transaction-helpers'
import { BatchTransferWrapper, NFTTransferState, TransferableNFT } from '../helpers/transfer-collectible'
import { isSolanaAddress } from '../../../common/helpers/utils'
import { TargetedEvent, unmountComponentAtNode } from 'preact/compat'
import { Form } from '../components/fields/form'
import { TextField } from '../components/fields/text-field'
import { TransactionLink, TransactionStatus } from './transfer-collectible'
import { Submit } from '../components/fields/submit'
import { Spinner } from '../spinner'
import { JSXInternal } from 'preact/src/jsx'
import TargetedKeyboardEvent = JSXInternal.TargetedKeyboardEvent

export interface Props {
  nft?: TransferableNFT
  wallets?: string[]
  onClose?: () => void
}

export interface State {
  nft: TransferableNFT
  transferring: boolean
  approving: boolean
  approved: boolean
  success: boolean
  error: string | null
  hash: string | null
  transferTo: string[]
}

export default function BatchTransferNFTWindow(props: Props) {
  const transactionHelper = new BatchTransferWrapper()

  // SOLANA: cluster is fixed by deployment config; chain_id is vestigial.
  const [nft, setNFT] = useState<TransferableNFT>(props.nft ?? { chain_id: 0 })
  const [error, setError] = useState<string>('')
  const [transferTo, setTransferTo] = useState<string[]>([])
  const [disabled, setDisabled] = useState<boolean>(false)
  const [transferState, setTransferState] = useState<NFTTransferState | null>(null)
  const [approved, setApproved] = useState<boolean>(false)
  const [revoking, setRevoking] = useState<boolean>(false)

  useEffect(() => {
    transactionHelper.isApproved(nft).then(setApproved)
    // SOLANA: base58 pubkeys are case-sensitive — never .toLowerCase().
    setTransferTo(props.wallets ?? [])
  }, [])

  useEffect(() => {
    // SOLANA: base58 pubkeys are case-sensitive — never .toLowerCase().
    setTransferTo(props.wallets ?? [])
  }, [props.wallets])

  useEffect(() => {
    if (transferState?.state === 'transferring') setApproved(true)
  }, [transferState])

  const transfer = async () => {
    setDisabled(true)
    setError('')
    setTransferState(null)
    const transfer = transactionHelper.transfer(nft, transferTo)
    try {
      for await (const i of transfer) {
        setTransferState(i)
      }
    } catch (e: any) {
      setError(e.toString())
      setTransferState(null)
    }
  }

  const revoke = async () => {
    setRevoking(true)
    await transactionHelper
      .revokeApproval(nft)
      .then(() => setApproved(false))
      .catch((e) => setError(e.toString()))
      .finally(() => setRevoking(false))
  }

  // SOLANA: the SPL mint (collection_address) is all that's needed; token_id and
  // chain_id are not required on Solana.
  const submitDisabled = disabled || !transferTo.length || !nft.collection_address

  return (
    <Form onSubmit={transfer}>
      <h3>Batch Transfer</h3>

      {/* SOLANA: the NFT is identified by its SPL mint (base58). No token id /
          chain selector — a Metaplex NFT is a single 1-supply mint on the
          configured cluster. */}
      <TextField
        name="MintAddress"
        label={'NFT mint address'}
        value={nft.collection_address?.toString() ?? ''}
        onChange={(ev: TargetedEvent<HTMLInputElement>) => setNFT({ ...nft, collection_address: ev.currentTarget['value'] })}
        placeholder="SPL mint address (base58)..."
        size={44}
        maxLength={44}
        disabled={disabled}
      />

      <div class="f">
        <label>Recipients</label>
        <WalletManager propsWallets={transferTo} onChange={(wallets: string[]) => setTransferTo(wallets)} />
      </div>

      <Submit label={'Transfer'} disabled={submitDisabled} />

      <div>
        {!error && <TransactionStatus state={transferState} />}
        {error && <Panel type="danger">{error}</Panel>}
        <div>{transferState?.hash && <TransactionLink transactionLink={getTransactionLink(nft.chain_id, transferState?.hash)} />}</div>

        {/* SOLANA: SPL transfers need no contract approval; revoke/approve are
            no-ops kept for layout. Hidden unless something set approved. */}
        {approved && revoking && (
          <div>
            <Spinner size={16} bg="light" /> Working
          </div>
        )}
      </div>

      <div>
        {/* SOLANA: each recipient receives a separate SPL token transfer of the
            mint, signed in Phantom. */}
        <b>This tool transfers an SPL NFT to one or more Solana wallets:</b>
        <ol>
          <li>Enter the NFT's SPL mint address</li>
          <li>Add the recipient Solana (base58) addresses</li>
          <li>Confirm each transfer in Phantom</li>
          <li>Wait for the transactions to confirm</li>
        </ol>
      </div>
    </Form>
  )
}

export function WalletManager({ propsWallets, onChange }: { propsWallets?: string[]; onChange: (wallets: string[]) => void }) {
  const [wallets, setWallets] = useState<string[]>(propsWallets ?? [])
  useEffect(() => onChange(wallets), [wallets])
  useEffect(() => setWallets(propsWallets ?? []), [propsWallets])

  const addWallets = (list: string[]) => {
    setWallets((wallets) => [...wallets, ...list])
  }

  const removeWallet = (value: string) => {
    setWallets((wallets) => wallets.filter((w) => w.toLowerCase() !== value.toLowerCase()))
  }

  return (
    <div>
      {wallets.map((wallet) => (
        <Wallet key={wallet} wallet={wallet} onRemove={removeWallet} />
      ))}
      {wallets.length > 0 && <br />}
      <AddWallet addWallets={addWallets} wallets={wallets} />
    </div>
  )
}

function Wallet({ wallet, onRemove }: { wallet: string; onRemove: (wallet: string) => void }) {
  const remove = (e: TargetedEvent<HTMLButtonElement>) => {
    e.preventDefault()
    onRemove(wallet)
  }
  return (
    <div key={wallet}>
      <div>
        <div>{wallet}</div>
        <button onClick={remove}>Remove</button>
      </div>
    </div>
  )
}

function AddWallet(props: { addWallets: (v: string[]) => void; wallets: string[] }) {
  const [wallet, setWallet] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [disabled, setDisabled] = useState<boolean>(false)

  const inputEl = createRef<HTMLInputElement>()

  useEffect(() => setError(''), [wallet])

  const validateAddresses = (newWallets: string) => {
    setDisabled(true)
    const wallets = newWallets.split(',')
    const promises = wallets.filter((addr) => app.state?.wallet?.toLowerCase() !== addr.toLowerCase()).map((addr) => getAddress(addr))

    return Promise.all(promises)
      .then((addresses) => {
        props.addWallets(addresses)
        setWallet('')
        inputEl.current?.focus()
      })
      .catch((e) => setError(e.message))
      .finally(() => setDisabled(false))
  }

  const getAddress = async (candidate: string): Promise<string> => {
    let address: string = candidate.trim().toLowerCase()
    if (address.endsWith('.eth')) {
      const reverseLookup = (await resolveName(candidate)) ?? ''
      if (!reverseLookup) {
        throw new Error(`'${address}' doesn't resolve to an wallet address`)
      }
      address = reverseLookup?.toLowerCase()
    }
    if (!isAddress(address)) {
      throw new Error(`Address '${address}' is not valid`)
    }
    // Check we haven't already recorded that address.
    if (props.wallets.find((w) => w.toLowerCase() == address?.toLowerCase())) {
      throw new Error('Address already listed')
    }
    return address
  }

  const handleEnter = async (e: TargetedKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    await validateAddresses(e.currentTarget.value)
  }

  const handleAdd = async (e: TargetedEvent<HTMLButtonElement>) => {
    e.preventDefault()
    await validateAddresses(wallet)
  }

  const handleOnChange = (e: TargetedEvent<HTMLInputElement>) => setWallet(e.currentTarget.value)

  return (
    <div>
      <input ref={inputEl} type="text" disabled={disabled} placeholder="Address or ENS" value={wallet} onChange={handleOnChange} onKeyPress={handleEnter} />
      &nbsp;
      <button disabled={disabled} onClick={handleAdd}>
        Add
      </button>
    </div>
  )
}
