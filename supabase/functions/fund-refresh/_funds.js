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
function sessionNavs(rows, heldFundCds) {
  const dangGiu = new Set(heldFundCds);
  const cuaQuyDangGiu = rows.filter((r) => dangGiu.has(r.assoc_fund_cd));
  const nguonNgay = cuaQuyDangGiu.length > 0 ? cuaQuyDangGiu : rows;
  const session = nguonNgay.map((r) => r.nav_date).sort().at(-1) ?? null;
  const navByFund = /* @__PURE__ */ new Map();
  for (const r of rows) if (r.nav > 0) navByFund.set(r.assoc_fund_cd, r.nav);
  const staleFunds = /* @__PURE__ */ new Set();
  for (const r of cuaQuyDangGiu) {
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
function planFundBackfill(account, navHistory, alreadyValued, maxDays) {
  if (account.coCaSoLenhCoPhieu) return { ok: false, reason: "tron-hai-loai-so-lenh", funds: [] };
  const { oversold } = fundHoldingsFromTrades(account.trades);
  if (oversold.length > 0) return { ok: false, reason: "so-lenh-co-lo-hong", funds: oversold };
  const lenhDauTien = account.trades.map((t) => t.tradedOn).sort()[0];
  if (lenhDauTien == null) return { ok: true, days: [], skipped: [] };
  const moiNgay = /* @__PURE__ */ new Set();
  for (const theoNgay2 of navHistory.values())
    for (const ngay of theoNgay2.keys()) if (ngay >= lenhDauTien) moiNgay.add(ngay);
  const cacNgay = [...moiNgay].sort().filter((ngay) => !alreadyValued.has(ngay)).slice(0, maxDays);
  const theoNgay = [];
  for (const ngay of cacNgay) {
    const { holdings } = fundHoldingsFromTrades(
      account.trades.filter((t) => t.tradedOn <= ngay)
    );
    if (holdings.length > 0) theoNgay.push({ valuedOn: ngay, holdings });
  }
  const thieuLichSu = [
    ...new Set(theoNgay.flatMap((x) => x.holdings.map((h) => h.assocFundCd)))
  ].filter((ma) => (navHistory.get(ma)?.size ?? 0) === 0).sort();
  if (thieuLichSu.length > 0)
    return { ok: false, reason: "thieu-lich-su-gia", funds: thieuLichSu };
  const days = [];
  const skipped = [];
  for (const { valuedOn, holdings } of theoNgay) {
    const navNgayDo = /* @__PURE__ */ new Map();
    for (const h of holdings) {
      const nav = navHistory.get(h.assocFundCd)?.get(valuedOn);
      if (nav != null) navNgayDo.set(h.assocFundCd, nav);
    }
    const { marketValue, missingNavs } = fundValue(holdings, navNgayDo);
    if (missingNavs.length > 0 || marketValue === null) {
      skipped.push(valuedOn);
      continue;
    }
    days.push({ valuedOn, marketValue });
  }
  return { ok: true, days, skipped };
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
  planFundBackfill,
  sessionNavs,
  toISODate
};
