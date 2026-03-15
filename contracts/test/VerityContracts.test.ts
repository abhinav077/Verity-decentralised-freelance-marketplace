import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  VRTToken,
  JobMarket,
  Escrow,
  DisputeResolution,
  UserProfile,
  Governance,
} from "../typechain-types";

describe("Verity DFM Contracts", function () {
  let vrt: VRTToken;
  let jobMarket: JobMarket;
  let escrow: Escrow;
  let dispute: DisputeResolution;
  let userProfile: UserProfile;
  let governance: Governance;

  let owner: any;
  let client: any;
  let freelancer: any;
  let voter1: any;
  let voter2: any;
  let voter3: any;

  const futureDeadline = () => Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  const ETH = (n: string | number) => ethers.parseEther(String(n));

  beforeEach(async function () {
    [owner, client, freelancer, voter1, voter2, voter3] =
      await ethers.getSigners();

    // ── Deploy ───────────────────────────────────────────────────────────
    vrt = await (await ethers.getContractFactory("VRTToken")).deploy();
    jobMarket = await (await ethers.getContractFactory("JobMarket")).deploy();
    escrow = await (await ethers.getContractFactory("Escrow")).deploy();
    dispute = await (await ethers.getContractFactory("DisputeResolution")).deploy();
    userProfile = await (await ethers.getContractFactory("UserProfile")).deploy();
    governance = await (await ethers.getContractFactory("Governance")).deploy();

    await Promise.all([
      vrt.waitForDeployment(),
      jobMarket.waitForDeployment(),
      escrow.waitForDeployment(),
      dispute.waitForDeployment(),
      userProfile.waitForDeployment(),
      governance.waitForDeployment(),
    ]);

    const [vrtA, jmA, esA, drA, upA, govA] = await Promise.all([
      vrt.getAddress(),
      jobMarket.getAddress(),
      escrow.getAddress(),
      dispute.getAddress(),
      userProfile.getAddress(),
      governance.getAddress(),
    ]);

    // ── Wire relationships ───────────────────────────────────────────────
    const MINTER = await vrt.MINTER_ROLE();
    await vrt.grantRole(MINTER, jmA);
    await vrt.grantRole(MINTER, drA);

    await jobMarket.setVRTToken(vrtA);
    await jobMarket.setEscrowContract(esA);
    await jobMarket.setDisputeResolutionContract(drA);
    await jobMarket.setGovernanceContract(govA);

    await escrow.setJobMarketContract(jmA);
    await escrow.setDisputeResolutionContract(drA);
    await escrow.setVRTToken(vrtA);
    await escrow.setGovernanceContract(govA);

    await dispute.setJobMarketContract(jmA);
    await dispute.setEscrowContract(esA);
    await dispute.setVRTToken(vrtA);

    await userProfile.setJobMarketContract(jmA);
    await governance.setVRTToken(vrtA);
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  VRTToken
  // ═════════════════════════════════════════════════════════════════════════

  describe("VRTToken", () => {
    it("has correct name and symbol", async () => {
      expect(await vrt.name()).to.equal("Verity Reputation Token");
      expect(await vrt.symbol()).to.equal("VRT");
    });

    it("mints tokens", async () => {
      await vrt.mint(client.address, ETH("10"));
      expect(await vrt.balanceOf(client.address)).to.equal(ETH("10"));
    });

    it("burns tokens", async () => {
      await vrt.mint(client.address, ETH("10"));
      await vrt.burn(client.address, ETH("4"));
      expect(await vrt.balanceOf(client.address)).to.equal(ETH("6"));
    });

    it("is soulbound (no transfers)", async () => {
      await vrt.mint(client.address, ETH("10"));
      await expect(
        vrt.connect(client).transfer(freelancer.address, ETH("1"))
      ).to.be.revertedWith("VRT: soulbound - cannot transfer");
    });

    it("is soulbound (no approvals)", async () => {
      await expect(
        vrt.connect(client).approve(freelancer.address, ETH("1"))
      ).to.be.revertedWith("VRT: soulbound - cannot approve");
    });

    it("calculates tiers correctly", async () => {
      // Bronze
      expect(await vrt.getTier(client.address)).to.equal(0);
      // Silver
      await vrt.mint(client.address, ETH("50"));
      expect(await vrt.getTier(client.address)).to.equal(1);
      // Gold
      await vrt.mint(client.address, ETH("150"));
      expect(await vrt.getTier(client.address)).to.equal(2);
      // Platinum
      await vrt.mint(client.address, ETH("300"));
      expect(await vrt.getTier(client.address)).to.equal(3);
    });

    it("returns correct fee discounts", async () => {
      expect(await vrt.getFeeDiscount(client.address)).to.equal(0);
      await vrt.mint(client.address, ETH("50"));
      expect(await vrt.getFeeDiscount(client.address)).to.equal(2500);
      await vrt.mint(client.address, ETH("150"));
      expect(await vrt.getFeeDiscount(client.address)).to.equal(5000);
      await vrt.mint(client.address, ETH("300"));
      expect(await vrt.getFeeDiscount(client.address)).to.equal(7500);
    });

    it("tracks totalEarned", async () => {
      await vrt.mint(client.address, ETH("100"));
      await vrt.burn(client.address, ETH("30"));
      expect(await vrt.totalEarned(client.address)).to.equal(ETH("100"));
    });

    it("rejects non-minter", async () => {
      await expect(
        vrt.connect(client).mint(client.address, ETH("10"))
      ).to.be.reverted;
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  JobMarket – basic flow
  // ═════════════════════════════════════════════════════════════════════════

  describe("JobMarket", () => {
    const createBasicJob = async () => {
      const tx = await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "Build a website",
          "Need a React site",
          "Web Dev",
          ETH("1"),
          futureDeadline()
        );
      await tx.wait();
      return 1;
    };

    it("creates a job", async () => {
      const id = await createBasicJob();
      const job = await jobMarket.getJob(id);
      expect(job.title).to.equal("Build a website");
      expect(job.client).to.equal(client.address);
      expect(job.status).to.equal(0); // Open
    });

    it("places a bid", async () => {
      await createBasicJob();
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "I can do it");
      const bids = await jobMarket.getJobBids(1);
      expect(bids.length).to.equal(1);
      expect(bids[0].freelancer).to.equal(freelancer.address);
    });

    it("B3 – prevents duplicate bids", async () => {
      await createBasicJob();
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "First bid");
      await expect(
        jobMarket.connect(freelancer).placeBid(1, ETH("0.7"), "Second bid")
      ).to.be.revertedWith("Already bid");
    });

    it("B2 – allows bid withdrawal", async () => {
      await createBasicJob();
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "My bid");
      await jobMarket.connect(freelancer).withdrawBid(1);
      // Can bid again after withdrawal
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.7"), "New bid");
    });

    it("accepts a bid and deposits to escrow", async () => {
      await createBasicJob();
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "Will do");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("0.8") });
      const job = await jobMarket.getJob(1);
      expect(job.status).to.equal(1); // InProgress
      expect(job.selectedFreelancer).to.equal(freelancer.address);
    });

    it("completes a job (non-milestone)", async () => {
      await createBasicJob();
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "Will do");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("0.8") });
      const balBefore = await ethers.provider.getBalance(freelancer.address);
      await jobMarket.connect(client).completeJob(1);
      const balAfter = await ethers.provider.getBalance(freelancer.address);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("A1 – uses bid amount, not budget", async () => {
      await createBasicJob();
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "Will do");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("0.8") });
      await jobMarket.connect(client).completeJob(1);
      const profile = await jobMarket.getUserProfile(freelancer.address);
      expect(profile.totalEarned).to.equal(ETH("0.8"));
    });

    it("B4 – rejects bids after deadline", async () => {
      const latestBlock = await ethers.provider.getBlock("latest");
      const deadline = latestBlock!.timestamp + 60;
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "Quick job", "Desc", "Cat", ETH("1"), deadline
        );
      await time.increase(120);
      await expect(
        jobMarket.connect(freelancer).placeBid(1, ETH("0.5"), "Late bid")
      ).to.be.revertedWith("Deadline passed");
    });

    it("B6 – cancel open job (no penalty)", async () => {
      await createBasicJob();
      await jobMarket.connect(client).cancelJob(1);
      expect((await jobMarket.getJob(1)).status).to.equal(3); // Cancelled
    });

    it("B7 – tip after completion", async () => {
      await createBasicJob();
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "x");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("0.8") });
      await jobMarket.connect(client).completeJob(1);
      const bal = await ethers.provider.getBalance(freelancer.address);
      await jobMarket.connect(client).tipFreelancer(1, { value: ETH("0.1") });
      expect(await ethers.provider.getBalance(freelancer.address)).to.be.gt(bal);
    });

    it("B10 – deliver → auto-release after 14 days", async () => {
      await createBasicJob();
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "x");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("0.8") });
      await jobMarket.connect(freelancer).deliverJob(1, "QmDeliveryProof");
      expect((await jobMarket.getJob(1)).status).to.equal(5); // Delivered
      await time.increase(14 * 24 * 60 * 60 + 1);
      await jobMarket.autoReleasePayment(1);
      expect((await jobMarket.getJob(1)).status).to.equal(2); // Completed
    });

    it("B9 – VRT minimum to bid", async () => {
      await jobMarket.setMinVrtToBid(ETH("5"));
      await createBasicJob();
      await expect(
        jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "x")
      ).to.be.revertedWith("VRT too low");
      // Mint enough VRT and try again
      await vrt.mint(freelancer.address, ETH("5"));
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "Now OK");
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  JobMarket – milestones (B1)
  // ═════════════════════════════════════════════════════════════════════════

  describe("Milestones (B1)", () => {
    const createMilestoneJob = async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256,uint256,bool,uint256[],string[])"](
          "MS Job", "Desc", "Cat", ETH("1"), futureDeadline(),
          0, false,
          [ETH("0.4"), ETH("0.6")],
          ["Design", "Development"]
        );
      return 1;
    };

    it("creates job with milestones", async () => {
      const id = await createMilestoneJob();
      const ms = await jobMarket.getJobMilestones(id);
      expect(ms.length).to.equal(2);
      expect(ms[0].title).to.equal("Design");
      expect(ms[0].amount).to.equal(ETH("0.4"));
      expect(ms[1].title).to.equal("Development");
    });

    it("submit + approve milestone releases partial payment", async () => {
      const id = await createMilestoneJob();
      await jobMarket.connect(freelancer).placeBid(id, ETH("1"), "OK");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });

      // Freelancer submits milestone 0
      await jobMarket.connect(freelancer).submitMilestone(id, 0, "cid://ms-0");
      // Client approves → releases 0.4 ETH
      const bal = await ethers.provider.getBalance(freelancer.address);
      await jobMarket.connect(client).approveMilestone(id, 0);
      expect(await ethers.provider.getBalance(freelancer.address)).to.be.gt(bal);
    });

    it("requires explicit client completion after all milestones approved", async () => {
      const id = await createMilestoneJob();
      await jobMarket.connect(freelancer).placeBid(id, ETH("1"), "OK");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });

      await jobMarket.connect(freelancer).submitMilestone(id, 0, "cid://ms-0");
      await jobMarket.connect(client).approveMilestone(id, 0);
      await jobMarket.connect(freelancer).submitMilestone(id, 1, "cid://ms-1");
      await jobMarket.connect(client).approveMilestone(id, 1);

      // Final completion is explicit after milestone approvals.
      await jobMarket.connect(client).completeJob(id);

      const job = await jobMarket.getJob(id);
      expect(job.status).to.equal(2); // Completed
    });

    it("rejects milestones that don't sum to budget", async () => {
      await expect(
        jobMarket
          .connect(client)
          ["createJob(string,string,string,uint256,uint256,uint256,bool,uint256[],string[])"](
            "Bad MS", "D", "C", ETH("1"), futureDeadline(),
            0, false, [ETH("0.3"), ETH("0.3")], ["A", "B"]
          )
      ).to.be.revertedWith("Milestones must sum to budget");
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  Escrow
  // ═════════════════════════════════════════════════════════════════════════

  describe("Escrow", () => {
    it("reports balance after deposit", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "J", "D", "C", ETH("1"), futureDeadline()
        );
      await jobMarket.connect(freelancer).placeBid(1, ETH("0.8"), "x");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("0.8") });
      expect(await escrow.getBalance(1)).to.equal(ETH("0.8"));
    });

    it("applies 2 % platform fee", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "J", "D", "C", ETH("1"), futureDeadline()
        );
      await jobMarket.connect(freelancer).placeBid(1, ETH("1"), "x");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });

      const bal0 = await ethers.provider.getBalance(freelancer.address);
      await jobMarket.connect(client).completeJob(1);
      const bal1 = await ethers.provider.getBalance(freelancer.address);
      // Freelancer gets 0.98 ETH (2 % fee)
      const diff = bal1 - bal0;
      expect(diff).to.be.closeTo(ETH("0.98"), ETH("0.001"));
    });

    it("A4 – admin can withdraw accumulated fees", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "J", "D", "C", ETH("1"), futureDeadline()
        );
      await jobMarket.connect(freelancer).placeBid(1, ETH("1"), "x");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });
      await jobMarket.connect(client).completeJob(1);

      const fees = await escrow.collectedFees();
      expect(fees).to.be.gt(0);
      await escrow.withdrawFees();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  DisputeResolution
  // ═════════════════════════════════════════════════════════════════════════

  describe("DisputeResolution", () => {
    // Helper: creates job, bid, accept → InProgress
    const setupInProgressJob = async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "J", "D", "C", ETH("1"), futureDeadline()
        );
      await jobMarket.connect(freelancer).placeBid(1, ETH("1"), "x");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });
    };

    it("raises a dispute", async () => {
      await setupInProgressJob();
      await dispute
        .connect(client)
        .raiseDispute(1, client.address, freelancer.address, "Work is bad");
      const d = await dispute.getDispute(1);
      expect(d.reason).to.equal("Work is bad");
      expect(d.status).to.equal(1); // ResponsePhase
    });

    it("A3 – parties cannot vote", async () => {
      await setupInProgressJob();
      await dispute.connect(client).raiseDispute(1, client.address, freelancer.address, "Bad");
      await dispute.connect(freelancer).submitResponse(1, "Not bad");

      await expect(
        dispute.connect(client).castVote(1, 0)
      ).to.be.revertedWith("Party cannot vote");
    });

    it("C2 – submit evidence", async () => {
      await setupInProgressJob();
      await dispute.connect(client).raiseDispute(1, client.address, freelancer.address, "Bad");
      await dispute.connect(client).submitEvidence(1, "QmHashOfProof123");
      const ev = await dispute.getEvidence(1);
      expect(ev.length).to.equal(1);
      expect(ev[0].ipfsHash).to.equal("QmHashOfProof123");
    });

    it("C5 – direct voting flow", async () => {
      await setupInProgressJob();
      await dispute.connect(client).raiseDispute(1, client.address, freelancer.address, "Bad");
      await dispute.connect(freelancer).submitResponse(1, "Not bad");

      // Cast direct votes
      await dispute.connect(voter1).castVote(1, 0); // Client
      await dispute.connect(voter2).castVote(1, 1); // Freelancer

      // Advance past voting period (5 days)
      await time.increase(5 * 24 * 60 * 60 + 1);

      // Tied votes — client wins ties
      await dispute.resolveDispute(1);
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(3); // Resolved
    });

    it("C7 – auto-resolve after 14 days", async () => {
      await setupInProgressJob();
      await dispute.connect(client).raiseDispute(1, client.address, freelancer.address, "Bad");
      // Don't respond, don't vote — wait 14 days
      await time.increase(14 * 24 * 60 * 60 + 1);
      await dispute.autoResolveDispute(1);
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(4); // AutoResolved
      // Respondent (freelancer) wins since client initiated
      expect(d.clientWon).to.equal(false);
    });

    it("allows initiator to withdraw dispute", async () => {
      await setupInProgressJob();
      await dispute.connect(client).raiseDispute(1, client.address, freelancer.address, "Bad");
      await dispute.connect(client).withdrawDispute(1);
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(5); // Withdrawn
    });

    it("C8 – admin split resolution", async () => {
      await setupInProgressJob();
      await dispute.connect(client).raiseDispute(1, client.address, freelancer.address, "Bad");
      await dispute.connect(freelancer).submitResponse(1, "My side");
      await dispute.resolveWithSplit(1, 60); // 60% client, 40% freelancer
      const d = await dispute.getDispute(1);
      expect(d.clientPercent).to.equal(60);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  UserProfile
  // ═════════════════════════════════════════════════════════════════════════

  describe("UserProfile", () => {
    it("creates a profile", async () => {
      await userProfile.connect(client).createProfile("Alice", "Dev", ["React", "Solidity"]);
      const p = await userProfile.getProfile(client.address);
      expect(p.name).to.equal("Alice");
      expect(p.exists).to.equal(true);
    });

    it("updates a profile", async () => {
      await userProfile.connect(client).createProfile("Alice", "Dev", ["React"]);
      await userProfile.connect(client).updateProfile("Alice B", "Sr Dev", ["React", "Node"]);
      expect((await userProfile.getProfile(client.address)).bio).to.equal("Sr Dev");
    });

    it("submits reviews (D7 – bidirectional)", async () => {
      await userProfile.connect(client).submitReview(1, freelancer.address, 5, "Great work");
      await userProfile.connect(freelancer).submitReview(1, client.address, 4, "Good client");
      expect((await userProfile.getReviews(freelancer.address)).length).to.equal(1);
      expect((await userProfile.getReviews(client.address)).length).to.equal(1);
    });

    it("D1 – skill endorsements", async () => {
      await userProfile.connect(client).endorseSkill(freelancer.address, "Solidity", 1);
      const e = await userProfile.getEndorsements(freelancer.address);
      expect(e.length).to.equal(1);
      expect(e[0].skill).to.equal("Solidity");
    });

    it("D2 – portfolio items", async () => {
      await userProfile.connect(freelancer).createProfile("Bob", "Dev", ["Solidity"]);
      await userProfile.connect(freelancer).addPortfolioItem("DeFi App", "QmHash123", 1);
      const p = await userProfile.getPortfolio(freelancer.address);
      expect(p.length).to.equal(1);
    });

    it("average rating calculation", async () => {
      await userProfile.connect(client).submitReview(1, freelancer.address, 5, "A");
      await userProfile.connect(voter1).submitReview(2, freelancer.address, 3, "B");
      // (5+3)/2 * 100 = 400
      expect(await userProfile.getAverageRating(freelancer.address)).to.equal(400);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  Governance
  // ═════════════════════════════════════════════════════════════════════════

  describe("Governance", () => {
    it("G2 – receives ETH in treasury", async () => {
      await owner.sendTransaction({
        to: await governance.getAddress(),
        value: ETH("1"),
      });
      expect(await governance.treasuryBalance()).to.equal(ETH("1"));
    });

    it("G1 – create & vote on proposal", async () => {
      await vrt.mint(client.address, ETH("100"));
      await governance
        .connect(client)
        .createProposal("Raise fee", "Raise to 3%", ethers.ZeroAddress, "0x");
      const p = await governance.getProposal(1);
      expect(p.title).to.equal("Raise fee");

      await governance.connect(client).voteOnProposal(1, true);
      const p2 = await governance.getProposal(1);
      expect(p2.forVotes).to.be.gt(0);
    });

    it("G1 – finalize proposal", async () => {
      await vrt.mint(client.address, ETH("100"));
      await governance
        .connect(client)
        .createProposal("Test", "D", ethers.ZeroAddress, "0x");
      await governance.connect(client).voteOnProposal(1, true);
      await time.increase(5 * 24 * 60 * 60 + 1);
      await governance.finalizeProposal(1);
      expect((await governance.getProposal(1)).status).to.equal(1); // Passed
    });

    it("requires VRT to propose", async () => {
      await expect(
        governance.connect(client).createProposal("X", "Y", ethers.ZeroAddress, "0x")
      ).to.be.revertedWith("Need 100 VRT");
    });

    it("admin can withdraw treasury", async () => {
      await owner.sendTransaction({
        to: await governance.getAddress(),
        value: ETH("2"),
      });
      await governance.withdrawTreasury(owner.address, ETH("1"));
      expect(await governance.treasuryBalance()).to.equal(ETH("1"));
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  Integration: full job lifecycle
  // ═════════════════════════════════════════════════════════════════════════

  describe("Integration", () => {
    it("full lifecycle: create → bid → accept → milestones → complete", async () => {
      // Create  job with 2 milestones
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256,uint256,bool,uint256[],string[])"](
          "Full Job", "End to end", "Dev", ETH("2"), futureDeadline(),
          0, false,
          [ETH("0.8"), ETH("1.2")],
          ["Phase 1", "Phase 2"]
        );

      // Bid + accept
      await jobMarket.connect(freelancer).placeBid(1, ETH("2"), "All in");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("2") });

      // Milestone 1
      await jobMarket.connect(freelancer).submitMilestone(1, 0, "cid://phase-1");
      await jobMarket.connect(client).approveMilestone(1, 0);

      // Milestone 2
      await jobMarket.connect(freelancer).submitMilestone(1, 1, "cid://phase-2");
      await jobMarket.connect(client).approveMilestone(1, 1);

      await jobMarket.connect(client).completeJob(1);

      // Verify completed
      const job = await jobMarket.getJob(1);
      expect(job.status).to.equal(2); // Completed

      // Both got VRT reputation
      expect(await vrt.balanceOf(freelancer.address)).to.equal(ETH("10"));
      expect(await vrt.balanceOf(client.address)).to.equal(ETH("10"));
    });
  });
});
