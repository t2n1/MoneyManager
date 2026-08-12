// TỆP SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
// Nguồn: src/features/assets/serverBundleFunds.ts (và mọi thứ nó import)
// Sinh lại: npm run bundle:rules
// Sửa tay ở đây sẽ bị lần chạy sau ghi đè, và tests/pushBundle.test.ts sẽ đỏ.

// src/features/assets/fundHoldings.ts
var NAV_UNITS = 1e4;
function thuTuTrongNgay(t) {
  return t.kind === "buy" ? 0 : t.kind === "adjust" ? 1 : 2;
}
function avgNavOf(costBasis, units) {
  return units > 0 ? Math.round(costBasis / units * NAV_UNITS) : 0;
}
function fundLineValue(units, nav) {
  return Math.round(units * nav / NAV_UNITS);
}
function fundHoldingsFromTrades(trades) {
  const acc = /* @__PURE__ */ new Map();
  const oversold = /* @__PURE__ */ new Set();
  let realizedPnl = 0;
  const inOrder = trades.slice().sort((a, b) => a.tradedOn.localeCompare(b.tradedOn) || thuTuTrongNgay(a) - thuTuTrongNgay(b));
  for (const t of inOrder) {
    const h = acc.get(t.assocFundCd) ?? { units: 0, costBasis: 0 };
    if (t.kind === "buy") {
      h.units += t.units;
      h.costBasis += t.amount;
    } else if (t.kind === "sell") {
      if (t.units > h.units) oversold.add(t.assocFundCd);
      const sold = Math.min(t.units, h.units);
      const thuVe = t.units > 0 ? t.amount * sold / t.units : 0;
      const von = h.units > 0 ? h.costBasis * sold / h.units : 0;
      realizedPnl += thuVe - von;
      h.units -= sold;
      h.costBasis -= von;
      if (h.units === 0) h.costBasis = 0;
    } else {
      h.units += t.units;
      if (h.units < 0) {
        oversold.add(t.assocFundCd);
        h.units = 0;
        h.costBasis = 0;
      }
    }
    acc.set(t.assocFundCd, h);
  }
  const holdings = [...acc.entries()].filter(([, h]) => h.units > 0).map(([assocFundCd, h]) => ({
    assocFundCd,
    units: h.units,
    costBasis: Math.round(h.costBasis),
    avgNav: avgNavOf(h.costBasis, h.units)
  })).sort((a, b) => b.costBasis - a.costBasis || a.assocFundCd.localeCompare(b.assocFundCd));
  return {
    holdings,
    realizedPnl: Math.round(realizedPnl),
    oversold: [...oversold].sort()
  };
}
function sessionNavs(rows) {
  const session = rows.map((r) => r.nav_date).sort().at(-1) ?? null;
  const navByFund = /* @__PURE__ */ new Map();
  const staleFunds = /* @__PURE__ */ new Set();
  for (const r of rows) {
    if (r.nav > 0) navByFund.set(r.assoc_fund_cd, r.nav);
    if (session !== null && r.nav_date < session) staleFunds.add(r.assoc_fund_cd);
  }
  return { session, navByFund, staleFunds };
}
function fundValue(holdings, navByFund) {
  let marketValue = 0;
  const missingNavs = [];
  for (const h of holdings) {
    const nav = navByFund.get(h.assocFundCd);
    if (nav == null || nav <= 0) {
      missingNavs.push(h.assocFundCd);
      marketValue += h.costBasis;
    } else {
      marketValue += fundLineValue(h.units, nav);
    }
  }
  const allMissing = holdings.length > 0 && missingNavs.length === holdings.length;
  return { marketValue: allMissing ? null : marketValue, missingNavs };
}

// src/lib/dates.ts
var pad = (n) => String(n).padStart(2, "0");
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export {
  NAV_UNITS,
  fundHoldingsFromTrades,
  fundValue,
  sessionNavs,
  toISODate
};
