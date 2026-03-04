"use client";
import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { getProvider } from "@/lib/contracts";

interface WalletState {
  address: string | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    provider: null,
    signer: null,
    chainId: null,
    connecting: false,
    error: null,
  });

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const provider = await getProvider();
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      setState({ address, provider, signer, chainId: Number(network.chainId), connecting: false, error: null });
    } catch (e: unknown) {
      setState((s) => ({ ...s, connecting: false, error: (e as Error).message }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ address: null, provider: null, signer: null, chainId: null, connecting: false, error: null });
  }, []);

  // Auto-reconnect if already connected
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then((accounts: string[]) => {
      if (accounts.length > 0) connect();
    });

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) disconnect();
      else connect();
    };
    const handleChainChanged = () => connect();

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [connect, disconnect]);

  return { ...state, connect, disconnect };
}
