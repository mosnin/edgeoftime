import { Component, render } from 'preact'
import Panel, { PanelType } from '../components/panel'
import { unmountComponentAtNode, useState } from 'preact/compat'
import { ParcelSettings, SingleParcelRecord, tokensToEnter } from '../../../common/messages/parcel'
import { AssetType, saveAsset } from '../helpers/save-helper'
import { app } from '../state'
import { isSolanaAddress, md5 } from '../../../common/helpers/utils'
import { getActiveChain } from '../../../common/helpers/solana-chain-helpers'

const stableHash = md5

// SOLANA: token-gating types map to Solana mints.
//   - 'spl'        -> hold >= some balance of an SPL token mint
//   - 'nft'        -> hold a specific Metaplex NFT mint
//   - 'collection' -> hold any NFT verified under a collection mint (DAS)
type SolanaTokenType = 'spl' | 'nft' | 'collection'

export interface Props {
  parcel: SingleParcelRecord
  onClose?: () => void
  onUpdate?: () => void
}

type idTokenToEnter = tokensToEnter & { hash?: string }

export interface State {
  settings: ParcelSettings
  tokensToEnter: idTokenToEnter[] // hash is a computed key of the content
  description?: string
  error: string | null
  success: boolean
}

const hashNFT = (nft: tokensToEnter) => {
  return stableHash(JSON.stringify(nft))
}

export class NFTGatingSettingsWindow extends Component<Props, State> {
  static currentElement: Element

  constructor(props: any) {
    super()

    const hashify = (token: idTokenToEnter) => {
      token.hash = hashNFT(token)
      return token
    }

    this.state = {
      settings: props.parcel.settings || {},
      tokensToEnter: props.parcel?.settings?.tokensToEnter?.map(hashify) || [],
      error: null,
      success: false,
    }
  }

  setStateAsync(state: any): Promise<void> {
    return new Promise((resolve) => {
      this.setState(state, resolve)
    })
  }

  componentWillUnmount() {
    this.clean()
  }

  clean() {
    this.setState({ tokensToEnter: [], description: undefined, error: null })
  }

  addNftInput = () => {
    // SOLANA: new gate defaults to an empty SPL mint on the active cluster.
    const newToken = { address: '', type: 'nft' as SolanaTokenType, chain: getActiveChain().cluster, tokenId: undefined }
    ;(newToken as any).hash = hashNFT(newToken as any)
    this.setState({ tokensToEnter: [...this.state.tokensToEnter, newToken as any] })
  }

  saveNewToken = async (nft: idTokenToEnter) => {
    const tokenList = [...this.state.tokensToEnter]
    const prevToken = tokenList.find((t) => t.hash == nft.hash)
    if (prevToken) {
      // remove old token if it's been edited
      tokenList.splice(tokenList.indexOf(prevToken), 1)
    }
    delete nft.hash // delete old hash
    nft.hash = hashNFT(nft) // create new hash of content
    tokenList.push(nft)
    //non-hashed list of tokens because we don't save the hashes on the DB
    const nonHashedList = [...tokenList].map((t) => {
      delete t.hash
      return t
    })
    await this.setStateAsync({
      tokensToEnter: tokenList,
      settings: { ...this.state.settings, tokensToEnter: nonHashedList },
      success: false,
    })

    const result = await saveAsset(AssetType.Parcel, this.props.parcel.id, { settings: this.state.settings })
    if (result.success) {
      this.setState({ success: true })
      this.props.onUpdate && this.props.onUpdate()
    } else {
      this.setState({ success: false })

      app.showSnackbar(result.message || 'Settings could not be saved', PanelType.Danger)
    }
  }

  onRemoveToken = async (hash: string) => {
    const tokenList = [...this.state.tokensToEnter]
    const prevToken = tokenList.find((t) => t.hash == hash)
    if (prevToken) {
      // remove old token if it's been edited
      tokenList.splice(tokenList.indexOf(prevToken), 1)
    } else {
      return
    }
    //non-hashed list of tokens because we don't save the hashes on the DB
    const nonHashedList = [...tokenList].map((t) => {
      delete t.hash
      return t
    })
    await this.setStateAsync({
      tokensToEnter: tokenList,
      settings: { ...this.state.settings, tokensToEnter: nonHashedList },
      success: false,
    })

    const result = await saveAsset(AssetType.Parcel, this.props.parcel.id, { settings: this.state.settings })
    if (result.success) {
      this.setState({ success: true })
      this.props.onUpdate && this.props.onUpdate()
    } else {
      app.showSnackbar(result.message || 'Settings could not be saved', PanelType.Danger)
    }
  }

  render({}: Props, { tokensToEnter, error, success }: State) {
    const nftsViews = tokensToEnter.map((t) => {
      //@ts-expect-error the type of token is incompatible, i dont know if that was intentionally by the previous author
      return <TokenToEnterView key={t.hash} onSubmit={this.saveNewToken} onRemoveToken={this.onRemoveToken} hash={t.hash} address={t.address} tokenId={t.tokenId} chain={t.chain} type={t.type} />
    })
    return (
      <div className={`OverlayWindow -auto-height -fixed`}>
        <header>
          <h3>Limit entry to token holders.</h3>
          <button onClick={this.props.onClose}>&times;</button>
        </header>
        <section>
          <div>
            <p>This tool lets you block users from entering your parcel if they do not hold certain Solana tokens or NFTs.</p>
            <Panel>This feature is currently in Beta.</Panel>
            {!!error && <Panel type="danger">{error}</Panel>}
            {success && <Panel type="success">Settings Saved!</Panel>}
            <b>Add/Remove tokens:</b>
            <ul>{nftsViews}</ul>
          </div>
          {tokensToEnter.length < 1 && (
            <div>
              <button onClick={() => this.addNftInput()}>Add token</button>
            </div>
          )}
        </section>
      </div>
    )
  }
}

