// ─── Price Alerts Engine ──────────────────────────────────────────────────────

const STORAGE_KEY = "aqua_alerts";

export const alerts = {
  list: [],

  // Load from localStorage
  load() {
    try {
      this.list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      this.list = [];
    }
  },

  // Save to localStorage
  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.list));
  },

  // Add a new alert
  // e.g. { symbol: "AQUA", condition: "above", price: 0.0004 }
  add({ symbol, condition, price }) {
    const id = Date.now().toString();
    const alert = {
      id,
      symbol: symbol.toUpperCase(),
      condition, // "above" | "below"
      price: parseFloat(price),
      triggered: false,
      createdAt: Date.now(),
    };
    this.list.push(alert);
    this.save();
    return alert;
  },

  // Remove alert by id
  remove(id) {
    this.list = this.list.filter(a => a.id !== id);
    this.save();
  },

  // Check all alerts against current prices map { symbol → priceUsd }
  check(priceMap, onTrigger) {
    let changed = false;
    for (const alert of this.list) {
      if (alert.triggered) continue;
      const currentPrice = priceMap[alert.symbol.toUpperCase()];
      if (currentPrice == null) continue;
      const hit =
        (alert.condition === "above" && currentPrice >= alert.price) ||
        (alert.condition === "below" && currentPrice <= alert.price);
      if (hit) {
        alert.triggered = true;
        changed = true;
        onTrigger(alert, currentPrice);
      }
    }
    if (changed) this.save();
  },

  // Request notification permission
  async requestPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    const perm = await Notification.requestPermission();
    return perm === "granted";
  },

  // Fire a browser notification
  notify(alert, currentPrice) {
    const dir = alert.condition === "above" ? "↑" : "↓";
    const msg = `${alert.symbol} ${dir} $${currentPrice.toFixed(8)} (target: $${alert.price.toFixed(8)})`;
    if (Notification.permission === "granted") {
      new Notification(`AQUA Alert: ${alert.symbol}`, {
        body: msg,
        icon: "./aqua-icon.png",
      });
    }
    // Also dispatch DOM event so the UI can react
    window.dispatchEvent(new CustomEvent("aqua:alert:triggered", {
      detail: { alert, currentPrice, msg }
    }));
  },

  // Parse a natural-language alert command
  // e.g. "alert AQUA above 0.0004" or "set alert when ORCAT below 0.00001"
  parse(text) {
    const t = text.toLowerCase();
    const symbolMatch = t.match(/alert\s+([a-z]+)/i) ||
                        t.match(/when\s+([a-z]+)/i) ||
                        t.match(/if\s+([a-z]+)/i);
    const condMatch = t.match(/(above|over|greater|below|under|less)/i);
    const priceMatch = t.match(/[\d.]+/);
    if (!symbolMatch || !condMatch || !priceMatch) return null;
    const symbol = symbolMatch[1].toUpperCase();
    const condWord = condMatch[1].toLowerCase();
    const condition = ["above","over","greater"].includes(condWord) ? "above" : "below";
    const price = parseFloat(priceMatch[0]);
    if (isNaN(price)) return null;
    return { symbol, condition, price };
  },
};

alerts.load();
