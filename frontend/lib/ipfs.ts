/**
 * IPFS utility functions for Verity DFM.
 *
 * Centralises gateway URL resolution so every part of the UI handles
 * ipfs:// URIs, bare CIDs, and full HTTP URLs consistently.
 */

const DEFAULT_GATEWAY = "https://gateway.pinata.cloud/ipfs";

/**
 * Returns the configured IPFS gateway base URL (no trailing slash).
 */
export function getGateway(): string {
  if (typeof window !== "undefined") {
    return (
      process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
      process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
      DEFAULT_GATEWAY
    );
  }
  return DEFAULT_GATEWAY;
}

/**
 * Convert any IPFS reference to a full HTTP URL.
 *
 * Handles:
 *  - `ipfs://Qm…`          → `<gateway>/Qm…`
 *  - `Qm…` or `bafy…`      → `<gateway>/Qm…`
 *  - `https://…`            → returned as-is
 *  - empty / null           → empty string
 */
export function resolveIpfsUrl(uri: string | null | undefined): string {
  if (!uri || uri.trim() === "") return "";

  const trimmed = uri.trim();

  // Already a full HTTP(S) URL — return directly
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // ipfs:// protocol
  if (trimmed.startsWith("ipfs://")) {
    const cid = trimmed.slice("ipfs://".length);
    return `${getGateway()}/${cid}`;
  }

  // Bare CID (starts with "Qm" v0 or "bafy" v1)
  if (trimmed.startsWith("Qm") || trimmed.startsWith("bafy")) {
    return `${getGateway()}/${trimmed}`;
  }

  // Fallback — assume it's a relative CID-like path
  return `${getGateway()}/${trimmed}`;
}

/**
 * Extract just the CID from any IPFS URL/URI.
 */
export function extractCid(uri: string | null | undefined): string {
  if (!uri) return "";
  const trimmed = uri.trim();

  if (trimmed.startsWith("ipfs://")) {
    return trimmed.slice("ipfs://".length).split("/")[0];
  }

  // Full gateway URL — grab last path segment
  if (trimmed.includes("/ipfs/")) {
    const parts = trimmed.split("/ipfs/");
    return parts[parts.length - 1].split("/")[0];
  }

  // Bare CID
  if (trimmed.startsWith("Qm") || trimmed.startsWith("bafy")) {
    return trimmed.split("/")[0];
  }

  return trimmed;
}

/**
 * Check if a string looks like a valid IPFS CID or URI.
 */
export function isIpfsReference(uri: string | null | undefined): boolean {
  if (!uri) return false;
  const trimmed = uri.trim();
  return (
    trimmed.startsWith("ipfs://") ||
    trimmed.startsWith("Qm") ||
    trimmed.startsWith("bafy") ||
    trimmed.includes("/ipfs/")
  );
}
