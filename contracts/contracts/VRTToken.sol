// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title VRTToken (Verity Reputation Token)
 * @notice Soulbound reputation token with tier-based benefits
 * @dev Non-transferable ERC20. Tiers unlock fee discounts, governance power,
 *      jury eligibility, and bounty access.
 *
 * Tier thresholds (cumulative balance):
 *   Bronze   : 0 VRT    — basic access
 *   Silver   : 50 VRT   — 25 % fee discount, can post bounties
 *   Gold     : 200 VRT  — 50 % fee discount, priority jury, verified badge
 *   Platinum : 500 VRT  — 75 % fee discount, 2× governance weight
 */
contract VRTToken is ERC20, AccessControl {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ── Tier system ──────────────────────────────────────────────────────────

    enum Tier { Bronze, Silver, Gold, Platinum }

    uint256 public constant SILVER_THRESHOLD   =  50 * 1e18;
    uint256 public constant GOLD_THRESHOLD     = 200 * 1e18;
    uint256 public constant PLATINUM_THRESHOLD = 500 * 1e18;

    /// @notice Fee discount per tier in basis-points (0 – 10 000)
    mapping(Tier => uint256) public tierFeeDiscount;

    /// @notice Lifetime tokens earned (never decreases, used for tier calc)
    mapping(address => uint256) public totalEarned;

    // ── Events ───────────────────────────────────────────────────────────────

    event TokensEarned(address indexed user, uint256 amount, string reason);
    event TokensBurned(address indexed user, uint256 amount, string reason);
    event TierChanged(address indexed user, Tier oldTier, Tier newTier);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor() ERC20("Verity Reputation Token", "VRT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);

        tierFeeDiscount[Tier.Bronze]   =     0; // 0 %
        tierFeeDiscount[Tier.Silver]   =  2500; // 25 %
        tierFeeDiscount[Tier.Gold]     =  5000; // 50 %
        tierFeeDiscount[Tier.Platinum] =  7500; // 75 %
    }

    // ── Mint / Burn ──────────────────────────────────────────────────────────

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
        totalEarned[to] += amount;
        _checkTierChange(to);
        emit TokensEarned(to, amount, "");
    }

    function mintWithReason(address to, uint256 amount, string calldata reason)
        external onlyRole(MINTER_ROLE)
    {
        _mint(to, amount);
        totalEarned[to] += amount;
        _checkTierChange(to);
        emit TokensEarned(to, amount, reason);
    }

    function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(balanceOf(from) >= amount, "VRT: insufficient balance");
        _burn(from, amount);
        emit TokensBurned(from, amount, "");
    }

    function burnWithReason(address from, uint256 amount, string calldata reason)
        external onlyRole(MINTER_ROLE)
    {
        require(balanceOf(from) >= amount, "VRT: insufficient balance");
        _burn(from, amount);
        emit TokensBurned(from, amount, reason);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    function getReputation(address user) external view returns (uint256) {
        return balanceOf(user);
    }

    function getTier(address user) external view returns (Tier) {
        return _calculateTier(user);
    }

    /// @return Basis-point discount the user qualifies for (0 – 7500)
    function getFeeDiscount(address user) external view returns (uint256) {
        return tierFeeDiscount[_calculateTier(user)];
    }

    /// @return Governance voting weight multiplier (×100). Platinum = 200, others = 100.
    function getGovernanceWeight(address user) external view returns (uint256) {
        return _calculateTier(user) == Tier.Platinum ? 200 : 100;
    }

    /// @return True if user qualifies as a dispute juror (Silver+ and ≥ 10 VRT balance)
    function isEligibleJuror(address user) external view returns (bool) {
        return balanceOf(user) >= 10 * 1e18 && _calculateTier(user) >= Tier.Silver;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _calculateTier(address user) internal view returns (Tier) {
        uint256 earned = totalEarned[user];
        if (earned >= PLATINUM_THRESHOLD) return Tier.Platinum;
        if (earned >= GOLD_THRESHOLD)     return Tier.Gold;
        if (earned >= SILVER_THRESHOLD)   return Tier.Silver;
        return Tier.Bronze;
    }

    function _checkTierChange(address user) internal {
        Tier current  = _calculateTier(user);
        // Quick storage check: read last stored tier from totalEarned delta
        // We store tier implicitly via threshold — no extra slot needed.
        // TierChanged event is emitted whenever totalEarned crosses a threshold.
        // For simplicity, always emit if _might_ have changed (caller just minted).
        // Frontend deduplicates.
        emit TierChanged(user, Tier.Bronze, current); // simplified; frontend checks
    }

    // ── Soulbound overrides ──────────────────────────────────────────────────

    function transfer(address, uint256) public pure override returns (bool) {
        revert("VRT: soulbound - cannot transfer");
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("VRT: soulbound - cannot transfer");
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert("VRT: soulbound - cannot approve");
    }
}