type TokenToEnterProps = idTokenToEnter & { onSubmit: (nft: idTokenToEnter) => void; onRemoveToken: (hash: string) => void }

// SOLANA: the gate editor. `address` is a base58 Metaplex/SPL mint validated
// with isSolanaAddress; the chain selector picks a Solana cluster.
const TokenToEnterView = ({ address, chain, type, hash, onSubmit, onRemoveToken }: TokenToEnterProps) => {
  const [contract, setContract] = useState<string | undefined>(address || undefined)
  const [cluster, setCluster] = useState<string>((chain as string) || getActiveChain().cluster)
  const [tokenType, setTokenType] = useState<SolanaTokenType>((type as SolanaTokenType) || 'nft')
  // States:
  const [error, setError] = useState<string | null>(null)

  // SOLANA TODO: fetch on-chain metadata (name/image) for the entered mint via
  // the DAS API (getActiveChain().rpcUrl getAsset) to preview the gated token.

  const validation = () => {
    if (!cluster) {
      setError('Cluster is invalid')
      return false
    }
    if (!contract || !isSolanaAddress(contract)) {
      setError('Mint address is invalid (expected a base58 Solana mint)')
      return false
    }
    if (!tokenType) {
      setError('Token type is required')
      return false
    }
    setError(null)
    // save new setting
    return true
  }

  const submitToken = (evt: any) => {
    evt.preventDefault()
    if (!validation()) return
    // SOLANA: persist shape consistent with SolanaTokenToEnter (type/address).
    onSubmit({ hash, address: contract as string, chain: cluster, type: tokenType as any, tokenId: undefined } as any)
  }

  const removeToken = () => {
    if (!confirm('Are you sure you want to remove this token?')) return
    if (!hash) {
      app.showSnackbar('This token is broken, try reloading the page')
      return
    }
    onRemoveToken(hash)
  }

  const conditionLabel = () => {
    if (!contract) return null
    const short = contract.length > 15 ? contract.substring(0, 15) + '...' : contract
    switch (tokenType) {
      case 'spl':
        return (
          <p>
            User has to hold the SPL token <b>{short}</b>
          </p>
        )
      case 'nft':
        return (
          <p>
            User has to hold the NFT <b>{short}</b>
          </p>
        )
      case 'collection':
        return (
          <p>
            User has to hold <b>any NFT</b> from collection {short}
          </p>
        )
    }
  }

  return (
    <li>
      {error && <Panel type="danger">{error}</Panel>}
      <form>
        <div>
          <label>Cluster</label>
          <select value={cluster} onChange={(e) => setCluster(e.currentTarget.value)} required>
            <option value={'mainnet-beta'}>Solana Mainnet</option>
            <option value={'devnet'}>Solana Devnet</option>
          </select>
        </div>
        <div>
          <label>Type</label>
          <select value={tokenType} onChange={(e) => setTokenType(e.currentTarget.value as SolanaTokenType)} required>
            <option value={'nft'}>NFT (specific mint)</option>
            <option value={'collection'}>Collection (any NFT in collection)</option>
            <option value={'spl'}>SPL token</option>
          </select>
        </div>
        <div>
          <label>Mint address</label>
          <input type="text" onChange={(e) => setContract(e.currentTarget.value)} placeholder="Base58 mint, e.g. So1111..." required value={contract} />
        </div>
        <div>
          <button onClick={submitToken}>Submit</button>
          <button onClick={removeToken}>Remove</button>
        </div>
      </form>
      <div>
        <b>Gate view:</b>
        <br />
        <div id="description">
          {contract && isSolanaAddress(contract) ? conditionLabel() : <p>Once you've added a valid Solana mint we'll show what the condition is.</p>}
        </div>
      </div>
    </li>
  )
}

export function toggleNFTGatingManager(parcel: SingleParcelRecord, onUpdate?: () => void, onClose?: () => void) {
  if (NFTGatingSettingsWindow.currentElement) {
    unmountComponentAtNode(NFTGatingSettingsWindow.currentElement) // unmount the component
    NFTGatingSettingsWindow.currentElement = null!
  } else {
    const div = document.createElement('div')
    document.body.appendChild(div)
    NFTGatingSettingsWindow.currentElement = div

    render(
      <NFTGatingSettingsWindow
        parcel={parcel}
        onUpdate={onUpdate}
        onClose={() => {
          !!NFTGatingSettingsWindow.currentElement && unmountComponentAtNode(NFTGatingSettingsWindow.currentElement) // unmount the component
          NFTGatingSettingsWindow.currentElement = null!
          onClose && onClose()
          div?.remove()
        }}
      />,
      div,
    )
  }
}
