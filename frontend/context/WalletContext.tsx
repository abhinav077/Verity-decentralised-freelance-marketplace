"use client";
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";

interface WalletState {
  address: string | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null, provider: null, signer: null, chainId: null,
  connecting: false, error: null,
  connect: async () => {}, disconnect: () => {},
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
      const _signer = await _provider.getSigner();
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
    <WalletContext.Provider value={{ address, provider, signer, chainId, connecting, error, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
