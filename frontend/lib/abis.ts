// ─── ABIs for Verity DFM contracts (ethers v6 human-readable) ────────────────
// Updated to match the ACTUAL deployed contracts (no sealed-bid commit/reveal,
// no referrals, no insurance; added settlement, direct voting, crowdfunding)

// ── JobMarket ────────────────────────────────────────────────────────────────

const JOB_TUPLE = "tuple(uint256 id, address client, string title, string description, string category, uint256 budget, uint256 deadline, uint8 status, address selectedFreelancer, uint256 acceptedBidId, uint256 createdAt, uint256 deliveredAt, uint256 milestoneCount, bool sealedBidding, uint256 expectedDays)";
const BID_TUPLE = "tuple(uint256 id, uint256 jobId, address freelancer, uint256 amount, uint256 completionDays, string proposal, uint256 timestamp, bool isActive)";
const SETTLEMENT_TUPLE = "tuple(uint256 jobId, address proposer, uint256 percentComplete, uint256 freelancerPercent, bool active)";
const MS_TUPLE = "tuple(string title, uint256 amount, uint8 status)";
const PROFILE_TUPLE = "tuple(uint256 jobsCompleted, uint256 totalEarned, uint256 totalSpent, uint256 averageRating, bool exists)";

export const JOB_MARKET_ABI = [
  "function jobCounter() view returns (uint256)",
  "function bidCounter() view returns (uint256)",
  "function AUTO_RELEASE_PERIOD() view returns (uint256)",
  "function REPUTATION_REWARD() view returns (uint256)",
  "function CANCEL_PENALTY_BPS() view returns (uint256)",
  "function minVrtToBid() view returns (uint256)",
  // Admin setters
  "function setReputationReward(uint256 _r) external",
  "function setAutoReleasePeriod(uint256 _p) external",
  "function setCancelPenaltyBps(uint256 _bps) external",
  "function setMinVrtToBid(uint256 _min) external",
  // Job creation (9-param full + 5-param backward-compat)
  "function createJob(string title, string description, string category, uint256 budget, uint256 deadline, uint256 expectedDays, bool sealedBidding, uint256[] milestoneAmounts, string[] milestoneTitles) external returns (uint256)",
  "function createJob(string title, string description, string category, uint256 budget, uint256 deadline) external returns (uint256)",
  // Bidding (4-param with completionDays + 3-param backward-compat)
  "function placeBid(uint256 jobId, uint256 amount, uint256 completionDays, string proposal) external returns (uint256)",
  "function placeBid(uint256 jobId, uint256 amount, string proposal) external returns (uint256)",
  "function withdrawBid(uint256 bidId) external",
  "function acceptBid(uint256 bidId) external payable",
  // Job lifecycle
  "function deliverJob(uint256 jobId) external",
  "function completeJob(uint256 jobId) external",
  "function autoReleasePayment(uint256 jobId) external",
  "function cancelJob(uint256 jobId) external",
  "function tipFreelancer(uint256 jobId) external payable",
  // Revision
  "function requestRevision(uint256 jobId) external",
  // Settlement
  "function requestSettlement(uint256 jobId, uint256 percentComplete, uint256 freelancerPct) external",
  "function respondToSettlement(uint256 jobId, bool accept) external",
  // Milestones
  "function submitMilestone(uint256 jobId, uint256 idx) external",
  "function approveMilestone(uint256 jobId, uint256 idx) external",
  // Views
  `function getJob(uint256 jobId) view returns (${JOB_TUPLE})`,
  `function getOpenJobs(uint256 offset, uint256 limit) view returns (${JOB_TUPLE}[])`,
  `function getJobBids(uint256 jobId) view returns (${BID_TUPLE}[])`,
  `function getJobMilestones(uint256 jobId) view returns (${MS_TUPLE}[])`,
  `function getUserProfile(address user) view returns (${PROFILE_TUPLE})`,
  `function getSettlement(uint256 jobId) view returns (${SETTLEMENT_TUPLE})`,
  // Events
  "event JobCreated(uint256 indexed jobId, address indexed client, string title, uint256 budget, string category)",
  "event BidPlaced(uint256 indexed bidId, uint256 indexed jobId, address indexed freelancer, uint256 amount)",
  "event BidAccepted(uint256 indexed bidId, uint256 indexed jobId, address indexed freelancer, address client)",
  "event JobCompleted(uint256 indexed jobId, address indexed freelancer, uint256 payment)",
  "event JobDelivered(uint256 indexed jobId, address indexed freelancer, uint256 autoReleaseAt)",
  "event JobAutoReleased(uint256 indexed jobId)",
  "event MilestoneSubmitted(uint256 indexed jobId, uint256 milestoneIndex)",
  "event MilestoneApproved(uint256 indexed jobId, uint256 milestoneIndex, uint256 amount)",
  "event DisputeRaised(uint256 indexed jobId, address indexed initiator)",
  "event TipAdded(uint256 indexed jobId, uint256 amount)",
  "event SettlementRequested(uint256 indexed jobId, address indexed proposer, uint256 percentComplete, uint256 freelancerPercent)",
  "event SettlementAccepted(uint256 indexed jobId)",
  "event SettlementRejected(uint256 indexed jobId)",
  "event RevisionRequested(uint256 indexed jobId)",
] as const;

