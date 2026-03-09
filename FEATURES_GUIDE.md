# Verity — Complete Features & Testing Guide

> **For testers with zero prior knowledge of this project.**
> This document explains every feature, what it does, what inputs it needs, what outputs to expect, and how to test it.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Getting Started (Wallet & Profile)](#2-getting-started-wallet--profile)
3. [Jobs — The Core Marketplace](#3-jobs--the-core-marketplace)
4. [Bidding on Jobs](#4-bidding-on-jobs)
5. [Job Lifecycle (After Bid Accepted)](#5-job-lifecycle-after-bid-accepted)
6. [Milestones](#6-milestones)
7. [Disputes & Voting](#7-disputes--voting)
8. [Bounty Board](#8-bounty-board)
9. [Sub-Contracting](#9-sub-contracting)
10. [Governance & Proposals](#10-governance--proposals)
11. [Crowdfunding](#11-crowdfunding)
12. [Insurance Pool](#12-insurance-pool)
13. [VRT Reputation Loans](#13-vrt-reputation-loans)
14. [User Profile, Reviews & Achievements](#14-user-profile-reviews--achievements)
15. [Chat & Task Board](#15-chat--task-board)
16. [VRT Token & Tier System](#16-vrt-token--tier-system)
17. [Admin Panel](#17-admin-panel)
18. [Notifications](#18-notifications)
19. [Quick-Reference: All Features Table](#19-quick-reference-all-features-table)

---

## 1. Platform Overview

**Verity** is a decentralized freelance marketplace on Ethereum. Clients post jobs, freelancers bid, payments are held in smart contract escrow, and disputes are resolved by community voting. Everything (payments, reputation, reviews) lives on-chain — no middleman.

**Key Concepts:**
- **ETH** = real money (Ether cryptocurrency) used for payments, bounties, insurance, crowdfunding
- **VRT (Verity Reputation Token)** = soulbound (non-transferable) reputation points earned by working on the platform
- **Escrow** = a smart contract that holds the client's ETH safely until work is complete
- **On-chain** = stored permanently on the blockchain, visible to everyone, cannot be edited or deleted

---

## 2. Getting Started (Wallet & Profile)

### Connecting Your Wallet

| Item | Details |
|---|---|
| **What** | Connect MetaMask wallet to the platform |
| **Where** | Click "Connect Wallet" button in the top-right navbar |
| **Input** | MetaMask popup → approve connection |
| **Output** | Your wallet address appears in navbar, shows your ETH and VRT balances |
| **Network** | Polygon Amoy (80002), Base Sepolia (84532), Ethereum Sepolia (11155111), or Hardhat Local (31337) |
| **Note** | A wrong-network warning badge appears if you're on the wrong chain |

### Creating Your Profile

| Item | Details |
|---|---|
| **What** | Set up your on-chain identity |
| **Where** | Click your address in navbar → "My Profile" → "Set Up Profile" |
| **Inputs** | **Name** (text), **Bio** (text), **Skills** (comma-separated, e.g., "Solidity, React, Design") |
| **Output** | Profile page shows your name, bio, skills, and stats (all zeroes initially) |
| **Optional** | Set avatar via IPFS — upload directly from the profile page (auto-pinned via Pinata) or paste an IPFS hash/URL |
| **Costs** | Gas fee only (no ETH payment) |
| **Note** | One profile per wallet address. Can be updated anytime. |

---

## 3. Jobs — The Core Marketplace

### Creating a Job (as Client)

Navigate to **Jobs** page → click **"+ Post a Job"** in the navbar, or go to `/jobs?create=true`.

| Field | Required | Description | Example |
|---|---|---|---|
| **Title** | Yes | Short name for the job | "Build a DeFi Dashboard" |
| **Description** | Yes | Detailed explanation of what you need done | "I need a React dashboard that shows..." |
| **Category** | Yes | Pick one: Web Dev, Mobile, Design, Writing, Marketing, Data, Blockchain, AI/ML, Other | "Web Dev" |
| **Budget** | Yes | Amount in ETH you're willing to pay | 0.5 |
| **Deadline** | Yes | Days until the job listing closes for new bids (default: 30) | 30 |
| **Expected Days** | No | How many days you expect the work to take | 14 |
| **Sealed Bidding** | No | Toggle ON = freelancers can't see each other's bids (only their own) | OFF (default) |
| **Milestones** | No | Break the job into phases with separate payments (amounts must sum to budget) | Milestone 1: "Design" — 0.2 ETH, Milestone 2: "Development" — 0.3 ETH |

| Output | Details |
|---|---|
| **On success** | Job appears in "Open Jobs" tab with status **Open** |
| **On-chain** | `JobCreated` event emitted; job gets a unique Job ID |
| **Cost** | Gas fee only (no ETH locked yet — that happens when accepting a bid) |

### Viewing Jobs

| Tab | What It Shows |
|---|---|
| **Open Jobs** | All jobs with status "Open" — available for bidding |
| **My Jobs** | Jobs you posted as a client |
| **My Work** | Jobs where you are the hired freelancer |

Each job card shows: title, status badge (color-coded), category, budget (ETH), deadline, posted date, and a lock icon if sealed bidding is enabled.

---

## 4. Bidding on Jobs

### Placing a Bid (as Freelancer)

Click on any **Open** job → the detail modal opens → scroll to "Place a Bid".

| Field | Required | Description | Example |
|---|---|---|---|
| **Bid Amount** | Yes | How much ETH you want to be paid (can be more or less than the budget) | 0.45 |
| **Completion Days** | No | How many days you'll need to finish the work | 10 |
| **Proposal** | Yes | Your pitch — why you're the right person for this job | "I have 3 years of React experience and..." |

| Output | Details |
|---|---|
| **On success** | Your bid appears in the job's bid list |
| **Rules** | One bid per freelancer per job. If `Min VRT to Bid` is set (admin config), you need that many VRT tokens to bid. |
| **Sealed bidding** | If enabled, other freelancers cannot see your bid — only the client sees all bids |
| **Cost** | Gas fee only |

### Withdrawing a Bid

| Item | Details |
|---|---|
| **Who** | The freelancer who placed the bid |
| **When** | Only while the job is still **Open** |
| **Action** | Click "Withdraw" on your bid in the job detail modal |
| **Output** | Bid is deactivated |

### Accepting a Bid (as Client)

| Item | Details |
|---|---|
| **Who** | The client who posted the job |
| **Where** | Job detail modal → click "Accept" on the desired bid |
| **What happens** | You must send ETH equal to the bid amount. This ETH goes into **Escrow** (held by smart contract). Job status changes to **In Progress**. All other bids are deactivated. |
| **Cost** | Bid amount in ETH + gas fee |
| **Output** | Job moves to "In Progress", freelancer is assigned |

---

## 5. Job Lifecycle (After Bid Accepted)

Once a bid is accepted, here's the complete flow:

```
Open → [Bid Accepted] → In Progress → [Freelancer Delivers] → Delivered
                              ↓                                    ↓
                         [Client Cancels]                [Client Completes] → Completed
                              ↓                          [Client Requests Revision] → back to In Progress
                          Cancelled                      [14 days pass, no action] → Auto-Released → Completed
                              ↓
                         [Either party raises dispute] → Disputed → [Voting] → Resolved → Completed
```

### Available Actions by Status

#### In Progress

| Action | Who | What It Does | Inputs |
|---|---|---|---|
| **Deliver Job** | Freelancer | Marks the job as "Delivered" and starts a 14-day auto-release timer | None (just click) |
| **Cancel Job** | Client | Cancels the job. Freelancer gets refunded but client pays a 5% penalty | None |
| **Raise Dispute** | Client or Freelancer | Opens a dispute (see Section 7) | Reason text |
| **Propose Settlement** | Either party | Propose a mutual money split without going to dispute | % complete (0-100), Freelancer's share % (0-100) |
| **Chat** | Client or Freelancer | Open the job chat room | — |
| **Video Call** | Either party | Opens a Jitsi video call room | — |
| **Task Board** | Freelancer (edit) / Client (view-only) | Kanban board to track sub-tasks | — |
| **Sub-Contract** | Freelancer | Delegate part of work to someone else (see Section 9) | — |

#### Delivered

| Action | Who | What It Does | Inputs |
|---|---|---|---|
| **Complete Job & Release Payment** | Client | Approves the delivery. ETH released from escrow to freelancer (minus platform fee). Both parties earn VRT reputation tokens. | None |
| **Request Revision** | Client | Sends job back to "In Progress" — freelancer must re-deliver | None |
| **Tip Freelancer** | Client | Send extra ETH as a bonus | ETH amount |
| **Auto-Release** | Anyone (after 14 days) | If the client hasn't acted for 14 days, anyone can trigger auto-release to complete the job | None |

#### Completed

| Action | Who | What It Does | Inputs |
|---|---|---|---|
| **Write Review** | Both parties | Leave a 1-5 star review + comment (stored on-chain, permanent) | Star rating, comment text |
| **Tip Freelancer** | Client | Send extra ETH tip | ETH amount |

### Settlement (Mutual Agreement)

Instead of going to a dispute, either party can propose a settlement:

| Step | Action | Details |
|---|---|---|
| 1 | **Propose Settlement** | One party enters: "% of work complete" and "freelancer's share %". Example: 60% complete, freelancer gets 60% |
| 2 | **Other Party Responds** | Accept → funds are split per the agreed percentages. Reject → proposal cancelled, parties can try again or raise dispute |
| 3 | **Result** | If accepted: freelancer gets their % (minus platform fee), client gets the rest. Job is completed. |

---

## 6. Milestones

If a job was created with milestones, the payment is broken into phases.

| Step | Who | Action | What Happens |
|---|---|---|---|
| 1 | Freelancer | **Submit Milestone** (click "Submit" on a milestone) | Milestone status → "Submitted" |
| 2 | Client | **Approve Milestone** (click "Approve") | The milestone's ETH portion is released from escrow to the freelancer. Milestone status → "Approved" |
| 3 | (repeat) | Complete all milestones | — |
| 4 | Auto | When ALL milestones are approved | Job auto-completes. Both parties earn VRT. |

| Milestone Status | Meaning |
|---|---|
| **Pending** | Not started yet |
| **In Progress** | Work has begun |
| **Submitted** | Freelancer has submitted work for this phase |
| **Approved** | Client approved; payment released for this phase |

---

## 7. Disputes & Voting

This is one of the most important features. When client and freelancer can't agree, a dispute is raised and the community votes to resolve it.

### Dispute Flow (Step by Step)

```
Raise Dispute → Response Phase (3 days) → Voting Phase (5 days) → Resolution
                                                                    ↓
                                                        If "Re-Proportion" wins → New voting round
                                                        If Client/Freelancer wins → Funds split
                                                        If no votes → Escalate to Admin
```

### Phase 1: Raising a Dispute

| Item | Details |
|---|---|
| **Who can raise** | Client or Freelancer (on an "In Progress" job) |
| **Input** | Reason/description text explaining why you're raising the dispute |
| **Output** | Dispute created with status "Response Phase". Job status → "Disputed". 3-day timer starts. |
| **Where** | Job detail modal → "Raise Dispute" button |

### Phase 2: Response Phase (3 days)

| Action | Who | Details |
|---|---|---|
| **Submit Response** | The OTHER party (non-initiator) | Write your side of the story. This advances the dispute to Voting Phase. |
| **Submit Evidence** | Either party | Provide IPFS hash/link to supporting evidence (screenshots, files, etc.) |
| **Set Proportion Demand** | Either party | Enter what % of the escrow funds you believe you deserve (0-100%) |
| **Withdraw Dispute** | Initiator only | Cancel the dispute → job returns to "In Progress" |
| **Escalate to Admin** | Either party (after 3-day deadline passes with no response) | Skip voting, let admin decide |

### Phase 3: Voting Phase (5 days)

| Action | Who | Details |
|---|---|---|
| **Cast Vote** | Any third party (not the client or freelancer) | Choose one of three options: **Vote for Client**, **Vote for Freelancer**, or **Vote for Re-Proportion** |
| **Set/Update Proportion Demand** | Client or Freelancer | Adjust what % you want (important for re-proportion rounds) |
| **Submit Evidence** | Either party | Can still add evidence during voting |

**Voting Rules:**
- Only people who are NOT the client or freelancer can vote
- Each person gets one vote per voting round
- If `Min VRT to Vote` is set, voters need that many VRT tokens
- Voters who vote with the winning side earn **2 VRT** as a reward

### Who Can See What During Voting

| Person | Can See Vote Tallies? | Can Vote? |
|---|---|---|
| **Client** (party in dispute) | YES — sees vote counts for all three options | NO |
| **Freelancer** (party in dispute) | YES — sees vote counts for all three options | NO |
| **Everyone else** | NO — sees a "voting in progress" message but NOT the vote counts | YES — can cast their vote |

> **Important:** The vote tallies (how many votes each side has) are HIDDEN from third-party voters. Only the two parties in the dispute can see the running totals. This prevents "bandwagon voting" — voters must decide independently without being influenced by which side is winning.

### Phase 4: Resolution

After the 5-day voting deadline:

| Outcome | What Happens |
|---|---|
| **Client wins** (most votes) | The client's proportion demand is used. Example: client demanded 70% → client gets 70% of escrow, freelancer gets 30% |
| **Freelancer wins** | The freelancer's proportion demand is used. Example: freelancer demanded 80% → freelancer gets 80%, client gets 20% |
| **Re-Proportion wins** | No one wins yet! The voting resets to a new round. Both parties can adjust their demands. Community votes again. |
| **Tie** | Client wins (client advantage on ties) |
| **No votes at all** | Either party can escalate to admin |

### Dispute Status Reference

| Status | Meaning |
|---|---|
| **Response Phase** | Waiting for the other party to respond (3-day window) |
| **Voting Phase** | Community is voting (5-day window) |
| **Resolved** | Voting completed, funds distributed |
| **Auto-Resolved** | 14 days passed with no action, system resolved automatically |
| **Withdrawn** | Initiator cancelled the dispute |
| **Escalated to Admin** | Admin will decide the outcome |

### Dispute Tabs (Filter)

| Tab | Shows |
|---|---|
| **Active** | Disputes in Response Phase or Voting Phase |
| **Resolved** | Disputes that have been settled |
| **Mine** | Disputes where you are client or freelancer |
| **All** | Every dispute |

### Auto-Resolution (Safety Net)

If a dispute has been open for 14 days with no resolution:
- **If no votes were cast** → The non-initiator (the person who didn't raise the dispute) wins
- **If votes exist** → The side with the majority wins

---

## 8. Bounty Board

Bounties are open tasks that anyone can attempt. Unlike jobs (1 client → 1 freelancer), bounties can have multiple winners.

### Creating a Bounty

| Field | Required | Description | Example |
|---|---|---|---|
| **Title** | Yes | Name of the bounty task | "Write a tutorial for our API" |
| **Description** | Yes | What needs to be done | "Create a step-by-step guide..." |
| **Category** | Yes | Type of work | "Writing" |
| **Reward** | Yes | Total ETH reward (sent with transaction, locked in contract) | 0.3 |
| **Deadline** | Yes | Date by which submissions must be made | 2026-04-01 |
| **Max Winners** | Yes | How many people can win (≥ 1) | 3 |

| Output | Details |
|---|---|
| **On success** | Bounty appears on the Bounties page with "Open" status |
| **Cost** | Reward ETH (locked in contract) + gas fee |
| **Payout** | Each winner gets: Total Reward ÷ Max Winners. Example: 0.3 ETH / 3 = 0.1 ETH per winner |

### Submitting Work on a Bounty

| Item | Details |
|---|---|
| **Who** | Anyone except the bounty poster |
| **When** | Before the deadline, while bounty is "Open" |
| **Inputs** | **Description** (what you did), **IPFS Proof** (link/hash to your work) |
| **Rule** | One submission per person per bounty |

### Reviewing Submissions (as Poster)

| Action | What It Does |
|---|---|
| **Approve** | Winner gets their share of ETH + 5 VRT minted as reputation reward |
| **Reject** | Submission rejected, no payout |

When the number of approved submissions equals Max Winners, the bounty auto-completes.

### Cancelling a Bounty

| Rule | Details |
|---|---|
| **Time limit** | Only within 15 minutes of creation |
| **Condition** | No submissions exist yet |
| **Effect** | Remaining ETH refunded to poster |

---

## 9. Sub-Contracting

A freelancer who has been hired for a job can delegate part (or all) of the work to another freelancer.

### Two Modes

| Mode | How It Works |
|---|---|
| **Direct Assignment** | You know who to assign → enter their wallet address when creating |
| **Open Listing** | Leave the sub-contractor address empty → other freelancers can browse and apply |

### Creating a Sub-Contract

| Field | Required | Description | Example |
|---|---|---|---|
| **Parent Job ID** | Yes | The job you want to sub-contract from | 3 |
| **Sub-Contractor Address** | No | Wallet address of the person (leave empty for open listing) | 0x1234...abcd or empty |
| **Work Description** | Yes | What the sub-contractor needs to do | "Design the UI mockups" |
| **Payment** | Yes | ETH amount (sent with transaction, locked in contract) | 0.1 |

### Sub-Contract Lifecycle

```
Created → [Direct: Active immediately / Open: Wait for applications] → Active → Submitted → Approved (paid)
  ↓
[Cancel at any time before approval → refund]
```

| Step | Who | Action |
|---|---|---|
| 1 (Direct) | — | Sub-contract created as "Active" |
| 1 (Open) | Freelancers | Browse open listings, click "Apply" |
| 2 (Open) | Primary freelancer | View applicants, click "Assign" on one |
| 3 | Sub-contractor | Click "Submit Work" when done |
| 4 | Primary freelancer | Click "Approve & Release Payment" → ETH sent to sub-contractor |

| Cancel | Primary freelancer can cancel if status is Open or Active → ETH refunded |
|---|---|

---

## 10. Governance & Proposals

The platform has a DAO (Decentralized Autonomous Organization) for community decision-making.

### Viewing Governance Stats

The governance page header shows:
- **Treasury Balance** — ETH collected from platform fees
- **Your VRT Balance** — your voting power
- **Total Proposals** — how many proposals have been created
- **Min VRT to Propose** — minimum VRT needed to create a proposal (default: 100)
- **Voting Period** — how long voting lasts (default: 5 days)
- **Quorum** — minimum % of total VRT supply that must vote for the result to count (default: 10%)

### Creating a Proposal

| Field | Required | Description | Example |
|---|---|---|---|
| **Title** | Yes | What the proposal is about | "Reduce platform fee to 1%" |
| **Description** | Yes | Detailed explanation | "The current 2% fee is too high..." |

| Requirement | Must hold ≥ Min VRT to Propose (default 100 VRT) |
|---|---|
| **Output** | Proposal appears as "Active" with a voting deadline |

### Voting on a Proposal

| Item | Details |
|---|---|
| **Who** | Anyone with VRT tokens (must hold > 0) |
| **Options** | **Vote For** or **Vote Against** |
| **Weight** | Your vote weight = your VRT balance. Platinum tier users get 2× weight. |
| **When** | While proposal is Active and before the deadline |
| **One vote** | You can only vote once per proposal |

### Finalizing a Proposal

| Item | Details |
|---|---|
| **When** | After the voting deadline has passed |
| **Who** | Anyone can click "Finalize" |
| **Result** | If "For" votes > "Against" votes AND quorum is met → **Passed**. Otherwise → **Rejected** |

### Proposal Statuses

| Status | Meaning |
|---|---|
| **Active** | Voting is open |
| **Passed** | Majority voted For + quorum met |
| **Rejected** | Majority voted Against, or quorum not met |
| **Executed** | Admin executed the passed proposal |
| **Cancelled** | Proposer or admin cancelled it |

---

## 11. Crowdfunding

Community members can create crowdfunding campaigns for projects.

### Creating a Crowdfunding Project

| Field | Required | Description | Example |
|---|---|---|---|
| **Title** | Yes | Project name | "Open-Source Freelancer Tools" |
| **Description** | Yes | What the project is about | "Building a suite of tools..." |
| **Category** | Yes | Product, Tool, Research, Community, Education, or Other | "Tool" |
| **Proof/Docs Link** | Yes | URL to project documentation or proof | "https://docs.google.com/..." |
| **Goal Amount** | Yes | ETH target to raise | 5.0 |
| **Duration** | Yes | Days the campaign will run | 30 |

| Requirement | Must hold ≥ 5 VRT (default) |
|---|---|
| **Output** | Project appears as "Active" with a progress bar (0% funded) |

### Contributing to a Project

| Item | Details |
|---|---|
| **Who** | Anyone except the project creator |
| **Input** | ETH amount to contribute |
| **Output** | Progress bar updates. When total raised ≥ goal → status changes to "Funded" |

### Project Lifecycle

| Status | What Can Happen |
|---|---|
| **Active** | Contributions accepted. Creator can post updates. Creator can cancel. |
| **Funded** | Goal reached! Creator can withdraw funds (one-time). Creator can post updates. |
| **Failed** | Deadline passed without reaching goal. Anyone can mark it failed. Contributors can get refunds. |
| **Cancelled** | Creator cancelled. Contributors can get refunds. |

### Posting Updates (Creator Only)

| Input | Description + optional link |
|---|---|
| **Output** | Update appears in the project's detail section with timestamp |

---

## 12. Insurance Pool

Freelancers can buy insurance to protect themselves in case of payment disputes.

### How It Works

1. Freelancer pays a **premium** (ETH) to buy an insurance policy
2. The policy gives **coverage** = premium × 3 (multiplier)
3. If a dispute is resolved in the freelancer's favor (client at fault), the admin/dispute system can **file a claim** → freelancer gets paid from the pool
4. If no claim is filed, freelancer can **withdraw their premium** back after the policy expires (90 days)

### Buying Insurance

| Field | Required | Description | Example |
|---|---|---|---|
| **Premium** | Yes | ETH to stake (minimum 0.01 ETH) | 0.1 |

| Output | Details |
|---|---|
| **Coverage** | Premium × 3. So 0.1 ETH premium = 0.3 ETH coverage |
| **Duration** | 90 days |
| **Cost** | Premium ETH + gas fee |

### Policy Actions

| Action | Who | When | What Happens |
|---|---|---|---|
| **File Claim** | Admin or Dispute contract | During active policy period | Freelancer receives coverage amount (or pool balance if pool is low) |
| **Withdraw Premium** | Freelancer (policy owner) | After policy expires AND no claim was filed | Premium returned to freelancer |
| **Fund Pool** | Anyone | Anytime | Add ETH to strengthen the insurance pool |

### Policy Statuses

| Status | Meaning |
|---|---|
| **Active** | Policy is valid, can be claimed |
| **Claimed** | Claim has been paid out |
| **Withdrawn** | Premium has been returned |
| **Expired** | Policy period ended (can now withdraw premium) |

---

## 13. VRT Reputation Loans

If you need VRT tokens (e.g., to meet a minimum bid requirement) but haven't earned enough yet, you can borrow them.

### Taking a Loan

| Field | Required | Description | Example |
|---|---|---|---|
| **Amount** | Yes | VRT to borrow (max 50 VRT) | 20 |

| What You Send | ETH collateral. Calculated as: (amount ÷ 10, rounded up) × 0.005 ETH. Minimum: 0.005 ETH |
|---|---|
| **Example** | Borrow 20 VRT → collateral = 2 × 0.005 = 0.01 ETH |
| **Output** | VRT minted to your wallet. Loan appears in your loan dashboard. |

### Loan Rules

| Rule | Details |
|---|---|
| **Max loan** | 50 VRT |
| **Duration** | 30 days to repay |
| **One at a time** | You can only have one active loan |
| **Repayment** | Earn VRT by completing jobs, then use it to repay. Repayment burns the VRT from your wallet. |
| **Full repayment** | When loan fully repaid → collateral ETH returned to you |
| **Default** | If 30 days pass and loan not repaid → anyone can mark you as "Defaulted" |
| **Default consequence** | Collateral forfeited permanently. You can NEVER take another loan. "Defaulted" status shown on your dashboard. |

### Loan Statuses

| Status | Meaning |
|---|---|
| **Active** | Loan is ongoing, timer running |
| **Settled** | Fully repaid, collateral returned |
| **Defaulted** | Time expired, collateral lost, permanently flagged |

---

## 14. User Profile, Reviews & Achievements

### Profile Stats

Every user's profile shows:

| Stat | Meaning |
|---|---|
| **Jobs Done** | Total jobs completed |
| **VRT Tokens** | Current VRT balance |
| **ETH Earned** | Total ETH earned as freelancer |
| **ETH Spent** | Total ETH spent as client |
| **Avg Rating** | Average star rating from reviews |

### Writing Reviews

| Item | Details |
|---|---|
| **When** | After a job is completed |
| **Who** | Both client and freelancer review each other |
| **Inputs** | Star rating (1-5: Poor / Fair / Good / Very Good / Excellent) + comment text |
| **Output** | Review permanently stored on-chain. Visible on the reviewee's profile. |
| **Rule** | One review per person per job. Cannot review yourself. Cannot edit or delete. |
| **Prompt** | After completing a job, a review prompt appears. It may be mandatory (cannot skip). |

### Skill Endorsements

| Item | Details |
|---|---|
| **What** | Endorse another user's skill (like a LinkedIn endorsement) |
| **Where** | Visit someone's profile → "Endorse Skill" |
| **Inputs** | Skill name + optional Job ID (the job you worked together on) |
| **Rule** | Cannot endorse yourself. One endorsement per (endorser, user, skill) combo. |
| **Output** | Endorsement appears on the user's profile, grouped by skill |

### Portfolio

| Item | Details |
|---|---|
| **What** | Showcase your work |
| **Where** | Your own profile → "Add Portfolio Item" |
| **Inputs** | Title, IPFS link (to the work), optional Job ID |
| **Output** | Portfolio item displayed on your profile with clickable IPFS link |

### Achievements (Gamification)

Achievements are unlocked automatically based on your activity:

| Achievement | How to Unlock |
|---|---|
| 🏆 **First Job** | Complete your 1st job |
| ⭐ **Experienced** | Complete 5 jobs |
| 🎖️ **Veteran** | Complete 10 jobs |
| 💯 **Perfect Score** | Receive a 5-star review |
| ✍️ **Reviewer** | Submit your first review |
| 🤝 **Endorsed** | Receive your first skill endorsement |
| 📁 **Showcase** | Add your first portfolio item |
| 🔥 **Popular** | Receive 5 reviews |
| 🎯 **Bounty Hunter** | Complete a bounty |
| 💰 **Top Earner** | Earn 1 ETH total on the platform |

---

## 15. Chat & Task Board

### Job Chat

| Item | Details |
|---|---|
| **What** | Direct messaging between client and freelancer for a specific job |
| **Where** | Job detail modal → "Chat" button (or from navbar link) |
| **Who can access** | Only the client and the assigned freelancer for that job |
| **Inputs** | Type a message (Enter to send, Shift+Enter for new line). Attach files (max 1MB). |
| **Output** | Messages appear as chat bubbles (blue = yours, white = theirs) with timestamps |
| **Storage** | Messages are stored in your browser's localStorage — NOT on the blockchain. Messages sync across tabs on the same computer. |
| **Images** | Attached images render inline in the chat |
| **Read-only** | Chat becomes read-only when the job is completed or cancelled |

### Task Board (Kanban)

| Item | Details |
|---|---|
| **What** | A personal to-do tracker for managing sub-tasks within a job |
| **Where** | Job detail modal → "Task Board" button |
| **Columns** | To Do → In Progress → Done |
| **Actions** | Add task (type + Enter), drag-and-drop between columns, move with arrow buttons, delete |
| **Who can edit** | Freelancer only. Client can view in read-only mode. |
| **Storage** | localStorage (per job) — not on-chain |

---

## 16. VRT Token & Tier System

VRT (Verity Reputation Token) is a **soulbound** token — it CANNOT be transferred to another person. You can only earn it by working on the platform.

### How to Earn VRT

| Activity | VRT Earned |
|---|---|
| Complete a job (as client or freelancer) | 10 VRT each |
| Win a bounty submission | 5 VRT |
| Vote on a dispute (winning side) | 2 VRT |
| VRT Loan (temporary, must repay) | Up to 50 VRT |

### Tier System

Your tier is based on **total VRT ever earned** (not current balance — burning tokens doesn't lower your tier).

| Tier | Total VRT Earned Required | Platform Fee Discount | Governance Vote Weight |
|---|---|---|---|
| 🥉 **Bronze** | 0 | 0% (full 2% fee) | 1× |
| 🥈 **Silver** | 50 | 25% off (1.5% fee) | 1× |
| 🥇 **Gold** | 200 | 50% off (1% fee) | 1× |
| 💎 **Platinum** | 500 | 75% off (0.5% fee) | 2× |

### What VRT Unlocks

| Feature | VRT Requirement |
|---|---|
| Bid on jobs (if configured) | Min VRT to Bid (admin-set, default 0) |
| Vote on disputes | Min VRT to Vote (admin-set, default 0) |
| Create governance proposals | 100 VRT |
| Create crowdfunding projects | 5 VRT |
| Lower platform fees | Automatic via tier |
| Stronger governance votes | Platinum = 2× weight |

---

## 17. Admin Panel

The Admin Panel is only accessible to the account that has the `ADMIN_ROLE` on the smart contracts (typically the deployer).

**Location:** Navbar → Other → Admin Panel

### Configurable Parameters

| Section | Parameter | Default | Description |
|---|---|---|---|
| **Jobs** | Auto-Release Period | 14 days | Days after delivery before auto-payment |
| **Jobs** | Reputation Reward | 10 VRT | VRT minted to both parties on job completion |
| **Jobs** | Cancel Penalty | 500 BPS (5%) | % penalty when client cancels an in-progress job |
| **Jobs** | Min VRT to Bid | 0 | Minimum VRT required to place a bid |
| **Fees** | Platform Fee | 200 BPS (2%) | Fee taken from freelancer's payment |
| **Fees** | Max Fee Cap | 500 BPS (5%) | Maximum allowed platform fee |
| **Disputes** | Response Period | 3 days | Time for opponent to respond |
| **Disputes** | Voting Period | 5 days | Duration of community voting |
| **Disputes** | Auto-Resolve Deadline | 14 days | Safety timeout for unresolved disputes |
| **Disputes** | Voter Reward | 2 VRT | VRT reward for voters on winning side |
| **Disputes** | Min VRT to Vote | 0 | Minimum VRT to participate in dispute voting |
| **Governance** | Min VRT to Propose | 100 VRT | Minimum VRT to create proposals |
| **Governance** | Voting Period | 5 days | Proposal voting duration |
| **Governance** | Min Quorum | 1000 BPS (10%) | Minimum % of total VRT supply that must vote |
| **Governance** | Min VRT to Crowdfund | 5 VRT | Minimum VRT to create crowdfunding projects |
| **Insurance** | Coverage Multiplier | 3× | Coverage = premium × this number |
| **Insurance** | Policy Duration | 90 days | How long a policy is active |
| **Insurance** | Min Premium | 0.01 ETH | Minimum insurance premium |
| **Loans** | Max Loan Amount | 50 VRT | Maximum borrowable VRT |
| **Loans** | Loan Duration | 30 days | Time to repay a loan |
| **Loans** | Collateral per 10 VRT | 0.005 ETH | ETH collateral required per 10 VRT borrowed |
| **Bounties** | Bounty VRT Reward | 5 VRT | VRT minted per approved bounty submission |

### Admin-Only Actions

| Action | What It Does |
|---|---|
| **Resolve Escalated Disputes** | Enter Freelancer % to manually resolve disputes escalated to admin |
| **Withdraw Escrow Fees** | Collect accumulated platform fees |
| **Withdraw Treasury** | Withdraw ETH from governance treasury |
| **Execute Passed Proposals** | Execute proposals that have been voted and passed |
| **Withdraw Forfeited Loan Collateral** | Collect ETH from defaulted loans |
| **Mint VRT** | Mint VRT to any address (for testing/rewards) |
| **Burn VRT** | Burn VRT from any address |
| **Set Tier Thresholds** | Change Silver/Gold/Platinum VRT requirements |
| **Set Tier Fee Discounts** | Change fee discount percentages per tier |

---

## 18. Notifications

The bell icon in the navbar shows notification count. Notifications are generated automatically:

| Type | Trigger | What It Says |
|---|---|---|
| 🔔 **New Bids** | Someone bids on your open job | "X active bids on Job #Y" |
| ⚠️ **Dispute** | A dispute involves you (response/voting phase) | "Active dispute on Job #Y" |
| 💬 **Chat** | Unread messages from the other party | "Unread messages for Job #Y" |
| ⭐ **Review** | Completed job not yet reviewed | "Review pending for Job #Y" |

Click the bell to see all notifications. Click a notification to go to the relevant page. Dismiss individual notifications with the × button.

---

## 19. Quick-Reference: All Features Table

| # | Feature | Page | What It Does | Key Inputs | Key Outputs | Who Can Use |
|---|---|---|---|---|---|---|
| 1 | **Create Job** | Jobs | Post a freelance job | Title, Description, Category, Budget (ETH), Deadline (days), Expected Days, Sealed Bidding, Milestones | Job listed as "Open" | Any connected wallet |
| 2 | **Place Bid** | Jobs (detail) | Propose to do a job | Bid Amount (ETH), Completion Days, Proposal text | Bid visible to client (and others, unless sealed) | Any freelancer (not the client) |
| 3 | **Accept Bid** | Jobs (detail) | Hire a freelancer | Select bid + send ETH to escrow | Job → "In Progress", funds locked | Client only |
| 4 | **Deliver Job** | Jobs (detail) | Mark work as done | None (click button) | Job → "Delivered", 14-day timer starts | Freelancer only |
| 5 | **Complete Job** | Jobs (detail) | Accept delivery, release payment | None (click button) | ETH sent to freelancer, both earn 10 VRT | Client only |
| 6 | **Request Revision** | Jobs (detail) | Ask for changes | None | Job → back to "In Progress" | Client (when Delivered) |
| 7 | **Auto-Release** | Jobs (detail) | Force payment after 14 days | None | Job completed, freelancer paid | Anyone (after timer) |
| 8 | **Cancel Job** | Jobs (detail) | Cancel the job | None | If Open: cancelled. If In Progress: refund + 5% penalty | Client only |
| 9 | **Tip Freelancer** | Jobs (detail) | Send extra ETH bonus | ETH amount | ETH sent directly to freelancer | Client (after completion) |
| 10 | **Propose Settlement** | Jobs (detail) | Agree on partial payment | % complete, Freelancer % | If accepted: funds split per agreement | Client or Freelancer |
| 11 | **Submit Milestone** | Jobs (detail) | Submit a milestone phase | None (click button) | Milestone → "Submitted" | Freelancer |
| 12 | **Approve Milestone** | Jobs (detail) | Accept milestone work | None | Milestone ETH released, milestone → "Approved" | Client |
| 13 | **Raise Dispute** | Jobs (detail) | Start dispute process | Reason text | Dispute created, job → "Disputed" | Client or Freelancer |
| 14 | **Submit Response** | Disputes | Respond to a dispute | Response text | Dispute → "Voting Phase" | Non-initiator |
| 15 | **Submit Evidence** | Disputes | Add proof | IPFS hash/link | Evidence listed in dispute | Either party |
| 16 | **Set Proportion** | Disputes | Claim your share | Percentage (0-100%) | Demand recorded for resolution | Client or Freelancer |
| 17 | **Vote on Dispute** | Disputes | Community justice | Client / Freelancer / Re-Proportion | Vote counted, may earn 2 VRT | Any third party |
| 18 | **Resolve Dispute** | Disputes | Finalize after voting | None | Funds split per winner's demand | Anyone (after deadline) |
| 19 | **Create Bounty** | Bounties | Post a task for anyone | Title, Description, Category, Reward (ETH), Deadline, Max Winners | Bounty listed, ETH locked | Any connected wallet |
| 20 | **Submit Bounty Work** | Bounties | Submit work for a bounty | Description, IPFS Proof | Submission listed as "Pending" | Anyone (not poster) |
| 21 | **Approve/Reject Submission** | Bounties | Judge bounty work | None (click button) | Approve: winner gets ETH + 5 VRT. Reject: nothing. | Bounty poster |
| 22 | **Create Sub-Contract** | Sub-Contracts | Delegate work | Job ID, optional Address, Description, Payment (ETH) | Sub-contract created, ETH locked | Freelancer |
| 23 | **Apply for Sub-Contract** | Sub-Contracts | Apply for open listing | None (click Apply) | Application recorded | Any freelancer |
| 24 | **Approve Sub-Contract Work** | Sub-Contracts | Accept sub-contractor's delivery | None | ETH paid to sub-contractor | Primary freelancer |
| 25 | **Create Proposal** | Governance | Propose platform change | Title, Description | Proposal → "Active", voting opens | Users with ≥100 VRT |
| 26 | **Vote on Proposal** | Governance | Vote For or Against | For / Against | Vote recorded (VRT-weighted) | Any VRT holder |
| 27 | **Create Crowdfund** | Crowdfunding | Start a fundraiser | Title, Description, Category, Proof Link, Goal (ETH), Duration (days) | Campaign listed as "Active" | Users with ≥5 VRT |
| 28 | **Contribute to Crowdfund** | Crowdfunding | Fund a project | ETH amount | Progress bar updates. Auto-"Funded" when goal met. | Anyone (not creator) |
| 29 | **Buy Insurance** | Insurance | Protect against non-payment | Premium (ETH, min 0.01) | Policy created: coverage = premium × 3, valid 90 days | Any freelancer |
| 30 | **Withdraw Insurance Premium** | Insurance | Get premium back | None | Premium ETH returned | Policy owner (if expired + unclaimed) |
| 31 | **Take VRT Loan** | Loans | Borrow temporary VRT | VRT amount (max 50) + ETH collateral | VRT minted to wallet, 30-day timer | Anyone without active loan |
| 32 | **Repay Loan** | Loans | Return borrowed VRT | VRT amount to repay | VRT burned. Full repay → collateral returned | Loan borrower |
| 33 | **Create Profile** | Profile | Set up identity | Name, Bio, Skills | Profile visible on-chain | Any connected wallet |
| 34 | **Write Review** | Jobs/Profile | Rate the other party | Stars (1-5), Comment | Review on reviewee's profile (permanent) | After job completion |
| 35 | **Endorse Skill** | Profile | Vouch for someone's skill | Skill name, optional Job ID | Endorsement on their profile | Any user (not self) |
| 36 | **Add Portfolio** | Profile | Showcase work | Title, IPFS link, optional Job ID | Portfolio item on your profile | Profile owner |
| 37 | **Chat** | Chat | Message the other party | Text message, optional file (≤1MB) | Chat bubbles with timestamps | Client + Freelancer |
| 38 | **Task Board** | Jobs (detail) | Track sub-tasks | Task name | Kanban board: To Do / In Progress / Done | Freelancer (edit), Client (view) |

---

## Platform Fee Structure

| Item | Rate |
|---|---|
| **Base platform fee** | 2% of freelancer's payment |
| **Fee discount (Silver)** | 25% off → effective 1.5% |
| **Fee discount (Gold)** | 50% off → effective 1.0% |
| **Fee discount (Platinum)** | 75% off → effective 0.5% |
| **Cancellation penalty** | 5% of escrow amount (when client cancels In Progress job) |
| **Where fees go** | Governance Treasury |

---

## Glossary

| Term | Meaning |
|---|---|
| **ETH** | Ether — the cryptocurrency used for all payments |
| **VRT** | Verity Reputation Token — earned by working, cannot be transferred |
| **Escrow** | Smart contract vault that holds payment until work is verified |
| **Soulbound** | Token that is permanently attached to your wallet and cannot be sent to anyone |
| **Gas Fee** | Small ETH cost for every blockchain transaction (paid to network validators) |
| **IPFS** | Decentralized file storage — integrated via Pinata; files are uploaded directly from the website and pinned automatically |
| **BPS** | Basis Points — 100 BPS = 1%, 500 BPS = 5%, 10000 BPS = 100% |
| **Quorum** | Minimum voting participation required for a result to be valid |
| **DAO** | Decentralized Autonomous Organization — community-governed entity |
| **Sealed Bidding** | Bid privacy mode where freelancers can't see each other's bids |
| **Re-Proportion** | A dispute vote option that resets voting and lets parties adjust demands |
| **Tier** | Your reputation level (Bronze → Silver → Gold → Platinum) |

---

*Last updated: March 2026 — Generated from the Verity smart contracts and frontend source code.*

---

## Appendix: Architecture & IPFS Integration

### Storage Architecture

The project follows the standard Web3 storage pattern:

| What | Where | Why |
|---|---|---|
| Job data, bids, escrow, wallet addresses | **Blockchain** (smart contracts) | Immutable, trustless, verifiable |
| Profile images, resumes, portfolio files, evidence | **IPFS** (via Pinata) | Large files, decentralized, content-addressed |
| CID references (pointers to IPFS files) | **Blockchain** (stored in smart contracts) | Links on-chain data to off-chain files |
| Chat messages | **Browser localStorage** | Ephemeral, per-device |

### IPFS Upload Flow

```
User selects file → Frontend component → POST /api/upload → Pinata API → IPFS pin → CID returned
                                                                                        ↓
                                                           CID stored on-chain via smart contract
                                                                                        ↓
                                                           File displayed via gateway: gateway.pinata.cloud/ipfs/<CID>
```

### Smart Contracts That Store IPFS CIDs

| Contract | Function | What It Stores |
|---|---|---|
| `UserProfile.sol` | `setAvatar(ipfsHash)` | Profile picture CID |
| `UserProfile.sol` | `addPortfolioItem(title, ipfsHash, jobId)` | Portfolio file CID |
| `DisputeResolution.sol` | `submitEvidence(disputeId, ipfsHash)` | Dispute evidence CID |
| `BountyBoard.sol` | `submitWork(bountyId, desc, ipfsProof)` | Bounty proof CID |

### Supported Networks

| Network | Chain ID | Type | Faucet |
|---|---|---|---|
| Polygon Amoy | 80002 | Testnet (recommended) | https://faucet.polygon.technology/ |
| Base Sepolia | 84532 | L2 Testnet | https://www.alchemy.com/faucets/base-sepolia |
| Ethereum Sepolia | 11155111 | Testnet | https://sepoliafaucet.com |
| Hardhat Local | 31337 | Local (dev only) | Pre-funded test accounts |

### Key Files Added/Modified

| File | Purpose |
|---|---|
| `frontend/app/api/upload/route.ts` | Server-side file upload proxy to Pinata |
| `frontend/app/api/upload-json/route.ts` | Server-side JSON metadata upload to Pinata |
| `frontend/lib/ipfs.ts` | IPFS utility functions (gateway resolution, CID extraction) |
| `frontend/hooks/useIpfsUpload.ts` | React hook for uploading files/JSON to IPFS |
| `frontend/components/IpfsFileUpload.tsx` | Drag-and-drop file upload component |
| `frontend/.env.example` | Template for all environment variables |
| `contracts/.env.example` | Updated with Amoy + Base Sepolia RPC URLs |
| `contracts/hardhat.config.ts` | Added Polygon Amoy + Base Sepolia networks |
