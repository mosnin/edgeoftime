// SOLANA: dropped ethers/verifyMessage; guestbook signing/verification moves to
// ed25519 (Phantom) signatures over base58 pubkeys instead of EIP-191 recovery.
import { isSolanaAddress } from '../../common/helpers/utils'
import Config from '../../common/config'
import { GuestBookRecord } from '../../common/messages/feature'
import { voxImporter } from '../../common/vox-import/vox-import'
import { provider } from '../../web/src/auth/state-login'
import { Position, Rotation, Scale } from '../../web/src/components/editor'
import Panel from '../../web/src/components/panel'
import { app } from '../../web/src/state'
import { Advanced, FeatureEditor, FeatureEditorProps, Toolbar, UuidReadOnly } from '../ui/features'
import { toggleGuestBookUi } from '../ui/guest-book-ui'
import ActionGui from '../ui/gui/action-button-gui'
import { FeatureMetadata, FeatureTemplate } from './_metadata'
import { Feature3D } from './feature'

export async function signMessage(wallet: string, message: string): Promise<string | null> {
  const currentProvider = provider.provider
  if (!currentProvider) {
    throw new Error('No provider available')
  }

  // SOLANA TODO: sign `message` with the connected Solana wallet adapter (Phantom)
  // via signMessage() over the UTF-8 bytes, returning the base58 ed25519 signature.
  // The EVM `personal_sign` (EIP-191) flow has been removed.
  console.warn('guest-book signMessage: Solana wallet signing not implemented yet')
  return null
}

interface GuestBookSharedState {
  signatures: { [wallet: string]: string }
}

export default class GuestBook extends Feature3D<GuestBookRecord> {
  static signGuestbookSound: BABYLON.Sound | null = null
  static metadata: FeatureMetadata = {
    title: 'Guest Book',
    subtitle: 'visitors leave a note',
    type: 'guest-book',
    image: '/icons/guest-book.png',
  }
  static template: FeatureTemplate = {
    type: 'guest-book',
    scale: [1, 1, 1],
    signature_text: 'Welcome!',
  }
  sharedState: GuestBookSharedState = { signatures: {} }
  ActionGui: ActionGui | null = null

  get signChatCommandEnabled() {
    return !!this.description.allowSignChatCommand
  }

  get hasUserSigned() {
    const wallet = app.state.wallet
    if (!wallet) {
      return false
    }
    return this.verifySignature(wallet, this.signatures[wallet])
  }

  get signatures() {
    return this.sharedState['signatures'] || {}
  }

  get signatureText() {
    return this.description.signature_text
  }

  get signatureMessage() {
    // if this changes, all signatures on this guestbook will become invalid
    return `Sign Guestbook for ${window.config.isSpace ? 'Space ' + window.config.spaceId : 'Parcel ' + this.parcel.id}\n\n${this.signatureText}`
  }

  whatIsThis() {
    return <label>This feature allows visitors to sign and record their visit.</label>
  }

  shouldBeInteractive() {
    return !this.hasUserSigned || this.parcel.canEdit
  }

  getVerifiedWallets(): Array<string> {
    return Object.keys(this.signatures).filter((wallet) => {
      return this.verifySignature(wallet, this.signatures[wallet])
    })
  }

  clearSignatures() {
    this.sendState({ signatures: {} })
  }

  verifySignature(wallet: string, signature: string | undefined) {
    if (!signature) return false
    // SOLANA: there is no address "recovery" like EIP-191 — an ed25519 signature is
    // verified against the claimed base58 pubkey. base58 is case-sensitive, so never
    // .toLowerCase() a wallet. Client-side we sanity-check the wallet is a valid
    // pubkey; authoritative ed25519 verification is verifySolanaSignature() on the server.
    if (!isSolanaAddress(wallet)) return false
    // SOLANA TODO: verify `signature` (base58 ed25519) against `this.signatureMessage`
    // and `wallet` using tweetnacl (nacl.sign.detached.verify) once client signing lands.
    return false
  }

  receiveState(state: GuestBookSharedState) {
    this.sharedState = state
  }

  sendState(state: GuestBookSharedState) {
    this.sharedState = state
    this.parcel.sendStatePatch({ [this.uuid]: this.sharedState })
  }

  async signGuestBook(): Promise<boolean> {
    if (!app.state.wallet) throw new Error('Must be signed in to sign guestbook')

    if (this.hasUserSigned) {
      return false
    }

    const wallet = app.state.wallet
    const signature = await signMessage(wallet, this.signatureMessage)
    if (!signature) {
      // user cancelled signing guestbook or signature
      return false
    }

    if (!this.verifySignature(wallet, signature)) {
      throw new Error('Could not sign guestbook as signature verification failed.')
    }

    // add the user's signature
    const signatures = this.sharedState.signatures || {}
    signatures[wallet] = signature
    this.sendState({ signatures })

    this.hideGui()

    this.avatar?.emote('🌟', this.positionInGrid.subtract(new BABYLON.Vector3(0, 1, 0)))
    if (GuestBook.signGuestbookSound) {
      GuestBook.signGuestbookSound.setPosition(this.absolutePosition)
      GuestBook.signGuestbookSound.play()
    }

    return true
  }

