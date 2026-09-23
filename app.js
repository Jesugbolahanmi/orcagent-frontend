// ─── ORCAGENT — Main App ───────────────────────────────────────────
import { api } from "./api.js";
import { wallet } from "./wallet.js";
import { trade } from "./trade.js";
import { agent } from "./agent.js";
import { alerts } from "./alerts.js";

// ── State ─────────────────────────────────────────────────────────────────────
let allLaunches = [];
let filteredLaunches = [];
let currentSort = "marketCapUsd";
let currentFilter = "all";
let searchQuery = "";
let priceCache = {}; // symbol → priceUsd

// ── DOM references ────────────────────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  setupTabs();
  setupWalletButton();
  setupSearch();
  setupSort();
  setupChat();
  setupTradeModal();
  setupAlertEvents();

  // Auto-connect if previously approved
  await wallet.tryAutoConnect();

  // Load config + markets
  try {
    await loadMarkets();
  } catch (e) {
    showError("Failed to load markets: " + e.message);
  }

  // Poll prices every 15s
  setInterval(refreshPrices, 15_000);

  // Check alerts every 20s
  setInterval(checkAlerts, 20_000);

  // Request notification permission for alerts
  alerts.requestPermission();
}

// ── Markets ───────────────────────────────────────────────────────────────────
async function loadMarkets() {
  showMarketsLoading(true);
  try {
    const data = await api.launches({ limit: 50 });
    allLaunches = data.launches;
    buildPriceCache(allLaunches);
    applyFiltersAndRender();
  } finally {
    showMarketsLoading(false);
  }
}

async function refreshPrices() {
  try {
    const prices = await api.marketPrices();
    prices.forEach(p => {
      const launch = allLaunches.find(l => l.id === p.launchId);
      if (launch) {
        const prev = launch.priceUsd;
        launch.priceUsd = p.priceUsd;
        launch.marketCapUsd = p.marketCapUsd;
        launch.change24h = p.change24h;
        launch._priceDir = p.priceUsd > prev ? "up" : p.priceUsd < prev ? "down" : "";
      }
    });
    buildPriceCache(allLaunches);
    applyFiltersAndRender();
    checkAlerts();
  } catch { /* silent */ }
}

function buildPriceCache(launches) {
  launches.forEach(l => { priceCache[l.symbol.toUpperCase()] = l.priceUsd; });
}

function applyFiltersAndRender() {
  let items = [...allLaunches];

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.symbol.toLowerCase().includes(q)
    );
  }

  // Pair filter
  if (currentFilter === "sol") items = items.filter(l => l.pairType === "sol");
  if (currentFilter === "orca") items = items.filter(l => l.pairType !== "sol");

  // Sort
  items.sort((a, b) => {
    const v = currentSort;
    if (v === "change24h") return (b.change24h || 0) - (a.change24h || 0);
    if (v === "change24h_asc") return (a.change24h || 0) - (b.change24h || 0);
    if (v === "volume24hUsd") return (b.volume24hUsd || 0) - (a.volume24hUsd || 0);
    if (v === "holderCount") return (b.holderCount || 0) - (a.holderCount || 0);
    if (v === "newest") return b.launchedAt - a.launchedAt;
    return (b.marketCapUsd || 0) - (a.marketCapUsd || 0); // default: marketCap
  });

  filteredLaunches = items;
  renderMarkets(items);
  updateMarketStats(allLaunches);
}

function renderMarkets(items) {
  const grid = $("#markets-grid");
  if (!grid) return;

  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🌊</div><p>No markets found</p></div>`;
    return;
  }

  grid.innerHTML = items.map(l => marketCard(l)).join("");

  // Attach buy button events
  grid.querySelectorAll(".btn-buy").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const launch = allLaunches.find(l => l.id === id);
      if (launch) openTradeModal(launch, "buy");
    });
  });
}

function marketCard(l) {
  const change = l.change24h || 0;
  const changeClass = change >= 0 ? "positive" : "negative";
  const changeStr = agent.pct(change);
  const priceStr = agent.usd(l.priceUsd);
  const mcStr = agent.usd(l.marketCapUsd);
  const volStr = agent.usd(l.volume24hUsd);
  const pairBadge = l.pairType === "sol"
    ? `<span class="pair-badge sol">SOL</span>`
    : `<span class="pair-badge orca">ORCA</span>`;
  const img = l.imageUrl
    ? `<img src="${l.imageUrl}" alt="${l.symbol}" class="token-img" onerror="this.style.display='none'">`
    : `<div class="token-img-placeholder">${l.symbol[0]}</div>`;
  const priceDir = l._priceDir ? ` price-${l._priceDir}` : "";

  return `
    <div class="market-card${priceDir}" data-id="${l.id}">
      <div class="card-header">
        <div class="token-identity">
          ${img}
          <div class="token-names">
            <span class="token-symbol">${l.symbol}</span>
            <span class="token-name">${l.name}</span>
          </div>
        </div>
        <div class="card-badges">${pairBadge}</div>
      </div>
      <div class="card-stats">
        <div class="stat">
          <span class="stat-label">Price</span>
          <span class="stat-value price-value">${priceStr}</span>
        </div>
        <div class="stat">
          <span class="stat-label">24h Change</span>
          <span class="stat-value ${changeClass}">${changeStr}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Market Cap</span>
          <span class="stat-value">${mcStr}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Volume 24h</span>
          <span class="stat-value">${volStr}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Holders</span>
          <span class="stat-value">${l.holderCount?.toLocaleString() || "—"}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Txns</span>
          <span class="stat-value">${l.txCount?.toLocaleString() || "—"}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-buy" data-id="${l.id}">Buy ${l.symbol}</button>
        <a href="https://aquafamily.fun/#/token/${l.mint}" target="_blank" class="btn-view">View ↗</a>
      </div>
    </div>`;
}

function updateMarketStats(launches) {
  const el = $("#market-stats");
  if (!el) return;
  const total = launches.length;
  const totalVol = launches.reduce((s, l) => s + (l.volume24hUsd || 0), 0);
  const totalMcap = launches.reduce((s, l) => s + (l.marketCapUsd || 0), 0);
  el.innerHTML = `
    <span>${total} markets</span>
    <span>Vol 24h: ${agent.usd(totalVol)}</span>
    <span>Total MCap: ${agent.usd(totalMcap)}</span>`;
}

function showMarketsLoading(on) {
  const el = $("#markets-loading");
  if (el) el.style.display = on ? "flex" : "none";
}

// ── Trade Modal ───────────────────────────────────────────────────────────────
function openTradeModal(launch, direction = "buy") {
  const modal = $("#trade-modal");
  if (!modal) return;

  trade.currentLaunch = launch;
  trade.currentQuote = null;

  // Populate header
  $("#modal-token-name").textContent = `${launch.symbol} — ${launch.name}`;
  $("#modal-token-price").textContent = `Current: ${agent.usd(launch.priceUsd)}`;
  const img = $("#modal-token-img");
  if (img) { img.src = launch.imageUrl || ""; img.style.display = launch.imageUrl ? "block" : "none"; }

  // Set direction
  const dirLabel = direction === "buy" ? "Buy" : "Sell";
  $("#modal-direction").textContent = dirLabel;
  $("#modal-submit-btn").textContent = `${dirLabel} ${launch.symbol}`;
  $("#modal-submit-btn").dataset.direction = direction;

  // Currency label
  const currency = launch.pairType === "sol" ? "SOL" : "ORCA";
  const label = direction === "buy"
    ? `Amount to spend (${currency})`
    : `Amount to sell (${launch.symbol})`;
  $("#modal-amount-label").textContent = label;
  $("#modal-amount").value = "";
  $("#modal-quote-box").innerHTML = "";
  $("#modal-quote-box").style.display = "none";

  modal.classList.add("open");
  document.body.classList.add("modal-open");
}

function closeTradeModal() {
  const modal = $("#trade-modal");
  if (modal) modal.classList.remove("open");
  document.body.classList.remove("modal-open");
  trade.currentQuote = null;
}

function setupTradeModal() {
  const modal = $("#trade-modal");
  if (!modal) return;

  // Close on backdrop click
  modal.addEventListener("click", e => {
    if (e.target === modal) closeTradeModal();
  });
  $("#modal-close")?.addEventListener("click", closeTradeModal);

  // Get Quote button
  $("#modal-quote-btn")?.addEventListener("click", async () => {
    const launch = trade.currentLaunch;
    const amount = $("#modal-amount")?.value?.trim();
    const direction = $("#modal-submit-btn")?.dataset?.direction || "buy";
    if (!launch || !amount || isNaN(parseFloat(amount))) {
      showModalError("Enter a valid amount"); return;
    }
    if (!wallet.connected) {
      showModalError("Connect your wallet first"); return;
    }
    showModalLoading(true, "Getting quote...");
    try {
      const currency = launch.pairType === "sol" ? "SOL" : "ORCA";
      const q = direction === "buy"
        ? await trade.getQuote(launch, amount, currency)
        : await trade.getSellQuote(launch, amount, currency);
      const fmt = trade.formatQuote(q, launch, direction);
      $("#modal-quote-box").style.display = "block";
      $("#modal-quote-box").innerHTML = `
        <div class="quote-row"><span>You pay</span><strong>${fmt.inFormatted}</strong></div>
        <div class="quote-row"><span>You receive</span><strong>${fmt.outFormatted}</strong></div>
        <div class="quote-row"><span>Price impact</span><strong>${fmt.priceImpact}%</strong></div>
        <div class="quote-row"><span>Slippage</span><strong>${fmt.slippage}%</strong></div>
        <div class="quote-note">Routed via Jupiter → Orca Whirlpool</div>`;
    } catch (e) {
      showModalError("Quote failed: " + e.message);
    } finally {
      showModalLoading(false);
    }
  });

  // Confirm swap
  $("#modal-submit-btn")?.addEventListener("click", async () => {
    if (!trade.currentQuote) { showModalError("Get a quote first"); return; }
    if (!wallet.connected) { showModalError("Connect your wallet first"); return; }
    showModalLoading(true, "Waiting for Phantom approval...");
    try {
      const sig = await trade.execute();
      closeTradeModal();
      showToast(`✅ Swap confirmed! <a href="${trade.solscanUrl(sig)}" target="_blank">View on Solscan ↗</a>`);
    } catch (e) {
      if (e.message.includes("rejected")) {
        showModalError("Transaction rejected");
      } else {
        showModalError("Swap failed: " + e.message);
      }
    } finally {
      showModalLoading(false);
    }
  });
}

function showModalError(msg) {
  const el = $("#modal-error");
  if (el) { el.textContent = msg; el.style.display = "block"; setTimeout(() => el.style.display = "none", 4000); }
}
function showModalLoading(on, msg = "") {
  const el = $("#modal-loading");
  if (el) { el.style.display = on ? "flex" : "none"; el.textContent = msg; }
}

// ── Chat Agent ────────────────────────────────────────────────────────────────
function setupChat() {
  const form   = $("#chat-form");
  const input  = $("#chat-input");
  if (!form || !input) return;

  // Welcome message
  appendBotMessage("👋 Hey! I'm **ORCAGENT**. I can help you browse markets, check prices, set alerts, and execute trades.\n\nType `help` to see all commands, or just tell me what you want to do.");

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    appendUserMessage(text);
    await handleCommand(text);
  });
}

async function handleCommand(text) {
  const cmd = agent.parse(text);
  showTypingIndicator();

  try {
    switch (cmd.type) {
      case "help":
        await delay(400);
        appendBotMessage(agent.helpText());
        break;

      case "markets":
        await delay(300);
        switchTab("markets");
        appendBotMessage(`📊 Showing **${filteredLaunches.length} markets**. I've switched you to the Markets tab!`);
        break;

      case "price": {
        const launch = findLaunch(cmd.symbol);
        if (!launch) { appendBotMessage(`❌ Couldn't find token **${cmd.symbol}**.`); break; }
        await delay(300);
        appendBotMessage(
          `**${launch.symbol}** (${launch.name})\n` +
          `💵 Price: ${agent.usd(launch.priceUsd)}\n` +
          `📈 24h: ${agent.pct(launch.change24h)}\n` +
          `💰 Market Cap: ${agent.usd(launch.marketCapUsd)}\n` +
          `📊 Volume 24h: ${agent.usd(launch.volume24hUsd)}\n` +
          `👥 Holders: ${launch.holderCount?.toLocaleString() || "—"}`
        );
        break;
      }

      case "info": {
        const launch = findLaunch(cmd.symbol);
        if (!launch) { appendBotMessage(`❌ Couldn't find **${cmd.symbol}**.`); break; }
        await delay(300);
        const pair = launch.pairType === "sol" ? "SOL" : "ORCA";
        appendBotMessage(
          `**${launch.symbol}** — ${launch.name}\n\n` +
          `💵 Price: ${agent.usd(launch.priceUsd)}\n` +
          `📈 24h Change: ${agent.pct(launch.change24h)}\n` +
          `💰 Market Cap: ${agent.usd(launch.marketCapUsd)}\n` +
          `📊 Volume 24h: ${agent.usd(launch.volume24hUsd)}\n` +
          `🏊 TVL: ${agent.usd(launch.tvlUsd)}\n` +
          `👥 Holders: ${launch.holderCount?.toLocaleString() || "—"}\n` +
          `🔄 Transactions: ${launch.txCount?.toLocaleString() || "—"}\n` +
          `💱 Pair: ${pair}\n` +
          `🔒 Liquidity: Permanently locked\n` +
          `🔗 [View on AQUA](https://aquafamily.fun/#/token/${launch.mint})\n` +
          `🔗 [Orca Pool](https://www.orca.so/pools/${launch.whirlpoolAddress})`
        );
        break;
      }

      case "top_movers": {
        const sorted = [...allLaunches].sort((a, b) => {
          return cmd.direction === "up"
            ? (b.change24h || 0) - (a.change24h || 0)
            : (a.change24h || 0) - (b.change24h || 0);
        });
        const top5 = sorted.slice(0, 5);
        const dir = cmd.direction === "up" ? "📈 Top Gainers" : "📉 Top Losers";
        const lines = top5.map((l, i) =>
          `${i + 1}. **${l.symbol}** — ${agent.pct(l.change24h)} | ${agent.usd(l.priceUsd)}`
        );
        appendBotMessage(`${dir} (24h)\n\n${lines.join("\n")}`);
        break;
      }

      case "top_volume": {
        const sorted = [...allLaunches].sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0));
        const top5 = sorted.slice(0, 5);
        const lines = top5.map((l, i) =>
          `${i + 1}. **${l.symbol}** — Vol: ${agent.usd(l.volume24hUsd)} | ${agent.usd(l.priceUsd)}`
        );
        appendBotMessage(`📊 Highest Volume (24h)\n\n${lines.join("\n")}`);
        break;
      }

      case "new_launches": {
        const sorted = [...allLaunches].sort((a, b) => b.launchedAt - a.launchedAt);
        const top5 = sorted.slice(0, 5);
        const lines = top5.map((l, i) => {
          const ago = timeAgo(l.launchedAt * 1000);
          return `${i + 1}. **${l.symbol}** (${l.name}) — ${ago} | MCap: ${agent.usd(l.marketCapUsd)}`;
        });
        appendBotMessage(`🆕 Newest Launches\n\n${lines.join("\n")}`);
        break;
      }

      case "buy": {
        const launch = findLaunch(cmd.symbol);
        if (!launch) { appendBotMessage(`❌ Couldn't find **${cmd.symbol}**.`); break; }
        if (!wallet.connected) {
          appendBotMessage(`🔐 Connect your wallet first! Click the **Connect Wallet** button in the top right.`);
          break;
        }
        appendBotMessage(`🛒 Opening trade for **${launch.symbol}**...`);
        await delay(300);
        openTradeModal(launch, "buy");
        // Pre-fill amount
        const amtInput = $("#modal-amount");
        if (amtInput && cmd.amount) amtInput.value = cmd.amount;
        break;
      }

      case "sell": {
        const launch = findLaunch(cmd.symbol);
        if (!launch) { appendBotMessage(`❌ Couldn't find **${cmd.symbol}**.`); break; }
        if (!wallet.connected) {
          appendBotMessage(`🔐 Connect your wallet first!`); break;
        }
        appendBotMessage(`💸 Opening sell for **${launch.symbol}**...`);
        await delay(300);
        openTradeModal(launch, "sell");
        break;
      }

      case "set_alert": {
        const parsed = alerts.parse(cmd.raw);
        if (!parsed) {
          appendBotMessage(`❌ Couldn't understand that alert. Try:\n\`set alert AQUA above 0.0005\`\n\`set alert ORCAT below 0.00001\``);
          break;
        }
        const a = alerts.add(parsed);
        appendBotMessage(`🔔 Alert set! I'll notify you when **${a.symbol}** goes ${a.condition} **${agent.usd(a.price)}**.\n\nCurrent price: ${agent.usd(priceCache[a.symbol] || null)}`);
        renderAlerts();
        break;
      }

      case "list_alerts": {
        const active = alerts.list.filter(a => !a.triggered);
        if (active.length === 0) {
          appendBotMessage("🔔 You have no active alerts. Try: `set alert AQUA above 0.0005`");
        } else {
          const lines = active.map((a, i) =>
            `${i + 1}. **${a.symbol}** ${a.condition} ${agent.usd(a.price)}`
          );
          appendBotMessage(`🔔 Your active alerts:\n\n${lines.join("\n")}`);
        }
        break;
      }

      case "remove_alert": {
        const active = alerts.list.filter(a => !a.triggered);
        const idx = parseInt(cmd.id) - 1;
        if (!isNaN(idx) && active[idx]) {
          alerts.remove(active[idx].id);
          appendBotMessage(`✅ Alert for **${active[idx].symbol}** removed.`);
          renderAlerts();
        } else {
          appendBotMessage(`Type \`show alerts\` to see your alerts, then \`remove alert 1\` (use the number).`);
        }
        break;
      }

      case "portfolio": {
        if (!wallet.connected) {
          appendBotMessage("🔐 Connect your wallet to see your portfolio.");
          break;
        }
        showTypingIndicator();
        try {
          await loadPortfolio();
          switchTab("portfolio");
          appendBotMessage("👛 Showing your token holdings in the Portfolio tab!");
        } catch (e) {
          appendBotMessage("❌ Failed to load portfolio: " + e.message);
        }
        break;
      }

      default:
        appendBotMessage(
          `🤔 I didn't quite get that. Here are some things I can do:\n\n` +
          `• \`price of AQUA\`\n• \`top movers\`\n• \`buy 0.1 SOL of AQUA\`\n• \`set alert AQUA above 0.0005\`\n• \`help\` for all commands`
        );
    }
  } catch (e) {
    appendBotMessage(`❌ Error: ${e.message}`);
  } finally {
    hideTypingIndicator();
  }
}