// ── VRT Token ────────────────────────────────────────────────────────────────

export const VRT_TOKEN_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function getReputation(address user) view returns (uint256)",
  "function getTier(address user) view returns (uint8)",
  "function getFeeDiscount(address user) view returns (uint256)",
  "function getGovernanceWeight(address user) view returns (uint256)",
  "function isEligibleJuror(address user) view returns (bool)",
  "function totalEarned(address user) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  // Admin (minter)
  "function mint(address to, uint256 amount) external",
  "function burn(address from, uint256 amount) external",
  // Tier thresholds (view + admin setters)
  "function SILVER_THRESHOLD() view returns (uint256)",
  "function GOLD_THRESHOLD() view returns (uint256)",
  "function PLATINUM_THRESHOLD() view returns (uint256)",
  "function tierFeeDiscount(uint8 tier) view returns (uint256)",
  "function setTierThresholds(uint256 silver, uint256 gold, uint256 platinum) external",
  "function setTierFeeDiscount(uint8 tier, uint256 bps) external",
  "event TokensEarned(address indexed user, uint256 amount, string reason)",
  "event TierChanged(address indexed user, uint8 oldTier, uint8 newTier)",
] as const;

// ── Escrow ───────────────────────────────────────────────────────────────────

export const ESCROW_ABI = [
  "function escrows(uint256 jobId) view returns (uint256 jobId, address client, address freelancer, uint256 totalAmount, uint256 releasedAmount, bool refunded, bool exists)",
  "function getEscrow(uint256 jobId) view returns (uint256 jobId, address client, address freelancer, uint256 totalAmount, uint256 releasedAmount, bool refunded, bool exists)",
  "function getBalance(uint256 jobId) view returns (uint256)",
  "function platformFeeBps() view returns (uint256)",
  "function collectedFees() view returns (uint256)",
  "function MAX_FEE_BPS() view returns (uint256)",
  // Admin
  "function setPlatformFee(uint256 newBps) external",
  "function setMaxFeeBps(uint256 _max) external",
  "function withdrawFees() external",
  "function ADMIN_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "event FundsDeposited(uint256 indexed jobId, address indexed client, address indexed freelancer, uint256 amount)",
  "event PaymentReleased(uint256 indexed jobId, address indexed freelancer, uint256 net, uint256 fee)",
  "event MilestonePaymentReleased(uint256 indexed jobId, address indexed freelancer, uint256 net, uint256 fee)",
  "event FundsRefunded(uint256 indexed jobId, address indexed client, uint256 amount)",
  "event SplitPayment(uint256 indexed jobId, uint256 clientShare, uint256 freelancerShare)",
] as const;

// ── DisputeResolution ────────────────────────────────────────────────────────
// Status: Active(0) ResponsePhase(1) VotingPhase(2) Resolved(3) AutoResolved(4)
//         Withdrawn(5) EscalatedToAdmin(6)
// VoteType: Client(0) Freelancer(1) ReProportion(2)

const DISPUTE_TUPLE = "tuple(uint256 id, uint256 jobId, address initiator, address client, address freelancer, string reason, string respondentDescription, bool responseSubmitted, uint8 status, uint256 createdAt, uint256 responseDeadline, uint256 votingDeadline, uint256 clientVotes, uint256 freelancerVotes, uint256 reProportionVotes, bool clientWon, uint256 clientPercent, uint256 totalVoters, uint256 freelancerDemandPct, uint256 clientDemandPct, bool freelancerDemandSet, bool clientDemandSet, uint256 votingRound)";
const EVIDENCE_TUPLE = "tuple(address party, string ipfsHash, uint256 timestamp)";

