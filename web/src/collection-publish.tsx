import { Component } from 'preact'
// SOLANA: dropped ethers (Contract/isAddress) + EVM collections-factory ABI.
// A collection on Solana is a Metaplex Certified Collection NFT, identified by
// its base58 collection mint pubkey. Validate addresses with the shared
// isSolanaAddress helper instead of EVM isAddress.
import { isSolanaAddress, web3ExtractErrorMessage } from '../../common/helpers/utils'
import { getActiveChain, activeCluster } from '../../common/helpers/solana-chain-helpers'
import { app } from './state'
import { fetchOptions } from './utils'

interface State {
  // SOLANA: replaced chainId/contractName(EVM) with a collection mint pubkey.
  mint: string
  collectionName: string
  accepted: boolean
  deploying: boolean
  error: string | null
  done: boolean
  // SOLANA: stores the base58 collection mint once linked.
  address: string | null
  collectionId: number
}

export default class PublishCollection extends Component<{ mint?: string }, State> {
  state: State = {
    mint: '',
    collectionName: '',
    accepted: false,
    deploying: false,
    error: null,
    done: false,
    address: null,
    collectionId: 0,
  }

  componentDidMount() {
    const id = parseInt(this.props.mint || '', 10)
    if (!id) return
    fetch(`/api/collections/${id}`, fetchOptions())
      .then((r) => r.json())
      .then((r) => {
        if (r.collection) {
          this.setState({ collectionId: r.collection.id, collectionName: r.collection.name })
        }
      })
  }

  // SOLANA: was an ethers contract deploy (factory.launchCollection) on
  // ETH/Polygon. On Solana a collection is a Metaplex Certified Collection NFT.
  // Two supported flows:
  //   1) Link an existing collection mint (paste a base58 pubkey) — implemented.
  //   2) Create a new collection mint on-chain — STUBBED (see SOLANA TODO).
  async deploy() {
    this.setState({ error: null })
    const { mint, accepted, collectionId } = this.state

    if (!accepted) {
      this.setState({ error: 'Accept the terms first.' })
      return
    }
    if (!app.state.wallet || !isSolanaAddress(app.state.wallet)) {
      this.setState({ error: 'Connect a Solana wallet first.' })
      return
    }

    let collectionMint = mint.trim()

    if (collectionMint) {
      // Flow 1: link an existing Metaplex collection mint.
      if (!isSolanaAddress(collectionMint)) {
        this.setState({ error: 'Enter a valid base58 collection mint address.' })
        return
      }
    } else {
      // Flow 2: create a brand-new collection mint on-chain.
      // SOLANA TODO: create a Metaplex Certified Collection NFT (Token Metadata
      // `createV1` with collectionDetails set, signed by the connected Phantom
      // wallet) and use its mint pubkey as `collectionMint`. The minting logic
      // lives in scripts/solana-mint-parcels.ts — reuse the collection-creation
      // path from there (or expose a server endpoint that wraps it). Until that
      // is wired, require the user to paste an existing mint.
      this.setState({ error: 'On-chain collection creation is not available yet — paste an existing collection mint address.' })
      return
    }

    this.setState({ deploying: true })

    // Persist the collection mint on the collection record (server validates
    // and stores it as the collection's Solana mint / address).
    let save: any
    try {
      save = await fetch(`/api/collections/${collectionId}/address`, {
        ...fetchOptions(),
        method: 'put',
        headers: { 'Content-Type': 'application/json' },
        // SOLANA: body now carries a base58 mint instead of a 0x contract address.
        body: JSON.stringify({ address: collectionMint }),
      }).then((r) => r.json())
    } catch (e: any) {
      this.setState({ deploying: false, error: web3ExtractErrorMessage(e) || 'Failed to save collection mint.' })
      return
    }

    if (!save?.success) {
      this.setState({ deploying: false, error: save?.message || 'Failed to save collection mint.' })
      return
    }

    this.setState({ deploying: false, done: true, address: collectionMint })
  }

  render() {
    const { done, address, deploying, error, accepted, mint, collectionName, collectionId } = this.state

    if (done) {
      // SOLANA: link to Solana Explorer for the collection mint (cluster-aware).
      const base = getActiveChain().explorerUrl
      const sep = base.includes('?') ? '&' : '?'
      const explorer = activeCluster === 'mainnet-beta' ? `${base}/address/${address}` : `${base}${sep}address=${address}`
      return (
        <section class="columns">
          <article>
            <hgroup>
              <h1>Published!</h1>
              <p>Collection mint linked for {collectionName}.</p>
            </hgroup>
            <p>
              Mint: <code>{address}</code>
            </p>
            <a href={explorer} target="_blank">
              View on Solana Explorer
            </a>
            <br />
            <br />
            <a href={`/collections/${collectionId}`}>Back to collection</a>
          </article>
        </section>
      )
    }

    return (
      <section class="columns">
        <article>
          <hgroup>
            <h1>Publish: {collectionName}</h1>
            {/* SOLANA: link a Metaplex collection mint instead of deploying an EVM contract. */}
            <p>Link this collection to a Solana Metaplex collection (a collection mint address).</p>
          </hgroup>

          <label>
            Collection mint <small>(base58 pubkey)</small>
          </label>
          {/* SOLANA: paste an existing Metaplex collection mint. Leaving this empty
              would trigger on-chain creation, which is stubbed for now. */}
          <input type="text" value={mint} placeholder="e.g. 4k3Dyjzvzp8e..." onInput={(e: any) => this.setState({ mint: e.target.value })} />

          <label>
            <input type="checkbox" checked={accepted} onClick={(e: any) => this.setState({ accepted: e.currentTarget.checked })} /> I own or have rights to this collection and agree to the <a href="/terms">terms</a>
          </label>

          {error && <p style="color:red">{error}</p>}

          <button disabled={deploying || !accepted} onClick={() => this.deploy()}>
            {deploying ? 'Linking...' : 'Link collection'}
          </button>
        </article>
      </section>
    )
  }
}