// ── Chat UI helpers ───────────────────────────────────────────────────────────
function appendUserMessage(text) {
  const feed = $("#chat-feed");
  if (!feed) return;
  const div = document.createElement("div");
  div.className = "chat-msg user";
  div.textContent = text;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function appendBotMessage(text) {
  const feed = $("#chat-feed");
  if (!feed) return;
  const div = document.createElement("div");
  div.className = "chat-msg bot";
  // Simple markdown-lite: bold, links
  div.innerHTML = renderMarkdown(text);
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function showTypingIndicator() {
  const feed = $("#chat-feed");
  if (!feed || feed.querySelector(".typing-indicator")) return;
  const div = document.createElement("div");
  div.className = "chat-msg bot typing-indicator";
  div.innerHTML = `<span></span><span></span><span></span>`;
  div.id = "typing-indicator";
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

function hideTypingIndicator() {
  document.getElementById("typing-indicator")?.remove();
}

function renderMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((.+?)\)/g, `<a href="$2" target="_blank">$1</a>`)
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

// ── Portfolio ─────────────────────────────────────────────────────────────────
async function loadPortfolio() {
  const el = $("#portfolio-content");
  if (!el) return;
  if (!wallet.connected) {
    el.innerHTML = `<div class="connect-prompt">Connect your wallet to see your holdings</div>`;
    return;
  }
  el.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Loading holdings...</p></div>`;
  const data = await api.holdings(wallet.publicKey);
  const holdings = data.holdings || [];
  if (holdings.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">👛</div><p>No token holdings found for this wallet.</p></div>`;
    return;
  }
  const totalUsd = holdings.reduce((s, h) => s + (h.valueUsd || 0), 0);
  el.innerHTML = `
    <div class="portfolio-header">
      <h3>Your Holdings</h3>
      <div class="portfolio-total">Total Value: <strong>${agent.usd(totalUsd)}</strong></div>
    </div>
    <div class="holdings-list">
      ${holdings.map(h => holdingRow(h)).join("")}
    </div>`;

  // Buy buttons on holdings
  el.querySelectorAll(".btn-buy-holding").forEach(btn => {
    btn.addEventListener("click", () => {
      const launch = allLaunches.find(l => l.id === btn.dataset.id);
      if (launch) openTradeModal(launch, "buy");
    });
  });
}

function holdingRow(h) {
  const l = h.launch;
  const bal = parseInt(h.balanceRaw) / Math.pow(10, l.tokenDecimals || 6);
  return `
    <div class="holding-row">
      <div class="holding-info">
        ${l.imageUrl ? `<img src="${l.imageUrl}" class="token-img-sm" onerror="this.style.display='none'">` : ""}
        <div>
          <div class="holding-symbol">${l.symbol}</div>
          <div class="holding-name">${l.name}</div>
        </div>
      </div>
      <div class="holding-amounts">
        <div class="holding-balance">${bal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${l.symbol}</div>
        <div class="holding-value">${agent.usd(h.valueUsd)}</div>
      </div>
      <button class="btn-buy-holding" data-id="${l.id}">Buy more</button>
    </div>`;
}

// ── Alerts UI ─────────────────────────────────────────────────────────────────
function setupAlertEvents() {
  // Listen for triggered alerts
  window.addEventListener("aqua:alert:triggered", e => {
    const { alert, currentPrice, msg } = e.detail;
    alerts.notify(alert, currentPrice);
    showToast(`🔔 Alert: ${msg}`);
    renderAlerts();
  });

  // Quick alert form in Alerts tab
  $("#alert-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const sym = $("#alert-symbol")?.value?.trim().toUpperCase();
    const cond = $("#alert-condition")?.value;
    const price = $("#alert-price")?.value?.trim();
    if (!sym || !cond || !price) return;
    alerts.add({ symbol: sym, condition: cond, price });
    renderAlerts();
    $("#alert-symbol").value = "";
    $("#alert-price").value = "";
    showToast(`🔔 Alert set for ${sym}`);
  });

  renderAlerts();
}

