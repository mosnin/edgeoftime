// SOLANA: DEPRECATED. Land ownership has been retargeted from Ethereum to
// Solana. The old ethers-based Transfer-event listener is gone; ownership is
// now reconciled by polling on-chain NFT holders in ./solana-listener.ts.
//
// This file is kept only as a thin shim so existing imports/wiring don't break.
// New code should import from './solana-listener' directly.

import { SolanaListener } from './solana-listener'

// Re-export under the legacy name so `EthereumListener()` keeps working while
// server.ts is migrated to call SolanaListener() directly (WP20).
export const EthereumListener = SolanaListener
