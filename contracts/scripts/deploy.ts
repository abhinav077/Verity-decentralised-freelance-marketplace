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

  // SubContracting → set VRT, DisputeResolution; grant MINTER_ROLE
  await subContracting.setVRTToken(vrtAddr);
  await subContracting.setDisputeResolutionContract(disputeAddr);
  await vrt.grantRole(MINTER_ROLE, scAddr);
  console.log("  SubContracting: linked VRT, DR, MINTER_ROLE granted");



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

  // Write .env.local for frontend
  const envPath = path.resolve(__dirname, "../../frontend/.env.local");

  // Determine the chain ID and RPC for the frontend
  const chainIdNum = (await ethers.provider.getNetwork()).chainId;
  const RPC_MAP: Record<string, string> = {
    "80002":    process.env.POLYGON_AMOY_RPC_URL    || "https://rpc-amoy.polygon.technology",
    "84532":    process.env.BASE_SEPOLIA_RPC_URL     || "https://sepolia.base.org",
    "11155111": process.env.SEPOLIA_RPC_URL           || "",
    "31337":    "http://127.0.0.1:8545",
  };
  const rpcUrl = RPC_MAP[chainIdNum.toString()] || "";

  // Preserve existing Pinata / IPFS keys that may already be in .env.local
  let existingExtra = "";
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, "utf-8");
    const preserveKeys = ["PINATA_JWT", "NEXT_PUBLIC_PINATA_GATEWAY", "NEXT_PUBLIC_IPFS_GATEWAY"];
    for (const line of existing.split("\n")) {
      const key = line.split("=")[0]?.trim();
      if (key && preserveKeys.includes(key)) {
        existingExtra += line + "\n";
      }
    }
  }

  const envContent = `# ═══ Contract addresses (auto-generated by deploy script) ═══
# Network: ${network.name} (chain ${chainIdNum})
NEXT_PUBLIC_CHAIN_ID=${chainIdNum}
NEXT_PUBLIC_RPC_URL=${rpcUrl}
NEXT_PUBLIC_DFM_TOKEN=${vrtAddr}
NEXT_PUBLIC_VRT_TOKEN=${vrtAddr}
NEXT_PUBLIC_JOB_MARKET=${jobAddr}
NEXT_PUBLIC_ESCROW=${escrowAddr}
NEXT_PUBLIC_DISPUTE_RESOLUTION=${disputeAddr}
NEXT_PUBLIC_USER_PROFILE=${upAddr}
NEXT_PUBLIC_GOVERNANCE=${govAddr}
NEXT_PUBLIC_BOUNTY_BOARD=${bbAddr}
NEXT_PUBLIC_SUB_CONTRACTING=${scAddr}

# ═══ IPFS / Pinata (add your keys here or they are preserved from previous) ═══
${existingExtra}`;

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
  console.log("\nNetwork:", network.name, `(chain ID: ${chainIdNum})`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });