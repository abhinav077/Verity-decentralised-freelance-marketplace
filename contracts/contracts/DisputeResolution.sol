// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/* ── Minimal interfaces ──────────────────────────────────────────────────── */

interface IVRT_DR {
    function balanceOf(address) external view returns (uint256);
    function mint(address, uint256) external;
}

interface IJobMarket_DR {
    function markDisputed(uint256 jobId) external;
    function resolveDispute(uint256 jobId, bool clientWins) external;
    function restoreToInProgress(uint256 jobId) external;
}

interface IEscrow_DR {
    function releasePayment(uint256 jobId) external;
    function refundClient(uint256 jobId) external;
    function splitPayment(uint256 jobId, uint256 clientPercent) external;
}

/**
 * @title DisputeResolution
 * @notice Direct voting, proportion demands, admin escalation.
 *
 * Flow:
 *  1. raiseDispute → ResponsePhase (3 days)
 *  2. submitResponse → VotingPhase (5 days)
 *     OR response deadline passes → can advanceToVoting or escalateToAdmin
 *  3. Both parties submit proportion demands (% they want for themselves)
 *  4. Voters vote directly: Client / Freelancer / ReProportion
 *  5. resolveDispute:
 *     → client/freelancer wins → use winner's proportion demand as split
 *     → re-proportion wins → reset votes, parties re-submit demands
 *  6. If no votes → either party can escalateToAdmin
 *  7. Admin resolves escalated disputes with their own split
 */
contract DisputeResolution is AccessControl, ReentrancyGuard {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ── External contracts ───────────────────────────────────────────────

    address public jobMarketContract;
    address public escrowContract;
    address public vrtToken;

    // ── Configurable parameters (admin-tunable) ─────────────────────────

    uint256 public RESPONSE_PERIOD      = 3 days;
    uint256 public VOTING_PERIOD         = 5 days;
    uint256 public AUTO_RESOLVE_DEADLINE = 10 days;  // 3 days response + 7 days grace

    // ── Rewards ──────────────────────────────────────────────────────────

    uint256 public VOTER_REWARD    = 2 * 1e18;   // 2 VRT per correct vote
    uint256 public MIN_VRT_TO_VOTE = 0;           // temporarily 0

    // ── Enums ────────────────────────────────────────────────────────────

    enum Status {
        Active,             // 0
        ResponsePhase,      // 1
        VotingPhase,        // 2
        Resolved,           // 3
        AutoResolved,       // 4
        Withdrawn,          // 5
        EscalatedToAdmin    // 6
    }

    enum VoteType { Client, Freelancer, ReProportion }

    // ── Structs ──────────────────────────────────────────────────────────

    struct Dispute {
        uint256 id;
        uint256 jobId;
        address initiator;
        address client;
        address freelancer;
        string  reason;
        string  respondentDescription;
        bool    responseSubmitted;
        Status  status;
        uint256 createdAt;
        uint256 responseDeadline;
        uint256 votingDeadline;
        uint256 clientVotes;
        uint256 freelancerVotes;
        uint256 reProportionVotes;
        bool    clientWon;
        uint256 clientPercent;          // final split: client gets this %
        uint256 totalVoters;
        uint256 freelancerDemandPct;    // what % freelancer wants for themselves
        uint256 clientDemandPct;        // what % client wants for themselves
        bool    freelancerDemandSet;
        bool    clientDemandSet;
        uint256 votingRound;            // starts at 1, increments on re-proportion
    }

    struct Evidence {
        address party;
        string  ipfsHash;
        uint256 timestamp;
    }

    // ── State ────────────────────────────────────────────────────────────

    uint256 public disputeCounter;
    uint256 public accumulatedFees;

    mapping(uint256 => Dispute)      public disputes;
    mapping(uint256 => Evidence[])   public evidence;

    // Voting state: did => round => voter => voted
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVotedRound;

    // Track voters per round for rewards
    mapping(uint256 => mapping(uint256 => address[])) internal _roundVoters;

    // Vote choice: did => round => voter => voteType (0=Client,1=Freelancer,2=ReProportion)
    mapping(uint256 => mapping(uint256 => mapping(address => uint8))) public voterChoice;

    // ── Events ───────────────────────────────────────────────────────────

    event DisputeCreated(uint256 indexed disputeId, uint256 indexed jobId, address indexed initiator);
    event ResponseSubmitted(uint256 indexed disputeId, address indexed respondent);
    event EvidenceSubmitted(uint256 indexed disputeId, address indexed party, string ipfsHash);
    event VoteCast(uint256 indexed disputeId, address indexed voter, uint8 voteType);
    event DisputeResolved(uint256 indexed disputeId, bool clientWon, uint256 clientVotes, uint256 freelancerVotes);
    event DisputeSplitResolved(uint256 indexed disputeId, uint256 clientPercent);
    event DisputeAutoResolved(uint256 indexed disputeId, string reason);
    event DisputeWithdrawn(uint256 indexed disputeId, address indexed initiator);
    event VoterRewarded(uint256 indexed disputeId, address indexed voter, uint256 amount);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event ProportionDemandSet(uint256 indexed disputeId, address indexed party, uint256 demandPct);
    event VotingReset(uint256 indexed disputeId, uint256 newRound);
    event EscalatedToAdmin(uint256 indexed disputeId, address indexed escalatedBy);
    event AdminResolved(uint256 indexed disputeId, uint256 freelancerPercent);

    // ── Constructor ──────────────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ── Admin setters ────────────────────────────────────────────────────

    function setJobMarketContract(address _j) external onlyRole(ADMIN_ROLE) { jobMarketContract = _j; }
    function setEscrowContract(address _e)    external onlyRole(ADMIN_ROLE) { escrowContract = _e; }
    function setVRTToken(address _v)          external onlyRole(ADMIN_ROLE) { vrtToken = _v; }
    function setDFMToken(address _v)          external onlyRole(ADMIN_ROLE) { vrtToken = _v; }
    function setResponsePeriod(uint256 _p)    external onlyRole(ADMIN_ROLE) { RESPONSE_PERIOD = _p; }
    function setVotingPeriod(uint256 _p)      external onlyRole(ADMIN_ROLE) { VOTING_PERIOD = _p; }
    function setAutoResolveDeadline(uint256 _d) external onlyRole(ADMIN_ROLE) { AUTO_RESOLVE_DEADLINE = _d; }
    function setVoterReward(uint256 _r)       external onlyRole(ADMIN_ROLE) { VOTER_REWARD = _r; }
    function setMinVrtToVote(uint256 _m)      external onlyRole(ADMIN_ROLE) { MIN_VRT_TO_VOTE = _m; }

    // ═══════════════════════════════════════════════════════════════════════
    //  1) RAISE DISPUTE
    // ═══════════════════════════════════════════════════════════════════════

    function raiseDispute(
        uint256 jobId,
        address client,
        address freelancer,
        string calldata reason
    ) external returns (uint256) {
        return _raiseDispute(jobId, client, freelancer, reason);
    }

    function _raiseDispute(
        uint256 jobId,
        address client,
        address freelancer,
        string calldata reason
    ) internal returns (uint256) {
        require(msg.sender == client || msg.sender == freelancer, "Not party");
        require(bytes(reason).length > 0, "Reason required");

        disputeCounter++;
        uint256 did = disputeCounter;

        disputes[did] = Dispute({
            id: did,
            jobId: jobId,
            initiator: msg.sender,
            client: client,
            freelancer: freelancer,
            reason: reason,
            respondentDescription: "",
            responseSubmitted: false,
            status: Status.ResponsePhase,
            createdAt: block.timestamp,
            responseDeadline: block.timestamp + RESPONSE_PERIOD,
            votingDeadline: 0,
            clientVotes: 0,
            freelancerVotes: 0,
            reProportionVotes: 0,
            clientWon: false,
            clientPercent: 0,
            totalVoters: 0,
            freelancerDemandPct: 0,
            clientDemandPct: 0,
            freelancerDemandSet: false,
            clientDemandSet: false,
            votingRound: 1
        });

        if (jobMarketContract != address(0)) {
            IJobMarket_DR(jobMarketContract).markDisputed(jobId);
        }

        emit DisputeCreated(did, jobId, msg.sender);
        return did;
    }

    /// @notice Raise dispute + submit initiator evidence + set initiator demand in one tx.
    function raiseDisputeWithEvidenceAndDemand(
        uint256 jobId,
        address client,
        address freelancer,
        string calldata reason,
        string calldata ipfsHash,
        uint256 myPercent
    ) external returns (uint256) {
        uint256 did = _raiseDispute(jobId, client, freelancer, reason);
        _submitEvidence(did, ipfsHash);
        _setProportionDemand(did, myPercent);
        return did;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  2) RESPOND
    // ═══════════════════════════════════════════════════════════════════════

    function submitResponse(uint256 did, string calldata desc) external {
        _submitResponse(did, desc);
    }

    /// @notice Submit respondent description + evidence + demand in one tx.
    function submitResponseWithEvidenceAndDemand(
        uint256 did,
        string calldata desc,
        string calldata ipfsHash,
        uint256 myPercent
    ) external {
        _submitResponse(did, desc);
        _submitEvidence(did, ipfsHash);
        _setProportionDemand(did, myPercent);
    }

    function _submitResponse(uint256 did, string calldata desc) internal {
        Dispute storage d = disputes[did];
        require(d.status == Status.ResponsePhase, "Not response phase");
        require(!d.responseSubmitted, "Already responded");
        address other = d.initiator == d.client ? d.freelancer : d.client;
        require(msg.sender == other, "Not respondent");

        d.respondentDescription = desc;
        d.responseSubmitted = true;
        _startVotingPhase(d);

        emit ResponseSubmitted(did, msg.sender);
    }

    /// @notice Advance to voting if response deadline passed (anyone can call)
    function advanceToVotingPhase(uint256 did) external {
        Dispute storage d = disputes[did];
        require(d.status == Status.ResponsePhase && block.timestamp >= d.responseDeadline, "Cannot advance");
        _startVotingPhase(d);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  3) EVIDENCE
    // ═══════════════════════════════════════════════════════════════════════

    function submitEvidence(uint256 did, string calldata ipfsHash) external {
        _submitEvidence(did, ipfsHash);
    }

    function _submitEvidence(uint256 did, string calldata ipfsHash) internal {
        Dispute storage d = disputes[did];
        require(msg.sender == d.client || msg.sender == d.freelancer, "Not party");
        require(
            d.status != Status.Resolved &&
            d.status != Status.AutoResolved &&
            d.status != Status.Withdrawn,
            "Closed"
        );
        require(bytes(ipfsHash).length > 0, "Empty");

        evidence[did].push(Evidence(msg.sender, ipfsHash, block.timestamp));
        emit EvidenceSubmitted(did, msg.sender, ipfsHash);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  4) SET PROPORTION DEMAND
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Each party sets what % of escrowed funds THEY want for themselves.
     * @param did  Dispute ID
     * @param myPercent  0-100: what % of escrowed funds the caller wants
     *
     * Example: freelancer did 1/3 of the work →
     *   freelancer calls setProportionDemand(did, 30)   → wants 30% for themselves
     *   client calls    setProportionDemand(did, 85)    → wants 85% for themselves
     *   If voters pick freelancer → freelancer gets 30%, client gets 70%
     *   If voters pick client → client gets 85%, freelancer gets 15%
     */
    function setProportionDemand(uint256 did, uint256 myPercent) external {
        _setProportionDemand(did, myPercent);
    }

    function _setProportionDemand(uint256 did, uint256 myPercent) internal {
        Dispute storage d = disputes[did];
        require(
            d.status == Status.VotingPhase || d.status == Status.ResponsePhase,
            "Cannot set demand"
        );
        require(myPercent <= 100, "> 100");

        if (msg.sender == d.client) {
            d.clientDemandPct = myPercent;
            d.clientDemandSet = true;
        } else if (msg.sender == d.freelancer) {
            d.freelancerDemandPct = myPercent;
            d.freelancerDemandSet = true;
        } else {
            revert("Not party");
        }

        emit ProportionDemandSet(did, msg.sender, myPercent);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  5) CAST VOTE (direct — no commit-reveal)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Cast a vote on a dispute.
     * @param did       Dispute ID
     * @param voteType  0 = Client wins, 1 = Freelancer wins, 2 = Demand re-proportion
     */
    function castVote(uint256 did, uint8 voteType) external {
        Dispute storage d = disputes[did];
        require(d.status == Status.VotingPhase, "Not voting phase");
        require(block.timestamp < d.votingDeadline, "Voting ended");
        require(!hasVotedRound[did][d.votingRound][msg.sender], "Already voted");
        require(msg.sender != d.client && msg.sender != d.freelancer, "Party cannot vote");
        require(voteType <= 2, "Invalid vote type");

        // MIN_VRT_TO_VOTE is 0 for now — anyone can vote
        if (MIN_VRT_TO_VOTE > 0 && vrtToken != address(0)) {
            require(IVRT_DR(vrtToken).balanceOf(msg.sender) >= MIN_VRT_TO_VOTE, "Need VRT");
        }

        hasVotedRound[did][d.votingRound][msg.sender] = true;
        voterChoice[did][d.votingRound][msg.sender] = voteType;
        _roundVoters[did][d.votingRound].push(msg.sender);

        d.totalVoters++;
        if (voteType == 0) d.clientVotes++;
        else if (voteType == 1) d.freelancerVotes++;
        else d.reProportionVotes++;

        emit VoteCast(did, msg.sender, voteType);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  6) RESOLVE
    // ═══════════════════════════════════════════════════════════════════════

    function resolveDispute(uint256 did) external nonReentrant {
        Dispute storage d = disputes[did];
        require(d.status == Status.VotingPhase && block.timestamp >= d.votingDeadline, "Cannot resolve");
        require(d.totalVoters > 0, "No votes - escalate to admin");

        // Check if re-proportion won
        if (d.reProportionVotes > d.clientVotes && d.reProportionVotes > d.freelancerVotes) {
            // Reset voting — parties must adjust demands
            d.votingRound++;
            d.clientVotes = 0;
            d.freelancerVotes = 0;
            d.reProportionVotes = 0;
            d.totalVoters = 0;
            d.votingDeadline = block.timestamp + VOTING_PERIOD;

            emit VotingReset(did, d.votingRound);
            return;
        }

        // Determine winner — ties trigger re-vote
        if (d.clientVotes == d.freelancerVotes) {
            // 50-50 tie: reset voting round for re-vote
            d.votingRound++;
            d.clientVotes = 0;
            d.freelancerVotes = 0;
            d.reProportionVotes = 0;
            d.totalVoters = 0;
            d.votingDeadline = block.timestamp + VOTING_PERIOD;

            emit VotingReset(did, d.votingRound);
            return;
        }

        bool clientWins = d.clientVotes > d.freelancerVotes;
        d.clientWon = clientWins;

        // Apply proportion demands
        if (clientWins && d.clientDemandSet) {
            d.clientPercent = d.clientDemandPct;
        } else if (!clientWins && d.freelancerDemandSet) {
            // Freelancer demanded X% for themselves → client gets (100 - X)%
            d.clientPercent = 100 - d.freelancerDemandPct;
        } else {
            // No demand set → winner takes all
            d.clientPercent = clientWins ? 100 : 0;
        }

        d.status = Status.Resolved;
        _executeResolution(d);
        _rewardVoters(did);

        emit DisputeResolved(did, clientWins, d.clientVotes, d.freelancerVotes);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  7) ESCALATE TO ADMIN
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Either party can escalate to admin if:
     *   - Response deadline passed with no response AND 7-day grace period also passed, OR
     *   - Voting ended with no votes
     */
    function escalateToAdmin(uint256 did) external {
        Dispute storage d = disputes[did];
        require(msg.sender == d.client || msg.sender == d.freelancer, "Not party");

        bool canEscalate = false;

        // Case 1: Response deadline passed, no response given, and 7-day grace period passed
        if (d.status == Status.ResponsePhase &&
            block.timestamp >= d.responseDeadline + 7 days &&
            !d.responseSubmitted) {
            canEscalate = true;
        }

        // Case 2: Voting ended, no one voted
        if (d.status == Status.VotingPhase &&
            block.timestamp >= d.votingDeadline &&
            d.totalVoters == 0) {
            canEscalate = true;
        }

        require(canEscalate, "Cannot escalate");
        d.status = Status.EscalatedToAdmin;

        emit EscalatedToAdmin(did, msg.sender);
    }

    /// @notice Admin resolves an escalated dispute with a custom split
    function resolveEscalatedDispute(uint256 did, uint256 freelancerPct) external onlyRole(ADMIN_ROLE) nonReentrant {
        Dispute storage d = disputes[did];
        require(d.status == Status.EscalatedToAdmin, "Not escalated");
        require(freelancerPct <= 100, "> 100");

        d.clientPercent = 100 - freelancerPct;
        d.clientWon = freelancerPct < 50;
        d.status = Status.Resolved;

        _executeResolution(d);

        emit AdminResolved(did, freelancerPct);
    }

    /// @notice Admin can resolve any active dispute with a custom split
    function resolveWithSplit(uint256 did, uint256 clientPct) external onlyRole(ADMIN_ROLE) nonReentrant {
        Dispute storage d = disputes[did];
        require(
            d.status == Status.VotingPhase ||
            d.status == Status.ResponsePhase ||
            d.status == Status.EscalatedToAdmin,
            "Cannot split"
        );
        require(clientPct <= 100, "> 100");

        d.clientPercent = clientPct;
        d.clientWon = clientPct > 50;
        d.status = Status.Resolved;

        if (escrowContract != address(0)) {
            IEscrow_DR(escrowContract).splitPayment(d.jobId, clientPct);
        }
        if (jobMarketContract != address(0)) {
            IJobMarket_DR(jobMarketContract).resolveDispute(d.jobId, d.clientWon);
        }

        emit DisputeSplitResolved(did, clientPct);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  AUTO-RESOLVE (safety net — 14 day deadline)
    // ═══════════════════════════════════════════════════════════════════════

    function autoResolveDispute(uint256 did) external nonReentrant {
        Dispute storage d = disputes[did];
        require(block.timestamp >= d.createdAt + AUTO_RESOLVE_DEADLINE, "Too early");
        require(
            d.status != Status.Resolved &&
            d.status != Status.AutoResolved &&
            d.status != Status.Withdrawn &&
            d.status != Status.EscalatedToAdmin,
            "Closed"
        );

        bool clientWins;
        if (d.totalVoters == 0) {
            // No votes — initiator wins (they raised the dispute, other party didn't respond)
            clientWins = d.initiator == d.client;
        } else {
            clientWins = d.clientVotes > d.freelancerVotes;
        }

        d.clientWon = clientWins;
        d.clientPercent = clientWins ? 100 : 0;
        d.status = Status.AutoResolved;

        _executeResolution(d);
        if (d.totalVoters > 0) _rewardVoters(did);

        emit DisputeAutoResolved(
            did,
            d.totalVoters == 0 ? "No response, initiator wins" : "Deadline reached"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  WITHDRAW DISPUTE
    // ═══════════════════════════════════════════════════════════════════════

    function withdrawDispute(uint256 did) external nonReentrant {
        Dispute storage d = disputes[did];
        require(msg.sender == d.initiator, "Only initiator");
        address other = d.initiator == d.client ? d.freelancer : d.client;
        require(!_hasPartyEvidence(did, other), "Counterparty already submitted evidence");
        require(
            d.status != Status.Resolved &&
            d.status != Status.AutoResolved &&
            d.status != Status.Withdrawn,
            "Closed"
        );

        d.status = Status.Withdrawn;
        if (jobMarketContract != address(0)) {
            IJobMarket_DR(jobMarketContract).restoreToInProgress(d.jobId);
        }
        emit DisputeWithdrawn(did, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  FEE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    function withdrawFees() external onlyRole(ADMIN_ROLE) nonReentrant {
        require(accumulatedFees > 0, "No fees");
        uint256 amt = accumulatedFees;
        accumulatedFees = 0;
        (bool ok,) = payable(msg.sender).call{value: amt}("");
        require(ok, "Transfer failed");
        emit FeesWithdrawn(msg.sender, amt);
    }

    receive() external payable { accumulatedFees += msg.value; }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════════

    function getDispute(uint256 did) external view returns (Dispute memory) {
        return disputes[did];
    }

    function getEvidence(uint256 did) external view returns (Evidence[] memory) {
        return evidence[did];
    }

    function hasSubmittedEvidence(uint256 did, address party) external view returns (bool) {
        return _hasPartyEvidence(did, party);
    }

    /// @notice Real-time vote tallies — frontend shows to parties only
    function getVoteTallies(uint256 did)
        external view
        returns (uint256 cVotes, uint256 fVotes, uint256 rpVotes)
    {
        Dispute storage d = disputes[did];
        return (d.clientVotes, d.freelancerVotes, d.reProportionVotes);
    }

    function getDisputesByJob(uint256 jobId) external view returns (uint256[] memory) {
        uint256 count;
        for (uint256 i = 1; i <= disputeCounter; i++)
            if (disputes[i].jobId == jobId) count++;
        uint256[] memory ids = new uint256[](count);
        count = 0;
        for (uint256 i = 1; i <= disputeCounter; i++)
            if (disputes[i].jobId == jobId) { ids[count] = i; count++; }
        return ids;
    }

    function getUserDisputes(address user) external view returns (uint256[] memory) {
        uint256 count;
        for (uint256 i = 1; i <= disputeCounter; i++)
            if (disputes[i].client == user || disputes[i].freelancer == user) count++;
        uint256[] memory ids = new uint256[](count);
        count = 0;
        for (uint256 i = 1; i <= disputeCounter; i++)
            if (disputes[i].client == user || disputes[i].freelancer == user) {
                ids[count] = i; count++;
            }
        return ids;
    }

    function getRoundVoters(uint256 did, uint256 round) external view returns (address[] memory) {
        return _roundVoters[did][round];
    }

    // ── Internal ─────────────────────────────────────────────────────────

    function _startVotingPhase(Dispute storage d) internal {
        d.status = Status.VotingPhase;
        d.votingDeadline = block.timestamp + VOTING_PERIOD;
    }

    function _hasPartyEvidence(uint256 did, address party) internal view returns (bool) {
        Evidence[] storage ev = evidence[did];
        for (uint256 i; i < ev.length; i++) {
            if (ev[i].party == party) return true;
        }
        return false;
    }

    function _executeResolution(Dispute storage d) internal {
        if (d.clientPercent == 100) {
            if (escrowContract != address(0))
                IEscrow_DR(escrowContract).refundClient(d.jobId);
        } else if (d.clientPercent == 0) {
            if (escrowContract != address(0))
                IEscrow_DR(escrowContract).releasePayment(d.jobId);
        } else {
            if (escrowContract != address(0))
                IEscrow_DR(escrowContract).splitPayment(d.jobId, d.clientPercent);
        }
        if (jobMarketContract != address(0)) {
            IJobMarket_DR(jobMarketContract).resolveDispute(d.jobId, d.clientWon);
        }
    }

    function _rewardVoters(uint256 did) internal {
        if (vrtToken == address(0)) return;
        Dispute storage d = disputes[did];
        address[] storage voters = _roundVoters[did][d.votingRound];
        bool clientWins = d.clientWon;

        for (uint256 i; i < voters.length; i++) {
            uint8 choice = voterChoice[did][d.votingRound][voters[i]];
            // Reward voters who chose the winning side
            if ((clientWins && choice == 0) || (!clientWins && choice == 1)) {
                try IVRT_DR(vrtToken).mint(voters[i], VOTER_REWARD) {
                    emit VoterRewarded(did, voters[i], VOTER_REWARD);
                } catch {}
            }
        }
    }
}
