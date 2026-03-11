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
  BountyBoard,
  SubContracting,
} from "../typechain-types";

describe("New Features Tests", function () {
  let vrt: VRTToken;
  let jobMarket: JobMarket;
  let escrow: Escrow;
  let dispute: DisputeResolution;
  let userProfile: UserProfile;
  let governance: Governance;
  let bountyBoard: BountyBoard;
  let subContracting: SubContracting;

  let owner: any;
  let client: any;
  let freelancer: any;
  let voter1: any;
  let voter2: any;
  let voter3: any;
  let sub: any;

  const futureDeadline = () =>
    Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  const ETH = (n: string | number) => ethers.parseEther(String(n));

  beforeEach(async function () {
    [owner, client, freelancer, voter1, voter2, voter3, sub] =
      await ethers.getSigners();

    vrt = await (await ethers.getContractFactory("VRTToken")).deploy();
    jobMarket = await (await ethers.getContractFactory("JobMarket")).deploy();
    escrow = await (await ethers.getContractFactory("Escrow")).deploy();
    dispute = await (
      await ethers.getContractFactory("DisputeResolution")
    ).deploy();
    userProfile = await (
      await ethers.getContractFactory("UserProfile")
    ).deploy();
    governance = await (
      await ethers.getContractFactory("Governance")
    ).deploy();
    bountyBoard = await (
      await ethers.getContractFactory("BountyBoard")
    ).deploy();
    subContracting = await (
      await ethers.getContractFactory("SubContracting")
    ).deploy();

    await Promise.all([
      vrt.waitForDeployment(),
      jobMarket.waitForDeployment(),
      escrow.waitForDeployment(),
      dispute.waitForDeployment(),
      userProfile.waitForDeployment(),
      governance.waitForDeployment(),
      bountyBoard.waitForDeployment(),
      subContracting.waitForDeployment(),
    ]);

    const [vrtA, jmA, esA, drA, upA, govA, bbA, scA] = await Promise.all(
      [
        vrt.getAddress(),
        jobMarket.getAddress(),
        escrow.getAddress(),
        dispute.getAddress(),
        userProfile.getAddress(),
        governance.getAddress(),
        bountyBoard.getAddress(),
        subContracting.getAddress(),
      ]
    );

    const MINTER = await vrt.MINTER_ROLE();
    await vrt.grantRole(MINTER, jmA);
    await vrt.grantRole(MINTER, drA);
    await vrt.grantRole(MINTER, bbA);

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

    await bountyBoard.setVRTToken(vrtA);
    // SubContracting is standalone — no wiring needed
  });

  // =========================================================================
  // Direct Voting Dispute Resolution
  // =========================================================================
  describe("Direct Voting Dispute Resolution", () => {
    const setupDisputeInVoting = async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "J",
          "D",
          "C",
          ETH("1"),
          futureDeadline()
        );
      await jobMarket
        .connect(freelancer)
        ["placeBid(uint256,uint256,string)"](1, ETH("1"), "proposal");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });
      await dispute
        .connect(client)
        .raiseDispute(1, client.address, freelancer.address, "Bad work");
      await dispute.connect(freelancer).submitResponse(1, "Not bad");
    };

    it("creates dispute in ResponsePhase", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "J",
          "D",
          "C",
          ETH("1"),
          futureDeadline()
        );
      await jobMarket
        .connect(freelancer)
        ["placeBid(uint256,uint256,string)"](1, ETH("1"), "p");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });
      await dispute
        .connect(client)
        .raiseDispute(1, client.address, freelancer.address, "issue");
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(1); // ResponsePhase
    });

    it("response moves dispute to VotingPhase", async () => {
      await setupDisputeInVoting();
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(2); // VotingPhase
    });

    it("advance to voting after 3-day response deadline", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "J",
          "D",
          "C",
          ETH("1"),
          futureDeadline()
        );
      await jobMarket
        .connect(freelancer)
        ["placeBid(uint256,uint256,string)"](1, ETH("1"), "p");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });
      await dispute
        .connect(client)
        .raiseDispute(1, client.address, freelancer.address, "issue");
      await time.increase(3 * 24 * 60 * 60 + 1);
      await dispute.advanceToVotingPhase(1);
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(2);
    });

    it("voters can cast direct votes", async () => {
      await setupDisputeInVoting();
      await dispute.connect(voter1).castVote(1, 0); // Client
      await dispute.connect(voter2).castVote(1, 1); // Freelancer
      const d = await dispute.getDispute(1);
      expect(d.clientVotes).to.equal(1);
      expect(d.freelancerVotes).to.equal(1);
      expect(d.totalVoters).to.equal(2);
    });

    it("parties cannot vote on their own dispute", async () => {
      await setupDisputeInVoting();
      await expect(
        dispute.connect(client).castVote(1, 0)
      ).to.be.revertedWith("Party cannot vote");
    });

    it("cannot vote twice in same round", async () => {
      await setupDisputeInVoting();
      await dispute.connect(voter1).castVote(1, 0);
      await expect(
        dispute.connect(voter1).castVote(1, 1)
      ).to.be.revertedWith("Already voted");
    });

    it("parties set proportion demands", async () => {
      await setupDisputeInVoting();
      await dispute.connect(freelancer).setProportionDemand(1, 30);
      await dispute.connect(client).setProportionDemand(1, 85);
      const d = await dispute.getDispute(1);
      expect(d.freelancerDemandPct).to.equal(30);
      expect(d.clientDemandPct).to.equal(85);
    });

    it("resolves with client win using client demand", async () => {
      await setupDisputeInVoting();
      await dispute.connect(client).setProportionDemand(1, 80);
      await dispute.connect(freelancer).setProportionDemand(1, 40);
      await dispute.connect(voter1).castVote(1, 0); // Client
      await dispute.connect(voter2).castVote(1, 0); // Client
      await dispute.connect(voter3).castVote(1, 1); // Freelancer
      await time.increase(5 * 24 * 60 * 60 + 1);
      await dispute.resolveDispute(1);
      const d = await dispute.getDispute(1);
      expect(d.clientWon).to.equal(true);
      expect(d.clientPercent).to.equal(80);
      expect(d.status).to.equal(3); // Resolved
    });

    it("resolves with freelancer win using freelancer demand", async () => {
      await setupDisputeInVoting();
      await dispute.connect(freelancer).setProportionDemand(1, 60);
      await dispute.connect(client).setProportionDemand(1, 70);
      await dispute.connect(voter1).castVote(1, 1); // Freelancer
      await dispute.connect(voter2).castVote(1, 1); // Freelancer
      await dispute.connect(voter3).castVote(1, 0); // Client
      await time.increase(5 * 24 * 60 * 60 + 1);
      await dispute.resolveDispute(1);
      const d = await dispute.getDispute(1);
      expect(d.clientWon).to.equal(false);
      expect(d.clientPercent).to.equal(40); // 100 - 60
    });

    it("re-proportion vote resets round", async () => {
      await setupDisputeInVoting();
      await dispute.connect(voter1).castVote(1, 2); // ReProportion
      await dispute.connect(voter2).castVote(1, 2); // ReProportion
      await dispute.connect(voter3).castVote(1, 0); // Client
      await time.increase(5 * 24 * 60 * 60 + 1);
      await dispute.resolveDispute(1);
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(2); // Still VotingPhase (new round)
      expect(d.votingRound).to.equal(2);
      expect(d.clientVotes).to.equal(0);
      expect(d.totalVoters).to.equal(0);
    });

    it("no demand set means winner takes all", async () => {
      await setupDisputeInVoting();
      await dispute.connect(voter1).castVote(1, 0);
      await time.increase(5 * 24 * 60 * 60 + 1);
      await dispute.resolveDispute(1);
      const d = await dispute.getDispute(1);
      expect(d.clientWon).to.equal(true);
      expect(d.clientPercent).to.equal(100);
    });

    it("cannot resolve with no votes", async () => {
      await setupDisputeInVoting();
      await time.increase(5 * 24 * 60 * 60 + 1);
      await expect(dispute.resolveDispute(1)).to.be.revertedWith(
        "No votes - escalate to admin"
      );
    });

    it("escalate to admin when no votes", async () => {
      await setupDisputeInVoting();
      await time.increase(5 * 24 * 60 * 60 + 1);
      await dispute.connect(client).escalateToAdmin(1);
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(6); // EscalatedToAdmin
    });

    it("escalate when no response after 3 days", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "J",
          "D",
          "C",
          ETH("1"),
          futureDeadline()
        );
      await jobMarket
        .connect(freelancer)
        ["placeBid(uint256,uint256,string)"](1, ETH("1"), "p");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });
      await dispute
        .connect(client)
        .raiseDispute(1, client.address, freelancer.address, "issue");
      await time.increase(3 * 24 * 60 * 60 + 1);
      await dispute.connect(client).escalateToAdmin(1);
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(6);
    });

    it("admin resolves escalated dispute", async () => {
      await setupDisputeInVoting();
      await time.increase(5 * 24 * 60 * 60 + 1);
      await dispute.connect(client).escalateToAdmin(1);
      await dispute.resolveEscalatedDispute(1, 30); // 30% to freelancer
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(3); // Resolved
      expect(d.clientPercent).to.equal(70);
      expect(d.clientWon).to.equal(true);
    });

    it("non-admin cannot resolve escalated dispute", async () => {
      await setupDisputeInVoting();
      await time.increase(5 * 24 * 60 * 60 + 1);
      await dispute.connect(client).escalateToAdmin(1);
      await expect(
        dispute.connect(client).resolveEscalatedDispute(1, 50)
      ).to.be.reverted;
    });

    it("withdraw dispute restores job to InProgress", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "J",
          "D",
          "C",
          ETH("1"),
          futureDeadline()
        );
      await jobMarket
        .connect(freelancer)
        ["placeBid(uint256,uint256,string)"](1, ETH("1"), "p");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });
      await dispute
        .connect(client)
        .raiseDispute(1, client.address, freelancer.address, "issue");
      await dispute.connect(client).withdrawDispute(1);
      const d = await dispute.getDispute(1);
      expect(d.status).to.equal(5); // Withdrawn
      const job = await jobMarket.getJob(1);
      expect(job.status).to.equal(1); // InProgress
    });

    it("vote tallies view returns correct counts", async () => {
      await setupDisputeInVoting();
      await dispute.connect(voter1).castVote(1, 0); // Client
      await dispute.connect(voter2).castVote(1, 1); // Freelancer
      await dispute.connect(voter3).castVote(1, 2); // ReProportion
      const [cVotes, fVotes, rpVotes] = await dispute.getVoteTallies(1);
      expect(cVotes).to.equal(1);
      expect(fVotes).to.equal(1);
      expect(rpVotes).to.equal(1);
    });
  });

  // =========================================================================
  // Settlement System
  // =========================================================================
  describe("Settlement System", () => {
    beforeEach(async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "J",
          "D",
          "C",
          ETH("1"),
          futureDeadline()
        );
      await jobMarket
        .connect(freelancer)
        ["placeBid(uint256,uint256,string)"](1, ETH("1"), "x");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });
    });

    it("client requests settlement", async () => {
      await jobMarket.connect(client).requestSettlement(1, 50, 40);
      const s = await jobMarket.getSettlement(1);
      expect(s.active).to.equal(true);
      expect(s.percentComplete).to.equal(50);
      expect(s.freelancerPercent).to.equal(40);
      expect(s.proposer).to.equal(client.address);
    });

    it("freelancer accepts settlement", async () => {
      await jobMarket.connect(client).requestSettlement(1, 50, 40);
      await jobMarket.connect(freelancer).respondToSettlement(1, true);
      const job = await jobMarket.getJob(1);
      expect(job.status).to.equal(2); // Completed
    });

    it("freelancer rejects settlement", async () => {
      await jobMarket.connect(client).requestSettlement(1, 50, 40);
      await jobMarket.connect(freelancer).respondToSettlement(1, false);
      const job = await jobMarket.getJob(1);
      expect(job.status).to.equal(1); // InProgress
      const s = await jobMarket.getSettlement(1);
      expect(s.active).to.equal(false);
    });

    it("both parties can request settlement", async () => {
      // Freelancer can also propose a settlement
      await jobMarket.connect(freelancer).requestSettlement(1, 50, 40);
      const s = await jobMarket.getSettlement(1);
      expect(s.active).to.equal(true);
      expect(s.proposer).to.equal(freelancer.address);
    });

    it("proposer cannot respond to own settlement", async () => {
      await jobMarket.connect(client).requestSettlement(1, 50, 40);
      await expect(
        jobMarket.connect(client).respondToSettlement(1, true)
      ).to.be.revertedWith("Cannot respond to own proposal");
    });
  });

  // =========================================================================
  // Job Creation and Bidding
  // =========================================================================
  describe("Job Creation and Bidding", () => {
    it("creates job with expectedDays and sealedBidding", async () => {
      await jobMarket
        .connect(client)
        [
          "createJob(string,string,string,uint256,uint256,uint256,bool,uint256[],string[])"
        ](
          "Job",
          "Desc",
          "Cat",
          ETH("1"),
          futureDeadline(),
          14,
          true,
          [],
          []
        );
      const job = await jobMarket.getJob(1);
      expect(job.sealedBidding).to.equal(true);
      expect(job.expectedDays).to.equal(14);
    });

    it("backward-compatible createJob still works", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "Job",
          "Desc",
          "Cat",
          ETH("1"),
          futureDeadline()
        );
      const job = await jobMarket.getJob(1);
      expect(job.sealedBidding).to.equal(false);
      expect(job.expectedDays).to.equal(0);
    });

    it("allows bids above budget", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "Job",
          "Desc",
          "Cat",
          ETH("1"),
          futureDeadline()
        );
      await jobMarket
        .connect(freelancer)
        ["placeBid(uint256,uint256,string)"](1, ETH("2"), "higher bid");
      const bids = await jobMarket.getJobBids(1);
      expect(bids.length).to.equal(1);
      expect(bids[0].amount).to.equal(ETH("2"));
    });

    it("bid with completionDays", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "Job",
          "Desc",
          "Cat",
          ETH("1"),
          futureDeadline()
        );
      await jobMarket
        .connect(freelancer)
        ["placeBid(uint256,uint256,uint256,string)"](
          1,
          ETH("1"),
          7,
          "7 day delivery"
        );
      const bids = await jobMarket.getJobBids(1);
      expect(bids[0].completionDays).to.equal(7);
    });

    it("auto-release period is 14 days", async () => {
      await jobMarket
        .connect(client)
        ["createJob(string,string,string,uint256,uint256)"](
          "Job",
          "D",
          "C",
          ETH("1"),
          futureDeadline()
        );
      await jobMarket
        .connect(freelancer)
        ["placeBid(uint256,uint256,string)"](1, ETH("1"), "x");
      await jobMarket.connect(client).acceptBid(1, { value: ETH("1") });
      await jobMarket.connect(freelancer).deliverJob(1);
      // After 7 days: too early
      await time.increase(7 * 24 * 60 * 60);
      await expect(jobMarket.autoReleasePayment(1)).to.be.revertedWith(
        "Too early"
      );
      // After 14 days: works
      await time.increase(7 * 24 * 60 * 60 + 1);
      await jobMarket.autoReleasePayment(1);
      const job = await jobMarket.getJob(1);
      expect(job.status).to.equal(2); // Completed
    });
  });

  // =========================================================================
  // BountyBoard
  // =========================================================================
  describe("BountyBoard", () => {
    it("creates a bounty", async () => {
      await bountyBoard
        .connect(client)
        .createBounty("Find bugs", "Bug bounty program", "Security", futureDeadline(), 2, {
          value: ETH("1"),
        });
      const b = await bountyBoard.getBounty(1);
      expect(b.title).to.equal("Find bugs");
      expect(b.reward).to.equal(ETH("1"));
      expect(b.maxWinners).to.equal(2);
    });

    it("submits work to bounty", async () => {
      await bountyBoard
        .connect(client)
        .createBounty("Bounty", "D", "C", futureDeadline(), 1, {
          value: ETH("1"),
        });
      await bountyBoard
        .connect(freelancer)
        .submitWork(1, "Found bug", "QmProof");
      const subs = await bountyBoard.getBountySubmissions(1);
      expect(subs.length).to.equal(1);
      expect(subs[0].submitter).to.equal(freelancer.address);
    });

    it("approves submission and pays", async () => {
      await bountyBoard
        .connect(client)
        .createBounty("Bounty", "D", "C", futureDeadline(), 1, {
          value: ETH("1"),
        });
      await bountyBoard
        .connect(freelancer)
        .submitWork(1, "Done", "QmProof");
      const bal0 = await ethers.provider.getBalance(freelancer.address);
      await bountyBoard.connect(client).approveSubmission(1);
      const bal1 = await ethers.provider.getBalance(freelancer.address);
      expect(bal1 - bal0).to.equal(ETH("1"));
    });

    it("cancels bounty within 1 hour", async () => {
      await bountyBoard
        .connect(client)
        .createBounty("B", "D", "C", futureDeadline(), 1, {
          value: ETH("1"),
        });
      const bal0 = await ethers.provider.getBalance(client.address);
      const tx = await bountyBoard.connect(client).cancelBounty(1);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const bal1 = await ethers.provider.getBalance(client.address);
      expect(bal1 + gasCost - bal0).to.be.closeTo(ETH("1"), ETH("0.001"));
    });

    it("cannot cancel bounty after 15 minutes", async () => {
      await bountyBoard
        .connect(client)
        .createBounty("B", "D", "C", futureDeadline(), 1, {
          value: ETH("1"),
        });
      await time.increase(901); // > 15 minutes
      await expect(
        bountyBoard.connect(client).cancelBounty(1)
      ).to.be.revertedWith("Cancel window closed (15 min)");
    });

    it("cannot cancel bounty with existing submissions", async () => {
      await bountyBoard
        .connect(client)
        .createBounty("B", "D", "C", futureDeadline(), 1, {
          value: ETH("1"),
        });
      await bountyBoard.connect(freelancer).submitWork(1, "Work", "Qm");
      await expect(
        bountyBoard.connect(client).cancelBounty(1)
      ).to.be.revertedWith("Submissions exist");
    });

    it("prevents duplicate submissions", async () => {
      await bountyBoard
        .connect(client)
        .createBounty("B", "D", "C", futureDeadline(), 1, {
          value: ETH("1"),
        });
      await bountyBoard.connect(freelancer).submitWork(1, "A", "Qm");
      await expect(
        bountyBoard.connect(freelancer).submitWork(1, "B", "Qm2")
      ).to.be.revertedWith("Already submitted");
    });
  });

  // =========================================================================
  // SubContracting
  // =========================================================================
  describe("SubContracting", () => {
    it("creates direct sub-contract (Active immediately)", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, sub.address, "Code the frontend", {
          value: ETH("0.5"),
        });
      const sc = await subContracting.getSubContract(1);
      expect(sc.primaryFreelancer).to.equal(freelancer.address);
      expect(sc.subContractor).to.equal(sub.address);
      expect(sc.payment).to.equal(ETH("0.5"));
      expect(sc.status).to.equal(1); // Active
    });

    it("creates open listing (status Open)", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, ethers.ZeroAddress, "Open work", {
          value: ETH("0.5"),
        });
      const sc = await subContracting.getSubContract(1);
      expect(sc.status).to.equal(0); // Open
      expect(sc.subContractor).to.equal(ethers.ZeroAddress);
    });

    it("freelancer applies to open listing", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, ethers.ZeroAddress, "Open work", {
          value: ETH("0.5"),
        });
      await subContracting.connect(sub).applyForSubContract(1);
      const apps = await subContracting.getApplications(1);
      expect(apps.length).to.equal(1);
      expect(apps[0]).to.equal(sub.address);
      expect(await subContracting.hasApplied(1, sub.address)).to.be.true;
    });

    it("primary assigns applicant, moves to Active", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, ethers.ZeroAddress, "Open work", {
          value: ETH("0.5"),
        });
      await subContracting.connect(sub).applyForSubContract(1);
      await subContracting.connect(freelancer).assignSubContractor(1, sub.address);
      const sc = await subContracting.getSubContract(1);
      expect(sc.status).to.equal(1); // Active
      expect(sc.subContractor).to.equal(sub.address);
    });

    it("cannot assign non-applicant", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, ethers.ZeroAddress, "Open work", {
          value: ETH("0.5"),
        });
      await expect(
        subContracting.connect(freelancer).assignSubContractor(1, sub.address)
      ).to.be.revertedWith("Not applied");
    });

    it("getOpenSubContracts returns open listings", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, ethers.ZeroAddress, "Open A", { value: ETH("0.3") });
      await subContracting
        .connect(freelancer)
        .createSubContract(1, sub.address, "Direct B", { value: ETH("0.2") });
      const open = await subContracting.getOpenSubContracts();
      expect(open.length).to.equal(1);
      expect(open[0].description).to.equal("Open A");
    });

    it("sub-contractor submits and gets approved", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, sub.address, "Work", { value: ETH("0.5") });
      await subContracting.connect(sub).submitWork(1);
      const bal0 = await ethers.provider.getBalance(sub.address);
      await subContracting.connect(freelancer).approveWork(1);
      const bal1 = await ethers.provider.getBalance(sub.address);
      expect(bal1 - bal0).to.equal(ETH("0.5"));
    });

    it("cancels active sub-contract and refunds", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, sub.address, "Work", { value: ETH("0.5") });
      const bal0 = await ethers.provider.getBalance(freelancer.address);
      const tx = await subContracting
        .connect(freelancer)
        .cancelSubContract(1);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const bal1 = await ethers.provider.getBalance(freelancer.address);
      expect(bal1 + gasCost - bal0).to.be.closeTo(ETH("0.5"), ETH("0.001"));
    });

    it("cancels open listing and refunds", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, ethers.ZeroAddress, "Open", { value: ETH("0.5") });
      const bal0 = await ethers.provider.getBalance(freelancer.address);
      const tx = await subContracting
        .connect(freelancer)
        .cancelSubContract(1);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const bal1 = await ethers.provider.getBalance(freelancer.address);
      expect(bal1 + gasCost - bal0).to.be.closeTo(ETH("0.5"), ETH("0.001"));
    });

    it("only sub-contractor can submit", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, sub.address, "Work", { value: ETH("0.5") });
      await expect(
        subContracting.connect(freelancer).submitWork(1)
      ).to.be.revertedWith("Not sub");
    });

    it("tracks job sub-contracts", async () => {
      await subContracting
        .connect(freelancer)
        .createSubContract(1, sub.address, "Part A", { value: ETH("0.3") });
      await subContracting
        .connect(freelancer)
        .createSubContract(1, voter1.address, "Part B", {
          value: ETH("0.2"),
        });
      const scs = await subContracting.getJobSubContracts(1);
      expect(scs.length).to.equal(2);
    });
  });

  // =========================================================================
  // Crowdfunding (Governance)
  // =========================================================================
  describe("Crowdfunding (Governance)", () => {
    beforeEach(async () => {
      await vrt.mint(client.address, ETH("10"));
    });

    it("creates a crowdfund project", async () => {
      await governance
        .connect(client)
        .createCrowdfundProject(
          "Clean Water",
          "Provide clean water to village X",
          "Environment",
          "https://proof.link",
          ETH("5"),
          30 * 24 * 60 * 60
        );
      const p = await governance.getCrowdfundProject(1);
      expect(p.title).to.equal("Clean Water");
      expect(p.goalAmount).to.equal(ETH("5"));
      expect(p.status).to.equal(0); // Active
      expect(p.creator).to.equal(client.address);
    });

    it("rejects project if under 5 VRT", async () => {
      await expect(
        governance
          .connect(voter1)
          .createCrowdfundProject(
            "Project",
            "Desc",
            "Cat",
            "link",
            ETH("1"),
            3600
          )
      ).to.be.revertedWith("Need >= 5 VRT to propose");
    });

    it("contributes ETH to project", async () => {
      await governance
        .connect(client)
        .createCrowdfundProject(
          "Proj",
          "Desc",
          "Cat",
          "link",
          ETH("5"),
          30 * 24 * 60 * 60
        );
      await governance
        .connect(voter1)
        .contributeToProject(1, { value: ETH("1") });
      const p = await governance.getCrowdfundProject(1);
      expect(p.totalRaised).to.equal(ETH("1"));
      expect(p.contributorCount).to.equal(1);
    });

    it("auto-marks as funded when goal reached", async () => {
      await governance
        .connect(client)
        .createCrowdfundProject(
          "Proj",
          "Desc",
          "Cat",
          "link",
          ETH("2"),
          30 * 24 * 60 * 60
        );
      await governance
        .connect(voter1)
        .contributeToProject(1, { value: ETH("2") });
      const p = await governance.getCrowdfundProject(1);
      expect(p.status).to.equal(1); // Funded
    });

    it("creator withdraws funds after funded", async () => {
      await governance
        .connect(client)
        .createCrowdfundProject(
          "Proj",
          "Desc",
          "Cat",
          "link",
          ETH("2"),
          30 * 24 * 60 * 60
        );
      await governance
        .connect(voter1)
        .contributeToProject(1, { value: ETH("2") });
      const bal0 = await ethers.provider.getBalance(client.address);
      const tx = await governance
        .connect(client)
        .withdrawCrowdfundFunds(1);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const bal1 = await ethers.provider.getBalance(client.address);
      expect(bal1 + gasCost - bal0).to.be.closeTo(ETH("2"), ETH("0.001"));
    });

    it("mark project failed after deadline", async () => {
      await governance
        .connect(client)
        .createCrowdfundProject(
          "Proj",
          "Desc",
          "Cat",
          "link",
          ETH("5"),
          3600
        );
      await governance
        .connect(voter1)
        .contributeToProject(1, { value: ETH("1") });
      await time.increase(3601);
      await governance.markProjectFailed(1);
      const p = await governance.getCrowdfundProject(1);
      expect(p.status).to.equal(2); // Failed
    });

    it("contributor gets refund on failed project", async () => {
      await governance
        .connect(client)
        .createCrowdfundProject(
          "Proj",
          "Desc",
          "Cat",
          "link",
          ETH("5"),
          3600
        );
      await governance
        .connect(voter1)
        .contributeToProject(1, { value: ETH("1") });
      await time.increase(3601);
      await governance.markProjectFailed(1);
      const bal0 = await ethers.provider.getBalance(voter1.address);
      const tx = await governance.connect(voter1).refundContribution(1);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const bal1 = await ethers.provider.getBalance(voter1.address);
      expect(bal1 + gasCost - bal0).to.be.closeTo(ETH("1"), ETH("0.001"));
    });

    it("creator cancels project enabling refunds", async () => {
      await governance
        .connect(client)
        .createCrowdfundProject(
          "Proj",
          "Desc",
          "Cat",
          "link",
          ETH("5"),
          30 * 24 * 60 * 60
        );
      await governance
        .connect(voter1)
        .contributeToProject(1, { value: ETH("1") });
      await governance.connect(client).cancelCrowdfundProject(1);
      const p = await governance.getCrowdfundProject(1);
      expect(p.status).to.equal(3); // Cancelled
    });

    it("creator posts progress updates", async () => {
      await governance
        .connect(client)
        .createCrowdfundProject(
          "Proj",
          "Desc",
          "Cat",
          "link",
          ETH("5"),
          30 * 24 * 60 * 60
        );
      await governance
        .connect(client)
        .postCrowdfundUpdate(1, "Phase 1 done", "https://proof.com");
      const updates = await governance.getCrowdfundUpdates(1);
      expect(updates.length).to.equal(1);
      expect(updates[0].description).to.equal("Phase 1 done");
    });
  });

  // =========================================================================
  // Gamification (Achievements)
  // =========================================================================
  describe("Gamification (Achievements)", () => {
    it("unlocks first review achievement", async () => {
      await userProfile
        .connect(client)
        .submitReview(1, freelancer.address, 5, "Great");
      const achs = await userProfile.getAchievements(client.address);
      expect(achs.length).to.equal(1);
      expect(achs[0].name).to.equal("Reviewer");
    });

    it("unlocks perfect rating achievement", async () => {
      await userProfile
        .connect(client)
        .submitReview(1, freelancer.address, 5, "Perfect");
      const achs = await userProfile.getAchievements(freelancer.address);
      expect(achs.length).to.equal(1);
      expect(achs[0].name).to.equal("Perfect Score");
    });

    it("unlocks portfolio achievement", async () => {
      await userProfile
        .connect(freelancer)
        .createProfile("Bob", "Dev", ["Sol"]);
      await userProfile
        .connect(freelancer)
        .addPortfolioItem("DApp", "QmHash", 0);
      expect(
        await userProfile.hasAchievement(freelancer.address, 7)
      ).to.equal(true);
    });

    it("unlocks endorsement achievement", async () => {
      await userProfile
        .connect(client)
        .endorseSkill(freelancer.address, "Solidity", 1);
      expect(
        await userProfile.hasAchievement(freelancer.address, 6)
      ).to.equal(true);
    });

    it("recordJobCompletion triggers job achievements", async () => {
      await userProfile.recordJobCompletion(freelancer.address, ETH("0.5"));
      expect(
        await userProfile.hasAchievement(freelancer.address, 1)
      ).to.equal(true);
    });

    it("five reviews triggers popular achievement", async () => {
      for (let i = 0; i < 5; i++) {
        const signer = [client, voter1, voter2, voter3, sub][i];
        await userProfile
          .connect(signer)
          .submitReview(i + 1, freelancer.address, 4, "Review " + i);
      }
      expect(
        await userProfile.hasAchievement(freelancer.address, 8)
      ).to.equal(true);
    });
  });
});
