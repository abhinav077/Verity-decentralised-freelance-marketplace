// Extend the Window interface to include MetaMask's ethereum provider
interface Window {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ethereum?: any;
}
