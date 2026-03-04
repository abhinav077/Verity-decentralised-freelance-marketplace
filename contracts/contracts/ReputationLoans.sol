// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVRT_RL {
    function balanceOf(address) external view returns (uint256);
    function mint(address, uint256) external;
    function burn(address, uint256) external;
}

/**
 * @title ReputationLoans
 * @notice H2 - Reputation loans: users can borrow temporary VRT to meet
 *         minimum thresholds (e.g. min VRT to bid). The loan must be repaid
 *         by earning VRT through completing jobs. If not repaid within the
 *         loan period, the user is flagged as defaulted.
 *
 * Design:
 *  - Max loan = 50 VRT (enough to unlock basic bidding)
 *  - Loan duration = 30 days
 *  - Collateral = 0.005 ETH per 10 VRT borrowed (refunded on repay)
 *  - Users can only have 1 active loan at a time
 */
contract ReputationLoans is AccessControl, ReentrancyGuard {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    address public vrtToken;

    struct Loan {
        uint256 id;
        address borrower;
        uint256 amount;            // VRT borrowed
        uint256 collateral;        // ETH collateral
        uint256 repaid;            // VRT repaid so far
        uint256 createdAt;
        uint256 expiresAt;
        bool    settled;           // fully repaid or defaulted
        bool    defaulted;
    }

    uint256 public loanCounter;
    uint256 public constant MAX_LOAN_AMOUNT = 50 * 1e18;
    uint256 public constant LOAN_DURATION = 30 days;
    uint256 public constant COLLATERAL_PER_10_VRT = 0.005 ether;

    mapping(uint256 => Loan)     public loans;
    mapping(address => uint256)  public activeLoan;      // user -> loanId (0 = none)
    mapping(address => uint256[]) public userLoans;
    mapping(address => bool)     public hasDefaulted;

    uint256 public collectedCollateral;

    event LoanCreated(uint256 indexed id, address indexed borrower, uint256 amount, uint256 collateral);
    event LoanRepaid(uint256 indexed id, address indexed borrower, uint256 amount);
    event LoanSettled(uint256 indexed id, address indexed borrower);
    event LoanDefaulted(uint256 indexed id, address indexed borrower);
    event CollateralRefunded(uint256 indexed id, address indexed borrower, uint256 amount);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function setVRTToken(address _v) external onlyRole(ADMIN_ROLE) { vrtToken = _v; }

    // ── Take a loan ──────────────────────────────────────────────────────

    function takeLoan(uint256 amount) external payable returns (uint256) {
        require(vrtToken != address(0), "VRT not set");
        require(amount > 0 && amount <= MAX_LOAN_AMOUNT, "Bad amount");
        require(activeLoan[msg.sender] == 0, "Active loan exists");
        require(!hasDefaulted[msg.sender], "Previously defaulted");

        uint256 requiredCollateral = (amount * COLLATERAL_PER_10_VRT) / (10 * 1e18);
        if (requiredCollateral == 0) requiredCollateral = COLLATERAL_PER_10_VRT; // minimum
        require(msg.value >= requiredCollateral, "Insufficient collateral");

        loanCounter++;
        loans[loanCounter] = Loan({
            id: loanCounter,
            borrower: msg.sender,
            amount: amount,
            collateral: msg.value,
            repaid: 0,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + LOAN_DURATION,
            settled: false,
            defaulted: false
        });
        activeLoan[msg.sender] = loanCounter;
        userLoans[msg.sender].push(loanCounter);
        collectedCollateral += msg.value;

        // Mint VRT to borrower
        IVRT_RL(vrtToken).mint(msg.sender, amount);

        emit LoanCreated(loanCounter, msg.sender, amount, msg.value);
        return loanCounter;
    }

    // ── Repay loan (burn VRT) ────────────────────────────────────────────

    function repayLoan(uint256 amount) external nonReentrant {
        uint256 lid = activeLoan[msg.sender];
        require(lid != 0, "No active loan");
        Loan storage l = loans[lid];
        require(!l.settled, "Already settled");
        require(amount > 0, "Amount > 0");

        uint256 remaining = l.amount - l.repaid;
        uint256 toRepay = amount > remaining ? remaining : amount;

        require(IVRT_RL(vrtToken).balanceOf(msg.sender) >= toRepay, "Insufficient VRT");
        IVRT_RL(vrtToken).burn(msg.sender, toRepay);
        l.repaid += toRepay;

        emit LoanRepaid(lid, msg.sender, toRepay);

        if (l.repaid >= l.amount) {
            l.settled = true;
            activeLoan[msg.sender] = 0;

            // Refund collateral
            collectedCollateral -= l.collateral;
            (bool ok,) = payable(msg.sender).call{value: l.collateral}("");
            require(ok, "Refund failed");

            emit LoanSettled(lid, msg.sender);
            emit CollateralRefunded(lid, msg.sender, l.collateral);
        }
    }

    // ── Mark default (anyone can call after expiry) ──────────────────────

    function markDefault(uint256 loanId) external {
        Loan storage l = loans[loanId];
        require(!l.settled, "Settled");
        require(block.timestamp > l.expiresAt, "Not expired");

        l.settled = true;
        l.defaulted = true;
        hasDefaulted[l.borrower] = true;
        activeLoan[l.borrower] = 0;

        // Collateral is forfeited (stays in contract)
        emit LoanDefaulted(loanId, l.borrower);
    }

    // ── Admin: withdraw forfeited collateral ─────────────────────────────

    function withdrawForfeitedCollateral() external onlyRole(ADMIN_ROLE) nonReentrant {
        // Only withdraw collateral from defaulted loans
        uint256 forfeited;
        for (uint256 i = 1; i <= loanCounter; i++) {
            if (loans[i].defaulted) {
                forfeited += loans[i].collateral;
                loans[i].collateral = 0; // prevent double withdrawal
            }
        }
        require(forfeited > 0, "Nothing to withdraw");
        (bool ok,) = payable(msg.sender).call{value: forfeited}("");
        require(ok, "Withdraw failed");
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getLoan(uint256 id) external view returns (Loan memory) { return loans[id]; }

    function getUserLoans(address user) external view returns (Loan[] memory) {
        uint256[] storage ids = userLoans[user];
        Loan[] memory r = new Loan[](ids.length);
        for (uint256 i; i < ids.length; i++) r[i] = loans[ids[i]];
        return r;
    }

    function getActiveLoan(address user) external view returns (Loan memory) {
        uint256 lid = activeLoan[user];
        return loans[lid];
    }
}
