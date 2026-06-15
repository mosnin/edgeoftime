// SOLANA: was the MetaMask/ethers login layer. Now uses the Phantom injected
// provider (window.solana) from login-helper.ts. A "wallet" is a base58 ed25519
// pubkey (NEVER 0x-hex, NEVER lowercased). The public shape used by the app is
// preserved.
import { PanelType } from '../components/panel'
import Snackbar from '../components/snackbar'
import { app, AppEvent, Appstate } from '../state'
import {
  changeNetwork,
  getCurrentChainId,
  getPhantomProvider,
  getUserAccounts,
  PhantomProvider,
  signMessage,
} from './login-helper'

const jsonHeaders = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
}

export class StateLogin {
  // SOLANA: provider is the Phantom injected provider; ethers Signer/Contract removed.
  provider: PhantomProvider | null = null
  showSnackbar = Snackbar.show ?? console.log
  private message: string | null = null
  #app: Appstate

  constructor(state: Appstate) {
    this.#app = state
  }

  get state() {
    return this.#app.state
  }

  get signedIn() {
    return this.#app.signedIn
  }

  // SOLANA: kept the export name; now means "is Phantom available".
  get hasMetamask(): boolean {
    return !!getPhantomProvider()
  }

  onToken(key: string, name: string | null, isNewUser: boolean): void {
    this.#app.onToken(key, name, isNewUser)
  }

  async emailSignin(email: string, code: string) {
    return this.#app.emailSignin(email, code)
  }

  async switchNetwork(chainId: number, callback?: () => void) {
    if (!this.provider) {
      console.error('No provider or login selected')
      app.showSnackbar('No provider or login selected', PanelType.Danger)
      return
    }
    const current = await this.getChainId()
    if (chainId == current || chainId == 0) {
      if (callback) callback()
      return true
    }
    // SOLANA: cluster is fixed by config — changeNetwork is a no-op success.
    const r = await changeNetwork(this.provider, chainId)
    const { success, error } = r
    if (success) {
      !!callback && callback()
    } else {
      console.log(error)
    }
    return success
  }

  async getChainId() {
    await this.refreshProvider()
    if (!this.provider) throw new Error('Provider not available')
    return await getCurrentChainId(this.provider)
  }

  async refreshProvider() {
    if (!this.provider) {
      await this.setProvider()
      return true
    }
    // SOLANA: re-connect Phantom (silent if already trusted) to confirm access.
    const accounts = await getUserAccounts(this.provider)
    if (!accounts || !accounts.length) return false
    return true
  }

  async startMetamaskLogin(): Promise<boolean> {
    if (this.signedIn) return true
    if (!this.provider || !this.state.unverifiedWallet) {
      const ok = await this.setProvider()
      if (!ok) return false
    }
    if (this.signedIn) return true
    return this.signin()
  }

  async signin(): Promise<boolean> {
    if (!this.state.unverifiedWallet || !this.provider) return false

    this.message = this.generateMessage()

    // SOLANA: sign the Terms of Service message with Phantom (ed25519) instead of
    // an ethers personal_sign. `unverifiedWallet` is a base58 pubkey set in setProvider().
    const signature = await signMessage(this.provider, this.state.unverifiedWallet, this.message)
    if (!signature) {
      console.error('Signature could not be generated')
      this.#app.emit(AppEvent.ErrorLogin)
      return false
    }
    await this.onSignature(signature)
    return this.signedIn
  }

  // SOLANA: signature is a base58 string (or raw ed25519 byte array); the server accepts both.
  async onSignature(signature: string | number[]) {
    if (!this.provider) console.warn('Provider missing')

    const message = this.message
    const wallet = this.state.unverifiedWallet
    // SOLANA: keep the base58 pubkey verbatim (case-sensitive) — never lowercase it.
    const options = { rememberSignIn: this.#app.rememberSignIn, providerName: 'Phantom' }
    let f
    try {
      f = await fetch(`${process.env.API}/signin`, {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify({ wallet, message, signature, options }),
      })
    } catch {
      this.#app.emit(AppEvent.ErrorLogin)
      console.error('Network Error, please try again a few minutes')
      return
    }
    const r = (await f.json()) as { success: boolean; name: string | null; token: string; isNewUser: boolean }
    if (r.success) {
      this.#app.onToken(r.token, r.name, r.isNewUser)
    } else {
      this.#app.emit(AppEvent.ErrorLogin)
      console.error('Could not log in', r)
    }
  }

  handleEvents = async () => {
    if (!this.provider) return
    // SOLANA: Phantom emits 'disconnect' and 'accountChanged' (instead of 'chainChanged').
    this.provider.on('disconnect', () => {
      this.#app.emit(AppEvent.ProviderMessage, 'Wallet disconnected.')
    })
    this.provider.on('accountChanged', (publicKey: any) => {
      const wallet = publicKey?.toBase58 ? publicKey.toBase58() : String(publicKey ?? '')
      this.#app.emit(AppEvent.ProviderMessage, 'Switched account to ' + wallet)
      console.info('Switched account ', wallet)
    })
  }

  private async setProvider() {
    // SOLANA: resolve Phantom from window.solana / window.phantom.solana.
    this.provider = getPhantomProvider()

    if (this.signedIn) {
      this.handleEvents()
      return
    }

    if (!this.provider || typeof this.provider.connect !== 'function') {
      this.provider = null
      return false
    }

    const accounts = await getUserAccounts(this.provider)
    if (!accounts || !accounts[0]) {
      this.#app.emit(AppEvent.ErrorLogin)
      return false
    }

    // SOLANA: wallet is the base58 pubkey from Phantom — kept verbatim.
    this.#app.setState({ unverifiedWallet: accounts[0] })
    this.handleEvents()
    return true
  }

  private generateMessage() {
    const d = new Date().toUTCString()
    return `# Terms of Service

I agree to the terms of service (and any future revisions) detailed at:

  https://www.voxels.com/terms

I agree to follow the code of conduct detailed at

  https://www.voxels.com/conduct

  Date: ${d}`
  }
}

export const login = new StateLogin(app)
export const provider = login
