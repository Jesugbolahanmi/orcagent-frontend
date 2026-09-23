// ─── Trade Module ─────────────────────────────────────────────────────────────
// Handles quote fetching + transaction building via Jupiter + Phantom signing

import { jupiter, SOL_MINT } from "./api.js";
import { wallet } from "./wallet.js";

export const trade = {
  // Active quote (shown in trade modal)
  currentQuote: null,
  currentLaunch: null,

  // Get a buy quote: paying `payAmount` of `payCurrency` for tokens in `launch`
  async getQuote(launch, payAmount, payCurrency = "SOL") {
    const inputMint = payCurrency.toUpperCase() === "SOL" ? SOL_MINT : launch.pairMint;
    const outputMint = launch.mint;
    const decimals = payCurrency.toUpperCase() === "SOL" ? 9 : 6;
    const rawAmount = Math.floor(parseFloat(payAmount) * Math.pow(10, decimals));

    const quote = await jupiter.quote({
      inputMint,
      outputMint,
      amount: rawAmount,
      slippageBps: 150, // 1.5% slippage
    });

    this.currentQuote = quote;
    this.currentLaunch = launch;
    return quote;
  },

  // Get a sell quote: selling `sellAmount` tokens for `receiveCurrency`
  async getSellQuote(launch, sellAmount, receiveCurrency = "SOL") {
    const inputMint = launch.mint;
    const outputMint = receiveCurrency.toUpperCase() === "SOL" ? SOL_MINT : launch.pairMint;
    const rawAmount = Math.floor(parseFloat(sellAmount) * Math.pow(10, launch.tokenDecimals || 6));

    const quote = await jupiter.quote({
      inputMint,
      outputMint,
      amount: rawAmount,
      slippageBps: 150,
    });

    this.currentQuote = quote;
    this.currentLaunch = launch;
    return quote;
  },

  // Execute the current quote (signs with Phantom)
  async execute() {
    if (!this.currentQuote) throw new Error("No active quote");
    if (!wallet.connected) throw new Error("Wallet not connected");

    // Build the swap transaction via Jupiter
    const base64Tx = await jupiter.swapTransaction({
      quoteResponse: this.currentQuote,
      userPublicKey: wallet.publicKey,
    });

    // Sign and send via Phantom
    const signature = await wallet.signAndSend(base64Tx);
    this.currentQuote = null;
    return signature;
  },

  // Format quote details for display
  formatQuote(quote, launch, direction = "buy") {
    if (!quote) return null;
    const inAmt  = parseInt(quote.inAmount);
    const outAmt = parseInt(quote.outAmount);
    const slippage = (quote.slippageBps / 100).toFixed(1);
    const priceImpact = quote.priceImpactPct
      ? (parseFloat(quote.priceImpactPct) * 100).toFixed(3)
      : "< 0.01";

    let inFormatted, outFormatted;
    if (direction === "buy") {
      inFormatted  = `${(inAmt / 1e9).toFixed(4)} SOL`;
      outFormatted = `${(outAmt / Math.pow(10, launch?.tokenDecimals || 6)).toLocaleString()} ${launch?.symbol || ""}`;
    } else {
      inFormatted  = `${(inAmt / Math.pow(10, launch?.tokenDecimals || 6)).toLocaleString()} ${launch?.symbol || ""}`;
      outFormatted = `${(outAmt / 1e9).toFixed(6)} SOL`;
    }

    return { inFormatted, outFormatted, slippage, priceImpact };
  },

  // Shorten signature for display
  shortSig(sig) {
    return `${sig.slice(0, 8)}...${sig.slice(-6)}`;
  },

  solscanUrl(sig) {
    return `https://solscan.io/tx/${sig}`;
  },
};
