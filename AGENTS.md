# ANS — Arc Name Service

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

A decentralized name service for the Arc blockchain. Users register `.arc` names (3/6/9/12 months), send USDC tips by name, gift names to others, and buy/sell names through an atomic-escrow marketplace. Reputation scores track each user's history. Max 10 active names per wallet.

## Deployed Contracts (Arc Testnet)

| Contract | Address | Explorer |
|---|---|---|
| `ANSReputation` | `0x988772c3e0133f49f4136305c35f378a26a2a264` | [View](https://explorer.testnet.arc.io/address/0x988772c3e0133f49f4136305c35f378a26a2a264) |
| `ArcNameService` | `0x328b80405c05b84ba72a457fcfe389ad9c159fbb` | [View](https://explorer.testnet.arc.io/address/0x328b80405c05b84ba72a457fcfe389ad9c159fbb) |

**Owner:** `0x315EED96725dFbdDeFcdF35673634CD1eCEB9433`
**USDC:** `0x3600000000000000000000000000000000000000` (Arc Testnet)

### Post-deploy wiring status
`ANSReputation.setAnsContract(0x328b80405c05b84ba72a457fcfe389ad9c159fbb)` was successfully executed on-chain from the owner wallet. ArcNameService is fully authorized to write reputation scores.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