function renderAlerts() {
  const el = $("#alerts-list");
  if (!el) return;
  const all = alerts.list;
  if (all.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔔</div><p>No alerts yet. Set one below or ask the agent!</p></div>`;
    return;
  }
  el.innerHTML = all.map(a => `
    <div class="alert-row ${a.triggered ? "triggered" : ""}">
      <div class="alert-info">
        <span class="alert-symbol">${a.symbol}</span>
        <span class="alert-cond">${a.condition}</span>
        <span class="alert-price">${agent.usd(a.price)}</span>
        ${a.triggered ? `<span class="alert-badge triggered">✓ Triggered</span>` : ""}
      </div>
      <div class="alert-current">
        Current: ${agent.usd(priceCache[a.symbol] || null)}
      </div>
      <button class="btn-remove-alert" data-id="${a.id}">×</button>
    </div>`).join("");

  el.querySelectorAll(".btn-remove-alert").forEach(btn => {
    btn.addEventListener("click", () => {
      alerts.remove(btn.dataset.id);
      renderAlerts();
    });
  });
}

function checkAlerts() {
  alerts.check(priceCache, (alert, currentPrice) => {
    const msg = `${alert.symbol} is now ${agent.usd(currentPrice)} (target ${alert.condition} ${agent.usd(alert.price)})`;
    alerts.notify(alert, currentPrice);
    showToast(`🔔 ${msg}`);
    renderAlerts();
  });
}

// ── Wallet UI ─────────────────────────────────────────────────────────────────
function setupWalletButton() {
  const btn = $("#wallet-btn");
  if (!btn) return;

  wallet.on("connect", (pk) => {
    btn.textContent = `${pk.slice(0, 4)}...${pk.slice(-4)}`;
    btn.classList.add("connected");
    loadPortfolio();
    renderAlerts();
  });

  wallet.on("disconnect", () => {
    btn.textContent = "Connect Wallet";
    btn.classList.remove("connected");
    const el = $("#portfolio-content");
    if (el) el.innerHTML = `<div class="connect-prompt">Connect your wallet to see your holdings</div>`;
  });

  btn.addEventListener("click", async () => {
    if (wallet.connected) {
      await wallet.disconnect();
    } else {
      try {
        await wallet.connect();
      } catch (e) {
        showToast("❌ " + e.message);
      }
    }
  });
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function setupTabs() {
  const tabs = $$(".tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
    });
  });
}

function switchTab(name) {
  $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab-panel").forEach(p => p.classList.toggle("active", p.dataset.tab === name));
  if (name === "portfolio" && wallet.connected) loadPortfolio();
  if (name === "alerts") renderAlerts();
}

// ── Search + Sort ─────────────────────────────────────────────────────────────
function setupSearch() {
  const input = $("#search-input");
  if (!input) return;
  input.addEventListener("input", e => {
    searchQuery = e.target.value.trim();
    applyFiltersAndRender();
  });

  $$(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      applyFiltersAndRender();
    });
  });
}

function setupSort() {
  const sel = $("#sort-select");
  if (!sel) return;
  sel.addEventListener("change", e => {
    currentSort = e.target.value;
    applyFiltersAndRender();
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function findLaunch(symbol) {
  const s = symbol.toUpperCase();
  return allLaunches.find(l => l.symbol.toUpperCase() === s || l.name.toLowerCase() === s.toLowerCase());
}

function showToast(html, duration = 5000) {
  const container = $("#toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = html;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

function showError(msg) {
  const el = $("#app-error");
  if (el) { el.textContent = msg; el.style.display = "block"; }
}

function timeAgo(ms) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
