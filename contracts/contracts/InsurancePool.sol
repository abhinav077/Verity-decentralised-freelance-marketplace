// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title InsurancePool
 * @notice H5 - Freelancer insurance pool. Freelancers stake ETH into a pool.
 *         If a dispute is resolved against a client (client at fault), the
 *         freelancer gets compensated from the pool. Premiums are returned
 *         if no claims are filed.
 */
contract InsurancePool is AccessControl, ReentrancyGuard {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    address public disputeResolutionContract;

    struct Policy {
        address freelancer;
        uint256 premium;           // ETH staked
        uint256 coverage;          // max payout = premium * COVERAGE_MULTIPLIER
        uint256 createdAt;
        uint256 expiresAt;
        bool    claimed;
        bool    withdrawn;
    }

    uint256 public policyCounter;
    uint256 public constant COVERAGE_MULTIPLIER = 3;   // 3x coverage
    uint256 public constant POLICY_DURATION = 90 days;
    uint256 public constant MIN_PREMIUM = 0.01 ether;

    mapping(uint256 => Policy) public policies;
    mapping(address => uint256[]) public userPolicies;

    uint256 public totalPoolBalance;

    event PolicyCreated(uint256 indexed id, address indexed freelancer, uint256 premium, uint256 coverage);
    event ClaimPaid(uint256 indexed policyId, address indexed freelancer, uint256 amount);
    event PremiumWithdrawn(uint256 indexed policyId, address indexed freelancer, uint256 amount);
    event PoolFunded(address indexed funder, uint256 amount);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function setDisputeResolutionContract(address _d) external onlyRole(ADMIN_ROLE) {
        disputeResolutionContract = _d;
    }

    // ── Buy insurance ────────────────────────────────────────────────────

    function buyInsurance() external payable returns (uint256) {
        require(msg.value >= MIN_PREMIUM, "Min premium 0.01 ETH");

        policyCounter++;
        uint256 coverage = msg.value * COVERAGE_MULTIPLIER;

        policies[policyCounter] = Policy({
            freelancer: msg.sender,
            premium: msg.value,
            coverage: coverage,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + POLICY_DURATION,
            claimed: false,
            withdrawn: false
        });
        userPolicies[msg.sender].push(policyCounter);
        totalPoolBalance += msg.value;

        emit PolicyCreated(policyCounter, msg.sender, msg.value, coverage);
        return policyCounter;
    }

    // ── File claim (called by dispute resolution or admin) ───────────────

    function fileClaim(uint256 policyId) external nonReentrant {
        require(
            msg.sender == disputeResolutionContract || hasRole(ADMIN_ROLE, msg.sender),
            "Unauthorized"
        );
        Policy storage p = policies[policyId];
        require(!p.claimed && !p.withdrawn, "Already used");
        require(block.timestamp <= p.expiresAt, "Expired");

        p.claimed = true;
        uint256 payout = p.coverage;
        if (payout > address(this).balance) payout = address(this).balance;

        totalPoolBalance = totalPoolBalance > payout ? totalPoolBalance - payout : 0;
        (bool ok,) = payable(p.freelancer).call{value: payout}("");
        require(ok, "Payout failed");

        emit ClaimPaid(policyId, p.freelancer, payout);
    }

    // ── Withdraw premium (after expiry, no claim) ────────────────────────

    function withdrawPremium(uint256 policyId) external nonReentrant {
        Policy storage p = policies[policyId];
        require(msg.sender == p.freelancer, "Not owner");
        require(!p.claimed && !p.withdrawn, "Already used");
        require(block.timestamp > p.expiresAt, "Not expired");

        p.withdrawn = true;
        totalPoolBalance -= p.premium;
        (bool ok,) = payable(msg.sender).call{value: p.premium}("");
        require(ok, "Withdraw failed");

        emit PremiumWithdrawn(policyId, msg.sender, p.premium);
    }

    // ── Fund pool (admin / governance) ───────────────────────────────────

    function fundPool() external payable {
        require(msg.value > 0, "Send ETH");
        totalPoolBalance += msg.value;
        emit PoolFunded(msg.sender, msg.value);
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getPolicy(uint256 id) external view returns (Policy memory) { return policies[id]; }

    function getUserPolicies(address user) external view returns (Policy[] memory) {
        uint256[] storage ids = userPolicies[user];
        Policy[] memory r = new Policy[](ids.length);
        for (uint256 i; i < ids.length; i++) r[i] = policies[ids[i]];
        return r;
    }

    function poolBalance() external view returns (uint256) { return address(this).balance; }

    receive() external payable { totalPoolBalance += msg.value; }
}
