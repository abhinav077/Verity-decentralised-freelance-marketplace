import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

async function main() {
  console.log("Deploying Verity DFM contracts...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", (await ethers.provider.getBalance(deployer.address)).toString(), "\n");

  // ── 1. VRTToken ────────────────────────────────────────────────────────
  console.log("Deploying VRTToken...");
  const VRTToken = await ethers.getContractFactory("VRTToken");
  const vrt = await VRTToken.deploy();
  await vrt.waitForDeployment();
  const vrtAddr = await vrt.getAddress();
  console.log("  VRTToken:", vrtAddr);

  // ── 2. JobMarket ───────────────────────────────────────────────────────
  console.log("Deploying JobMarket...");
  const JobMarket = await ethers.getContractFactory("JobMarket");
  const jobMarket = await JobMarket.deploy();
  await jobMarket.waitForDeployment();
  const jobAddr = await jobMarket.getAddress();
  console.log("  JobMarket:", jobAddr);

  // ── 3. Escrow ──────────────────────────────────────────────────────────
  console.log("Deploying Escrow...");
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log("  Escrow:", escrowAddr);

  // ── 4. DisputeResolution ───────────────────────────────────────────────
  console.log("Deploying DisputeResolution...");
  const DR = await ethers.getContractFactory("DisputeResolution");
  const dispute = await DR.deploy();
  await dispute.waitForDeployment();
  const disputeAddr = await dispute.getAddress();
  console.log("  DisputeResolution:", disputeAddr);

  // ── 5. UserProfile ─────────────────────────────────────────────────────
  console.log("Deploying UserProfile...");
  const UP = await ethers.getContractFactory("UserProfile");
  const userProfile = await UP.deploy();
  await userProfile.waitForDeployment();
  const upAddr = await userProfile.getAddress();
  console.log("  UserProfile:", upAddr);

  // ── 6. Governance ──────────────────────────────────────────────────────
  console.log("Deploying Governance...");
  const Gov = await ethers.getContractFactory("Governance");
  const governance = await Gov.deploy();
  await governance.waitForDeployment();
  const govAddr = await governance.getAddress();
  console.log("  Governance:", govAddr);

  // ═══════════════════════════════════════════════════════════════════════
  //  Wire up contract relationships
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\nSetting up relationships...");

  // VRT — grant MINTER_ROLE to JobMarket + DisputeResolution
  const MINTER_ROLE = await vrt.MINTER_ROLE();
  await vrt.grantRole(MINTER_ROLE, jobAddr);
  await vrt.grantRole(MINTER_ROLE, disputeAddr);
  console.log("  VRT: MINTER_ROLE → JobMarket, DisputeResolution");

  // JobMarket → set VRT, Escrow, DisputeResolution, Governance
  await jobMarket.setVRTToken(vrtAddr);
  await jobMarket.setEscrowContract(escrowAddr);
  await jobMarket.setDisputeResolutionContract(disputeAddr);
  await jobMarket.setGovernanceContract(govAddr);
  console.log("  JobMarket: linked VRT, Escrow, DR, Governance");

  // Escrow → set JobMarket, DisputeResolution, VRT, Governance
  await escrow.setJobMarketContract(jobAddr);
  await escrow.setDisputeResolutionContract(disputeAddr);
  await escrow.setVRTToken(vrtAddr);
  await escrow.setGovernanceContract(govAddr);
  console.log("  Escrow: linked JobMarket, DR, VRT, Governance");

  // DisputeResolution → set JobMarket, Escrow, VRT
  await dispute.setJobMarketContract(jobAddr);
  await dispute.setEscrowContract(escrowAddr);
  await dispute.setVRTToken(vrtAddr);
  console.log("  DR: linked JobMarket, Escrow, VRT");

  // UserProfile → set JobMarket
  await userProfile.setJobMarketContract(jobAddr);
  console.log("  UserProfile: linked JobMarket");

  // Governance → set VRT
  await governance.setVRTToken(vrtAddr);
  console.log("  Governance: linked VRT");

  // ── 7. BountyBoard ────────────────────────────────────────────────────
  console.log("Deploying BountyBoard...");
  const BB = await ethers.getContractFactory("BountyBoard");
  const bountyBoard = await BB.deploy();
  await bountyBoard.waitForDeployment();
  const bbAddr = await bountyBoard.getAddress();
  console.log("  BountyBoard:", bbAddr);

  await bountyBoard.setVRTToken(vrtAddr);
  await vrt.grantRole(MINTER_ROLE, bbAddr);
  console.log("  BountyBoard: linked VRT, MINTER_ROLE granted");

  // ── 9. SubContracting ─────────────────────────────────────────────────
  console.log("Deploying SubContracting...");
  const SC = await ethers.getContractFactory("SubContracting");
  const subContracting = await SC.deploy();
  await subContracting.waitForDeployment();
  const scAddr = await subContracting.getAddress();
  console.log("  SubContracting:", scAddr);

  console.log("  SubContracting: deployed (standalone)");

  // ── 10. ReputationLoans ───────────────────────────────────────────────
  console.log("Deploying ReputationLoans...");
  const RL = await ethers.getContractFactory("ReputationLoans");
  const repLoans = await RL.deploy();
  await repLoans.waitForDeployment();
  const rlAddr = await repLoans.getAddress();
  console.log("  ReputationLoans:", rlAddr);

  await repLoans.setVRTToken(vrtAddr);
  await vrt.grantRole(MINTER_ROLE, rlAddr);
  console.log("  ReputationLoans: linked VRT, MINTER_ROLE granted");

  // ── 11. InsurancePool ─────────────────────────────────────────────────
  console.log("Deploying InsurancePool...");
  const IP = await ethers.getContractFactory("InsurancePool");
  const insurancePool = await IP.deploy();
  await insurancePool.waitForDeployment();
  const ipAddr = await insurancePool.getAddress();
  console.log("  InsurancePool:", ipAddr);

  await insurancePool.setDisputeResolutionContract(disputeAddr);
  console.log("  InsurancePool: linked DisputeResolution");

  // ═══════════════════════════════════════════════════════════════════════
  //  Summary
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== Deployment Complete ===\n");
  console.log("Contract Addresses:");
  console.log("-------------------");
  console.log("VRTToken:          ", vrtAddr);
  console.log("JobMarket:         ", jobAddr);
  console.log("Escrow:            ", escrowAddr);
  console.log("DisputeResolution: ", disputeAddr);
  console.log("UserProfile:       ", upAddr);
  console.log("Governance:        ", govAddr);
  console.log("BountyBoard:       ", bbAddr);
  console.log("SubContracting:    ", scAddr);
  console.log("ReputationLoans:   ", rlAddr);
  console.log("InsurancePool:     ", ipAddr);

  // Write .env.local for frontend
  const envPath = path.resolve(__dirname, "../../frontend/.env.local");
  const envContent = `NEXT_PUBLIC_DFM_TOKEN=${vrtAddr}
NEXT_PUBLIC_VRT_TOKEN=${vrtAddr}
NEXT_PUBLIC_JOB_MARKET=${jobAddr}
NEXT_PUBLIC_ESCROW=${escrowAddr}
NEXT_PUBLIC_DISPUTE_RESOLUTION=${disputeAddr}
NEXT_PUBLIC_USER_PROFILE=${upAddr}
NEXT_PUBLIC_GOVERNANCE=${govAddr}
NEXT_PUBLIC_BOUNTY_BOARD=${bbAddr}
NEXT_PUBLIC_SUB_CONTRACTING=${scAddr}
NEXT_PUBLIC_REPUTATION_LOANS=${rlAddr}
NEXT_PUBLIC_INSURANCE_POOL=${ipAddr}
`;
  try {
    if (fs.existsSync(envPath)) {
      fs.copyFileSync(envPath, envPath + ".backup");
      console.log("\nBacked up old .env.local");
    }
    fs.writeFileSync(envPath, envContent);
    console.log("Frontend .env.local updated at:", envPath);
  } catch {
    console.log("\nCould not write frontend .env.local — copy addresses above manually.");
  }
  console.log("\nNetwork:", network.name);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });