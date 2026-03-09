import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "dotenv/config";

// Only include a private key if it's a valid 32-byte hex string
const pk = process.env.PRIVATE_KEY ?? "";
const validAccounts = pk.replace(/^0x/, "").length === 64 ? [pk] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    // ── Local development ─────────────────────────────────────────────────
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },

    // ── Testnets (persistent — data survives restarts) ────────────────────
    // Polygon Amoy (recommended — fast & cheap)
    amoy: {
      url: process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: validAccounts,
      chainId: 80002,
    },
    // Base Sepolia (L2 — very low gas)
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: validAccounts,
      chainId: 84532,
    },
    // Ethereum Sepolia (most popular testnet)
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: validAccounts,
      chainId: 11155111,
    },

    // ── Mainnets ──────────────────────────────────────────────────────────
    polygon: {
      url: process.env.POLYGON_MAINNET_RPC_URL || "https://polygon-rpc.com",
      accounts: validAccounts,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;