"use client";

const CHAIN_LABELS: Record<number, string> = {
  80002: "Polygon Amoy",
  84532: "Base Sepolia",
  11155111: "Sepolia",
  31337: "Localhost",
};

const LOW_SIGNAL_PATTERNS = [
  /^could not coalesce error/i,
  /^internal json-rpc error\.?$/i,
  /^missing revert data/i,
  /^call exception$/i,
  /^execution reverted:?$/i,
  /^processing response error/i,
];

const FRIENDLY_PATTERNS: Array<[RegExp, string]> = [
  [/user denied|user rejected|rejected the request|denied transaction signature/i, "Transaction rejected in wallet."],
  [/insufficient funds/i, "Insufficient funds to cover the transaction and gas."],
  [/already bid/i, "You have already placed a bid."],
  [/proposal required/i, "Enter a short proposal before submitting your bid."],
  [/amount must be > 0/i, "Enter a bid amount greater than 0."],
  [/own job|cannot bid on own/i, "You cannot bid on your own listing."],
  [/not open/i, "This listing is no longer open for bids."],
  [/deadline passed/i, "The bidding deadline has passed."],
];

export function getExpectedChainId(): number {
  return Number(process.env.NEXT_PUBLIC_CHAIN_ID || "31337");
}

export function getExpectedChainLabel(): string {
  const chainId = getExpectedChainId();
  return CHAIN_LABELS[chainId] ?? `chain ${chainId}`;
}

export function normalizeDecimalInput(value: string): string {
  const compact = value.trim().replace(/\s+/g, "");
  if (!compact) return "";
  if (!compact.includes(".") && (compact.match(/,/g) || []).length === 1) {
    return compact.replace(",", ".");
  }
  return compact;
}

function collectErrorMessages(error: unknown): string[] {
  const queue: unknown[] = [error];
  const seen = new Set<object>();
  const messages: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (typeof current === "string") {
      messages.push(current);
      continue;
    }

    if (typeof current !== "object") continue;

    const record = current as Record<string, unknown>;
    if (seen.has(record)) continue;
    seen.add(record);

    for (const key of ["reason", "shortMessage", "message", "details"]) {
      if (typeof record[key] === "string") messages.push(record[key] as string);
    }

    for (const key of ["error", "info", "data", "cause", "payload"]) {
      const next = record[key];
      if (next && typeof next === "object") queue.push(next);
      if (typeof next === "string") messages.push(next);
    }
  }

  return messages;
}

function cleanErrorMessage(message: string): string {
  let cleaned = message.replace(/\s+/g, " ").trim();

  const jsonMessageMatch = cleaned.match(/"message":"([^"]+)"/i);
  if (jsonMessageMatch?.[1]) {
    cleaned = jsonMessageMatch[1].replace(/\\"/g, "\"").trim();
  }

  const quotedReasonMatch = cleaned.match(/reverted with reason string ['"](.+?)['"]/i);
  if (quotedReasonMatch?.[1]) {
    cleaned = quotedReasonMatch[1].trim();
  }

  cleaned = cleaned
    .replace(/^error:\s*/i, "")
    .replace(/^execution reverted:\s*/i, "")
    .replace(/^vm exception while processing transaction:\s*/i, "")
    .replace(/^call revert exception.*?:\s*/i, "")
    .replace(/\(action=.*$/i, "")
    .trim();

  return cleaned;
}

export function extractTransactionError(error: unknown, fallback = "Transaction failed"): string {
  const messages = collectErrorMessages(error)
    .map(cleanErrorMessage)
    .filter(Boolean);

  for (const message of messages) {
    for (const [pattern, friendly] of FRIENDLY_PATTERNS) {
      if (pattern.test(message)) return friendly;
    }
  }

  for (const message of messages) {
    if (!LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(message))) {
      return message;
    }
  }

  if (messages.some((message) => /could not coalesce error/i.test(message))) {
    return "Your wallet could not prepare this transaction. Confirm the right network in the wallet and try again.";
  }

  return fallback;
}
