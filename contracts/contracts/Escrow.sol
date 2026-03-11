// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/* ── Minimal interfaces ──────────────────────────────────────────────────── */

interface IVRT_Escrow {
    function getFeeDiscount(address user) external view returns (uint256);
}

/**
 * @title Escrow
 * @notice Holds ETH for jobs and releases funds on milestone / completion.
 *
 * Features:
 *  - Milestone-partial releases
 *  - Platform fee → treasury (Governance)
 *  - Fee discounts for higher VRT tiers
 *  - Split payment (dispute resolution)
 *  - Tips (B7)
 *  - A4 – withdrawFees() for accumulated dispute fees
 */
contract Escrow is AccessControl, ReentrancyGuard {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ── External contracts ───────────────────────────────────────────────

    address public jobMarketContract;
    address public disputeResolutionContract;
    address public vrtToken;
    address public governanceContract;     // treasury

    // ── Config ───────────────────────────────────────────────────────────

    uint256 public platformFeeBps = 0;     // fee-free for now
    uint256 public MAX_FEE_BPS = 500;

    // ── State ────────────────────────────────────────────────────────────

    struct EscrowData {
        uint256 jobId;
        address client;
        address freelancer;
        uint256 totalAmount;
        uint256 releasedAmount;
        bool    refunded;
        bool    exists;
    }

    mapping(uint256 => EscrowData) public escrows;      // jobId → data
    uint256 public collectedFees;                        // accumulated fees not yet flushed

    // ── Events ───────────────────────────────────────────────────────────

    event FundsDeposited(uint256 indexed jobId, address indexed client, address indexed freelancer, uint256 amount);
    event PaymentReleased(uint256 indexed jobId, address indexed freelancer, uint256 net, uint256 fee);
    event MilestonePaymentReleased(uint256 indexed jobId, address indexed freelancer, uint256 net, uint256 fee);
    event FundsRefunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event SplitPayment(uint256 indexed jobId, uint256 clientShare, uint256 freelancerShare);
    event FeeFlushed(address indexed treasury, uint256 amount);
    event PlatformFeeUpdated(uint256 oldBps, uint256 newBps);

    // ── Constructor ──────────────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ── Modifiers ────────────────────────────────────────────────────────

    modifier onlyAuthorised() {
        require(
            msg.sender == jobMarketContract ||
            msg.sender == disputeResolutionContract ||
            hasRole(ADMIN_ROLE, msg.sender),
            "Escrow: unauthorized"
        );
        _;
    }

    // ── Admin setters ────────────────────────────────────────────────────

    function setJobMarketContract(address _j) external onlyRole(ADMIN_ROLE) {
        jobMarketContract = _j;
    }
    function setDisputeResolutionContract(address _d) external onlyRole(ADMIN_ROLE) {
        disputeResolutionContract = _d;
    }
    function setVRTToken(address _v) external onlyRole(ADMIN_ROLE) {
        vrtToken = _v;
    }
    function setGovernanceContract(address _g) external onlyRole(ADMIN_ROLE) {
        governanceContract = _g;
    }
    function setDFMToken(address _v) external onlyRole(ADMIN_ROLE) {
        vrtToken = _v;
    }
    function setPlatformFee(uint256 newBps) external onlyRole(ADMIN_ROLE) {
        require(newBps <= MAX_FEE_BPS, "Too high");
        emit PlatformFeeUpdated(platformFeeBps, newBps);
        platformFeeBps = newBps;
    }
    function setMaxFeeBps(uint256 _max) external onlyRole(ADMIN_ROLE) {
        require(_max <= 10000, "Max 100%");
        MAX_FEE_BPS = _max;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  DEPOSIT
    // ═══════════════════════════════════════════════════════════════════════

    function depositFunds(uint256 jobId, address client, address freelancer)
        external payable onlyAuthorised
    {
        require(!escrows[jobId].exists, "Exists");
        require(msg.value > 0, "No ETH");

        escrows[jobId] = EscrowData({
            jobId: jobId,
            client: client,
            freelancer: freelancer,
            totalAmount: msg.value,
            releasedAmount: 0,
            refunded: false,
            exists: true
        });

        emit FundsDeposited(jobId, client, freelancer, msg.value);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  RELEASE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Release full remaining balance (non-milestone jobs)
    function releasePayment(uint256 jobId) external nonReentrant onlyAuthorised {
        EscrowData storage ed = escrows[jobId];
        require(ed.exists && !ed.refunded, "Bad state");
        uint256 remaining = ed.totalAmount - ed.releasedAmount;
        require(remaining > 0, "Nothing left");

        (uint256 net, uint256 fee) = _applyFee(ed.freelancer, remaining);
        ed.releasedAmount = ed.totalAmount;

        _sendETH(ed.freelancer, net, "Pay");
        _collectFee(fee);

        emit PaymentReleased(jobId, ed.freelancer, net, fee);
    }

    /// @notice Release a specific amount (milestone-based)
    function releaseMilestonePayment(uint256 jobId, uint256 amount) external nonReentrant onlyAuthorised {
        EscrowData storage ed = escrows[jobId];
        require(ed.exists && !ed.refunded, "Bad state");
        require(ed.releasedAmount + amount <= ed.totalAmount, "Exceeds");

        (uint256 net, uint256 fee) = _applyFee(ed.freelancer, amount);
        ed.releasedAmount += amount;

        _sendETH(ed.freelancer, net, "Milestone");
        _collectFee(fee);

        emit MilestonePaymentReleased(jobId, ed.freelancer, net, fee);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  REFUND
    // ═══════════════════════════════════════════════════════════════════════

    function refundClient(uint256 jobId) external nonReentrant onlyAuthorised {
        EscrowData storage ed = escrows[jobId];
        require(ed.exists && !ed.refunded, "Bad state");
        uint256 remaining = ed.totalAmount - ed.releasedAmount;
        require(remaining > 0, "Nothing to refund");

        ed.refunded = true;
        _sendETH(ed.client, remaining, "Refund");
        emit FundsRefunded(jobId, ed.client, remaining);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  SPLIT (dispute use-case)
    // ═══════════════════════════════════════════════════════════════════════

    function splitPayment(uint256 jobId, uint256 clientPercent) external nonReentrant onlyAuthorised {
        require(clientPercent <= 100, "> 100");
        EscrowData storage ed = escrows[jobId];
        require(ed.exists && !ed.refunded, "Bad state");

        uint256 remaining = ed.totalAmount - ed.releasedAmount;
        require(remaining > 0, "Empty");

        uint256 cShare = (remaining * clientPercent) / 100;
        uint256 fShare = remaining - cShare;
        ed.releasedAmount = ed.totalAmount;

        if (cShare > 0) _sendETH(ed.client, cShare, "SplitC");
        if (fShare > 0) {
            (uint256 net, uint256 fee) = _applyFee(ed.freelancer, fShare);
            _sendETH(ed.freelancer, net, "SplitF");
            _collectFee(fee);
        }
        emit SplitPayment(jobId, cShare, fShare);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  FEE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Flush collected fees to governance / treasury
    function flushFees() external nonReentrant {
        require(collectedFees > 0, "No fees");
        uint256 amt = collectedFees;
        collectedFees = 0;
        address to = governanceContract != address(0) ? governanceContract : msg.sender;
        _sendETH(to, amt, "FlushFees");
        emit FeeFlushed(to, amt);
    }

    /// @notice A4 – admin withdraw accumulated fees
    function withdrawFees() external nonReentrant onlyRole(ADMIN_ROLE) {
        require(collectedFees > 0, "No fees");
        uint256 amt = collectedFees;
        collectedFees = 0;
        _sendETH(msg.sender, amt, "WithdrawFees");
        emit FeeFlushed(msg.sender, amt);
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getEscrow(uint256 jobId) external view returns (EscrowData memory) {
        return escrows[jobId];
    }

    function getBalance(uint256 jobId) external view returns (uint256) {
        EscrowData storage ed = escrows[jobId];
        if (!ed.exists || ed.refunded) return 0;
        return ed.totalAmount - ed.releasedAmount;
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    function _applyFee(address freelancer, uint256 amount) internal view returns (uint256 net, uint256 fee) {
        uint256 effectiveBps = platformFeeBps;
        if (vrtToken != address(0)) {
            uint256 discount = IVRT_Escrow(vrtToken).getFeeDiscount(freelancer);
            effectiveBps = effectiveBps > discount ? effectiveBps - (effectiveBps * discount / 10000) : 0;
        }
        fee = (amount * effectiveBps) / 10000;
        net = amount - fee;
    }

    function _collectFee(uint256 fee) internal {
        if (fee > 0) collectedFees += fee;
    }

    function _sendETH(address to, uint256 amount, string memory ctx) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, string.concat("ETH send failed: ", ctx));
    }
}
