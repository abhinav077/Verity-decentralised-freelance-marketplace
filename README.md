# Verity — Decentralized Freelancing Marketplace

> A fully on-chain, trustless freelancing platform powered by Ethereum smart contracts, a soulbound reputation system, and a DAO governance layer.

---

## Overview

DFM is an open, permissionless freelancing marketplace where clients and freelancers interact directly through smart contracts — no intermediaries, no hidden fees, and no central authority. Payments are held in escrow, disputes are resolved by a decentralized jury, and reputation is built on-chain through a non-transferable token system.

The platform is designed to be self-sustaining: a 1–2% fee on every transaction flows into a DAO treasury that the community governs through VRT-weighted proposals.

---

## Features

### Core Marketplace
- **Job Market** — Post jobs, submit bids (with optional milestone breakdowns), negotiate, and settle — all on-chain.
- **Escrow** — Funds are locked in a smart contract at job creation and released only when work is approved, a dispute is resolved, or a mutual settlement is reached. Auto-release triggers after 14 days of inactivity.
- **Milestones** — Clients can structure payments across multiple deliverable checkpoints.
- **Mutual Cancellation / Settlement** — Either party can propose a split; both must agree before funds move.

### Reputation System
- **VRT (Verity Reputation Token)** — Soulbound (non-transferable) ERC-20 token earned by completing jobs and contributing to the platform. It can never be bought, only earned.
- **Tiers** — Bronze → Silver (50 VRT) → Gold (200 VRT) → Platinum (500 VRT), unlocking fee discounts, governance weight, and jury eligibility.
- **Reputation Loans** — Users can borrow up to 50 VRT against ETH collateral to meet minimum thresholds, repayable through future earnings.

### User Profiles
- On-chain profiles with name, bio, IPFS avatar, and skills.
- Bidirectional reviews (client ↔ freelancer) locked to completed jobs.
- Skill endorsements between users who have worked together.
- Portfolio entries linked to IPFS and specific job IDs.
- Admin-verified skill badges.

### Dispute Resolution
- Disputed jobs go to a jury of VRT-holding peers, weighted by tier.
- Disputes can be escalated to admin arbitration.

### Bounty Board
- Anyone can post an open bounty with an ETH prize.
- Multiple submissions; poster approves winners.
- Silver-tier or higher required to post.

### Sub-Contracting
- Accepted freelancers can bring in sub-contractors and split payment at the smart-contract level.

### Insurance Pool
- Freelancers stake ETH as a premium to purchase coverage.
- If a dispute is resolved against the client (client at fault), the freelancer is compensated from the pool.
- Premiums are returned if no claims are filed.

### DAO Governance & Treasury
- VRT-weighted on-chain proposals and voting.
- Platform fees (1–2%) accumulate in the treasury.
- Crowdfunding module for community-driven public-good projects.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity ^0.8.24, OpenZeppelin |
| Contract Tooling | Hardhat, TypeChain, Ethers v6 |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Animations | Framer Motion, GSAP, Three.js |
| Wallet | ethers.js v6, MetaMask (via custom WalletContext) |
| IPFS Storage | Pinata (server-side API proxy) |
| Supported Networks | Polygon Amoy (recommended), Base Sepolia, Ethereum Sepolia, Localhost |

---

## Repository Structure

```
DFM/
├── contracts/          # Hardhat project — all smart contracts + tests
│   ├── contracts/      # Solidity source files
│   ├── scripts/        # Deployment scripts
│   ├── test/           # Hardhat tests (Mocha/Chai)
│   └── typechain-types/# Auto-generated TypeScript contract types
└── frontend/           # Next.js application
    ├── app/            # App Router pages (jobs, profile, governance, …)
    │   └── api/        # Server-side API routes (IPFS upload proxy)
    ├── components/     # Reusable UI components (IpfsFileUpload, etc.)
    ├── context/        # React contexts (Wallet, Theme, Notifications)
    ├── hooks/          # Custom React hooks (useIpfsUpload, etc.)
    └── lib/            # Contract ABIs, address config, IPFS utilities
```

---

## Smart Contracts

| Contract | Description |
|---|---|
| `VRTToken.sol` | Soulbound reputation token with tiered benefits |
| `JobMarket.sol` | Core job posting, bidding, and settlement logic |
| `Escrow.sol` | Trustless payment escrow with milestone support |
| `UserProfile.sol` | On-chain profiles, reviews, endorsements, badges |
| `DisputeResolution.sol` | Peer jury + admin arbitration system |
| `BountyBoard.sol` | Open bounties with multi-winner support |
| `SubContracting.sol` | On-chain sub-contractor management |
| `InsurancePool.sol` | Freelancer insurance with ETH collateral |
| `ReputationLoans.sol` | Temporary VRT loans against ETH collateral |
| `Governance.sol` | DAO proposals, voting, treasury, and crowdfunding |

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm or yarn
- MetaMask (or any EIP-1193 wallet)
- A Pinata account for IPFS uploads (free tier works): https://app.pinata.cloud

### 1. Clone the repository

```bash
git clone https://github.com/abhinav077/Verity-decentralised-freelance-marketplace.git
cd DFM
```

### 2. Install dependencies

```bash
# Terminal 1 — contracts
cd contracts
npm install

# Terminal 2 — frontend
cd frontend
npm install
```

### 3. Configure environment variables

**Contracts** (`contracts/.env`):
```bash
cp contracts/.env.example contracts/.env
# Edit contracts/.env and add your PRIVATE_KEY + RPC URL
```

**Frontend** (`frontend/.env.local`):
```bash
cp frontend/.env.example frontend/.env.local
# Add your Pinata JWT token (see below)
```

### 4. Get a Pinata JWT (for IPFS uploads)

1. Create a free account at https://app.pinata.cloud
2. Go to **API Keys** → **New Key**
3. Enable `pinFileToIPFS` and `pinJSONToIPFS`
4. Copy the **JWT** token
5. Add to `frontend/.env.local`:
   ```
   PINATA_JWT=your_jwt_here
   NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs
   ```

---

### Option A: Local Development (quick start)

```bash
# Terminal 1 — start local chain (Anvil with state persistence)
cd contracts
npm run node

# Terminal 2 — deploy contracts
cd contracts
npm run deploy:local

# Terminal 3 — start frontend
cd frontend
npm run dev
```

Configure MetaMask:
- **RPC URL**: `http://127.0.0.1:8545`
- **Chain ID**: `31337`
- Import a Hardhat test private key from the terminal output

> Note: Local chain data is saved to `hardhat-state.json` by Anvil.
> If you delete this file or start without the script, data resets.

### Option B: Polygon Amoy Testnet (recommended for persistent data)

```bash
# 1. Get testnet MATIC from https://faucet.polygon.technology/
# 2. Set up contracts/.env:
#    PRIVATE_KEY=your_wallet_private_key
#    POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology

# 3. Deploy contracts
cd contracts
npm run deploy:amoy

# 4. Start frontend (addresses auto-written to .env.local)
cd frontend
npm run dev
```

Configure MetaMask:
- **Network Name**: `Polygon Amoy`
- **RPC URL**: `https://rpc-amoy.polygon.technology`
- **Chain ID**: `80002`
- **Currency Symbol**: `MATIC`

### Option C: Other Testnets

```bash
# Base Sepolia
npm run deploy:baseSepolia

# Ethereum Sepolia
npm run deploy:sepolia
```

### 5. Run the frontend

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> After deploying to a testnet: restarting the frontend or backend will **not** erase data.
> All smart contract data persists on the blockchain permanently.


## License

MIT
