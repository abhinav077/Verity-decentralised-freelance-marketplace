"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { patchSignerWithFeeFloor } from "@/lib/tx";

interface WalletState {
  address: string | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToExpectedChain: () => Promise<void>;
}

const WalletContext = createContext<WalletState>({
  address: null, provider: null, signer: null, chainId: null,
  connecting: false, error: null,
  connect: async () => {}, disconnect: () => {}, switchToExpectedChain: async () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("MetaMask not detected. Please install MetaMask.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const _provider = new BrowserProvider(window.ethereum);
      await _provider.send("eth_requestAccounts", []);
      const rawSigner = await _provider.getSigner();
      const _signer = patchSignerWithFeeFloor(rawSigner, _provider);
      const _address = await _signer.getAddress();
      const network = await _provider.getNetwork();
      setProvider(_provider);
      setSigner(_signer);
      setAddress(_address);
      setChainId(Number(network.chainId));
      // Remember that user is connected
      localStorage.setItem("dfm_wallet_connected", "true");
    } catch (e: unknown) {
      setError((e as Error).message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
    setError(null);
    // Remember that user explicitly disconnected — don't auto-reconnect on refresh
    localStorage.removeItem("dfm_wallet_connected");
  }, []);

  // Network metadata for wallet_addEthereumChain
  const CHAIN_META: Record<number, { chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls?: string[] }> = {
    80002: { chainName: "Polygon Amoy Testnet", rpcUrls: ["https://rpc-amoy.polygon.technology"], nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 }, blockExplorerUrls: ["https://amoy.polygonscan.com"] },
    84532: { chainName: "Base Sepolia Testnet", rpcUrls: ["https://sepolia.base.org"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, blockExplorerUrls: ["https://sepolia.basescan.org"] },
    11155111: { chainName: "Sepolia Testnet", rpcUrls: ["https://rpc.sepolia.org"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, blockExplorerUrls: ["https://sepolia.etherscan.io"] },
    31337: { chainName: "Localhost (Hardhat)", rpcUrls: ["http://127.0.0.1:8545"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } },
  };

  const switchToExpectedChain = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const expectedId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "31337");
    const hexChainId = "0x" + expectedId.toString(16);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
    } catch (err: unknown) {
      // Error 4902 = chain not added to wallet yet — add it
      if ((err as { code?: number })?.code === 4902) {
        const meta = CHAIN_META[expectedId];
        if (meta) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: hexChainId, ...meta }],
          });
        }
      }
    }
  }, []);

  // Auto-reconnect on mount ONLY if user previously connected and didn't disconnect
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const wasConnected = localStorage.getItem("dfm_wallet_connected") === "true";
    if (wasConnected) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts: string[]) => {
        if (accounts.length > 0) connect();
      }).catch(() => {});
    }

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) disconnect();
      else if (localStorage.getItem("dfm_wallet_connected") === "true") connect();
    };
    const handleChainChanged = () => connect();

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [connect, disconnect]);

  return (
    <WalletContext.Provider value={{ address, provider, signer, chainId, connecting, error, connect, disconnect, switchToExpectedChain }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
