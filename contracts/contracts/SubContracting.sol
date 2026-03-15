// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/* ── Minimal interfaces ──────────────────────────────────────────────────── */

interface IVRT_SC {
    function mint(address to, uint256 amount) external;
}

/**
 * @title SubContracting
 * @notice Full job-like lifecycle for delegating work to a sub-contractor.
 *
 *  Flow A — Direct assignment:
 *    createSubContract(jobId, subAddr, desc) { value: ETH }
 *    → Active → sub delivers → primary approves / requests revision
 *    → Completed (payment released, VRT minted)
 *
 *  Flow B — Open listing (marketplace with bidding):
 *    createSubContract(jobId, address(0), desc) { value: ETH }
 *    → freelancers place bids → primary accepts bid (locks funds)
 *    → Active → deliver → approve / revision → Completed
 *
 *  Dispute:  Either party can raise via DisputeResolution.
 *            DR calls markDisputed / resolveDispute / restoreToActive.
 *
 *  Settlement: Either party proposes mutual split; the other accepts/rejects.
 *
 *  Auto-release: 14 days after delivery, anyone can trigger payment.
 */
contract SubContracting is AccessControl, ReentrancyGuard {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ── External contracts ───────────────────────────────────────────────

    address public vrtToken;
    address public disputeResolutionContract;

    // ── Enums / Structs ──────────────────────────────────────────────────

    enum Status { Open, Active, Delivered, Completed, Disputed, Cancelled }

    struct SubContract {
        uint256 id;
        uint256 parentJobId;
        address primaryFreelancer;
        address subContractor;       // address(0) while Open
        string  description;
        uint256 payment;             // ETH locked (set at creation or on bid accept)
        Status  status;
        uint256 createdAt;
        uint256 deliveredAt;
        uint256 completedAt;
        uint256 acceptedBidId;
        string  deliveryProof;      // IPFS CID / proof link submitted on delivery
        string  deliveryDescription;
        bool    revisionRequested;  // waiting for sub-contractor response to revision
        bool    tipGiven;           // one-time tip guard
    }

    struct Bid {
        uint256 id;
        uint256 scId;
        address bidder;
        uint256 amount;
        uint256 completionDays;
        string  proposal;
        uint256 timestamp;
        bool    isActive;
    }

    struct Settlement {
        address proposer;
        uint256 freelancerPercent;   // 0-100
        bool    active;
    }

    // ── Configurable ─────────────────────────────────────────────────────

    uint256 public REPUTATION_REWARD   = 10 * 1e18;
    uint256 public AUTO_RELEASE_PERIOD = 14 days;

    // ── State ────────────────────────────────────────────────────────────

    uint256 public subContractCounter;
    uint256 public bidCounter;

    mapping(uint256 => SubContract)  public subContracts;
    mapping(uint256 => uint256[])    public jobSubContracts;   // parentJobId → scIds
    mapping(address => uint256[])    public userSubContracts;  // user → scIds

    // Bids
    mapping(uint256 => Bid)          public bids;
    mapping(uint256 => uint256[])    public scBids;            // scId → bidIds
    mapping(uint256 => mapping(address => bool)) public hasBidOn;

    // Legacy applications (kept for open listings that haven't moved to bidding)
    mapping(uint256 => address[])    public applications;
    mapping(uint256 => mapping(address => bool)) public hasApplied;

    // Settlement
    mapping(uint256 => Settlement)   public settlements;

    // ── Events ───────────────────────────────────────────────────────────

    event SubContractCreated(uint256 indexed id, uint256 indexed parentJobId, address indexed primaryFreelancer, uint256 payment, bool isOpen);
    event BidPlaced(uint256 indexed bidId, uint256 indexed scId, address indexed bidder, uint256 amount);
    event BidWithdrawn(uint256 indexed bidId, uint256 indexed scId, address indexed bidder);
    event BidAccepted(uint256 indexed bidId, uint256 indexed scId, address indexed subContractor);
    event SubContractorAssigned(uint256 indexed id, address indexed subContractor);
    event WorkDelivered(uint256 indexed id, address indexed subContractor, uint256 autoReleaseAt);
    event WorkApproved(uint256 indexed id, address indexed subContractor, uint256 payment);
    event RevisionRequested(uint256 indexed id);
    event RevisionRequestResponded(uint256 indexed id, bool accepted);
    event SubContractCancelled(uint256 indexed id);
    event AutoReleased(uint256 indexed id);
    event DisputeRaised(uint256 indexed id, address indexed initiator);
    event DisputeResolved(uint256 indexed id);
    event RestoredToActive(uint256 indexed id);
    event SettlementRequested(uint256 indexed id, address indexed proposer, uint256 freelancerPercent);
    event SettlementAccepted(uint256 indexed id);
    event SettlementRejected(uint256 indexed id);
    event TipAdded(uint256 indexed id, uint256 amount);
    event TokenMintFailed(address indexed user, uint256 amount);

    // ── Constructor ──────────────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ── Admin setters ────────────────────────────────────────────────────

    function setVRTToken(address _v) external onlyRole(ADMIN_ROLE) { vrtToken = _v; }
    function setDisputeResolutionContract(address _d) external onlyRole(ADMIN_ROLE) { disputeResolutionContract = _d; }
    function setReputationReward(uint256 _r) external onlyRole(ADMIN_ROLE) { REPUTATION_REWARD = _r; }
    function setAutoReleasePeriod(uint256 _p) external onlyRole(ADMIN_ROLE) { AUTO_RELEASE_PERIOD = _p; }

    // ═══════════════════════════════════════════════════════════════════════
    //  CREATE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Create a sub-contract.
     *  - Pass address(0) as subContractor to create an open listing (freelancers bid).
     *  - Pass a real address for direct assignment (payment locked immediately).
     */
    function createSubContract(
        uint256 parentJobId,
        address subContractor,
        string calldata description
    ) external payable returns (uint256) {
        require(msg.value > 0, "Must fund");
        require(bytes(description).length > 0, "Desc required");
        if (subContractor != address(0)) {
            require(subContractor != msg.sender, "Cannot sub to self");
        }

        subContractCounter++;
        uint256 scId = subContractCounter;
        bool isOpen = subContractor == address(0);

        subContracts[scId] = SubContract({
            id: scId,
            parentJobId: parentJobId,
            primaryFreelancer: msg.sender,
            subContractor: subContractor,
            description: description,
            payment: msg.value,
            status: isOpen ? Status.Open : Status.Active,
            createdAt: block.timestamp,
            deliveredAt: 0,
            completedAt: 0,
            acceptedBidId: 0,
            deliveryProof: "",
            deliveryDescription: "",
            revisionRequested: false,
            tipGiven: false
        });

        jobSubContracts[parentJobId].push(scId);
        userSubContracts[msg.sender].push(scId);
        if (!isOpen) {
            userSubContracts[subContractor].push(scId);
        }

        emit SubContractCreated(scId, parentJobId, msg.sender, msg.value, isOpen);
        return scId;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  BIDDING (open listings)
    // ═══════════════════════════════════════════════════════════════════════

    function placeBid(
        uint256 scId,
        uint256 amount,
        uint256 completionDays,
        string calldata proposal
    ) external returns (uint256) {
        SubContract storage sc = subContracts[scId];
        require(sc.id != 0, "Not found");
        require(sc.status == Status.Open, "Not open");
        require(msg.sender != sc.primaryFreelancer, "Cannot bid on own");
        require(amount > 0, "Amount must be > 0");
        require(bytes(proposal).length > 0, "Proposal required");
        require(!hasBidOn[scId][msg.sender], "Already bid");

        bidCounter++;
        uint256 bidId = bidCounter;
        bids[bidId] = Bid({
            id: bidId,
            scId: scId,
            bidder: msg.sender,
            amount: amount,
            completionDays: completionDays,
            proposal: proposal,
            timestamp: block.timestamp,
            isActive: true
        });
        scBids[scId].push(bidId);
        hasBidOn[scId][msg.sender] = true;

        // Also mark as applied for backward compat
        if (!hasApplied[scId][msg.sender]) {
            applications[scId].push(msg.sender);
            hasApplied[scId][msg.sender] = true;
        }

        emit BidPlaced(bidId, scId, msg.sender, amount);
        return bidId;
    }

    function withdrawBid(uint256 bidId) external {
        Bid storage b = bids[bidId];
        require(b.id != 0 && b.bidder == msg.sender && b.isActive, "Cannot withdraw");
        require(subContracts[b.scId].status == Status.Open, "Not open");
        b.isActive = false;
        hasBidOn[b.scId][msg.sender] = false;
        emit BidWithdrawn(bidId, b.scId, msg.sender);
    }

    /**
     * @notice Primary accepts a bid. The sub-contractor is assigned and status → Active.
     *         If the bid amount differs from locked payment, the primary must have
     *         sent the exact amount at creation time. Bids are informational pricing.
     */
    function acceptBid(uint256 bidId) external {
        Bid storage b = bids[bidId];
        require(b.id != 0 && b.isActive, "Bad bid");
        SubContract storage sc = subContracts[b.scId];
        require(msg.sender == sc.primaryFreelancer, "Not primary");
        require(sc.status == Status.Open, "Not open");

        sc.subContractor = b.bidder;
        sc.status = Status.Active;
        sc.acceptedBidId = bidId;
        userSubContracts[b.bidder].push(sc.id);

        // Deactivate all bids
        uint256[] storage ids = scBids[sc.id];
        for (uint256 i; i < ids.length; i++) bids[ids[i]].isActive = false;

        emit BidAccepted(bidId, sc.id, b.bidder);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  LEGACY APPLY / ASSIGN (for direct applications without bid amounts)
    // ═══════════════════════════════════════════════════════════════════════

    function applyForSubContract(uint256 scId) external {
        SubContract storage sc = subContracts[scId];
        require(sc.id != 0, "Not found");
        require(sc.status == Status.Open, "Not open");
        require(msg.sender != sc.primaryFreelancer, "Cannot apply to own");
        require(!hasApplied[scId][msg.sender], "Already applied");

        applications[scId].push(msg.sender);
        hasApplied[scId][msg.sender] = true;
    }

    function assignSubContractor(uint256 scId, address _sub) external {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.primaryFreelancer, "Not primary");
        require(sc.status == Status.Open, "Not open");
        require(_sub != address(0) && _sub != msg.sender, "Bad address");
        require(hasApplied[scId][_sub], "Not applied");

        sc.subContractor = _sub;
        sc.status = Status.Active;
        userSubContracts[_sub].push(sc.id);

        emit SubContractorAssigned(scId, _sub);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  DELIVERY / COMPLETION
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Sub-contractor marks work delivered — starts auto-release timer
    function deliverWork(uint256 scId, string calldata ipfsProof) external {
        _deliverWork(scId, ipfsProof, "");
    }

    function deliverWork(uint256 scId, string calldata ipfsProof, string calldata description) external {
        _deliverWork(scId, ipfsProof, description);
    }

    function _deliverWork(uint256 scId, string calldata ipfsProof, string memory description) internal {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.subContractor, "Not sub");
        require(sc.status == Status.Active, "Not active");
        require(bytes(ipfsProof).length > 0, "Proof required");
        sc.status = Status.Delivered;
        sc.deliveredAt = block.timestamp;
        sc.deliveryProof = ipfsProof;
        sc.deliveryDescription = description;
        sc.revisionRequested = false;
        emit WorkDelivered(scId, msg.sender, block.timestamp + AUTO_RELEASE_PERIOD);
    }

    /// @notice Primary approves delivered work — releases payment + mints VRT
    function approveWork(uint256 scId) external nonReentrant {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.primaryFreelancer, "Not primary");
        require(sc.status == Status.Delivered, "Not delivered");
        require(!sc.revisionRequested, "Revision response pending");
        _completeSubContract(scId);
    }

    /// @notice Primary requests revision — returns to Active
    function requestRevision(uint256 scId) external {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.primaryFreelancer, "Not primary");
        require(sc.status == Status.Delivered, "Not delivered");
        require(!sc.revisionRequested, "Already requested");
        sc.revisionRequested = true;
        emit RevisionRequested(scId);
    }

    function approveRevisionRequest(uint256 scId) external {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.subContractor, "Not sub");
        require(sc.status == Status.Delivered, "Not delivered");
        require(sc.revisionRequested, "No request");
        sc.status = Status.Active;
        sc.deliveredAt = 0;
        sc.deliveryProof = "";
        sc.deliveryDescription = "";
        sc.revisionRequested = false;
        emit RevisionRequestResponded(scId, true);
    }

    function rejectRevisionRequest(uint256 scId) external {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.subContractor, "Not sub");
        require(sc.status == Status.Delivered, "Not delivered");
        require(sc.revisionRequested, "No request");
        sc.revisionRequested = false;
        emit RevisionRequestResponded(scId, false);
    }

    /// @notice Anyone triggers auto-release after AUTO_RELEASE_PERIOD
    function autoRelease(uint256 scId) external nonReentrant {
        SubContract storage sc = subContracts[scId];
        require(sc.status == Status.Delivered && sc.deliveredAt > 0, "Not delivered");
        require(!sc.revisionRequested, "Revision response pending");
        require(block.timestamp >= sc.deliveredAt + AUTO_RELEASE_PERIOD, "Too early");
        _completeSubContract(scId);
        emit AutoReleased(scId);
    }

    function _completeSubContract(uint256 scId) internal {
        SubContract storage sc = subContracts[scId];
        sc.status = Status.Completed;
        sc.completedAt = block.timestamp;

        (bool ok,) = payable(sc.subContractor).call{value: sc.payment}("");
        require(ok, "Payment failed");

        _mintVRT(sc.primaryFreelancer, REPUTATION_REWARD);
        _mintVRT(sc.subContractor, REPUTATION_REWARD);

        emit WorkApproved(scId, sc.subContractor, sc.payment);
    }

    /// @notice Primary freelancer can tip sub-contractor once after completion
    function tipSubContractor(uint256 scId) external payable nonReentrant {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.primaryFreelancer, "Not primary");
        require(sc.status == Status.Completed, "Not completed");
        require(msg.value > 0, "Bad tip");
        require(!sc.tipGiven, "Tip already sent");

        sc.tipGiven = true;
        (bool ok,) = payable(sc.subContractor).call{value: msg.value}("");
        require(ok, "Tip failed");

        emit TipAdded(scId, msg.value);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  CANCEL
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Primary can cancel only when Open (before work starts)
    function cancelSubContract(uint256 scId) external nonReentrant {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.primaryFreelancer, "Not primary");
        require(sc.status == Status.Open, "Can only cancel when Open");

        sc.status = Status.Cancelled;
        (bool ok,) = payable(msg.sender).call{value: sc.payment}("");
        require(ok, "Refund failed");

        emit SubContractCancelled(scId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  SETTLEMENT
    // ═══════════════════════════════════════════════════════════════════════

    function requestSettlement(uint256 scId, uint256 freelancerPct) external {
        SubContract storage sc = subContracts[scId];
        require(
            msg.sender == sc.primaryFreelancer || msg.sender == sc.subContractor,
            "Not party"
        );
        require(
            sc.status == Status.Active || sc.status == Status.Delivered,
            "Bad status"
        );
        require(freelancerPct <= 100, "Max 100");

        settlements[scId] = Settlement({
            proposer: msg.sender,
            freelancerPercent: freelancerPct,
            active: true
        });

        emit SettlementRequested(scId, msg.sender, freelancerPct);
    }

    function respondToSettlement(uint256 scId, bool accept) external nonReentrant {
        SubContract storage sc = subContracts[scId];
        Settlement storage s = settlements[scId];
        require(
            msg.sender == sc.primaryFreelancer || msg.sender == sc.subContractor,
            "Not party"
        );
        require(msg.sender != s.proposer, "Cannot respond to own");
        require(s.active, "No active settlement");

        s.active = false;

        if (accept) {
            sc.status = Status.Completed;
            sc.completedAt = block.timestamp;

            uint256 subShare = (sc.payment * s.freelancerPercent) / 100;
            uint256 primaryShare = sc.payment - subShare;

            if (subShare > 0) {
                (bool ok1,) = payable(sc.subContractor).call{value: subShare}("");
                require(ok1, "Sub payment failed");
            }
            if (primaryShare > 0) {
                (bool ok2,) = payable(sc.primaryFreelancer).call{value: primaryShare}("");
                require(ok2, "Primary refund failed");
            }

            emit SettlementAccepted(scId);
        } else {
            emit SettlementRejected(scId);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  DISPUTE HOOKS (called by DisputeResolution contract)
    // ═══════════════════════════════════════════════════════════════════════

    function markDisputed(uint256 scId) external {
        SubContract storage sc = subContracts[scId];
        require(sc.status == Status.Active || sc.status == Status.Delivered, "Bad status");
        require(
            msg.sender == sc.primaryFreelancer ||
            msg.sender == sc.subContractor ||
            msg.sender == disputeResolutionContract,
            "Not authorised"
        );
        sc.status = Status.Disputed;
        emit DisputeRaised(scId, msg.sender);
    }

    function resolveDispute(uint256 scId, bool) external {
        require(
            msg.sender == disputeResolutionContract ||
            hasRole(ADMIN_ROLE, msg.sender),
            "Unauthorized"
        );
        require(subContracts[scId].status == Status.Disputed, "Not disputed");
        subContracts[scId].status = Status.Completed;
        subContracts[scId].completedAt = block.timestamp;
        emit DisputeResolved(scId);
    }

    function restoreToActive(uint256 scId) external {
        require(
            msg.sender == disputeResolutionContract ||
            hasRole(ADMIN_ROLE, msg.sender),
            "Unauthorized"
        );
        require(subContracts[scId].status == Status.Disputed, "Not disputed");
        subContracts[scId].status = Status.Active;
        emit RestoredToActive(scId);
    }

    /// @notice Split payment after dispute resolution
    function splitPayment(uint256 scId, uint256 primaryPct) external nonReentrant {
        require(
            msg.sender == disputeResolutionContract ||
            hasRole(ADMIN_ROLE, msg.sender),
            "Unauthorized"
        );
        SubContract storage sc = subContracts[scId];
        require(sc.status == Status.Completed || sc.status == Status.Disputed, "Bad status");

        if (sc.status == Status.Disputed) {
            sc.status = Status.Completed;
            sc.completedAt = block.timestamp;
        }

        uint256 primaryShare = (sc.payment * primaryPct) / 100;
        uint256 subShare = sc.payment - primaryShare;

        if (subShare > 0) {
            (bool ok1,) = payable(sc.subContractor).call{value: subShare}("");
            require(ok1, "Sub payment failed");
        }
        if (primaryShare > 0) {
            (bool ok2,) = payable(sc.primaryFreelancer).call{value: primaryShare}("");
            require(ok2, "Primary refund failed");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════════

    function getSubContract(uint256 id) external view returns (SubContract memory) {
        return subContracts[id];
    }

    function getJobSubContracts(uint256 jobId) external view returns (SubContract[] memory) {
        uint256[] storage ids = jobSubContracts[jobId];
        SubContract[] memory r = new SubContract[](ids.length);
        for (uint256 i; i < ids.length; i++) r[i] = subContracts[ids[i]];
        return r;
    }

    function getUserSubContracts(address user) external view returns (SubContract[] memory) {
        uint256[] storage ids = userSubContracts[user];
        SubContract[] memory r = new SubContract[](ids.length);
        for (uint256 i; i < ids.length; i++) r[i] = subContracts[ids[i]];
        return r;
    }

    function getOpenSubContracts() external view returns (SubContract[] memory) {
        uint256 c;
        for (uint256 i = 1; i <= subContractCounter; i++) {
            if (subContracts[i].status == Status.Open) c++;
        }
        SubContract[] memory r = new SubContract[](c);
        c = 0;
        for (uint256 i = 1; i <= subContractCounter; i++) {
            if (subContracts[i].status == Status.Open) {
                r[c] = subContracts[i];
                c++;
            }
        }
        return r;
    }

    function getApplications(uint256 scId) external view returns (address[] memory) {
        return applications[scId];
    }

    function getScBids(uint256 scId) external view returns (Bid[] memory) {
        uint256[] storage ids = scBids[scId];
        Bid[] memory r = new Bid[](ids.length);
        for (uint256 i; i < ids.length; i++) r[i] = bids[ids[i]];
        return r;
    }

    function getSettlement(uint256 scId) external view returns (Settlement memory) {
        return settlements[scId];
    }

    // ── Internal ─────────────────────────────────────────────────────────

    function _mintVRT(address to, uint256 amt) internal {
        if (vrtToken == address(0)) return;
        try IVRT_SC(vrtToken).mint(to, amt) {} catch { emit TokenMintFailed(to, amt); }
    }
}