export const DISPUTE_RESOLUTION_ABI = [
  "function disputeCounter() view returns (uint256)",
  "function RESPONSE_PERIOD() view returns (uint256)",
  "function VOTING_PERIOD() view returns (uint256)",
  "function AUTO_RESOLVE_DEADLINE() view returns (uint256)",
  "function MIN_VRT_TO_VOTE() view returns (uint256)",
  "function VOTER_REWARD() view returns (uint256)",
  // Admin setters
  "function setResponsePeriod(uint256 _p) external",
  "function setVotingPeriod(uint256 _p) external",
  "function setAutoResolveDeadline(uint256 _d) external",
  "function setVoterReward(uint256 _r) external",
  "function setMinVrtToVote(uint256 _m) external",
  // Actions
  "function raiseDispute(uint256 jobId, address client, address freelancer, string reason) external returns (uint256)",
  "function submitResponse(uint256 disputeId, string description) external",
  "function submitEvidence(uint256 disputeId, string ipfsHash) external",
  "function advanceToVotingPhase(uint256 disputeId) external",
  // Direct voting (no commit-reveal)
  "function castVote(uint256 disputeId, uint8 voteType) external",
  // Proportion demands
  "function setProportionDemand(uint256 disputeId, uint256 myPercent) external",
  // Resolve
  "function resolveDispute(uint256 disputeId) external",
  "function autoResolveDispute(uint256 disputeId) external",
  "function withdrawDispute(uint256 disputeId) external",
  // Admin escalation
  "function escalateToAdmin(uint256 disputeId) external",
  "function resolveEscalatedDispute(uint256 disputeId, uint256 freelancerPct) external",
  "function resolveWithSplit(uint256 did, uint256 clientPct) external",
  "function withdrawFees() external",
  "function ADMIN_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  // Views
  `function getDispute(uint256 disputeId) view returns (${DISPUTE_TUPLE})`,
  `function getEvidence(uint256 disputeId) view returns (${EVIDENCE_TUPLE}[])`,
  "function getVoteTallies(uint256 disputeId) view returns (uint256 cVotes, uint256 fVotes, uint256 rpVotes)",
  "function getDisputesByJob(uint256 jobId) view returns (uint256[])",
  "function getUserDisputes(address user) view returns (uint256[])",
  "function hasVotedRound(uint256 disputeId, uint256 round, address voter) view returns (bool)",
  "function getRoundVoters(uint256 disputeId, uint256 round) view returns (address[])",
  // Events
  "event DisputeCreated(uint256 indexed disputeId, uint256 indexed jobId, address indexed initiator)",
  "event ResponseSubmitted(uint256 indexed disputeId, address indexed respondent)",
  "event EvidenceSubmitted(uint256 indexed disputeId, address indexed party, string ipfsHash)",
  "event VoteCast(uint256 indexed disputeId, address indexed voter, uint8 voteType)",
  "event DisputeResolved(uint256 indexed disputeId, bool clientWon, uint256 clientVotes, uint256 freelancerVotes)",
  "event DisputeSplitResolved(uint256 indexed disputeId, uint256 clientPercent)",
  "event DisputeAutoResolved(uint256 indexed disputeId, string reason)",
  "event DisputeWithdrawn(uint256 indexed disputeId, address indexed initiator)",
  "event ProportionDemandSet(uint256 indexed disputeId, address indexed party, uint256 demandPct)",
  "event VotingReset(uint256 indexed disputeId, uint256 newRound)",
  "event EscalatedToAdmin(uint256 indexed disputeId, address indexed escalatedBy)",
  "event AdminResolved(uint256 indexed disputeId, uint256 freelancerPercent)",
] as const;

// ── UserProfile ──────────────────────────────────────────────────────────────

const UP_PROFILE_TUPLE = "tuple(string name, string bio, string ipfsAvatar, string[] skills, uint256 createdAt, bool exists)";
const REVIEW_TUPLE = "tuple(uint256 id, uint256 jobId, address reviewer, address reviewee, uint8 rating, string comment, uint256 timestamp)";
const ENDORSEMENT_TUPLE = "tuple(address endorser, string skill, uint256 jobId, uint256 timestamp)";
const PORTFOLIO_TUPLE = "tuple(string title, string ipfsHash, uint256 jobId, uint256 timestamp)";
const ACHIEVEMENT_TUPLE = "tuple(string name, string description, string icon, uint256 unlockedAt)";

