// SOLANA: was the MetaMask/ethers (EIP-1193) wallet-connection layer. Now talks
// to the Phantom injected provider (window.solana). We keep the lightweight
// injected-provider approach (no @solana/wallet-adapter dep) and keep every
// export name the rest of the client imports, so WP15 (sign-in) and the header
// don't have to change. A "wallet" here is a base58 ed25519 pubkey (NEVER
// 0x-hex, NEVER lowercased).
import { supportedChains } from '../../../common/helpers/chain-helpers'
import { ssrFriendlyWindow } from '../../../common/helpers/utils'

// SOLANA: minimal shape of the Phantom injected provider (window.solana). Typed
// here to avoid pulling in @solana/wallet-adapter just for connection. Phantom
// exposes isPhantom, connect(), signMessage(), publicKey and the same on/off
// EventEmitter surface MetaMask had.
export interface PhantomPublicKey {
  toBase58(): string
  toString(): string
}
export interface PhantomProvider {
  isPhantom?: boolean
  publicKey?: PhantomPublicKey | null
  isConnected?: boolean
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PhantomPublicKey }>
  disconnect(): Promise<void>
  signMessage(message: Uint8Array, display?: 'utf8' | 'hex'): Promise<{ signature: Uint8Array; publicKey: PhantomPublicKey }>
  on(event: string, handler: (args: any) => void): void
  off?(event: string, handler: (args: any) => void): void
  request?(args: { method: string; params?: any }): Promise<any>
}

// SOLANA: Phantom lives at window.solana (and sometimes window.phantom.solana).
export function getPhantomProvider(): PhantomProvider | null {
  const w = ssrFriendlyWindow as any
  if (!w) return null
  const provider = w.phantom?.solana ?? w.solana
  if (provider?.isPhantom) return provider as PhantomProvider
  return null
}

// SOLANA: base58 (Bitcoin alphabet) encoder so we can hand the server a base58
// signature string (verifySolanaSignature accepts base58) without adding a bs58
// runtime dep to this client module.
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58Encode(bytes: Uint8Array): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  const digits: number[] = [0]
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let out = '1'.repeat(zeros)
  for (let k = digits.length - 1; k >= 0; k--) out += B58_ALPHABET[digits[k]]
  return out
}

// SOLANA: ENS-style name resolution has no Solana analogue here (SNS .sol would
// need an RPC lookup). Stubbed to a safe default: pass through pubkeys, reject
// names. Kept because popup-ui/batch-transfer-nft.tsx imports it.
export const resolveName = async (name: string): Promise<string> => {
  if (getPhantomProvider() && name && !name.includes('.')) return name
  throw new Error('Name resolution is not supported on Solana')
}

// SOLANA: "do we have an injected wallet?" — kept the export name hasMetamask so
// the header/login UI compile unchanged; it now means "is Phantom available".
export const hasMetamask = (): boolean => {
  return !!getPhantomProvider()
}

const MM_LOGIN_KEY = 'voxels_mm_login'
const MM_LOGIN_PARAM = 'mm_login'

export function markMetamaskLoginPending() {
  try {
    sessionStorage.setItem(MM_LOGIN_KEY, '1')
  } catch {}
}

// SOLANA: after Phantom's in-app browser opens this page, auto-resume login.
export function consumeMetamaskLoginPending(): boolean {
  try {
    const urlPending = new URL(location.href).searchParams.get(MM_LOGIN_PARAM) === '1'
    const storePending = sessionStorage.getItem(MM_LOGIN_KEY) === '1'
    if (!urlPending && !storePending) return false
    sessionStorage.removeItem(MM_LOGIN_KEY)
    const u = new URL(location.href)
    if (u.searchParams.has(MM_LOGIN_PARAM)) {
      u.searchParams.delete(MM_LOGIN_PARAM)
      const qs = u.searchParams.toString()
      history.replaceState(history.state, '', u.pathname + (qs ? `?${qs}` : '') + u.hash)
    }
    return true
  } catch {
    return false
  }
}

// SOLANA: mobile browsers have no injected provider — open this page inside
// Phantom's in-app browser (phantom.app/ul/browse) instead of MetaMask's.
export function openMetamaskMobileDapp() {
  const loc = ssrFriendlyWindow?.location
  if (!loc) return
  markMetamaskLoginPending()
  const u = new URL(loc.href)
  u.searchParams.set(MM_LOGIN_PARAM, '1')
  const target = encodeURIComponent(u.href)
  const ref = encodeURIComponent(`${u.protocol}//${u.host}`)
  loc.href = `https://phantom.app/ul/browse/${target}?ref=${ref}`
}

// ------------------------------------------
// Chain Interaction helpers

/**
 * SOLANA: connect the Phantom wallet and return the connected account(s).
 * Was getUserAccounts(provider) over EIP-1193 eth_requestAccounts; now calls
 * provider.connect() and returns the base58 pubkey. Returns [] when the user
 * rejects (Phantom throws code 4001) or there is no provider. Shape kept as a
 * string[] so state-login.ts (WP15) treats accounts[0] as the wallet.
 */
export async function getUserAccounts(provider: PhantomProvider | null | undefined): Promise<string[]> {
  if (!provider || typeof provider.connect !== 'function') {
    return []
  }
  try {
    // Reuse an existing approval silently when possible.
    if (provider.isConnected && provider.publicKey) {
      return [provider.publicKey.toBase58()]
    }
    const res = await provider.connect()
    const pk = res?.publicKey ?? provider.publicKey
    return pk ? [pk.toBase58()] : []
  } catch (e) {
    // User refused to link their wallet.
    console.log('Could not get user accounts\n', e)
    return []
  }
}

/**
 * SOLANA: there is no per-request "chainId" on Solana the way EIP-1193 exposes
 * one; the cluster is fixed by deployment config. Return a stable sentinel so
 * callers that compare/log a chain id keep working. (changeNetwork below is a
 * no-op for the same reason.)
 */
export async function getCurrentChainId(_provider: PhantomProvider): Promise<number> {
  return 1
}

/**
 * SOLANA: ask Phantom to sign the UTF-8 login message with ed25519 and return a
 * base58 signature string. Was personal_sign returning a 0x-hex signature; the
 * server's verifySolanaSignature accepts a base58 string. Returns null when the
 * user refuses (Phantom throws).
 */
export async function signMessage(provider: PhantomProvider, _wallet: string, message: string): Promise<string | null> {
  try {
    const encoded = new TextEncoder().encode(message)
    const { signature } = await provider.signMessage(encoded, 'utf8')
    if (!signature || signature.length !== 64) return null
    return base58Encode(signature instanceof Uint8Array ? signature : Uint8Array.from(signature))
  } catch (e) {
    // User refused to sign.
    console.error(e)
    return null
  }
}

/**
 * SOLANA: network switching is not applicable — the cluster is fixed by config
 * (SOLANA_CLUSTER). Kept as a no-op returning success so any caller that asks
 * to switch networks before an action proceeds. supportedChains is now the
 * Solana cluster list.
 */
export async function changeNetwork(
  _provider: PhantomProvider,
  _chainId: number,
): Promise<{
  success: boolean
  error?: string
}> {
  if (!supportedChains.length) {
    return { success: false, error: 'No Solana cluster configured' }
  }
  return { success: true }
}
