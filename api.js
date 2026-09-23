// ─── AQUA Backend API ────────────────────────────────────────────────────────
const AQUA_API = "https://corsproxy.io/?https://launchpad-backend-production-63dc.up.railway.app";

async function apiFetch(path) {
  const res = await fetch(`${AQUA_API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  // Paginated list of all launches
  async launches(params = {}) {
    const qs = new URLSearchParams({ limit: 50, ...params }).toString();
    const data = await apiFetch(`/api/launches?${qs}`);
    return data; // { launches: [...], hasMore, nextOffset }
  },

  // All launches (auto-paginate up to 200)
  async allLaunches() {
    let all = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore && all.length < 200) {
      const data = await apiFetch(`/api/launches?limit=50&offset=${offset}`);
      all = all.concat(data.launches);
      hasMore = data.hasMore;
      offset = data.nextOffset;
    }
    return all;
  },

  // Single launch by id or mint
  async launch(idOrMint) {
    return apiFetch(`/api/launches/${encodeURIComponent(idOrMint)}`);
  },

  // Live prices for all markets
  async marketPrices() {
    const data = await apiFetch("/api/market-prices");
    return data.prices; // [{ launchId, priceUsd, ... }]
  },

  // Platform config (RPC URL, program IDs, fees)
  async config() {
    return apiFetch("/api/config");
  },

  // Wallet holdings
  async holdings(walletAddress) {
    return apiFetch(`/api/wallets/${encodeURIComponent(walletAddress)}/holdings`);
  },

  // Analytics
  async analytics() {
    return apiFetch("/api/analytics");
  },
};

// ─── Jupiter Swap API (for building trade transactions) ───────────────────────
const JUPITER_API = "https://quote-api.jup.ag/v6";
const SOL_MINT   = "So11111111111111111111111111111111111111112";
const ORCA_MINT  = "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE";

export const jupiter = {
  // Get a swap quote: inputMint → outputMint, amount in lamports/raw
  async quote({ inputMint, outputMint, amount, slippageBps = 100 }) {
    const qs = new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(amount),
      slippageBps: String(slippageBps),
    });
    const res = await fetch(`${JUPITER_API}/quote?${qs}`);
    if (!res.ok) throw new Error("Jupiter quote failed");
    return res.json();
  },

  // Build a swap transaction (returns base64 transaction to sign)
  async swapTransaction({ quoteResponse, userPublicKey }) {
    const res = await fetch(`${JUPITER_API}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });
    if (!res.ok) throw new Error("Jupiter swap tx failed");
    const data = await res.json();
    return data.swapTransaction; // base64 versioned transaction
  },

  // Helper: SOL lamports from SOL amount
  solToLamports(sol) {
    return Math.floor(parseFloat(sol) * 1e9);
  },

  // Helper: raw token units
  tokenToRaw(amount, decimals) {
    return Math.floor(parseFloat(amount) * Math.pow(10, decimals));
  },

  // Pair mint for an AQUA launch
  pairMint(launch) {
    return launch.pairType === "sol" ? SOL_MINT : ORCA_MINT;
  },
};

export { SOL_MINT, ORCA_MINT };
