// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SubContracting
 * @notice Allows a freelancer to delegate part of a job to a sub-contractor.
 *
 *  Flow A — Direct assignment:
 *    createSubContract(jobId, subContractorAddr, desc) { value: ETH }
 *    → sub submits work → primary approves → ETH sent to sub
 *
 *  Flow B — Open listing (marketplace):
 *    createSubContract(jobId, address(0), desc) { value: ETH }
 *    → freelancers apply → primary assigns one → sub submits → approve
 */
contract SubContracting is AccessControl, ReentrancyGuard {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ── Enums / Structs ──────────────────────────────────────────────────

    enum Status { Open, Active, Submitted, Approved, Cancelled }

    struct SubContract {
        uint256 id;
        uint256 parentJobId;
        address primaryFreelancer;
        address subContractor;      // address(0) while Open
        string  description;
        uint256 payment;            // ETH locked on creation
        Status  status;
        uint256 createdAt;
        uint256 completedAt;
    }

    // ── State ────────────────────────────────────────────────────────────

    uint256 public subContractCounter;

    mapping(uint256 => SubContract)  public subContracts;
    mapping(uint256 => uint256[])    public jobSubContracts;   // parentJobId → ids
    mapping(address => uint256[])    public userSubContracts;  // user → ids

    // Applications for open listings
    mapping(uint256 => address[])    public applications;      // scId → applicants
    mapping(uint256 => mapping(address => bool)) public hasApplied;

    // ── Events ───────────────────────────────────────────────────────────

    event SubContractCreated(uint256 indexed id, uint256 indexed parentJobId, address indexed primaryFreelancer, uint256 payment, bool isOpen);
    event ApplicationSubmitted(uint256 indexed id, address indexed applicant);
    event SubContractorAssigned(uint256 indexed id, address indexed subContractor);
    event WorkSubmitted(uint256 indexed id, address indexed subContractor);
    event WorkApproved(uint256 indexed id, address indexed subContractor, uint256 payment);
    event SubContractCancelled(uint256 indexed id);

    // ── Constructor ──────────────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ── Create ───────────────────────────────────────────────────────────

    /**
     * @notice Create a sub-contract. Pass address(0) as subContractor to create
     *         an open listing that freelancers can apply to.
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
            completedAt: 0
        });

        jobSubContracts[parentJobId].push(scId);
        userSubContracts[msg.sender].push(scId);
        if (!isOpen) {
            userSubContracts[subContractor].push(scId);
        }

        emit SubContractCreated(scId, parentJobId, msg.sender, msg.value, isOpen);
        return scId;
    }

    // ── Apply (open listings) ────────────────────────────────────────────

    function applyForSubContract(uint256 scId) external {
        SubContract storage sc = subContracts[scId];
        require(sc.id != 0, "Not found");
        require(sc.status == Status.Open, "Not open");
        require(msg.sender != sc.primaryFreelancer, "Cannot apply to own");
        require(!hasApplied[scId][msg.sender], "Already applied");

        applications[scId].push(msg.sender);
        hasApplied[scId][msg.sender] = true;

        emit ApplicationSubmitted(scId, msg.sender);
    }

    // ── Assign (open listings) ───────────────────────────────────────────

    function assignSubContractor(uint256 scId, address _sub) external {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.primaryFreelancer, "Not primary");
        require(sc.status == Status.Open, "Not open");
        require(_sub != address(0) && _sub != msg.sender, "Bad address");
        require(hasApplied[scId][_sub], "Not applied");

        sc.subContractor = _sub;
        sc.status = Status.Active;
        userSubContracts[_sub].push(scId);

        emit SubContractorAssigned(scId, _sub);
    }

    // ── Sub-contractor submits work ──────────────────────────────────────

    function submitWork(uint256 scId) external {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.subContractor, "Not sub");
        require(sc.status == Status.Active, "Not active");
        sc.status = Status.Submitted;
        emit WorkSubmitted(scId, msg.sender);
    }

    // ── Primary approves + pays ──────────────────────────────────────────

    function approveWork(uint256 scId) external nonReentrant {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.primaryFreelancer, "Not primary");
        require(sc.status == Status.Submitted, "Not submitted");

        sc.status = Status.Approved;
        sc.completedAt = block.timestamp;

        (bool ok,) = payable(sc.subContractor).call{value: sc.payment}("");
        require(ok, "Payment failed");

        emit WorkApproved(scId, sc.subContractor, sc.payment);
    }

    // ── Cancel (refund to primary) ───────────────────────────────────────

    function cancelSubContract(uint256 scId) external nonReentrant {
        SubContract storage sc = subContracts[scId];
        require(msg.sender == sc.primaryFreelancer, "Not primary");
        require(sc.status == Status.Open || sc.status == Status.Active, "Cannot cancel");

        sc.status = Status.Cancelled;
        (bool ok,) = payable(msg.sender).call{value: sc.payment}("");
        require(ok, "Refund failed");

        emit SubContractCancelled(scId);
    }

    // ── Views ────────────────────────────────────────────────────────────

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

    /// @notice Returns all sub-contracts with status Open (marketplace listings)
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
}
