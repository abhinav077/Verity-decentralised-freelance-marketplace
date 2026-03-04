// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVRT_BB {
    function balanceOf(address) external view returns (uint256);
    function mint(address, uint256) external;
    function getTier(address) external view returns (uint8);
}

/**
 * @title BountyBoard
 * @notice Open bounties that anyone can claim by submitting work.
 *
 * H9 - Bounty board: post bounties, submit solutions, approve, multiple winners.
 */
contract BountyBoard is AccessControl, ReentrancyGuard {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    address public vrtToken;

    enum BountyStatus { Open, Completed, Cancelled }
    enum SubmissionStatus { Pending, Approved, Rejected }

    struct Bounty {
        uint256 id;
        address poster;
        string  title;
        string  description;
        string  category;
        uint256 reward;             // ETH reward
        uint256 vrtReward;          // VRT bonus
        uint256 deadline;
        uint256 maxWinners;
        uint256 approvedCount;
        BountyStatus status;
        uint256 createdAt;
    }

    struct Submission {
        uint256 id;
        uint256 bountyId;
        address submitter;
        string  description;
        string  ipfsProof;          // link to work
        SubmissionStatus status;
        uint256 timestamp;
    }

    uint256 public bountyCounter;
    uint256 public submissionCounter;

    mapping(uint256 => Bounty)       public bounties;
    mapping(uint256 => Submission)   public submissions;
    mapping(uint256 => uint256[])    public bountySubmissions;  // bountyId -> submissionIds
    mapping(uint256 => mapping(address => bool)) public hasSubmitted;

    uint256 public constant BOUNTY_VRT_REWARD = 5 * 1e18;

    event BountyCreated(uint256 indexed id, address indexed poster, string title, uint256 reward);
    event BountySubmission(uint256 indexed bountyId, uint256 indexed submissionId, address indexed submitter);
    event SubmissionApproved(uint256 indexed bountyId, uint256 indexed submissionId, address indexed submitter, uint256 reward);
    event SubmissionRejected(uint256 indexed bountyId, uint256 indexed submissionId);
    event BountyCancelled(uint256 indexed bountyId);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function setVRTToken(address _v) external onlyRole(ADMIN_ROLE) { vrtToken = _v; }

    // ── Create bounty (must send ETH reward) ─────────────────────────────

    function createBounty(
        string calldata title,
        string calldata description,
        string calldata category,
        uint256 deadline,
        uint256 maxWinners
    ) external payable returns (uint256) {
        require(bytes(title).length > 0, "Title required");
        require(msg.value > 0, "Must fund bounty");
        require(deadline > block.timestamp, "Future deadline");
        require(maxWinners > 0, "Need >= 1 winner");

        bountyCounter++;
        bounties[bountyCounter] = Bounty({
            id: bountyCounter,
            poster: msg.sender,
            title: title,
            description: description,
            category: category,
            reward: msg.value,
            vrtReward: BOUNTY_VRT_REWARD,
            deadline: deadline,
            maxWinners: maxWinners,
            approvedCount: 0,
            status: BountyStatus.Open,
            createdAt: block.timestamp
        });

        emit BountyCreated(bountyCounter, msg.sender, title, msg.value);
        return bountyCounter;
    }

    // ── Submit work ──────────────────────────────────────────────────────

    function submitWork(uint256 bountyId, string calldata description, string calldata ipfsProof)
        external returns (uint256)
    {
        Bounty storage b = bounties[bountyId];
        require(b.id != 0 && b.status == BountyStatus.Open, "Not open");
        require(block.timestamp < b.deadline, "Deadline passed");
        require(msg.sender != b.poster, "Own bounty");
        require(!hasSubmitted[bountyId][msg.sender], "Already submitted");

        submissionCounter++;
        submissions[submissionCounter] = Submission({
            id: submissionCounter,
            bountyId: bountyId,
            submitter: msg.sender,
            description: description,
            ipfsProof: ipfsProof,
            status: SubmissionStatus.Pending,
            timestamp: block.timestamp
        });
        bountySubmissions[bountyId].push(submissionCounter);
        hasSubmitted[bountyId][msg.sender] = true;

        emit BountySubmission(bountyId, submissionCounter, msg.sender);
        return submissionCounter;
    }

    // ── Approve submission ───────────────────────────────────────────────

    function approveSubmission(uint256 submissionId) external nonReentrant {
        Submission storage s = submissions[submissionId];
        Bounty storage b = bounties[s.bountyId];
        require(msg.sender == b.poster, "Only poster");
        require(b.status == BountyStatus.Open, "Not open");
        require(s.status == SubmissionStatus.Pending, "Not pending");
        require(b.approvedCount < b.maxWinners, "Max winners reached");

        s.status = SubmissionStatus.Approved;
        b.approvedCount++;

        // Pay proportional reward
        uint256 payout = b.reward / b.maxWinners;
        (bool ok,) = payable(s.submitter).call{value: payout}("");
        require(ok, "Payment failed");

        // Mint VRT
        if (vrtToken != address(0)) {
            try IVRT_BB(vrtToken).mint(s.submitter, b.vrtReward) {} catch {}
        }

        if (b.approvedCount == b.maxWinners) {
            b.status = BountyStatus.Completed;
        }

        emit SubmissionApproved(s.bountyId, submissionId, s.submitter, payout);
    }

    function rejectSubmission(uint256 submissionId) external {
        Submission storage s = submissions[submissionId];
        require(msg.sender == bounties[s.bountyId].poster, "Only poster");
        require(s.status == SubmissionStatus.Pending, "Not pending");
        s.status = SubmissionStatus.Rejected;
        emit SubmissionRejected(s.bountyId, submissionId);
    }

    // ── Cancel bounty ────────────────────────────────────────────────────

    function cancelBounty(uint256 bountyId) external nonReentrant {
        Bounty storage b = bounties[bountyId];
        require(msg.sender == b.poster, "Only poster");
        require(b.status == BountyStatus.Open, "Not open");
        require(block.timestamp <= b.createdAt + 15 minutes, "Cancel window closed (15 min)");
        // Cannot cancel if anyone has already submitted work
        require(bountySubmissions[bountyId].length == 0, "Submissions exist");

        b.status = BountyStatus.Cancelled;
        uint256 remaining = b.reward - (b.reward / b.maxWinners * b.approvedCount);
        if (remaining > 0) {
            (bool ok,) = payable(msg.sender).call{value: remaining}("");
            require(ok, "Refund failed");
        }
        emit BountyCancelled(bountyId);
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getBounty(uint256 id) external view returns (Bounty memory) { return bounties[id]; }

    function getSubmission(uint256 id) external view returns (Submission memory) { return submissions[id]; }

    function getBountySubmissions(uint256 bountyId) external view returns (Submission[] memory) {
        uint256[] storage ids = bountySubmissions[bountyId];
        Submission[] memory r = new Submission[](ids.length);
        for (uint256 i; i < ids.length; i++) r[i] = submissions[ids[i]];
        return r;
    }
}
