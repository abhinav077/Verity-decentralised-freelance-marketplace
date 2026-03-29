"use client";
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner, type Eip1193Provider } from "ethers";
import { patchSignerWithFeeFloor } from "@/lib/tx";
import WalletSelectModal from "@/components/WalletSelectModal";

export type WalletType = "injected" | "walletconnect" | null;

// Minimal EIP-1193 provider interface (covers both window.ethereum and WalletConnect)
interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
}

interface WalletState {
  address: string | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  walletType: WalletType;
  walletModalOpen: boolean;
  connect: () => Promise<void>;
  connectInjected: () => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  disconnect: () => void;
  switchToExpectedChain: () => Promise<void>;
  openWalletModal: () => void;
  closeWalletModal: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null, provider: null, signer: null, chainId: null,
  connecting: false, error: null, walletType: null, walletModalOpen: false,
  connect: async () => {}, connectInjected: async () => {}, connectWalletConnect: async () => {},
  disconnect: () => {}, switchToExpectedChain: async () => {},
  openWalletModal: () => {}, closeWalletModal: () => {},
});

// Network metadata for wallet_addEthereumChain
const CHAIN_META: Record<number, { chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls?: string[] }> = {
  80002: { chainName: "Polygon Amoy Testnet", rpcUrls: ["https://rpc-amoy.polygon.technology"], nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 }, blockExplorerUrls: ["https://amoy.polygonscan.com"] },
  84532: { chainName: "Base Sepolia Testnet", rpcUrls: ["https://sepolia.base.org"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, blockExplorerUrls: ["https://sepolia.basescan.org"] },
  11155111: { chainName: "Sepolia Testnet", rpcUrls: ["https://rpc.sepolia.org"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, blockExplorerUrls: ["https://sepolia.etherscan.io"] },
  31337: { chainName: "Localhost (Hardhat)", rpcUrls: ["http://127.0.0.1:8545"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } },
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  // Refs for the active EIP-1193 provider and WalletConnect instance
  const activeProviderRef = useRef<EIP1193Provider | null>(null);
  const wcProviderRef = useRef<{ disconnect: () => Promise<void> } | null>(null);

  const openWalletModal = useCallback(() => {
    setError(null);
    setWalletModalOpen(true);
  }, []);

  const closeWalletModal = useCallback(() => {
    setWalletModalOpen(false);
  }, []);

  // Clear all wallet state (used by both disconnect and WC session-end handler)
  const clearWalletState = useCallback(() => {
    activeProviderRef.current = null;
    setAddress(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
    setError(null);
    setWalletType(null);
    localStorage.removeItem("dfm_wallet_connected");
    localStorage.removeItem("dfm_wallet_type");
  }, []);

  const disconnect = useCallback(() => {
    // Close WalletConnect session if active
    if (wcProviderRef.current) {
      const wcp = wcProviderRef.current;
      wcProviderRef.current = null;
      wcp.disconnect().catch(() => {});
    }
    clearWalletState();
  }, [clearWalletState]);

  // Shared: wire up an EIP-1193 provider and populate wallet state
  const finalizeConnection = useCallback(async (eip1193: EIP1193Provider, type: "injected" | "walletconnect") => {
    const _provider = new BrowserProvider(eip1193 as unknown as Eip1193Provider);
    await _provider.send("eth_requestAccounts", []);
    const rawSigner = await _provider.getSigner();
    const _signer = patchSignerWithFeeFloor(rawSigner, _provider);
    const _address = await _signer.getAddress();
    const network = await _provider.getNetwork();
    setProvider(_provider);
    setSigner(_signer);
    setAddress(_address);
    setChainId(Number(network.chainId));
    setWalletType(type);
    activeProviderRef.current = eip1193;
    localStorage.setItem("dfm_wallet_connected", "true");
    localStorage.setItem("dfm_wallet_type", type);
  }, []);

  // Connect via browser extension (MetaMask, Coinbase Wallet, etc.)
  const connectInjected = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No browser wallet detected. Please install MetaMask or use WalletConnect.");
      return;
    }
    setConnecting(true);
    setError(null);
    setWalletModalOpen(false);
    try {
      await finalizeConnection(window.ethereum as unknown as EIP1193Provider, "injected");
    } catch (e: unknown) {
      setError((e as Error).message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  }, [finalizeConnection]);

  // Connect via WalletConnect v2 — shows QR code on desktop, deep-links on mobile
  const connectWalletConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    setWalletModalOpen(false);
    try {
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
      if (!projectId) {
        throw new Error(
          "WalletConnect Project ID is not configured. " +
          "Add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to your .env.local file. " +
          "Get a free ID at https://cloud.walletconnect.com"
        );
      }

      const expectedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "1");
      // All supported chains minus the required one become optional
      const allChains = [80002, 84532, 11155111, 31337];
      const optionalChainsRaw = allChains.filter(c => c !== expectedChainId);

      const wcProvider = await EthereumProvider.init({
        projectId,
        showQrModal: true,
        chains: [expectedChainId] as [number, ...number[]],
        ...(optionalChainsRaw.length > 0 && { optionalChains: optionalChainsRaw as [number, ...number[]] }),
        metadata: {
          name: "Verity Marketplace",
          description: "Decentralised Freelance Marketplace",
          url: typeof window !== "undefined" ? window.location.origin : "",
          icons: typeof window !== "undefined" ? [`${window.location.origin}/logo.png`] : [],
        },
      });

      wcProviderRef.current = wcProvider;

      // enable() opens the QR modal on desktop or triggers deep-link on mobile
      await wcProvider.enable();

      await finalizeConnection(wcProvider as unknown as EIP1193Provider, "walletconnect");

      // Mirror WalletConnect-side disconnects (e.g. user disconnects from wallet app)
      wcProvider.on("disconnect", () => {
        wcProviderRef.current = null;
        clearWalletState();
      });
    } catch (e: unknown) {
      const msg = (e as Error).message || "WalletConnect connection failed";
      // User closed modal / rejected — not shown as an error
      if (
        !msg.includes("User rejected") &&
        !msg.includes("Modal closed") &&
        !msg.includes("Connection request reset") &&
        !msg.includes("close")
      ) {
        setError(msg);
      }
    } finally {
      setConnecting(false);
    }
  }, [finalizeConnection, clearWalletState]);

  // Main connect() — opens wallet selection modal
  const connect = useCallback(async () => {
    openWalletModal();
  }, [openWalletModal]);

  const switchToExpectedChain = useCallback(async () => {
    const eip1193 = activeProviderRef.current;
    if (!eip1193) return;
    const expectedId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "31337");
    const hexChainId = "0x" + expectedId.toString(16);
    try {
      await eip1193.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
    } catch (err: unknown) {
      // Error 4902 = chain not added to wallet yet — add it
      if ((err as { code?: number })?.code === 4902) {
        const meta = CHAIN_META[expectedId];
        if (meta) {
          await eip1193.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: hexChainId, ...meta }],
          });
        }
      }
    }
  }, []);

  // Auto-reconnect injected wallet on mount if previously connected
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const wasConnected = localStorage.getItem("dfm_wallet_connected") === "true";
    const savedType = localStorage.getItem("dfm_wallet_type");

    if (wasConnected && savedType !== "walletconnect") {
      (window.ethereum as unknown as EIP1193Provider)
        .request({ method: "eth_accounts" })
        .then((accounts) => {
          if ((accounts as string[]).length > 0) void connectInjected();
        })
        .catch(() => {});
    }

    const eip1193 = window.ethereum as unknown as EIP1193Provider;

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) disconnect();
      else if (
        localStorage.getItem("dfm_wallet_connected") === "true" &&
        localStorage.getItem("dfm_wallet_type") !== "walletconnect"
      ) {
        void connectInjected();
      }
    };
    const handleChainChanged = () => {
      if (localStorage.getItem("dfm_wallet_type") !== "walletconnect") void connectInjected();
    };

    eip1193.on("accountsChanged", handleAccountsChanged);
    eip1193.on("chainChanged", handleChainChanged);
    return () => {
      eip1193.removeListener("accountsChanged", handleAccountsChanged);
      eip1193.removeListener("chainChanged", handleChainChanged);
    };
  }, [connectInjected, disconnect]);

  return (
    <WalletContext.Provider value={{
      address, provider, signer, chainId, connecting, error,
      walletType, walletModalOpen,
      connect, connectInjected, connectWalletConnect,
      disconnect, switchToExpectedChain,
      openWalletModal, closeWalletModal,
    }}>
      {children}
      <WalletSelectModal />
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