  async generate() {
    const url = Config.voxModelURL('https://voxels.com/models/guest-book.vox', this.parcel, 'vox-model')
    this.mesh = await voxImporter().import(url, { signal: this.abortController.signal })
    this.mesh.isPickable = true
    this.mesh.id = this.uniqueEntityName('mesh')

    this.setCommon()

    this.addEvents()
    this.addTrigger({ onTrigger: this.onTrigger, onUnTrigger: this.onUnTrigger, proximityToTrigger: 3 })

    if (!GuestBook.signGuestbookSound && this.audio) {
      GuestBook.signGuestbookSound = this.audio.createSound({
        name: 'sign-guestbook-sound',
        url: `${process.env.SOUNDS_URL}/alerts/sign-guestbook.mp3`,
        options: { loop: false, autoplay: false },
      })
    }
  }

  onClick = () => {
    toggleGuestBookUi(this, this.scene)
  }

  onTrigger = () => {
    if (!app.signedIn) {
      return
    }
    if (this.parcel.canEdit || !this.hasUserSigned) {
      this.showGui()
    }
  }

  onUnTrigger = () => {
    this.hideGui()
  }

  showGui() {
    if (this.ActionGui) return

    this.ActionGui = new ActionGui(this)
    !this.hasUserSigned &&
      this.ActionGui.addButton('Sign Guestbook', {
        onClick: () => this.signGuestBook(),
        height: '50px',
        fontSizePx: '18px',
      })
    this.parcel.canEdit &&
      this.ActionGui.addButton('Manage', {
        positionInGrid: [1, 0],
        onClick: this.onClick,
        height: '50px',
        fontSizePx: '18px',
      })

    this.ActionGui.generate()
  }

  hideGui() {
    if (this.ActionGui) {
      this.ActionGui.dispose()
      this.ActionGui = null
    }
  }

  dispose() {
    if (this.ActionGui) {
      this.ActionGui.dispose()
      this.ActionGui = null
    }
    this._dispose()
  }

  toString() {
    return `[Guest book]`
  }
}

class Editor extends FeatureEditor<GuestBook> {
  constructor(props: FeatureEditorProps<GuestBook>) {
    super(props)

    this.state = {
      id: props.feature.description.id,
      signature_text: props.feature.description.signature_text,
      allowSignChatCommand: !!props.feature.description.allowSignChatCommand,
      error: null,
    }
  }

  componentDidUpdate() {
    this.merge({
      id: this.state.id,
      allowSignChatCommand: !!this.state.allowSignChatCommand,
    })
  }

  updateSignatureMessage() {
    if (!this.state.signature_text || this.state.signature_text.length == 0) {
      this.setState({ error: "Message can't be empty." })
      return
    }
    this.merge({
      signature_text: this.state.signature_text,
      allowSignChatCommand: this.state.allowSignChatCommand,
    })
  }

  render() {
    return (
      <section>
        <header>
          <h2>Edit GuestBook</h2>
          <button onClick={this.onBackClick} class="close">
            <span>&times;</span>
          </button>
        </header>
        <div className="scrollContainer">
          <Toolbar feature={this.props.feature} scene={this.props.scene} />
          {/* keys are provided so that the getState in the component is reset after gizmo is used */}
          <Position feature={this.props.feature} key={this.props.feature.position.toString()} />
          <Scale feature={this.props.feature} key={this.props.feature.scale.toString()} />
          <Rotation feature={this.props.feature} key={this.props.feature.rotation.toString()} />
          {this.state.error && <Panel type="warning">{this.state.error}</Panel>}
          <div className="f">
            <label>Sign Message</label>
            <textarea style={{ width: '100%', height: '50px' }} onInput={(e) => this.setState({ signature_text: e.currentTarget.value })} value={this.state.signature_text} />
            <p style="color: #CCC;font-size: 85%;">
              This message will appear when a signature is requested. Please be aware that changing this message will <strong>invalidate</strong> any previously recorded signatures.
            </p>
            <button onClick={() => this.updateSignatureMessage()}>Save signature message</button>
          </div>
          <Advanced>
            <div className="f">
              <label>Feature ID</label>
              <input value={this.state.id} onInput={(e) => this.setState({ id: e.currentTarget.value })} type="text" />
            </div>

            <label>
              <input type="checkbox" checked={!!this.state.allowSignChatCommand} onChange={(e) => this.setState({ allowSignChatCommand: e.currentTarget.checked })} />
              Users can sign using the '/sign' chat command
            </label>

            <UuidReadOnly feature={this.props.feature} />
          </Advanced>
        </div>
      </section>
    )
  }
}

GuestBook.Editor = Editor