export const USER_PROFILE_ABI = [
  // Profile
  "function createProfile(string name, string bio, string[] skills) external",
  "function updateProfile(string name, string bio, string[] skills) external",
  "function setAvatar(string ipfsHash) external",
  // Admin
  "function recordBountyCompletion(address user) external",
  // Reviews
  "function submitReview(uint256 jobId, address reviewee, uint8 rating, string comment) external",
  "function hasReviewed(uint256 jobId, address reviewer, address reviewee) view returns (bool)",
  // Endorsements
  "function endorseSkill(address user, string skill, uint256 jobId) external",
  // Portfolio
  "function addPortfolioItem(string title, string ipfsHash, uint256 jobId) external",
  // Views
  `function getProfile(address user) view returns (${UP_PROFILE_TUPLE})`,
  `function getReviews(address user) view returns (${REVIEW_TUPLE}[])`,
  "function getAverageRating(address user) view returns (uint256)",
  `function getEndorsements(address user) view returns (${ENDORSEMENT_TUPLE}[])`,
  `function getPortfolio(address user) view returns (${PORTFOLIO_TUPLE}[])`,
  `function getAchievements(address user) view returns (${ACHIEVEMENT_TUPLE}[])`,
  "function hasAchievement(address user, uint256 achId) view returns (bool)",
  "function achievementCount(address user) view returns (uint256)",
  "function getReviewCount(address user) view returns (uint256)",
  // Events
  "event ProfileCreated(address indexed user, string name)",
  "event ProfileUpdated(address indexed user)",
  "event ReviewSubmitted(uint256 indexed reviewId, uint256 indexed jobId, address indexed reviewer, address reviewee, uint8 rating)",
  "event SkillEndorsed(address indexed endorser, address indexed endorsee, string skill, uint256 jobId)",
  "event PortfolioItemAdded(address indexed user, string ipfsHash, uint256 jobId)",
  "event AchievementUnlocked(address indexed user, uint256 indexed achievementId, string name)",
] as const;

// ── Governance (proposals + crowdfunding) ────────────────────────────────────

const PROPOSAL_TUPLE = "tuple(uint256 id, address proposer, string title, string description, uint256 forVotes, uint256 againstVotes, uint256 createdAt, uint256 deadline, uint8 status, bytes executionData, address executionTarget)";
const CROWDFUND_TUPLE = "tuple(uint256 id, address creator, string title, string description, string category, string proofLink, uint256 goalAmount, uint256 totalRaised, uint256 deadline, uint8 status, uint256 createdAt, uint256 contributorCount, bool fundsWithdrawn)";
const CROWDFUND_UPDATE_TUPLE = "tuple(string description, string link, uint256 timestamp)";

export const GOVERNANCE_ABI = [
  "function proposalCounter() view returns (uint256)",
  "function crowdfundCounter() view returns (uint256)",
  "function treasuryBalance() view returns (uint256)",
  "function MIN_VRT_TO_PROPOSE() view returns (uint256)",
  "function MIN_VRT_TO_CROWDFUND() view returns (uint256)",
  "function VOTING_PERIOD() view returns (uint256)",
  "function MIN_QUORUM_BPS() view returns (uint256)",
  // Admin setters
  "function setMinVrtToPropose(uint256 _m) external",
  "function setGovVotingPeriod(uint256 _p) external",
  "function setMinQuorumBps(uint256 _q) external",
  "function setMinVrtToCrowdfund(uint256 _m) external",
  // Proposals
  "function createProposal(string title, string description, address execTarget, bytes execData) external returns (uint256)",
  "function voteOnProposal(uint256 pid, bool support) external",
  "function finalizeProposal(uint256 pid) external",
  "function cancelProposal(uint256 pid) external",
  "function executeProposal(uint256 pid) external",
  "function withdrawTreasury(address to, uint256 amount) external",
  "function hasVotedOnProposal(uint256 pid, address voter) view returns (bool)",
  `function getProposal(uint256 pid) view returns (${PROPOSAL_TUPLE})`,
  // Crowdfunding
  "function createCrowdfundProject(string title, string description, string category, string proofLink, uint256 goalAmount, uint256 duration) external returns (uint256)",
  "function contributeToProject(uint256 projectId) external payable",
  "function withdrawCrowdfundFunds(uint256 projectId) external",
  "function postCrowdfundUpdate(uint256 projectId, string desc, string link) external",
  "function markProjectFailed(uint256 projectId) external",
  "function refundContribution(uint256 projectId) external",
  "function cancelCrowdfundProject(uint256 projectId) external",
  `function getCrowdfundProject(uint256 pid) view returns (${CROWDFUND_TUPLE})`,
  `function getCrowdfundUpdates(uint256 pid) view returns (${CROWDFUND_UPDATE_TUPLE}[])`,
  "function getContribution(uint256 projectId, address user) view returns (uint256)",
  // Events
  "event ProposalCreated(uint256 indexed id, address indexed proposer, string title)",
  "event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight)",
  "event ProposalExecuted(uint256 indexed id)",
  "event ProposalCancelled(uint256 indexed id)",
  "event TreasuryReceived(address indexed from, uint256 amount)",
  "event CrowdfundProjectCreated(uint256 indexed id, address indexed creator, string title, uint256 goalAmount)",
  "event CrowdfundContribution(uint256 indexed projectId, address indexed contributor, uint256 amount)",
  "event CrowdfundFundsWithdrawn(uint256 indexed projectId, address indexed creator, uint256 amount)",
  "event CrowdfundProjectCancelled(uint256 indexed projectId)",
  "event CrowdfundProjectFailed(uint256 indexed projectId)",
  "event CrowdfundUpdatePosted(uint256 indexed projectId, string description)",
] as const;

