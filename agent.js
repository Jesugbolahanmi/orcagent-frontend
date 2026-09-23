// ─── Chat Agent Command Parser ────────────────────────────────────────────────
// Interprets natural-language commands and returns structured actions

export const agent = {
  // Parse a user message into a structured command
  parse(text) {
    const t = text.trim().toLowerCase();

    // ── BUY commands ──────────────────────────────────────────────────────────
    // "buy 0.1 SOL of ORCA"  "buy 50 ORCA worth of ORCAT"  "buy ORCA with 0.5 sol"
    const buyPatterns = [
      /buy\s+([\d.]+)\s*(sol|orca)\s+(?:of|worth\s+of)?\s*([a-z]+)/i,
      /buy\s+([a-z]+)\s+with\s+([\d.]+)\s*(sol|orca)/i,
      /(?:purchase|get|swap)\s+([\d.]+)\s*(sol|orca)\s+(?:of|for)?\s*([a-z]+)/i,
    ];
    for (const pat of buyPatterns) {
      const m = t.match(pat);
      if (m) {
        // Normalize: amount, currency, symbol
        let amount, currency, symbol;
        if (pat.toString().includes("buy\\s+([a-z]+)")) {
          symbol = m[1].toUpperCase();
          amount = m[2];
          currency = m[3].toUpperCase();
        } else {
          amount = m[1];
          currency = m[2].toUpperCase();
          symbol = m[3].toUpperCase();
        }
        return { type: "buy", amount, currency, symbol };
      }
    }

    // ── SELL commands ─────────────────────────────────────────────────────────
    const sellMatch = t.match(/sell\s+([\d.]+)\s+([a-z]+)/i) ||
                      t.match(/sell\s+all\s+(?:my\s+)?([a-z]+)/i);
    if (sellMatch) {
      if (t.includes("all")) {
        return { type: "sell", amount: "all", symbol: sellMatch[1].toUpperCase() };
      }
      return { type: "sell", amount: sellMatch[1], symbol: sellMatch[2].toUpperCase() };
    }

    // ── PRICE commands ────────────────────────────────────────────────────────
    const priceMatch = t.match(/price\s+(?:of\s+)?([a-z]+)/i) ||
                       t.match(/(?:what(?:'s| is)\s+(?:the\s+)?price\s+of\s+)([a-z]+)/i) ||
                       t.match(/([a-z]+)\s+price/i);
    if (priceMatch && !["buy","sell","top","my","show","list","set","alert"].includes(priceMatch[1].toLowerCase())) {
      return { type: "price", symbol: priceMatch[1].toUpperCase() };
    }

    // ── TOP MOVERS / GAINERS ──────────────────────────────────────────────────
    if (t.match(/top\s+(movers?|gainers?|winners?)/i)) {
      return { type: "top_movers", direction: "up" };
    }
    if (t.match(/top\s+(losers?|decliners?)/i)) {
      return { type: "top_movers", direction: "down" };
    }

    // ── VOLUME ────────────────────────────────────────────────────────────────
    if (t.match(/(?:most|highest?|top)\s+(?:volume|trading)/i) ||
        t.match(/by\s+volume/i)) {
      return { type: "top_volume" };
    }

    // ── NEW LAUNCHES ──────────────────────────────────────────────────────────
    if (t.match(/new(est)?\s+(launches?|tokens?|coins?)/i) ||
        t.match(/recently\s+launched/i) ||
        t.match(/latest/i)) {
      return { type: "new_launches" };
    }

    // ── SHOW MARKETS ──────────────────────────────────────────────────────────
    if (t.match(/(?:show|list|view|display|browse|see)\s+(?:all\s+)?(?:markets?|tokens?|coins?|launches?)/i) ||
        t === "markets" || t === "tokens" || t === "coins") {
      return { type: "markets" };
    }

    // ── PORTFOLIO / HOLDINGS ──────────────────────────────────────────────────
    if (t.match(/(?:my\s+)?(?:portfolio|holdings?|balance|wallet)/i)) {
      return { type: "portfolio" };
    }

    // ── ALERTS ────────────────────────────────────────────────────────────────
    if (t.match(/(?:set\s+)?alert/i) || t.match(/notify\s+me/i)) {
      return { type: "set_alert", raw: text };
    }
    if (t.match(/(?:show|list|my)\s+alerts?/i)) {
      return { type: "list_alerts" };
    }
    if (t.match(/(?:clear|remove|delete|cancel)\s+alert/i)) {
      const idMatch = t.match(/alert\s+(\d+)/i);
      return { type: "remove_alert", id: idMatch ? idMatch[1] : null };
    }

    // ── TOKEN INFO ────────────────────────────────────────────────────────────
    const infoMatch = t.match(/(?:info|details?|about|tell\s+me\s+about)\s+([a-z]+)/i);
    if (infoMatch) {
      return { type: "info", symbol: infoMatch[1].toUpperCase() };
    }

    // ── HELP ──────────────────────────────────────────────────────────────────
    if (t.match(/^(help|commands?|what\s+can\s+you\s+do|\?+)$/i)) {
      return { type: "help" };
    }

    // ── UNKNOWN ───────────────────────────────────────────────────────────────
    return { type: "unknown", raw: text };
  },

  // Format number as USD
  usd(n) {
    if (n == null) return "N/A";
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
    if (n >= 1) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(8)}`;
  },

  // Format percentage change
  pct(n) {
    if (n == null) return "";
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
  },

  // Help text
  helpText() {
    return `**ORCAGENT Commands:**

💰 **Trading**
• \`buy 0.1 SOL of ORCA\` — swap SOL for a token
• \`buy 5 ORCA of ORCAT\` — swap ORCA for a token
• \`sell 1000 ORCA\` — sell a token back

📊 **Markets**
• \`show markets\` — browse all launches
• \`top movers\` — biggest 24h gainers
• \`top losers\` — biggest 24h decliners
• \`most volume\` — sort by trading volume
• \`newest launches\` — recently launched tokens
• \`price of ORCA\` — get current price
• \`info ORCA\` — detailed token info

🔔 **Alerts**
• \`set alert ORCA above 0.0005\` — price alert
• \`set alert ORCAT below 0.00001\` — downside alert
• \`show alerts\` — list your active alerts
• \`remove alert 1\` — delete an alert

👛 **Wallet**
• \`my portfolio\` — see your holdings`;
  },
};
