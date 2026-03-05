// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/* ── Minimal interfaces ──────────────────────────────────────────────────── */

interface IVRT {
    function balanceOf(address) external view returns (uint256);
    function mint(address, uint256) external;
    function getFeeDiscount(address) external view returns (uint256);
}

interface IEscrow {
    function depositFunds(uint256 jobId, address client, address freelancer) external payable;
    function releasePayment(uint256 jobId) external;
    function releaseMilestonePayment(uint256 jobId, uint256 amount) external;
    function refundClient(uint256 jobId) external;
    function splitPayment(uint256 jobId, uint256 clientPercent) external;
}

/**
 * @title JobMarket
 * @notice Core marketplace — jobs, bids, milestones, settlement, reputation.
 *
 * Changes from v1:
 *  - Removed referral system
 *  - Removed sealed bid commit-reveal (sealed = frontend-enforced visibility)
 *  - Freelancers can bid above budget
 *  - Added expectedDays (client) and completionDays (freelancer bid)
 *  - Added mutual cancellation/settlement system
 *  - Auto-release period = 14 days
 */
contract JobMarket is AccessControl, ReentrancyGuard {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ── External contracts ───────────────────────────────────────────────────

    address public vrtToken;
    address public escrowContract;
    address public disputeResolutionContract;
    address public governanceContract;

    // ── Enums ────────────────────────────────────────────────────────────────

    enum JobStatus { Open, InProgress, Completed, Cancelled, Disputed, Delivered }
    enum MilestoneStatus { Pending, InProgress, Submitted, Approved }

    // ── Structs ──────────────────────────────────────────────────────────────

    struct Milestone {
        string  title;
        uint256 amount;
        MilestoneStatus status;
    }

    struct Job {
        uint256 id;
        address client;
        string  title;
        string  description;
        string  category;
        uint256 budget;
        uint256 deadline;
        JobStatus status;
        address selectedFreelancer;
        uint256 acceptedBidId;
        uint256 createdAt;
        uint256 deliveredAt;
        uint256 milestoneCount;
        bool    sealedBidding;       // if true, frontend hides bids from other freelancers
        uint256 expectedDays;        // client's expected completion timeframe in days
    }

    struct Bid {
        uint256 id;
        uint256 jobId;
        address freelancer;
        uint256 amount;
        uint256 completionDays;      // freelancer's proposed timeframe in days
        string  proposal;
        uint256 timestamp;
        bool    isActive;
    }

    struct SettlementRequest {
        uint256 jobId;
        address proposer;
        uint256 percentComplete;     // informational 0-100: how much work was done
        uint256 freelancerPercent;   // 0-100: what % of escrowed funds goes to freelancer
        bool    active;
    }

    struct UserProfile {
        uint256 jobsCompleted;
        uint256 totalEarned;
        uint256 totalSpent;
        uint256 averageRating;
        bool    exists;
    }

    // ── Configurable parameters (admin-tunable) ──────────────────────────────

    uint256 public REPUTATION_REWARD   = 10 * 1e18;
    uint256 public AUTO_RELEASE_PERIOD = 14 days;
    uint256 public CANCEL_PENALTY_BPS  = 500;        // 5 %

    // ── State ────────────────────────────────────────────────────────────────

    uint256 public jobCounter;
    uint256 public bidCounter;
    uint256 public minVrtToBid;

    mapping(uint256 => Job)         public jobs;
    mapping(uint256 => Bid)         public bids;
    mapping(address => UserProfile) public userProfiles;
    mapping(uint256 => uint256[])   public jobBids;

    mapping(uint256 => mapping(uint256 => Milestone)) public milestones;
    mapping(uint256 => mapping(address => bool))      public hasBidOnJob;

    // Settlement state
    mapping(uint256 => SettlementRequest) public settlements;

    // ── Events ───────────────────────────────────────────────────────────────

    event JobCreated(uint256 indexed jobId, address indexed client, string title, uint256 budget, string category);
    event BidPlaced(uint256 indexed bidId, uint256 indexed jobId, address indexed freelancer, uint256 amount);
    event BidWithdrawn(uint256 indexed bidId, uint256 indexed jobId, address indexed freelancer);
    event BidAccepted(uint256 indexed bidId, uint256 indexed jobId, address indexed freelancer, address client);
    event JobCompleted(uint256 indexed jobId, address indexed freelancer, uint256 payment);
    event JobCancelled(uint256 indexed jobId, address indexed client, uint256 penalty);
    event JobDelivered(uint256 indexed jobId, address indexed freelancer, uint256 autoReleaseAt);
    event JobAutoReleased(uint256 indexed jobId);
    event MilestoneSubmitted(uint256 indexed jobId, uint256 milestoneIndex);
    event MilestoneApproved(uint256 indexed jobId, uint256 milestoneIndex, uint256 amount);
    event DisputeRaised(uint256 indexed jobId, address indexed initiator);
    event JobRestoredToInProgress(uint256 indexed jobId);
    event TokenMintFailed(address indexed user, uint256 amount, string reason);
    event TipAdded(uint256 indexed jobId, uint256 amount);
    event SettlementRequested(uint256 indexed jobId, address indexed proposer, uint256 percentComplete, uint256 freelancerPercent);
    event SettlementAccepted(uint256 indexed jobId);
    event SettlementRejected(uint256 indexed jobId);
    event RevisionRequested(uint256 indexed jobId);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ── Admin setters ────────────────────────────────────────────────────────

    function setVRTToken(address _t)                  external onlyRole(ADMIN_ROLE) { vrtToken = _t; }
    function setEscrowContract(address _e)            external onlyRole(ADMIN_ROLE) { escrowContract = _e; }
    function setDisputeResolutionContract(address _d) external onlyRole(ADMIN_ROLE) { disputeResolutionContract = _d; }
    function setGovernanceContract(address _g)        external onlyRole(ADMIN_ROLE) { governanceContract = _g; }
    function setMinVrtToBid(uint256 _min)             external onlyRole(ADMIN_ROLE) { minVrtToBid = _min; }
    function setDFMToken(address _t)                  external onlyRole(ADMIN_ROLE) { vrtToken = _t; }
    function setReputationReward(uint256 _r)           external onlyRole(ADMIN_ROLE) { REPUTATION_REWARD = _r; }
    function setAutoReleasePeriod(uint256 _p)          external onlyRole(ADMIN_ROLE) { AUTO_RELEASE_PERIOD = _p; }
    function setCancelPenaltyBps(uint256 _bps)         external onlyRole(ADMIN_ROLE) { require(_bps <= 5000, "Max 50%"); CANCEL_PENALTY_BPS = _bps; }

    // ═══════════════════════════════════════════════════════════════════════
    //  JOB CREATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Create a job with optional milestones, sealed bidding, and expected days.
     */
    function createJob(
        string  calldata title,
        string  calldata description,
        string  calldata category,
        uint256 budget,
        uint256 deadline,
        uint256 expectedDays,
        bool    sealedBidding,
        uint256[] calldata milestoneAmounts,
        string[]  calldata milestoneTitles
    ) external returns (uint256) {
        require(bytes(title).length > 0,       "Title required");
        require(bytes(description).length > 0, "Description required");
        require(budget > 0,                    "Budget must be > 0");
        require(deadline > block.timestamp,    "Deadline must be future");

        if (milestoneAmounts.length > 0) {
            require(milestoneAmounts.length == milestoneTitles.length, "Arrays mismatch");
            uint256 total;
            for (uint256 i; i < milestoneAmounts.length; i++) {
                require(milestoneAmounts[i] > 0, "Milestone amt > 0");
                total += milestoneAmounts[i];
            }
            require(total == budget, "Milestones must sum to budget");
        }

        jobCounter++;
        uint256 jid = jobCounter;

        jobs[jid] = Job({
            id: jid,
            client: msg.sender,
            title: title,
            description: description,
            category: category,
            budget: budget,
            deadline: deadline,
            status: JobStatus.Open,
            selectedFreelancer: address(0),
            acceptedBidId: 0,
            createdAt: block.timestamp,
            deliveredAt: 0,
            milestoneCount: milestoneAmounts.length,
            sealedBidding: sealedBidding,
            expectedDays: expectedDays
        });

        for (uint256 i; i < milestoneAmounts.length; i++) {
            milestones[jid][i] = Milestone(milestoneTitles[i], milestoneAmounts[i], MilestoneStatus.Pending);
        }

        _ensureProfile(msg.sender);

        emit JobCreated(jid, msg.sender, title, budget, category);
        return jid;
    }

    /// @notice Backward-compatible overload (no milestones, no sealed, no days)
    function createJob(
        string calldata title,
        string calldata description,
        string calldata category,
        uint256 budget,
        uint256 deadline
    ) external returns (uint256) {
        require(bytes(title).length > 0 && bytes(description).length > 0, "Title & desc required");
        require(budget > 0 && deadline > block.timestamp, "Bad budget/deadline");

        jobCounter++;
        uint256 jid = jobCounter;
        jobs[jid] = Job({
            id: jid,
            client: msg.sender,
            title: title,
            description: description,
            category: category,
            budget: budget,
            deadline: deadline,
            status: JobStatus.Open,
            selectedFreelancer: address(0),
            acceptedBidId: 0,
            createdAt: block.timestamp,
            deliveredAt: 0,
            milestoneCount: 0,
            sealedBidding: false,
            expectedDays: 0
        });
        _ensureProfile(msg.sender);
        emit JobCreated(jid, msg.sender, title, budget, category);
        return jid;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  BIDDING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Place a bid on a job. Amount can be higher or lower than budget.
     *         For sealed-bid jobs, the frontend hides bids from other freelancers
     *         (all bids are visible on-chain but the UI enforces privacy).
     */
    function placeBid(uint256 jobId, uint256 amount, uint256 completionDays, string calldata proposal)
        external nonReentrant returns (uint256)
    {
        Job storage job = jobs[jobId];
        require(job.id != 0,                          "Job !exist");
        require(job.status == JobStatus.Open,          "Not open");
        require(job.client != msg.sender,              "Own job");
        require(amount > 0,                            "Amount must be > 0");
        require(bytes(proposal).length > 0,            "Proposal required");
        require(!hasBidOnJob[jobId][msg.sender],       "Already bid");
        require(block.timestamp < job.deadline,        "Deadline passed");

        if (minVrtToBid > 0 && vrtToken != address(0)) {
            require(IVRT(vrtToken).balanceOf(msg.sender) >= minVrtToBid, "VRT too low");
        }

        bidCounter++;
        uint256 bid_ = bidCounter;
        bids[bid_] = Bid(bid_, jobId, msg.sender, amount, completionDays, proposal, block.timestamp, true);
        jobBids[jobId].push(bid_);
        hasBidOnJob[jobId][msg.sender] = true;
        _ensureProfile(msg.sender);

        emit BidPlaced(bid_, jobId, msg.sender, amount);
        return bid_;
    }

    /// @notice Backward-compatible overload (no completionDays)
    function placeBid(uint256 jobId, uint256 amount, string calldata proposal)
        external nonReentrant returns (uint256)
    {
        Job storage job = jobs[jobId];
        require(job.id != 0,                          "Job !exist");
        require(job.status == JobStatus.Open,          "Not open");
        require(job.client != msg.sender,              "Own job");
        require(amount > 0,                            "Amount must be > 0");
        require(bytes(proposal).length > 0,            "Proposal required");
        require(!hasBidOnJob[jobId][msg.sender],       "Already bid");
        require(block.timestamp < job.deadline,        "Deadline passed");

        if (minVrtToBid > 0 && vrtToken != address(0)) {
            require(IVRT(vrtToken).balanceOf(msg.sender) >= minVrtToBid, "VRT too low");
        }

        bidCounter++;
        uint256 bid_ = bidCounter;
        bids[bid_] = Bid(bid_, jobId, msg.sender, amount, 0, proposal, block.timestamp, true);
        jobBids[jobId].push(bid_);
        hasBidOnJob[jobId][msg.sender] = true;
        _ensureProfile(msg.sender);

        emit BidPlaced(bid_, jobId, msg.sender, amount);
        return bid_;
    }

    /// @notice Withdraw bid before acceptance
    function withdrawBid(uint256 bidId) external {
        Bid storage b = bids[bidId];
        require(b.id != 0 && b.freelancer == msg.sender && b.isActive, "Cannot withdraw");
        require(jobs[b.jobId].status == JobStatus.Open, "Not open");
        b.isActive = false;
        hasBidOnJob[b.jobId][msg.sender] = false;
        emit BidWithdrawn(bidId, b.jobId, msg.sender);
    }

    function acceptBid(uint256 bidId) external payable nonReentrant {
        Bid storage b = bids[bidId];
        Job storage job = jobs[b.jobId];
        require(job.client == msg.sender && job.status == JobStatus.Open && b.isActive, "Cannot accept");
        require(msg.value == b.amount,        "Send exact amount");
        require(block.timestamp < job.deadline, "Deadline passed");

        job.status = JobStatus.InProgress;
        job.selectedFreelancer = b.freelancer;
        job.acceptedBidId = bidId;

        uint256[] storage ids = jobBids[job.id];
        for (uint256 i; i < ids.length; i++) bids[ids[i]].isActive = false;

        if (escrowContract != address(0)) {
            IEscrow(escrowContract).depositFunds{value: msg.value}(job.id, job.client, b.freelancer);
        }
        emit BidAccepted(bidId, job.id, b.freelancer, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  MILESTONES
    // ═══════════════════════════════════════════════════════════════════════

    function submitMilestone(uint256 jobId, uint256 idx) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.selectedFreelancer && job.status == JobStatus.InProgress, "Not allowed");
        require(idx < job.milestoneCount, "Bad idx");
        Milestone storage ms = milestones[jobId][idx];
        require(ms.status == MilestoneStatus.Pending || ms.status == MilestoneStatus.InProgress, "Not submittable");
        ms.status = MilestoneStatus.Submitted;
        emit MilestoneSubmitted(jobId, idx);
    }

    function approveMilestone(uint256 jobId, uint256 idx) external nonReentrant {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client && job.status == JobStatus.InProgress, "Not allowed");
        require(idx < job.milestoneCount, "Bad idx");
        Milestone storage ms = milestones[jobId][idx];
        require(ms.status == MilestoneStatus.Submitted, "Not submitted");

        ms.status = MilestoneStatus.Approved;
        if (escrowContract != address(0)) {
            IEscrow(escrowContract).releaseMilestonePayment(jobId, ms.amount);
        }
        emit MilestoneApproved(jobId, idx, ms.amount);

        // auto-complete if all approved
        bool done = true;
        for (uint256 i; i < job.milestoneCount; i++) {
            if (milestones[jobId][i].status != MilestoneStatus.Approved) { done = false; break; }
        }
        if (done) _completeJob(jobId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  COMPLETION / DELIVERY / CANCEL
    // ═══════════════════════════════════════════════════════════════════════

    function completeJob(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.client == msg.sender, "Only client");
        require(job.status == JobStatus.InProgress || job.status == JobStatus.Delivered, "Not completable");
        if (job.milestoneCount > 0) {
            for (uint256 i; i < job.milestoneCount; i++)
                require(milestones[jobId][i].status == MilestoneStatus.Approved, "Milestones pending");
        }
        _completeJob(jobId);
    }

    function _completeJob(uint256 jobId) internal {
        Job storage job = jobs[jobId];
        job.status = JobStatus.Completed;

        uint256 bidAmt = bids[job.acceptedBidId].amount;
        userProfiles[job.selectedFreelancer].jobsCompleted++;
        userProfiles[job.selectedFreelancer].totalEarned += bidAmt;
        userProfiles[job.client].totalSpent += bidAmt;

        if (job.milestoneCount == 0 && escrowContract != address(0)) {
            IEscrow(escrowContract).releasePayment(jobId);
        }

        _mintVRT(job.selectedFreelancer, REPUTATION_REWARD);
        _mintVRT(job.client, REPUTATION_REWARD);

        emit JobCompleted(jobId, job.selectedFreelancer, bidAmt);
    }

    /// @notice Freelancer marks job delivered — starts 14-day auto-release timer
    function deliverJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.selectedFreelancer && job.status == JobStatus.InProgress, "Not allowed");
        job.status = JobStatus.Delivered;
        job.deliveredAt = block.timestamp;
        emit JobDelivered(jobId, msg.sender, block.timestamp + AUTO_RELEASE_PERIOD);
    }

    /// @notice Anyone triggers auto-release after 14 days
    function autoReleasePayment(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Delivered && job.deliveredAt > 0, "Not delivered");
        require(block.timestamp >= job.deliveredAt + AUTO_RELEASE_PERIOD, "Too early");
        _completeJob(jobId);
        emit JobAutoReleased(jobId);
    }

    function cancelJob(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.client == msg.sender, "Only client");

        if (job.status == JobStatus.Open) {
            job.status = JobStatus.Cancelled;
            emit JobCancelled(jobId, msg.sender, 0);
        } else if (job.status == JobStatus.InProgress) {
            job.status = JobStatus.Cancelled;
            uint256 penalty = (bids[job.acceptedBidId].amount * CANCEL_PENALTY_BPS) / 10000;
            if (escrowContract != address(0)) IEscrow(escrowContract).refundClient(jobId);
            emit JobCancelled(jobId, msg.sender, penalty);
        } else {
            revert("Cannot cancel");
        }
    }

    /// @notice Tip freelancer after completion
    function tipFreelancer(uint256 jobId) external payable nonReentrant {
        Job storage job = jobs[jobId];
        require(job.client == msg.sender && job.status == JobStatus.Completed && msg.value > 0, "Bad tip");
        (bool ok,) = payable(job.selectedFreelancer).call{value: msg.value}("");
        require(ok, "Tip failed");
        emit TipAdded(jobId, msg.value);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  MUTUAL CANCELLATION / SETTLEMENT
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Client proposes a settlement — both agree to end the job without dispute.
     * @param jobId            The job to settle
     * @param percentComplete  How much work was done (informational, 0-100)
     * @param freelancerPct    What % of escrowed funds goes to freelancer (0-100)
     */
    function requestSettlement(uint256 jobId, uint256 percentComplete, uint256 freelancerPct) external {
        Job storage job = jobs[jobId];
        require(
            msg.sender == job.client || msg.sender == job.selectedFreelancer,
            "Only client or freelancer"
        );
        require(
            job.status == JobStatus.InProgress || job.status == JobStatus.Delivered,
            "Bad status"
        );
        require(percentComplete <= 100, "percentComplete > 100");
        require(freelancerPct <= 100, "freelancerPct > 100");

        settlements[jobId] = SettlementRequest({
            jobId: jobId,
            proposer: msg.sender,
            percentComplete: percentComplete,
            freelancerPercent: freelancerPct,
            active: true
        });

        emit SettlementRequested(jobId, msg.sender, percentComplete, freelancerPct);
    }

    /**
     * @notice The OTHER party (not the proposer) accepts or rejects the settlement.
     *         If accepted, escrowed funds are split accordingly.
     */
    function respondToSettlement(uint256 jobId, bool accept) external nonReentrant {
        Job storage job = jobs[jobId];
        SettlementRequest storage s = settlements[jobId];
        require(
            msg.sender == job.client || msg.sender == job.selectedFreelancer,
            "Not party"
        );
        require(msg.sender != s.proposer, "Cannot respond to own proposal");
        require(s.active, "No active settlement");

        s.active = false;

        if (accept) {
            job.status = JobStatus.Completed;
            uint256 clientPct = 100 - s.freelancerPercent;
            if (escrowContract != address(0)) {
                IEscrow(escrowContract).splitPayment(jobId, clientPct);
            }
            emit SettlementAccepted(jobId);
        } else {
            emit SettlementRejected(jobId);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  REVISION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Client requests a revision on a delivered job, returning it to InProgress.
     */
    function requestRevision(uint256 _jobId) external {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Delivered, "Not delivered");
        require(msg.sender == job.client, "Only client");
        job.status = JobStatus.InProgress;
        job.deliveredAt = 0;
        emit RevisionRequested(_jobId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  DISPUTE HOOKS
    // ═══════════════════════════════════════════════════════════════════════

    function markDisputed(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.InProgress || job.status == JobStatus.Delivered, "Bad status");
        require(
            msg.sender == job.client ||
            msg.sender == job.selectedFreelancer ||
            msg.sender == disputeResolutionContract,
            "Not authorised"
        );
        job.status = JobStatus.Disputed;
        emit DisputeRaised(jobId, msg.sender);
    }

    function resolveDispute(uint256 jobId, bool) external {
        require(
            msg.sender == escrowContract ||
            msg.sender == disputeResolutionContract ||
            hasRole(ADMIN_ROLE, msg.sender),
            "Unauthorized"
        );
        require(jobs[jobId].status == JobStatus.Disputed, "Not disputed");
        jobs[jobId].status = JobStatus.Completed;
    }

    function restoreToInProgress(uint256 jobId) external {
        require(msg.sender == disputeResolutionContract || hasRole(ADMIN_ROLE, msg.sender), "Unauth");
        require(jobs[jobId].status == JobStatus.Disputed, "Not disputed");
        jobs[jobId].status = JobStatus.InProgress;
        emit JobRestoredToInProgress(jobId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════════

    function getJob(uint256 jobId) external view returns (Job memory) { return jobs[jobId]; }

    function getJobBids(uint256 jobId) external view returns (Bid[] memory) {
        uint256[] storage ids = jobBids[jobId];
        Bid[] memory r = new Bid[](ids.length);
        for (uint256 i; i < ids.length; i++) r[i] = bids[ids[i]];
        return r;
    }

    function getJobMilestones(uint256 jobId) external view returns (Milestone[] memory) {
        uint256 c = jobs[jobId].milestoneCount;
        Milestone[] memory r = new Milestone[](c);
        for (uint256 i; i < c; i++) r[i] = milestones[jobId][i];
        return r;
    }

    function getUserProfile(address u) external view returns (UserProfile memory) { return userProfiles[u]; }

    function getSettlement(uint256 jobId) external view returns (SettlementRequest memory) {
        return settlements[jobId];
    }

    function getOpenJobs(uint256 offset, uint256 limit) external view returns (Job[] memory) {
        uint256 c;
        for (uint256 i = offset + 1; i <= jobCounter && c < limit; i++)
            if (jobs[i].status == JobStatus.Open) c++;
        Job[] memory r = new Job[](c);
        c = 0;
        for (uint256 i = offset + 1; i <= jobCounter && c < limit; i++)
            if (jobs[i].status == JobStatus.Open) { r[c] = jobs[i]; c++; }
        return r;
    }

    // ── Internal ─────────────────────────────────────────────────────────

    function _ensureProfile(address u) internal {
        if (!userProfiles[u].exists) userProfiles[u] = UserProfile(0,0,0,0,true);
    }

    function _mintVRT(address to, uint256 amt) internal {
        if (vrtToken == address(0)) return;
        try IVRT(vrtToken).mint(to, amt) {} catch { emit TokenMintFailed(to, amt, "mint failed"); }
    }
}
