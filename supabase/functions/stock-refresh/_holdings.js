// TỆP SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
// Nguồn: src/features/assets/serverBundle.ts (và mọi thứ nó import)
// Sinh lại: npm run bundle:rules
// Sửa tay ở đây sẽ bị lần chạy sau ghi đè, và tests/pushBundle.test.ts sẽ đỏ.

// src/features/assets/holdings.ts
function holdingsFromTrades(trades) {
  const acc = /* @__PURE__ */ new Map();
  const oversold = /* @__PURE__ */ new Set();
  let realizedPnl = 0;
  const inOrder = trades.slice().sort((a, b) => a.tradedOn.localeCompare(b.tradedOn));
  for (const t of inOrder) {
    const h = acc.get(t.symbol) ?? { quantity: 0, costBasis: 0 };
    if (t.kind === "buy") {
      h.quantity += t.quantity;
      h.costBasis += t.quantity * t.price + t.fee;
    } else if (t.kind === "sell") {
      const avg = h.quantity > 0 ? h.costBasis / h.quantity : 0;
      if (t.quantity > h.quantity) oversold.add(t.symbol);
      const sold = Math.min(t.quantity, h.quantity);
      realizedPnl += sold * t.price - t.fee - t.tax - sold * avg;
      h.quantity -= sold;
      h.costBasis -= sold * avg;
      if (h.quantity === 0) h.costBasis = 0;
    } else {
      h.quantity += t.quantity;
      if (h.quantity < 0) {
        oversold.add(t.symbol);
        h.quantity = 0;
        h.costBasis = 0;
      }
    }
    acc.set(t.symbol, h);
  }
  const holdings = [...acc.entries()].filter(([, h]) => h.quantity > 0).map(([symbol, h]) => ({
    symbol,
    quantity: h.quantity,
    costBasis: Math.round(h.costBasis),
    avgCost: Math.round(h.costBasis / h.quantity)
  })).sort((a, b) => b.costBasis - a.costBasis || a.symbol.localeCompare(b.symbol));
  return {
    holdings,
    realizedPnl: Math.round(realizedPnl),
    oversold: [...oversold].sort()
  };
}
function brokerCash(accountBalance, trades) {
  let spent = 0;
  for (const t of trades) {
    if (t.kind === "buy") spent += t.quantity * t.price + t.fee;
    else if (t.kind === "sell") spent -= t.quantity * t.price - t.fee - t.tax;
  }
  return Math.round(accountBalance - spent);
}
function sessionPrices(rows) {
  const session = rows.map((r) => r.trading_date).sort().at(-1) ?? null;
  const priceBySymbol = /* @__PURE__ */ new Map();
  const staleSymbols = /* @__PURE__ */ new Set();
  for (const r of rows) {
    if (r.price > 0) priceBySymbol.set(r.symbol, r.price);
    if (session !== null && r.trading_date < session) staleSymbols.add(r.symbol);
  }
  return { session, priceBySymbol, staleSymbols };
}
function portfolioValue(holdings, priceBySymbol, cash) {
  let stockValue = 0;
  const missingPrices = [];
  for (const h of holdings) {
    const price = priceBySymbol.get(h.symbol);
    if (price == null || price <= 0) {
      missingPrices.push(h.symbol);
      stockValue += h.costBasis;
    } else {
      stockValue += h.quantity * price;
    }
  }
  const allMissing = holdings.length > 0 && missingPrices.length === holdings.length;
  const marketValue = cash < 0 || allMissing ? null : stockValue + cash;
  return { marketValue, stockValue, cash, missingPrices };
}

// src/lib/dates.ts
var pad = (n) => String(n).padStart(2, "0");
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export {
  brokerCash,
  holdingsFromTrades,
  portfolioValue,
  sessionPrices,
  toISODate
};
