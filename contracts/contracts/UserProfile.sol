// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title UserProfile
 * @notice On-chain profiles, reviews, skill endorsements, portfolio, badges.
 *
 * Features:
 *  D1 – Skill endorsements (after working together)
 *  D2 – Portfolio IPFS links tied to jobs
 *  D4 – Admin-verified skill badges
 *  D7 – Bidirectional reviews (client ↔ freelancer)
 */
contract UserProfile is AccessControl {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ── External ─────────────────────────────────────────────────────────

    address public jobMarketContract;

    // ── Structs ──────────────────────────────────────────────────────────

    struct Profile {
        string  name;
        string  bio;
        string  ipfsAvatar;          // IPFS hash for avatar
        string[] skills;
        uint256 createdAt;
        bool    exists;
    }

    struct Review {
        uint256 id;
        uint256 jobId;
        address reviewer;
        address reviewee;
        uint8   rating;              // 1-5
        string  comment;
        uint256 timestamp;
    }

    struct SkillEndorsement {
        address endorser;
        string  skill;
        uint256 jobId;               // must have worked together
        uint256 timestamp;
    }

    struct PortfolioItem {
        string  title;
        string  ipfsHash;
        uint256 jobId;               // linked job (0 if standalone)
        uint256 timestamp;
    }

    // ── H13 Gamification structs ─────────────────────────────────────────

    struct Achievement {
        string  name;
        string  description;
        string  icon;                // emoji or URI
        uint256 unlockedAt;
    }

    // Predefined achievement IDs
    uint256 public constant ACH_FIRST_JOB     = 1;   // Complete first job
    uint256 public constant ACH_FIVE_JOBS      = 2;   // Complete 5 jobs
    uint256 public constant ACH_TEN_JOBS       = 3;   // Complete 10 jobs
    uint256 public constant ACH_PERFECT_RATING = 4;   // Get a 5-star review
    uint256 public constant ACH_FIRST_REVIEW   = 5;   // Submit first review
    uint256 public constant ACH_ENDORSED       = 6;   // Receive first endorsement
    uint256 public constant ACH_PORTFOLIO      = 7;   // Add first portfolio item
    uint256 public constant ACH_FIVE_REVIEWS   = 8;   // Get 5 reviews
    uint256 public constant ACH_BOUNTY_HUNTER  = 9;   // Complete first bounty
    uint256 public constant ACH_TOP_EARNER     = 10;  // Earn 1 ETH total

    // ── State ────────────────────────────────────────────────────────────

    mapping(address => Profile)              public  profiles;
    mapping(address => Review[])             private _reviews;
    mapping(address => SkillEndorsement[])   private _endorsements;
    mapping(address => PortfolioItem[])      private _portfolio;

    // ── H13 Achievement state ────────────────────────────────────────────
    mapping(address => mapping(uint256 => Achievement)) public achievements;
    mapping(address => uint256[]) private _achievementIds;
    mapping(address => uint256)   public achievementCount;

    // Stat tracking for achievements
    mapping(address => uint256) public jobsCompletedCount;
    mapping(address => uint256) public reviewsReceivedCount;
    mapping(address => uint256) public reviewsGivenCount;
    mapping(address => uint256) public endorsementsReceived;
    mapping(address => uint256) public totalEarnedWei;

    // Track who has reviewed whom for a job (prevent duplicates)
    mapping(uint256 => mapping(address => mapping(address => bool))) public hasReviewed;

    // Track who has endorsed whom for a skill
    mapping(address => mapping(address => mapping(bytes32 => bool))) public hasEndorsed;

    uint256 public reviewCounter;

    // ── Events ───────────────────────────────────────────────────────────

    event ProfileCreated(address indexed user, string name);
    event ProfileUpdated(address indexed user);
    event ReviewSubmitted(uint256 indexed reviewId, uint256 indexed jobId, address indexed reviewer, address reviewee, uint8 rating);
    event SkillEndorsed(address indexed endorser, address indexed endorsee, string skill, uint256 jobId);
    event PortfolioItemAdded(address indexed user, string ipfsHash, uint256 jobId);
    event AchievementUnlocked(address indexed user, uint256 indexed achievementId, string name);

    // ── Constructor ──────────────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ── Admin setters ────────────────────────────────────────────────────

    function setJobMarketContract(address _j) external onlyRole(ADMIN_ROLE) { jobMarketContract = _j; }

    // ═══════════════════════════════════════════════════════════════════════
    //  PROFILE
    // ═══════════════════════════════════════════════════════════════════════

    function createProfile(string calldata name, string calldata bio, string[] calldata skills) external {
        require(!profiles[msg.sender].exists, "Exists");
        require(bytes(name).length > 0, "Name required");

        profiles[msg.sender] = Profile({
            name: name,
            bio: bio,
            ipfsAvatar: "",
            skills: skills,
            createdAt: block.timestamp,
            exists: true
        });

        emit ProfileCreated(msg.sender, name);
    }

    function updateProfile(string calldata name, string calldata bio, string[] calldata skills) external {
        require(profiles[msg.sender].exists, "No profile");
        Profile storage p = profiles[msg.sender];
        p.name = name;
        p.bio = bio;
        p.skills = skills;
        emit ProfileUpdated(msg.sender);
    }

    function setAvatar(string calldata ipfsHash) external {
        require(profiles[msg.sender].exists, "No profile");
        profiles[msg.sender].ipfsAvatar = ipfsHash;
        emit ProfileUpdated(msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  REVIEWS  (D7 – bidirectional)
    // ═══════════════════════════════════════════════════════════════════════

    function submitReview(
        uint256 jobId, address reviewee, uint8 rating, string calldata comment
    ) external {
        require(rating >= 1 && rating <= 5, "1-5");
        require(msg.sender != reviewee, "Self-review");
        require(!hasReviewed[jobId][msg.sender][reviewee], "Already reviewed");

        reviewCounter++;
        _reviews[reviewee].push(Review({
            id: reviewCounter,
            jobId: jobId,
            reviewer: msg.sender,
            reviewee: reviewee,
            rating: rating,
            comment: comment,
            timestamp: block.timestamp
        }));
        hasReviewed[jobId][msg.sender][reviewee] = true;

        // Achievement triggers
        reviewsReceivedCount[reviewee]++;
        reviewsGivenCount[msg.sender]++;
        if (reviewsGivenCount[msg.sender] == 1) _unlockAchievement(msg.sender, ACH_FIRST_REVIEW, "Reviewer", "Submitted first review", "pencil");
        if (rating == 5) _unlockAchievement(reviewee, ACH_PERFECT_RATING, "Perfect Score", "Received a 5-star review", "sparkle");
        if (reviewsReceivedCount[reviewee] == 5) _unlockAchievement(reviewee, ACH_FIVE_REVIEWS, "Popular", "Received 5 reviews", "heart");

        emit ReviewSubmitted(reviewCounter, jobId, msg.sender, reviewee, rating);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ENDORSEMENTS  (D1)
    // ═══════════════════════════════════════════════════════════════════════

    function endorseSkill(address user, string calldata skill, uint256 jobId) external {
        require(msg.sender != user, "Self-endorse");
        require(bytes(skill).length > 0, "Skill required");
        bytes32 skillHash = keccak256(bytes(skill));
        require(!hasEndorsed[user][msg.sender][skillHash], "Already endorsed");

        _endorsements[user].push(SkillEndorsement({
            endorser: msg.sender,
            skill: skill,
            jobId: jobId,
            timestamp: block.timestamp
        }));
        hasEndorsed[user][msg.sender][skillHash] = true;

        endorsementsReceived[user]++;
        if (endorsementsReceived[user] == 1) _unlockAchievement(user, ACH_ENDORSED, "Endorsed", "Received first skill endorsement", "thumbsup");

        emit SkillEndorsed(msg.sender, user, skill, jobId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  PORTFOLIO  (D2)
    // ═══════════════════════════════════════════════════════════════════════

    function addPortfolioItem(string calldata title, string calldata ipfsHash, uint256 jobId) external {
        require(profiles[msg.sender].exists, "No profile");
        require(bytes(ipfsHash).length > 0, "Hash required");

        _portfolio[msg.sender].push(PortfolioItem({
            title: title,
            ipfsHash: ipfsHash,
            jobId: jobId,
            timestamp: block.timestamp
        }));

        if (_portfolio[msg.sender].length == 1) _unlockAchievement(msg.sender, ACH_PORTFOLIO, "Showcase", "Added first portfolio item", "gallery");

        emit PortfolioItemAdded(msg.sender, ipfsHash, jobId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  H13 GAMIFICATION – ACHIEVEMENT TRIGGERS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Called by JobMarket or admin when a user completes a job
    function recordJobCompletion(address user, uint256 earnedWei) external {
        require(msg.sender == jobMarketContract || hasRole(ADMIN_ROLE, msg.sender), "Unauth");
        jobsCompletedCount[user]++;
        totalEarnedWei[user] += earnedWei;

        if (jobsCompletedCount[user] == 1)  _unlockAchievement(user, ACH_FIRST_JOB, "First Job", "Completed your first job", "briefcase");
        if (jobsCompletedCount[user] == 5)  _unlockAchievement(user, ACH_FIVE_JOBS, "Experienced", "Completed 5 jobs", "star");
        if (jobsCompletedCount[user] == 10) _unlockAchievement(user, ACH_TEN_JOBS, "Veteran", "Completed 10 jobs", "trophy");
        if (totalEarnedWei[user] >= 1 ether) _unlockAchievement(user, ACH_TOP_EARNER, "Top Earner", "Earned 1 ETH total", "money");
    }

    /// @notice Called by BountyBoard when a bounty is completed
    function recordBountyCompletion(address user) external {
        require(hasRole(ADMIN_ROLE, msg.sender), "Unauth");
        _unlockAchievement(user, ACH_BOUNTY_HUNTER, "Bounty Hunter", "Completed first bounty", "target");
    }

    function _unlockAchievement(address user, uint256 achId, string memory name, string memory desc, string memory icon) internal {
        if (achievements[user][achId].unlockedAt > 0) return; // already unlocked
        achievements[user][achId] = Achievement(name, desc, icon, block.timestamp);
        _achievementIds[user].push(achId);
        achievementCount[user]++;
        emit AchievementUnlocked(user, achId, name);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════════

    function getProfile(address user) external view returns (Profile memory) {
        return profiles[user];
    }

    function getReviews(address user) external view returns (Review[] memory) {
        return _reviews[user];
    }

    function getAverageRating(address user) external view returns (uint256) {
        Review[] storage r = _reviews[user];
        if (r.length == 0) return 0;
        uint256 total;
        for (uint256 i; i < r.length; i++) total += r[i].rating;
        return (total * 100) / r.length;       // scaled by 100 for precision
    }

    function getEndorsements(address user) external view returns (SkillEndorsement[] memory) {
        return _endorsements[user];
    }

    function getPortfolio(address user) external view returns (PortfolioItem[] memory) {
        return _portfolio[user];
    }

    function getReviewCount(address user) external view returns (uint256) {
        return _reviews[user].length;
    }

    function getAchievements(address user) external view returns (Achievement[] memory) {
        uint256[] storage ids = _achievementIds[user];
        Achievement[] memory r = new Achievement[](ids.length);
        for (uint256 i; i < ids.length; i++) r[i] = achievements[user][ids[i]];
        return r;
    }

    function hasAchievement(address user, uint256 achId) external view returns (bool) {
        return achievements[user][achId].unlockedAt > 0;
    }
}