// ── BountyBoard ─────────────────────────────────────────────────────────────

const BOUNTY_TUPLE = "tuple(uint256 id, address poster, string title, string description, string category, uint256 reward, uint256 vrtReward, uint256 deadline, uint256 maxWinners, uint256 approvedCount, uint8 status, uint256 createdAt)";
const SUBMISSION_TUPLE = "tuple(uint256 id, uint256 bountyId, address submitter, string description, string ipfsProof, uint8 status, uint256 timestamp)";

export const BOUNTY_BOARD_ABI = [
  "function bountyCounter() view returns (uint256)",
  "function createBounty(string title, string description, string category, uint256 deadline, uint256 maxWinners) external payable returns (uint256)",
  "function submitWork(uint256 bountyId, string description, string ipfsProof) external returns (uint256)",
  "function approveSubmission(uint256 submissionId) external",
  "function rejectSubmission(uint256 submissionId) external",
  "function cancelBounty(uint256 bountyId) external",
  `function getBounty(uint256 id) view returns (${BOUNTY_TUPLE})`,
  `function getSubmission(uint256 id) view returns (${SUBMISSION_TUPLE})`,
  `function getBountySubmissions(uint256 bountyId) view returns (${SUBMISSION_TUPLE}[])`,
  "function hasSubmitted(uint256 bountyId, address user) view returns (bool)",
  "function BOUNTY_VRT_REWARD() view returns (uint256)",
  // Admin setters
  "function setBountyVrtReward(uint256 _r) external",
  "event BountyCreated(uint256 indexed id, address indexed poster, string title, uint256 reward)",
  "event BountySubmission(uint256 indexed bountyId, uint256 indexed submissionId, address indexed submitter)",
  "event SubmissionApproved(uint256 indexed bountyId, uint256 indexed submissionId, address indexed submitter, uint256 reward)",
  "event SubmissionRejected(uint256 indexed bountyId, uint256 indexed submissionId)",
  "event BountyCancelled(uint256 indexed bountyId)",
] as const;

// ── SubContracting ──────────────────────────────────────────────────────────

const SUB_CONTRACT_TUPLE = "tuple(uint256 id, uint256 parentJobId, address primaryFreelancer, address subContractor, string description, uint256 payment, uint8 status, uint256 createdAt, uint256 completedAt)";

export const SUB_CONTRACTING_ABI = [
  "function subContractCounter() view returns (uint256)",
  "function createSubContract(uint256 parentJobId, address subContractor, string description) external payable returns (uint256)",
  "function applyForSubContract(uint256 scId) external",
  "function assignSubContractor(uint256 scId, address _sub) external",
  "function submitWork(uint256 scId) external",
  "function approveWork(uint256 scId) external",
  "function cancelSubContract(uint256 scId) external",
  `function getSubContract(uint256 id) view returns (${SUB_CONTRACT_TUPLE})`,
  `function getJobSubContracts(uint256 jobId) view returns (${SUB_CONTRACT_TUPLE}[])`,
  `function getUserSubContracts(address user) view returns (${SUB_CONTRACT_TUPLE}[])`,
  `function getOpenSubContracts() view returns (${SUB_CONTRACT_TUPLE}[])`,
  "function getApplications(uint256 scId) view returns (address[])",
  "function hasApplied(uint256 scId, address user) view returns (bool)",
  "event SubContractCreated(uint256 indexed id, uint256 indexed parentJobId, address indexed primaryFreelancer, uint256 payment, bool isOpen)",
  "event ApplicationSubmitted(uint256 indexed id, address indexed applicant)",
  "event SubContractorAssigned(uint256 indexed id, address indexed subContractor)",
  "event WorkSubmitted(uint256 indexed id, address indexed subContractor)",
  "event WorkApproved(uint256 indexed id, address indexed subContractor, uint256 payment)",
  "event SubContractCancelled(uint256 indexed id)",
] as const;
