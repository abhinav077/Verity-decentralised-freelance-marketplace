#!/usr/bin/env bash
# Starts Anvil with automatic state save/restore.
#
# --state loads the file if it exists AND dumps to it on Ctrl+C exit.
# Anvil is drop-in compatible: same chain ID (31337), same test accounts, same port (8545).

ANVIL="$HOME/.foundry/bin/anvil"
STATE_FILE="hardhat-state.json"

if [ ! -f "$ANVIL" ]; then
  echo "❌ Anvil not found. Run: curl -L https://foundry.paradigm.xyz | bash && foundryup"
  exit 1
fi

if [ -f "$STATE_FILE" ]; then
  echo "📦 Restoring state from $STATE_FILE — all contracts, users, and jobs will be back"
  echo ""
  echo "⚠️  DO NOT redeploy contracts — they are already in the restored state."
  echo "   Only redeploy if you want to wipe everything and start fresh."
  echo "   To start fresh: delete hardhat-state.json, then run this script."
else
  echo "🆕 No saved state — starting fresh"
  echo "   Deploy contracts: npx hardhat run scripts/deploy.ts --network localhost"
  echo "   Then use the app. Ctrl+C saves everything automatically every 30s."
fi

"$ANVIL" --chain-id 31337 --state "$STATE_FILE" --state-interval 30

