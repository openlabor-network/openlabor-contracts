# OpenLabor Contracts

Smart contracts powering the OpenLabor protocol on [WorldChain](https://world.org).

## Contracts

### OpenLaborAgentRegistry

Registers agents verified as unique humans via [WorldID](https://worldcoin.org/world-id) zero-knowledge proofs. Each agent maps to a nullifier hash to prevent sybil attacks.

- WorldID proof verification
- Merkle root whitelisting with 4-hour expiration
- Nonce-based replay protection
- Two-step ownership transfer

### OpenLaborSmartWallet

Smart wallet with time-limited session keys and [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271) signature validation.

- Owner-controlled session keys with expiration (max 1 year)
- EIP-1271 compatible signature checks (owner + session keys)
- Deployed via factory

### OpenLaborWalletFactory

Deploys and manages OpenLaborSmartWallet instances.

- Creates wallets per user
- Admin and owner can set session keys on wallets
- Two-step admin transfer
- Tracks all wallets per owner

## Setup

```bash
npm install
npx hardhat compile
```

## Testing

```bash
npx hardhat test
```

## Deployment

Targets WorldChain mainnet. Requires `PLATFORM_PRIVATE_KEY` and `WORLD_APP_ID` env vars.

```bash
cp .env.example .env
# fill in your keys
npm run deploy
```

## Stack

- Solidity 0.8.20
- Hardhat
- ethers.js v6
- WorldID
