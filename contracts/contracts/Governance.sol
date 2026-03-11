// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/* ── Minimal interfaces ──────────────────────────────────────────────────── */

interface IVRT_Gov {
    function balanceOf(address) external view returns (uint256);
    function getTier(address) external view returns (uint8);
    function totalSupply() external view returns (uint256);
}

/**
 * @title Governance
 * @notice DAO treasury, proposals, VRT-weighted voting, crowdfunding.
 *
 * Features:
 *  G1 – DAO governance (VRT-weighted proposals)
 *  G2 – Treasury (community deposits, crowdfunding)
 *  G5 – Crowdfunding: propose projects for societal good, community donates
 */
contract Governance is AccessControl, ReentrancyGuard {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    address public vrtToken;

    // ── Proposals ────────────────────────────────────────────────────────

    enum ProposalStatus { Active, Passed, Rejected, Executed, Cancelled }

    struct Proposal {
        uint256 id;
        address proposer;
        string  title;
        string  description;        // or IPFS hash
        uint256 forVotes;
        uint256 againstVotes;
        uint256 createdAt;
        uint256 deadline;
        ProposalStatus status;
        bytes   executionData;       // optional calldata
        address executionTarget;     // optional target
    }

    uint256 public proposalCounter;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVotedOnProposal;

    uint256 public MIN_VRT_TO_PROPOSE = 100 * 1e18;
    uint256 public VOTING_PERIOD      = 5 days;
    uint256 public MIN_QUORUM_BPS     = 1000;   // 10 % of total committed votes

    // ═══════════════════════════════════════════════════════════════════════
    //  CROWDFUNDING (replaces quadratic funding)
    // ═══════════════════════════════════════════════════════════════════════

    enum CrowdfundStatus { Active, Funded, Failed, Cancelled }

    struct CrowdfundProject {
        uint256 id;
        address creator;
        string  title;
        string  description;         // detailed project description
        string  category;            // e.g., "Education", "Environment", "Tech"
        string  proofLink;           // URL/IPFS for project verification, progress tracking
        uint256 goalAmount;          // ETH goal
        uint256 totalRaised;         // ETH raised so far
        uint256 deadline;
        CrowdfundStatus status;
        uint256 createdAt;
        uint256 contributorCount;
        bool    fundsWithdrawn;
    }

    struct CrowdfundUpdate {
        string  description;
        string  link;                // proof of progress
        uint256 timestamp;
    }

    uint256 public crowdfundCounter;
    uint256 public MIN_VRT_TO_CROWDFUND = 5 * 1e18; // 5 VRT to propose a project

    mapping(uint256 => CrowdfundProject) public crowdfundProjects;
    mapping(uint256 => mapping(address => uint256)) public crowdfundContributions; // projectId → user → amount
    mapping(uint256 => CrowdfundUpdate[]) public crowdfundUpdates;
    mapping(uint256 => uint256) public crowdfundWithdrawn;  // projectId → total ETH withdrawn

    // ── Events ───────────────────────────────────────────────────────────

    event TreasuryReceived(address indexed from, uint256 amount);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event ProposalCreated(uint256 indexed id, address indexed proposer, string title);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed id);
    event ProposalCancelled(uint256 indexed id);
    event CrowdfundProjectCreated(uint256 indexed id, address indexed creator, string title, uint256 goalAmount);
    event CrowdfundContribution(uint256 indexed projectId, address indexed contributor, uint256 amount);
    event CrowdfundFundsWithdrawn(uint256 indexed projectId, address indexed creator, uint256 amount);
    event CrowdfundProjectCancelled(uint256 indexed projectId);
    event CrowdfundProjectFailed(uint256 indexed projectId);
    event CrowdfundUpdatePosted(uint256 indexed projectId, string description);

    // ── Constructor ──────────────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function setVRTToken(address _v) external onlyRole(ADMIN_ROLE) { vrtToken = _v; }
    function setDFMToken(address _v) external onlyRole(ADMIN_ROLE) { vrtToken = _v; }
    function setMinVrtToPropose(uint256 _m) external onlyRole(ADMIN_ROLE) { MIN_VRT_TO_PROPOSE = _m; }
    function setGovVotingPeriod(uint256 _p) external onlyRole(ADMIN_ROLE) { VOTING_PERIOD = _p; }
    function setMinQuorumBps(uint256 _q)    external onlyRole(ADMIN_ROLE) { require(_q <= 10000, "Max 100%"); MIN_QUORUM_BPS = _q; }
    function setMinVrtToCrowdfund(uint256 _m) external onlyRole(ADMIN_ROLE) { MIN_VRT_TO_CROWDFUND = _m; }

    // ═══════════════════════════════════════════════════════════════════════
    //  TREASURY  (G2)
    // ═══════════════════════════════════════════════════════════════════════

    receive() external payable { emit TreasuryReceived(msg.sender, msg.value); }

    function treasuryBalance() external view returns (uint256) { return address(this).balance; }

    function withdrawTreasury(address to, uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant {
        require(amount <= address(this).balance, "Insufficient");
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "Transfer failed");
        emit TreasuryWithdrawn(to, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  PROPOSALS  (G1)
    // ═══════════════════════════════════════════════════════════════════════

    function createProposal(
        string calldata title,
        string calldata description,
        address execTarget,
        bytes calldata execData
    ) external returns (uint256) {
        require(bytes(title).length > 0, "Title required");
        if (vrtToken != address(0)) {
            require(IVRT_Gov(vrtToken).balanceOf(msg.sender) >= MIN_VRT_TO_PROPOSE, "Need 100 VRT");
        }

        proposalCounter++;
        proposals[proposalCounter] = Proposal({
            id: proposalCounter,
            proposer: msg.sender,
            title: title,
            description: description,
            forVotes: 0,
            againstVotes: 0,
            createdAt: block.timestamp,
            deadline: block.timestamp + VOTING_PERIOD,
            status: ProposalStatus.Active,
            executionData: execData,
            executionTarget: execTarget
        });

        emit ProposalCreated(proposalCounter, msg.sender, title);
        return proposalCounter;
    }

    function voteOnProposal(uint256 pid, bool support) external {
        Proposal storage p = proposals[pid];
        require(p.status == ProposalStatus.Active && block.timestamp < p.deadline, "Not active");
        require(!hasVotedOnProposal[pid][msg.sender], "Voted");

        uint256 weight = 1;
        if (vrtToken != address(0)) {
            uint256 bal = IVRT_Gov(vrtToken).balanceOf(msg.sender);
            require(bal > 0, "Must hold VRT");
            weight = bal / 1e18;
            // Platinum (tier 3) gets 2× weight
            if (IVRT_Gov(vrtToken).getTier(msg.sender) == 3) weight *= 2;
        }

        hasVotedOnProposal[pid][msg.sender] = true;
        if (support) p.forVotes += weight; else p.againstVotes += weight;

        emit Voted(pid, msg.sender, support, weight);
    }

    function finalizeProposal(uint256 pid) external {
        Proposal storage p = proposals[pid];
        require(p.status == ProposalStatus.Active && block.timestamp >= p.deadline, "Not ended");

        uint256 totalVotes = p.forVotes + p.againstVotes;
        uint256 supply = IVRT_Gov(vrtToken).totalSupply();
        bool quorumMet = supply == 0 || (totalVotes * 10000 >= supply * MIN_QUORUM_BPS);

        if (p.forVotes > p.againstVotes && totalVotes > 0 && quorumMet) {
            p.status = ProposalStatus.Passed;
        } else {
            p.status = ProposalStatus.Rejected;
        }
    }

    function executeProposal(uint256 pid) external onlyRole(ADMIN_ROLE) nonReentrant {
        Proposal storage p = proposals[pid];
        require(p.status == ProposalStatus.Passed, "Not passed");
        p.status = ProposalStatus.Executed;

        if (p.executionTarget != address(0) && p.executionData.length > 0) {
            (bool ok,) = p.executionTarget.call(p.executionData);
            require(ok, "Execution failed");
        }
        emit ProposalExecuted(pid);
    }

    function cancelProposal(uint256 pid) external {
        Proposal storage p = proposals[pid];
        require(msg.sender == p.proposer || hasRole(ADMIN_ROLE, msg.sender), "Not allowed");
        require(p.status == ProposalStatus.Active, "Not active");
        p.status = ProposalStatus.Cancelled;
        emit ProposalCancelled(pid);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  CROWDFUNDING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Propose a crowdfunding project. Must hold >= 5 VRT.
     * @param title       Project title
     * @param description Detailed description of the project and its societal impact
     * @param category    Category (Education, Environment, Tech, Health, etc.)
     * @param proofLink   URL/IPFS link to project proof, team info, milestones etc.
     * @param goalAmount  ETH goal (total amount needed)
     * @param duration    How long the campaign runs (in seconds)
     */
    function createCrowdfundProject(
        string calldata title,
        string calldata description,
        string calldata category,
        string calldata proofLink,
        uint256 goalAmount,
        uint256 duration
    ) external returns (uint256) {
        require(bytes(title).length > 0, "Title required");
        require(bytes(description).length > 0, "Description required");
        require(goalAmount > 0, "Goal must be > 0");
        require(duration > 0, "Duration must be > 0");

        if (vrtToken != address(0)) {
            require(
                IVRT_Gov(vrtToken).balanceOf(msg.sender) >= MIN_VRT_TO_CROWDFUND,
                "Need >= 5 VRT to propose"
            );
        }

        crowdfundCounter++;
        crowdfundProjects[crowdfundCounter] = CrowdfundProject({
            id: crowdfundCounter,
            creator: msg.sender,
            title: title,
            description: description,
            category: category,
            proofLink: proofLink,
            goalAmount: goalAmount,
            totalRaised: 0,
            deadline: block.timestamp + duration,
            status: CrowdfundStatus.Active,
            createdAt: block.timestamp,
            contributorCount: 0,
            fundsWithdrawn: false
        });

        emit CrowdfundProjectCreated(crowdfundCounter, msg.sender, title, goalAmount);
        return crowdfundCounter;
    }

    /**
     * @notice Contribute ETH to a crowdfunding project.
     */
    function contributeToProject(uint256 projectId) external payable nonReentrant {
        CrowdfundProject storage p = crowdfundProjects[projectId];
        require(p.id != 0, "Project not found");
        require(p.status == CrowdfundStatus.Active, "Not active");
        require(block.timestamp < p.deadline, "Campaign ended");
        require(msg.value > 0, "Send ETH");

        if (crowdfundContributions[projectId][msg.sender] == 0) {
            p.contributorCount++;
        }
        crowdfundContributions[projectId][msg.sender] += msg.value;
        p.totalRaised += msg.value;

        // Auto-mark as funded when goal is reached
        if (p.totalRaised >= p.goalAmount) {
            p.status = CrowdfundStatus.Funded;
        }

        emit CrowdfundContribution(projectId, msg.sender, msg.value);
    }

    /**
     * @notice Creator withdraws available funds (can withdraw multiple times).
     *         Withdrawal does not change totalRaised — progress bar always shows total funded.
     */
    function withdrawCrowdfundFunds(uint256 projectId) external nonReentrant {
        CrowdfundProject storage p = crowdfundProjects[projectId];
        require(msg.sender == p.creator, "Only creator");
        require(p.status == CrowdfundStatus.Active || p.status == CrowdfundStatus.Funded, "Cannot withdraw");

        uint256 available = p.totalRaised - crowdfundWithdrawn[projectId];
        require(available > 0, "Nothing to withdraw");

        crowdfundWithdrawn[projectId] += available;
        p.fundsWithdrawn = true;

        (bool ok,) = payable(msg.sender).call{value: available}("");
        require(ok, "Withdraw failed");

        emit CrowdfundFundsWithdrawn(projectId, msg.sender, available);
    }

    /**
     * @notice Creator posts an update about project progress.
     */
    function postCrowdfundUpdate(uint256 projectId, string calldata desc, string calldata link) external {
        CrowdfundProject storage p = crowdfundProjects[projectId];
        require(msg.sender == p.creator, "Only creator");
        require(bytes(desc).length > 0, "Description required");

        crowdfundUpdates[projectId].push(CrowdfundUpdate({
            description: desc,
            link: link,
            timestamp: block.timestamp
        }));

        emit CrowdfundUpdatePosted(projectId, desc);
    }

    /**
     * @notice Mark project as failed after deadline if goal not reached.
     *         Contributors can then get refunds.
     */
    function markProjectFailed(uint256 projectId) external {
        CrowdfundProject storage p = crowdfundProjects[projectId];
        require(p.status == CrowdfundStatus.Active, "Not active");
        require(block.timestamp >= p.deadline, "Still active");
        require(p.totalRaised < p.goalAmount, "Goal was reached");

        p.status = CrowdfundStatus.Failed;
        emit CrowdfundProjectFailed(projectId);
    }

    /**
     * @notice Contributors can get a refund if project failed.
     */
    function refundContribution(uint256 projectId) external nonReentrant {
        CrowdfundProject storage p = crowdfundProjects[projectId];
        require(p.status == CrowdfundStatus.Failed || p.status == CrowdfundStatus.Cancelled, "Not refundable");

        uint256 amount = crowdfundContributions[projectId][msg.sender];
        require(amount > 0, "Nothing to refund");

        crowdfundContributions[projectId][msg.sender] = 0;
        p.totalRaised -= amount;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "Refund failed");
    }

    /**
     * @notice Creator or admin can cancel a project. Enables refunds.
     */
    function cancelCrowdfundProject(uint256 projectId) external {
        CrowdfundProject storage p = crowdfundProjects[projectId];
        require(
            msg.sender == p.creator || hasRole(ADMIN_ROLE, msg.sender),
            "Not authorized"
        );
        require(p.status == CrowdfundStatus.Active, "Not active");
        require(!p.fundsWithdrawn, "Funds already withdrawn");

        p.status = CrowdfundStatus.Cancelled;
        emit CrowdfundProjectCancelled(projectId);
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getProposal(uint256 pid) external view returns (Proposal memory) {
        return proposals[pid];
    }

    function getCrowdfundProject(uint256 pid) external view returns (CrowdfundProject memory) {
        return crowdfundProjects[pid];
    }

    function getCrowdfundUpdates(uint256 pid) external view returns (CrowdfundUpdate[] memory) {
        return crowdfundUpdates[pid];
    }

    function getContribution(uint256 projectId, address user) external view returns (uint256) {
        return crowdfundContributions[projectId][user];
    }
}
