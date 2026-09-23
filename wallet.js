// ─── Phantom Wallet Integration ───────────────────────────────────────────────

export const wallet = {
  publicKey: null,

  get connected() {
    return !!this.publicKey;
  },

  get phantom() {
    return window.solana && window.solana.isPhantom ? window.solana : null;
  },

  get isInstalled() {
    return !!this.phantom;
  },

  // Connect wallet — shows Phantom popup
  async connect() {
    if (!this.phantom) {
      window.open("https://phantom.app/", "_blank");
      throw new Error("Phantom not installed");
    }
    try {
      const resp = await this.phantom.connect();
      this.publicKey = resp.publicKey.toString();
      this._emit("connect", this.publicKey);
      return this.publicKey;
    } catch (e) {
      if (e.code === 4001) throw new Error("Connection rejected by user");
      throw e;
    }
  },

  // Disconnect
  async disconnect() {
    if (this.phantom) {
      await this.phantom.disconnect();
    }
    this.publicKey = null;
    this._emit("disconnect");
  },

  // Sign and send a base64 versioned transaction (from Jupiter)
  async signAndSend(base64Tx) {
    if (!this.connected) throw new Error("Wallet not connected");
    // Decode base64 → Uint8Array
    const txBytes = Uint8Array.from(atob(base64Tx), c => c.charCodeAt(0));
    // Deserialize as VersionedTransaction using @solana/web3.js (loaded globally)
    const { VersionedTransaction } = window.solanaWeb3 || {};
    if (!VersionedTransaction) throw new Error("@solana/web3.js not loaded");
    const tx = VersionedTransaction.deserialize(txBytes);
    // Sign via Phantom
    const signedTx = await this.phantom.signTransaction(tx);
    // Send via connection
    const connection = new window.solanaWeb3.Connection(
      "https://mainnet.helius-rpc.com/?api-key=8bdb5404-e5d6-49c0-a177-d09b4f95de37",
      "confirmed"
    );
    const rawTx = signedTx.serialize();
    const sig = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      maxRetries: 3,
    });
    return sig;
  },

  // Auto-connect if already approved
  async tryAutoConnect() {
    if (!this.phantom) return false;
    try {
      const resp = await this.phantom.connect({ onlyIfTrusted: true });
      this.publicKey = resp.publicKey.toString();
      this._emit("connect", this.publicKey);
      return true;
    } catch {
      return false;
    }
  },

  // Simple event emitter
  _listeners: {},
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  },
  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  },
  _emit(event, ...args) {
    (this._listeners[event] || []).forEach(fn => fn(...args));
  },
};

// Listen for Phantom account changes
window.addEventListener("load", () => {
  if (window.solana?.isPhantom) {
    window.solana.on("accountChanged", (pubkey) => {
      if (pubkey) {
        wallet.publicKey = pubkey.toString();
        wallet._emit("connect", wallet.publicKey);
      } else {
        wallet.publicKey = null;
        wallet._emit("disconnect");
      }
    });
  }
});
