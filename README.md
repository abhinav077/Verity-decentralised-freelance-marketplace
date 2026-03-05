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
    ├── components/     # Reusable UI components
    ├── context/        # React contexts (Wallet, Theme, Notifications)
    ├── hooks/          # Custom React hooks
    └── lib/            # Contract ABIs and address config
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

### 1. Clone the repository

```bash
git clone https://github.com/abhinav077/Verity-decentralised-freelance-marketplace.git
cd DFM
```

### 2. Install dependencies

In two separate terminals, install dependencies for each package:

```bash
# Terminal 1 — contracts
cd contracts
npm install

# Terminal 2 — frontend
cd frontend
npm install
```

### 3. Start the local Hardhat node

In a terminal inside the `contracts` folder:

```bash
cd contracts
npx hardhat node
```

Keep this terminal running. It starts a local Ethereum node at `http://127.0.0.1:8545` (Chain ID `31337`).

### 4. Deploy contracts

Open a **new terminal**, also inside `contracts`:

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network localhost
```

The deploy script automatically writes these addresses to `frontend/.env.local`.
If that write fails, copy the printed addresses into `frontend/.env.local` manually.

### 5. Run the frontend

Open a **new terminal** inside `frontend`:

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Configure MetaMask for local testing

1. Open MetaMask and add a custom network:
   - **Network Name**: `Hardhat Local`
   - **RPC URL**: `http://127.0.0.1:8545`
   - **Chain ID**: `31337`
   - **Currency Symbol**: `ETH`
2. Import one funded Hardhat account:
   - In the terminal running `npx hardhat node`, copy any `Private Key` shown under `Accounts`.
   - In MetaMask, use **Import Account** and paste that private key.
3. Select the `Hardhat Local` network in MetaMask before connecting on the frontend.
4. If transactions fail because of nonce/network mismatch, reset MetaMask activity for this network and re-import the account while the Hardhat node is running.

> You must keep `npx hardhat node` running while testing, since account balances and contract state live in that local chain.


## License

MIT
