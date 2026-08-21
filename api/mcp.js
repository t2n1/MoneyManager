// TỆP SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
// Nguồn: api/_handler.ts (và mọi thứ nó import trong src/)
// Sinh lại: npm run bundle:mcp
// Sửa tay ở đây sẽ bị lần chạy sau ghi đè, và tests/mcpBundle.test.ts sẽ đỏ.

// api/_handler.ts
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { z } from "zod";

// src/mcp/env.ts
import { createClient } from "@supabase/supabase-js";
var TOKEN_TOI_THIEU = 32;
function docCauhinh(env) {
  const doc = (ten) => {
    const v = (env[ten] ?? "").trim();
    if (v === "") {
      throw new Error(
        `Thi\u1EBFu bi\u1EBFn m\xF4i tr\u01B0\u1EDDng ${ten}. \u0110\u1EB7t n\xF3 trong Vercel (Settings \u2192 Environment Variables) r\u1ED3i deploy l\u1EA1i.`
      );
    }
    return v;
  };
  const token = doc("MCP_BEARER_TOKEN");
  if (token.length < TOKEN_TOI_THIEU) {
    throw new Error(
      `MCP_BEARER_TOKEN ph\u1EA3i d\xE0i \xEDt nh\u1EA5t ${TOKEN_TOI_THIEU} k\xFD t\u1EF1 \u2014 n\xF3 l\xE0 h\xE0ng r\xE0o duy nh\u1EA5t c\u1EE7a server n\xE0y. Sinh b\u1EB1ng: openssl rand -hex 32`
    );
  }
  return {
    supabaseUrl: doc("SUPABASE_URL"),
    serviceRoleKey: doc("SUPABASE_SERVICE_ROLE_KEY"),
    userId: doc("SO_GAO_USER_ID"),
    token
  };
}
function taoClient(c) {
  return createClient(c.supabaseUrl, c.serviceRoleKey, {
    auth: { persistSession: false }
  });
}

// src/data/paging.ts
var PAGE_SIZE = 1e3;
var DEFAULT_MAX_PAGES = 200;
async function fetchAllPages(page, opts = {}) {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const out = [];
  for (let i = 0; i < maxPages; i++) {
    const from = i * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
  throw new Error(
    `\u0110\u1ECDc d\u1EEF li\u1EC7u v\u01B0\u1EE3t qu\xE1 nhi\u1EC1u trang (> ${maxPages * PAGE_SIZE} d\xF2ng) \u2014 d\u1EEBng \u0111\u1EC3 kh\xF4ng l\u1EB7p v\xF4 h\u1EA1n.`
  );
}

// src/mcp/load.ts
async function napDuLieu(sb, userId) {
  const bat = sb;
  const doc = (bang, sapTheo) => fetchAllPages(async (from, to) => {
    const { data, error } = await bat.from(bang).select("*").eq("user_id", userId).order(sapTheo, { ascending: true }).range(from, to);
    return { data, error };
  });
  const [profile, txs, accounts, categories, tags, txTags, budgets, fx] = await Promise.all([
    sb.from("profiles").select("*").eq("user_id", userId).single(),
    doc("transactions", "id"),
    doc("accounts", "id"),
    doc("categories", "id"),
    doc("tags", "id"),
    doc("transaction_tags", "transaction_id"),
    doc("budgets", "id"),
    doc("fx_history", "on_date")
  ]);
  if (profile.error) {
    throw new Error(`\u0110\u1ECDc b\u1EA3ng profiles l\u1ED7i: ${profile.error.message}`);
  }
  if (profile.data === null) {
    throw new Error(`Kh\xF4ng c\xF3 d\xF2ng profiles cho user ${userId} \u2014 ki\u1EC3m l\u1EA1i SO_GAO_USER_ID.`);
  }
  return {
    txs,
    accounts,
    categories,
    tags,
    txTags,
    budgets,
    fx,
    base: profile.data.base_currency,
    monthStartDay: profile.data.month_start_day,
    tz: profile.data.push_tz
  };
}

// src/lib/jpHolidays.ts
function addDaysISO(isoDate, delta) {
  const d = /* @__PURE__ */ new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
var pad = (n) => String(n).padStart(2, "0");
var iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
var dow = (isoDate) => (/* @__PURE__ */ new Date(isoDate + "T00:00:00Z")).getUTCDay();
function nthMonday(year, month, nth) {
  const firstDow = dow(iso(year, month, 1));
  const first = 1 + (8 - firstDow) % 7;
  return first + (nth - 1) * 7;
}
function equinoxDay(year, base) {
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
function baseHolidays(year) {
  return [
    iso(year, 1, 1),
    // 元日
    iso(year, 1, nthMonday(year, 1, 2)),
    // 成人の日
    iso(year, 2, 11),
    // 建国記念の日
    iso(year, 2, 23),
    // 天皇誕生日
    iso(year, 3, equinoxDay(year, 20.8431)),
    // 春分の日
    iso(year, 4, 29),
    // 昭和の日
    iso(year, 5, 3),
    // 憲法記念日
    iso(year, 5, 4),
    // みどりの日
    iso(year, 5, 5),
    // こどもの日
    iso(year, 7, nthMonday(year, 7, 3)),
    // 海の日
    iso(year, 8, 11),
    // 山の日
    iso(year, 9, nthMonday(year, 9, 3)),
    // 敬老の日
    iso(year, 9, equinoxDay(year, 23.2488)),
    // 秋分の日
    iso(year, 10, nthMonday(year, 10, 2)),
    // スポーツの日
    iso(year, 11, 3),
    // 文化の日
    iso(year, 11, 23)
    // 勤労感謝の日
  ];
}
var cache = /* @__PURE__ */ new Map();
function holidaysOf(year) {
  const cached = cache.get(year);
  if (cached) return cached;
  const set = new Set(baseHolidays(year));
  for (const day of [...set].sort()) {
    if (dow(day) !== 0) continue;
    let d = addDaysISO(day, 1);
    while (set.has(d)) d = addDaysISO(d, 1);
    set.add(d);
  }
  for (const day of [...set]) {
    const gap = addDaysISO(day, 1);
    if (set.has(gap) || dow(gap) === 0) continue;
    if (set.has(addDaysISO(gap, 1))) set.add(gap);
  }
  cache.set(year, set);
  return set;
}
function isJapaneseHoliday(isoDate) {
  return holidaysOf(Number(isoDate.slice(0, 4))).has(isoDate);
}

// src/lib/dates.ts
var pad2 = (n) => String(n).padStart(2, "0");
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function getMonthRange(key, monthStartDay = 1) {
  const start = new Date(key.year, key.month - 1, monthStartDay);
  const end = new Date(key.year, key.month, monthStartDay);
  return { start: toISODate(start), end: toISODate(end) };
}
function monthKeyForDate(dateISO, monthStartDay = 1) {
  const [year, month, day] = dateISO.split("-").map(Number);
  if (day >= monthStartDay) return { year, month };
  return addMonths({ year, month }, -1);
}
function addMonths(key, delta) {
  const d = new Date(key.year, key.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
function monthKeyString(key) {
  return `${key.year}-${pad2(key.month)}`;
}
function addDaysISO2(iso2, delta) {
  const d = /* @__PURE__ */ new Date(iso2 + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// src/features/categories/kind.ts
var NO_TRANSFER_CATEGORIES = /* @__PURE__ */ new Set();
function transferCategoryIds(categories) {
  const out = /* @__PURE__ */ new Set();
  for (const c of categories) if (c.kind === "transfer") out.add(c.id);
  return out.size === 0 ? NO_TRANSFER_CATEGORIES : out;
}

// src/mcp/basket.ts
function docThang(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Th\xE1ng ph\u1EA3i vi\u1EBFt d\u1EA1ng YYYY-MM (v\xED d\u1EE5 2026-07), nh\u1EADn \u0111\u01B0\u1EE3c "${s}".`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Th\xE1ng ph\u1EA3i t\u1EEB 01 t\u1EDBi 12, nh\u1EADn \u0111\u01B0\u1EE3c "${s}".`);
  return { year, month };
}
function khoangNgay(khoang, monthStartDay) {
  if (khoang.tu_thang !== void 0) {
    const tuKey = docThang(khoang.tu_thang);
    const denKey = docThang(khoang.den_thang ?? khoang.tu_thang);
    return {
      tu: getMonthRange(tuKey, monthStartDay).start,
      // `end` của getMonthRange đã là mốc MỞ của chính tháng đó, nên tháng cuối lấy `end`.
      den: getMonthRange(denKey, monthStartDay).end
    };
  }
  if (khoang.tu_ngay !== void 0) {
    const den = khoang.den_ngay ?? khoang.tu_ngay;
    return { tu: khoang.tu_ngay, den: addDaysISO2(den, 1) };
  }
  throw new Error(
    "Ph\u1EA3i cho m\u1ED9t kho\u1EA3ng: tu_thang (+ den_thang), ho\u1EB7c tu_ngay (+ den_ngay). Kh\xF4ng c\xF3 kho\u1EA3ng th\xEC tool s\u1EBD \u0111\u1ECDc c\u1EA3 s\u1ED5, v\xE0 \u0111\xF3 g\u1EA7n nh\u01B0 lu\xF4n l\xE0 c\xE2u h\u1ECFi sai."
  );
}
function ratesMoiNhat(fx, base) {
  let moi = null;
  for (const r of fx) {
    if (r.base !== base) continue;
    if (moi === null || r.on_date > moi.on_date) moi = r;
  }
  return moi === null ? {} : moi.rates;
}
function dungRo(du, khoang) {
  const { tu, den } = khoangNgay(khoang, du.monthStartDay);
  const txs = du.txs.filter(
    (t) => t.occurred_on >= tu && t.occurred_on < den && !t.is_debt_flow && !t.exclude_from_stats
  );
  return {
    txs,
    rates: ratesMoiNhat(du.fx, du.base),
    // Dùng lại features/categories/kind.ts: tập danh mục chuyển tài sản chỉ được suy ở MỘT
    // chỗ trong cả repo, không thì hai bên ra hai con số (chính lý do cột `kind` có mặt).
    transferIds: transferCategoryIds(du.categories),
    phamVi: {
      tu_ngay: tu,
      den_ngay: den,
      so_dong_vao_ro: txs.length,
      loc_da_ap: ["b\u1ECF d\xF2ng ti\u1EC1n n\u1EE3/cho vay", "b\u1ECF kho\u1EA3n \u0111\xE3 \u0111\xE1nh d\u1EA5u lo\u1EA1i kh\u1ECFi th\u1ED1ng k\xEA"]
    }
  };
}
function thangCuaNgay(iso2, monthStartDay) {
  return monthKeyString(monthKeyForDate(iso2, monthStartDay));
}

// src/lib/currencies.ts
var CURRENCIES = {
  JPY: { symbol: "\xA5", decimals: 0, label: "Y\xEAn Nh\u1EADt", position: "prefix", group: ",", decimal: "." },
  VND: { symbol: "\u20AB", decimals: 0, label: "\u0110\u1ED3ng Vi\u1EC7t Nam", position: "suffix", group: ".", decimal: "," },
  // USD theo chuẩn Mỹ ($2,000.00), đổi 2026-08-11. Trước đây là group '.' / decimal ','
  // kiểu Việt ($2.000,00) — mà màn Tài khoản hiện "¥1,187,910 · $2.000,00" cạnh nhau,
  // tức dấu ',' vừa là hàng nghìn (JPY) vừa là thập phân (USD) trong CÙNG một danh sách:
  // $2.000,00 rất dễ đọc thành hai nghìn hoặc hai triệu. Việc đổi này chỉ ảnh hưởng
  // HIỂN THỊ — parseAmountToMinor (nhập CSV) đoán dấu thập phân bằng heuristic "dấu cuối
  // theo sau 1–2 chữ số" nên đọc được cả hai kiểu, còn parseMoney chỉ giữ chữ số.
  USD: { symbol: "$", decimals: 2, label: "\u0110\xF4 la M\u1EF9", position: "prefix", group: ",", decimal: "." }
};
var groupThousands = (digits, sep) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

// src/mcp/format.ts
function tien(minor, don_vi) {
  const { symbol, decimals, position, group, decimal } = CURRENCIES[don_vi];
  const sign = minor < 0 ? "-" : "";
  const abs = Math.trunc(Math.abs(minor)).toString().padStart(decimals + 1, "0");
  const intPart = decimals > 0 ? abs.slice(0, -decimals) : abs;
  const fracPart = decimals > 0 ? `${decimal}${abs.slice(-decimals)}` : "";
  const body = `${groupThousands(intPart, group)}${fracPart}`;
  const hien = position === "prefix" ? `${sign}${symbol}${body}` : `${sign}${body} ${symbol}`;
  return { don_vi, so: minor, hien };
}

// src/lib/rates.ts
function convertToBase(minor, from, base, rates) {
  if (from === base) return minor;
  const rate = rates[from];
  if (!rate) return null;
  const fromMajor = minor / 10 ** CURRENCIES[from].decimals;
  const baseMajor = fromMajor / rate;
  return Math.round(baseMajor * 10 ** CURRENCIES[base].decimals);
}

// src/features/reports/aggregate.ts
var isTransfer = (t, ids) => t.category_id !== null && ids.has(t.category_id);
var expenseSign = (t) => t.is_refund ? -1 : 1;
function sumIncomeExpense(txs, currencyOf, base, rates, transferIds = NO_TRANSFER_CATEGORIES) {
  let income = 0;
  let expense = 0;
  let transfer = 0;
  let hasForeign = false;
  let hasMissingRate = false;
  for (const t of txs) {
    if (t.type === "transfer" || t.is_debt_flow || t.exclude_from_stats) continue;
    const cur = currencyOf(t.account_id);
    if (cur !== base) hasForeign = true;
    const v = convertToBase(t.amount, cur, base, rates);
    if (v === null) {
      hasMissingRate = true;
      continue;
    }
    if (t.type === "income") income += v;
    else if (isTransfer(t, transferIds)) transfer += v * expenseSign(t);
    else expense += v * expenseSign(t);
  }
  return { income, expense, transfer, hasForeign, hasMissingRate };
}

// src/mcp/tools/truyVan.ts
var KHUNG_GIO = [
  [6, "\u0111\xEAm 0\u20135"],
  [12, "s\xE1ng 6\u201311"],
  [18, "chi\u1EC1u 12\u201317"],
  [24, "t\u1ED1i 18\u201323"]
];
var THU = ["Ch\u1EE7 Nh\u1EADt", "Th\u1EE9 Hai", "Th\u1EE9 Ba", "Th\u1EE9 T\u01B0", "Th\u1EE9 N\u0103m", "Th\u1EE9 S\xE1u", "Th\u1EE9 B\u1EA3y"];
function tuanISO(iso2) {
  const [y, m, d] = iso2.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - (dt.getUTCDay() + 6) % 7 + 3);
  const namISO = dt.getUTCFullYear();
  const moc = new Date(Date.UTC(namISO, 0, 4));
  moc.setUTCDate(moc.getUTCDate() - (moc.getUTCDay() + 6) % 7 + 3);
  const tuan = 1 + Math.round((dt.getTime() - moc.getTime()) / (7 * 864e5));
  return `${namISO}-W${String(tuan).padStart(2, "0")}`;
}
var NGUONG_CO = {
  JPY: [1e3, 5e3, 2e4, 1e5],
  VND: [1e5, 5e5, 2e6, 1e7],
  USD: [1e3, 5e3, 2e4, 1e5]
};
function gioTai(isoUtc, tz) {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false
  }).format(new Date(isoUtc));
  return Number(s) % 24;
}
function ngayTai(isoUtc, tz) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(isoUtc));
}
function soNgayGiua(tuISO, denISO) {
  const [y1, m1, d1] = tuISO.split("-").map(Number);
  const [y2, m2, d2] = denISO.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 864e5);
}
function coKhoan(minor, don_vi) {
  const n = NGUONG_CO[don_vi];
  const abs = Math.abs(minor);
  if (abs < n[0]) return "r\u1EA5t nh\u1ECF";
  if (abs < n[1]) return "nh\u1ECF";
  if (abs < n[2]) return "v\u1EEBa";
  if (abs < n[3]) return "to";
  return "r\u1EA5t to";
}
function truyVan(input, du) {
  if (input.xe_theo.length > 2) {
    throw new Error(
      "X\u1EBB t\u1ED1i \u0111a 2 chi\u1EC1u m\u1ED9t l\u1EA7n. Ba chi\u1EC1u tr\u1EDF l\xEAn th\xEC b\u1EA3ng n\u1EDF ra h\xE0ng tr\u0103m d\xF2ng, kh\xF3 \u0111\u1ECDc v\xE0 t\u1ED1n token \u2014 h\xE3y l\u1ECDc b\u1EDBt r\u1ED3i x\u1EBB l\u1EA1i."
    );
  }
  const ro = dungRo(du, input.khoang);
  const loai = input.loai ?? "chi";
  const ghi_chu = [];
  const tenTaiKhoan = new Map(du.accounts.map((a) => [a.id, a.name]));
  const tienTeCua = new Map(du.accounts.map((a) => [a.id, a.currency]));
  const danhMuc = new Map(du.categories.map((c) => [c.id, c]));
  const tenNhan = new Map(du.tags.map((t) => [t.id, t.name]));
  const nhanCuaTx = /* @__PURE__ */ new Map();
  for (const tt of du.txTags) {
    const ten = tenNhan.get(tt.tag_id);
    if (ten === void 0) continue;
    const cu = nhanCuaTx.get(tt.transaction_id);
    if (cu) cu.push(ten);
    else nhanCuaTx.set(tt.transaction_id, [ten]);
  }
  function idTheoTen(ten, nguon, nhan) {
    const theoTen = new Map(nguon.map((x) => [x.name.toLowerCase(), x.id]));
    const out = /* @__PURE__ */ new Set();
    for (const t of ten) {
      const id = theoTen.get(t.trim().toLowerCase());
      if (id === void 0) {
        throw new Error(
          `Kh\xF4ng c\xF3 ${nhan} t\xEAn "${t}". T\xEAn c\xF3 th\u1EADt: ${nguon.map((x) => x.name).join(", ")}`
        );
      }
      out.add(id);
    }
    return out;
  }
  const locDanhMuc = input.loc?.danh_muc ? idTheoTen(input.loc.danh_muc, du.categories, "danh m\u1EE5c") : null;
  const locTaiKhoan = input.loc?.tai_khoan ? idTheoTen(input.loc.tai_khoan, du.accounts, "t\xE0i kho\u1EA3n") : null;
  const locNhan = input.loc?.nhan ? idTheoTen(input.loc.nhan, du.tags, "nh\xE3n") : null;
  const nhanIdCuaTx = /* @__PURE__ */ new Map();
  if (locNhan) {
    for (const tt of du.txTags) {
      const cu = nhanIdCuaTx.get(tt.transaction_id);
      if (cu) cu.add(tt.tag_id);
      else nhanIdCuaTx.set(tt.transaction_id, /* @__PURE__ */ new Set([tt.tag_id]));
    }
  }
  const danhMucChuyen = (t) => t.category_id !== null && ro.transferIds.has(t.category_id);
  function dungLoai(t) {
    if (t.type === "transfer") return false;
    if (loai === "thu") return t.type === "income";
    if (loai === "chuyen") return t.type === "expense" && danhMucChuyen(t);
    return t.type === "expense" && !danhMucChuyen(t);
  }
  function quaLoc(t) {
    if (locDanhMuc && (t.category_id === null || !locDanhMuc.has(t.category_id))) return false;
    if (locTaiKhoan && !locTaiKhoan.has(t.account_id)) return false;
    if (locNhan) {
      const cua = nhanIdCuaTx.get(t.id);
      if (!cua || ![...locNhan].some((x) => cua.has(x))) return false;
    }
    if (input.loc?.tien_te) {
      const cur = tienTeCua.get(t.account_id);
      if (cur === void 0 || !input.loc.tien_te.includes(cur)) return false;
    }
    if (input.loc?.la_gui_tien !== void 0) {
      if ((t.is_remittance ?? false) !== input.loc.la_gui_tien) return false;
    }
    if (input.loc?.need_level || input.loc?.cost_type) {
      const cat = t.category_id === null ? void 0 : danhMuc.get(t.category_id);
      if (input.loc.need_level && !input.loc.need_level.includes(cat?.need_level ?? "")) return false;
      if (input.loc.cost_type && !input.loc.cost_type.includes(cat?.cost_type ?? "")) return false;
    }
    return true;
  }
  function khoaCua(t, chieu) {
    const cat = t.category_id === null ? void 0 : danhMuc.get(t.category_id);
    switch (chieu) {
      case "danh_muc":
        return [cat?.name ?? "(kh\xF4ng danh m\u1EE5c)"];
      case "danh_muc_cha": {
        if (cat === void 0) return ["(kh\xF4ng danh m\u1EE5c)"];
        const cha = cat.parent_id === null ? cat : danhMuc.get(cat.parent_id);
        return [cha?.name ?? cat.name];
      }
      case "nhan": {
        const ten = nhanCuaTx.get(t.id);
        return ten === void 0 || ten.length === 0 ? ["(kh\xF4ng nh\xE3n)"] : ten;
      }
      case "tai_khoan":
        return [tenTaiKhoan.get(t.account_id) ?? "(t\xE0i kho\u1EA3n \u0111\xE3 xo\xE1)"];
      case "thang":
        return [thangCuaNgay(t.occurred_on, du.monthStartDay)];
      case "tuan":
        return [tuanISO(t.occurred_on)];
      case "thu_trong_tuan": {
        const [y, m, d] = t.occurred_on.split("-").map(Number);
        return [THU[new Date(y, m - 1, d).getDay()]];
      }
      case "gio_nhap": {
        const h = gioTai(t.created_at, du.tz);
        return [KHUNG_GIO.find(([tran]) => h < tran)?.[1] ?? "t\u1ED1i 18\u201323"];
      }
      case "ngay_le_nhat": {
        if (isJapaneseHoliday(t.occurred_on)) return ["ng\xE0y l\u1EC5"];
        const [y, m, d] = t.occurred_on.split("-").map(Number);
        const wd = new Date(y, m - 1, d).getDay();
        return [wd === 0 || wd === 6 ? "cu\u1ED1i tu\u1EA7n" : "ng\xE0y th\u01B0\u1EDDng"];
      }
      case "co_khoan":
        return [coKhoan(t.amount, tienTeCua.get(t.account_id) ?? du.base)];
      case "need_level":
        return [cat?.need_level ?? "(ch\u01B0a ph\xE2n lo\u1EA1i)"];
      case "cost_type":
        return [cat?.cost_type ?? "(ch\u01B0a ph\xE2n lo\u1EA1i)"];
      case "la_gui_tien":
        return [t.is_remittance ? "g\u1EEDi ti\u1EC1n v\u1EC1 VN" : "kh\xF4ng"];
    }
  }
  const nhom = /* @__PURE__ */ new Map();
  let thieu_ty_gia = false;
  let so_khoan_bi_loai = 0;
  let nhieuNhan = false;
  for (const t of ro.txs) {
    if (!dungLoai(t) || !quaLoc(t)) continue;
    const cur = tienTeCua.get(t.account_id);
    if (cur === void 0) {
      so_khoan_bi_loai += 1;
      thieu_ty_gia = true;
      continue;
    }
    const v = convertToBase(t.amount, cur, du.base, ro.rates);
    if (v === null) {
      so_khoan_bi_loai += 1;
      thieu_ty_gia = true;
      continue;
    }
    const giaTri = loai === "thu" ? v : v * expenseSign(t);
    const tre = soNgayGiua(t.occurred_on, ngayTai(t.created_at, du.tz));
    const phan = input.xe_theo.map((c) => khoaCua(t, c));
    if (phan.some((p) => p.length > 1)) nhieuNhan = true;
    const toHop = phan.length === 0 ? [[]] : phan.reduce(
      (acc, p) => acc.flatMap((dau) => p.map((x) => [...dau, x])),
      [[]]
    );
    for (const khoa of toHop) {
      const k = khoa.join(" ");
      const cu = nhom.get(k);
      const g = cu?.g ?? { tong: 0, soLan: 0, lonNhat: 0, treNgay: 0 };
      g.tong += giaTri;
      g.soLan += 1;
      g.lonNhat = Math.max(g.lonNhat, Math.abs(giaTri));
      g.treNgay += tre;
      if (cu === void 0) nhom.set(k, { khoa, g });
    }
  }
  if (nhieuNhan) {
    ghi_chu.push(
      "M\u1ED9t giao d\u1ECBch c\xF3 th\u1EC3 mang nhi\u1EC1u nh\xE3n n\xEAn n\xF3 \u0111\u01B0\u1EE3c t\xEDnh v\xE0o nhi\u1EC1u d\xF2ng \u2014 t\u1ED5ng c\xE1c d\xF2ng c\xF3 th\u1EC3 L\u1EDAN H\u01A0N t\u1ED5ng th\u1EADt."
    );
  }
  if (loai === "chuyen") {
    ghi_chu.push(
      "Ch\u1EC9 t\xEDnh kho\u1EA3n CHI thu\u1ED9c danh m\u1EE5c chuy\u1EC3n t\xE0i s\u1EA3n (v\xED d\u1EE5 g\u1EEDi ti\u1EC1n v\u1EC1 VN). Kho\u1EA3n chuy\u1EC3n gi\u1EEFa hai t\xE0i kho\u1EA3n c\u1EE7a ch\xEDnh m\xECnh KH\xD4NG \u0111\u01B0\u1EE3c t\xEDnh \u2014 ti\u1EC1n kh\xF4ng r\u1EDDi tay, v\xE0 tab B\xE1o c\xE1o c\u1EE7a app c\u0169ng kh\xF4ng t\xEDnh ch\xFAng."
    );
  }
  if (thieu_ty_gia) {
    ghi_chu.push(
      `Thi\u1EBFu t\u1EF7 gi\xE1 cho ${so_khoan_bi_loai} kho\u1EA3n; ch\xFAng b\u1ECB lo\u1EA1i kh\u1ECFi t\u1ED5ng (kh\xF4ng quy 1:1), n\xEAn con s\u1ED1 d\u01B0\u1EDBi \u0111\xE2y l\xE0 CH\u01AFA \u0110\u1EE6.`
    );
  }
  let dong = [...nhom.values()].map(({ khoa, g }) => {
    switch (input.do_luong) {
      case "so_lan":
        return { khoa, so: g.soLan, so_lan: g.soLan };
      case "do_tre_ghi":
        return { khoa, so: Math.round(g.treNgay / g.soLan), so_lan: g.soLan };
      case "trung_binh_moi_lan":
        return { khoa, tien: tien(Math.round(g.tong / g.soLan), du.base), so_lan: g.soLan };
      case "lon_nhat":
        return { khoa, tien: tien(g.lonNhat, du.base), so_lan: g.soLan };
      case "tong_tien":
        return { khoa, tien: tien(g.tong, du.base), so_lan: g.soLan };
    }
  });
  const giaTriSap = (d) => d.tien?.so ?? d.so ?? 0;
  const sap = input.sap_xep ?? "giam";
  dong.sort(
    (a, b) => sap === "ten" ? a.khoa.join(" ").localeCompare(b.khoa.join(" "), "vi") : sap === "tang" ? giaTriSap(a) - giaTriSap(b) : giaTriSap(b) - giaTriSap(a)
  );
  dong = dong.slice(0, input.gioi_han ?? 20);
  if (dong.length === 0) {
    ghi_chu.push(
      `Ch\u01B0a c\xF3 giao d\u1ECBch n\xE0o kh\u1EDBp trong kho\u1EA3ng ${ro.phamVi.tu_ngay} \u2192 ${ro.phamVi.den_ngay} (m\u1ED1c cu\u1ED1i kh\xF4ng t\xEDnh). \u0110\xE2y l\xE0 "kh\xF4ng c\xF3 d\u1EEF li\u1EC7u", KH\xD4NG ph\u1EA3i "ti\xEAu 0 \u0111\u1ED3ng".`
    );
  }
  const loc_da_ap = [
    ...ro.phamVi.loc_da_ap,
    loai === "chi" ? "ch\u1EC9 t\xEDnh kho\u1EA3n CHI" : loai === "thu" ? "ch\u1EC9 t\xEDnh kho\u1EA3n THU" : "ch\u1EC9 t\xEDnh kho\u1EA3n CHUY\u1EC2N T\xC0I S\u1EA2N"
  ];
  return {
    dong,
    pham_vi: { ...ro.phamVi, loc_da_ap },
    thieu_ty_gia,
    so_khoan_bi_loai,
    ghi_chu
  };
}

// src/mcp/tools/thoiQuenGhiChep.ts
var NHOM_TRE = ["ghi ngay", "1\u20132 ng\xE0y", "3\u20137 ng\xE0y", "h\u01A1n m\u1ED9t tu\u1EA7n"];
var KHUNG = ["\u0111\xEAm 0\u20135", "s\xE1ng 6\u201311", "chi\u1EC1u 12\u201317", "t\u1ED1i 18\u201323"];
var THU2 = ["Ch\u1EE7 Nh\u1EADt", "Th\u1EE9 Hai", "Th\u1EE9 Ba", "Th\u1EE9 T\u01B0", "Th\u1EE9 N\u0103m", "Th\u1EE9 S\xE1u", "Th\u1EE9 B\u1EA3y"];
function nhomTre(ngay) {
  if (ngay <= 0) return "ghi ngay";
  if (ngay <= 2) return "1\u20132 ng\xE0y";
  if (ngay <= 7) return "3\u20137 ng\xE0y";
  return "h\u01A1n m\u1ED9t tu\u1EA7n";
}
function ngayTai2(isoUtc, tz) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(isoUtc));
}
function gioTai2(isoUtc, tz) {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).format(
      new Date(isoUtc)
    )
  ) % 24;
}
function soNgayGiua2(tuISO, denISO) {
  const [y1, m1, d1] = tuISO.split("-").map(Number);
  const [y2, m2, d2] = denISO.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}
function thoiQuenGhiChep(input, du) {
  const ro = dungRo(du, input.khoang);
  const ghi_chu = [];
  const tenDanhMuc = new Map(du.categories.map((c) => [c.id, c.name]));
  const demTre = /* @__PURE__ */ new Map();
  const demGio = /* @__PURE__ */ new Map();
  const demThu = /* @__PURE__ */ new Map();
  const theoDanhMuc = /* @__PURE__ */ new Map();
  let coGhiTruoc = false;
  for (const t of ro.txs) {
    const tre = soNgayGiua2(t.occurred_on, ngayTai2(t.created_at, du.tz));
    if (tre < 0) coGhiTruoc = true;
    const nt = nhomTre(tre);
    demTre.set(nt, (demTre.get(nt) ?? 0) + 1);
    const h = gioTai2(t.created_at, du.tz);
    const khung = KHUNG[Math.min(3, Math.floor(h / 6))];
    demGio.set(khung, (demGio.get(khung) ?? 0) + 1);
    const [y, m, d] = t.occurred_on.split("-").map(Number);
    const thu = THU2[new Date(y, m - 1, d).getDay()];
    demThu.set(thu, (demThu.get(thu) ?? 0) + 1);
    const ten = t.category_id === null ? "(kh\xF4ng danh m\u1EE5c)" : tenDanhMuc.get(t.category_id) ?? "(danh m\u1EE5c \u0111\xE3 xo\xE1)";
    const cu = theoDanhMuc.get(ten) ?? { tong: 0, soLan: 0 };
    cu.tong += tre;
    cu.soLan += 1;
    theoDanhMuc.set(ten, cu);
  }
  if (coGhiTruoc) {
    ghi_chu.push(
      "C\xF3 kho\u1EA3n \u0111\u01B0\u1EE3c ghi TR\u01AF\u1EDAC ng\xE0y ti\u1EC1n \u0111i (\u0111\u1ED9 tr\u1EC5 \xE2m) \u2014 th\u01B0\u1EDDng l\xE0 kho\u1EA3n \u0111\u1EB7t tr\u01B0\u1EDBc ho\u1EB7c kho\u1EA3n \u0111\u1ECBnh k\u1EF3 nh\u1EADp s\u1EB5n. D\u1EA5u \xE2m \u0111\u01B0\u1EE3c gi\u1EEF nguy\xEAn, kh\xF4ng k\u1EB9p v\u1EC1 0."
    );
  }
  if (ro.txs.length === 0) {
    ghi_chu.push(
      `Ch\u01B0a c\xF3 giao d\u1ECBch n\xE0o trong kho\u1EA3ng ${ro.phamVi.tu_ngay} \u2192 ${ro.phamVi.den_ngay} (m\u1ED1c cu\u1ED1i kh\xF4ng t\xEDnh), n\xEAn kh\xF4ng \u0111o \u0111\u01B0\u1EE3c th\xF3i quen ghi ch\xE9p.`
    );
  }
  return {
    do_tre: NHOM_TRE.filter((n) => demTre.has(n)).map((n) => ({
      nhom: n,
      so_lan: demTre.get(n)
    })),
    gio_nhap: KHUNG.filter((k) => demGio.has(k)).map((k) => ({
      khung: k,
      so_lan: demGio.get(k)
    })),
    thu_trong_tuan: THU2.filter((t) => demThu.has(t)).map((t) => ({
      thu: t,
      so_lan: demThu.get(t)
    })),
    danh_muc_ghi_muon_nhat: [...theoDanhMuc.entries()].map(([ten, g]) => ({
      ten,
      tre_trung_binh_ngay: Math.round(g.tong / g.soLan),
      so_lan: g.soLan
    })).sort((a, b) => b.tre_trung_binh_ngay - a.tre_trung_binh_ngay).slice(0, 10),
    pham_vi: ro.phamVi,
    ghi_chu
  };
}

// src/mcp/tools/lichSuTyGia.ts
function lichSuTyGia(input, du) {
  const dong = du.fx.filter((r) => r.base === du.base && r.on_date >= input.tu_ngay && r.on_date <= input.den_ngay).sort((a, b) => a.on_date.localeCompare(b.on_date)).map((r) => ({ ngay: r.on_date, ty_gia: r.rates }));
  const ghi_chu = [];
  if (dong.length === 0) {
    ghi_chu.push(
      `Kh\xF4ng c\xF3 d\xF2ng t\u1EF7 gi\xE1 n\xE0o trong kho\u1EA3ng ${input.tu_ngay} \u2192 ${input.den_ngay}. B\u1EA3ng l\u1ECBch s\u1EED t\u1EF7 gi\xE1 ch\u1EC9 b\u1EAFt \u0111\u1EA7u t\xEDch t\u1EEB cu\u1ED1i th\xE1ng 7/2026, v\xE0 ch\u1EC9 ghi th\xEAm v\xE0o nh\u1EEFng ng\xE0y ng\u01B0\u1EDDi d\xF9ng c\xF3 m\u1EDF app \u2014 n\xEAn kho\u1EA3ng tr\u1ED1ng l\xE0 b\xECnh th\u01B0\u1EDDng, kh\xF4ng ph\u1EA3i l\u1ED7i.`
    );
  }
  return {
    chieu: `1 ${du.base} \u0111\u1ED5i \u0111\u01B0\u1EE3c bao nhi\xEAu \u0111\u01A1n v\u1ECB \u0111\u1ED3ng ti\u1EC1n kia`,
    pham_vi: { tu_ngay: input.tu_ngay, den_ngay: input.den_ngay, so_dong: dong.length },
    dong,
    ghi_chu
  };
}

// src/features/budgets/progress.ts
function statusOf(ratio) {
  if (ratio >= 1) return "over";
  if (ratio >= 0.8) return "warn";
  return "ok";
}
function buildBudgetReport(allBudgets, monthTxs, currencyOf, base, rates, parentOf = () => null, carryByCat = /* @__PURE__ */ new Map(), transferIds = NO_TRANSFER_CATEGORIES) {
  const spentByCat = /* @__PURE__ */ new Map();
  let hasMissingRate = false;
  for (const t of monthTxs) {
    if (t.type !== "expense" || !t.category_id || t.exclude_from_stats) continue;
    if (transferIds.has(t.category_id)) continue;
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates);
    if (v === null) {
      hasMissingRate = true;
      continue;
    }
    spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + v * expenseSign(t));
  }
  const groupSpent = (catId) => {
    let s = spentByCat.get(catId) ?? 0;
    for (const [cat, v] of spentByCat) if (parentOf(cat) === catId) s += v;
    return s;
  };
  const budgets = allBudgets.filter((b) => !transferIds.has(b.category_id));
  const budgetedIds = new Set(budgets.map((b) => b.category_id));
  let totalBudgeted = 0;
  let totalSpent = 0;
  let overCount = 0;
  let warnCount = 0;
  const lines = [];
  for (const b of budgets) {
    const parent = parentOf(b.category_id);
    const isMarker = parent != null && budgetedIds.has(parent);
    const carried = b.rollover ? Math.max(0, carryByCat.get(b.category_id) ?? 0) : 0;
    const budgeted = b.amount + carried;
    const spent = isMarker ? spentByCat.get(b.category_id) ?? 0 : groupSpent(b.category_id);
    const ratio = budgeted > 0 ? spent / budgeted : 0;
    const status = statusOf(ratio);
    if (!isMarker) {
      if (status === "over") overCount++;
      else if (status === "warn") warnCount++;
      totalBudgeted += budgeted;
      totalSpent += spent;
    }
    lines.push({ categoryId: b.category_id, budgeted, carried, spent, ratio, status, isMarker });
  }
  lines.sort((a, b) => b.ratio - a.ratio);
  const totalRatio = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0;
  const totalStatus = statusOf(totalRatio);
  return {
    lines,
    totalBudgeted,
    totalSpent,
    totalStatus,
    overCount,
    warnCount,
    hasMissingRate,
    spentByCategory: spentByCat
  };
}
function carryFromPreviousMonth(prevBudgets, prevMonthTxs, currencyOf, base, rates, parentOf = () => null, transferIds = NO_TRANSFER_CATEGORIES) {
  const prev = buildBudgetReport(
    prevBudgets,
    prevMonthTxs,
    currencyOf,
    base,
    rates,
    parentOf,
    /* @__PURE__ */ new Map(),
    transferIds
  );
  const carry = /* @__PURE__ */ new Map();
  for (const line of prev.lines) {
    carry.set(line.categoryId, Math.max(0, line.budgeted - line.spent));
  }
  return carry;
}

// src/mcp/tools/moc.ts
function currencyOfCua(du) {
  const m = new Map(du.accounts.map((a) => [a.id, a.currency]));
  return (accountId) => m.get(accountId) ?? du.base;
}
function baoCaoThang(input, du) {
  docThang(input.thang);
  const ro = dungRo(du, { tu_thang: input.thang, den_thang: input.thang });
  const s = sumIncomeExpense(ro.txs, currencyOfCua(du), du.base, ro.rates, ro.transferIds);
  const ghi_chu = [];
  if (s.hasMissingRate) {
    ghi_chu.push(
      "Thi\u1EBFu t\u1EF7 gi\xE1 cho \xEDt nh\u1EA5t m\u1ED9t kho\u1EA3n; kho\u1EA3n \u0111\xF3 b\u1ECB lo\u1EA1i kh\u1ECFi t\u1ED5ng (kh\xF4ng quy 1:1), n\xEAn c\xE1c s\u1ED1 d\u01B0\u1EDBi \u0111\xE2y l\xE0 CH\u01AFA \u0110\u1EE6."
    );
  }
  if (ro.txs.length === 0) {
    ghi_chu.push(
      `Ch\u01B0a c\xF3 giao d\u1ECBch n\xE0o trong th\xE1ng ${input.thang} (${ro.phamVi.tu_ngay} \u2192 ${ro.phamVi.den_ngay}, m\u1ED1c cu\u1ED1i kh\xF4ng t\xEDnh).`
    );
  }
  return {
    thu: tien(s.income, du.base),
    chi: tien(s.expense, du.base),
    chuyen: tien(s.transfer, du.base),
    // Ba tầng cộng lại ĐÚNG bằng thu — ràng buộc của khối 01 báo cáo tháng. Có thể ÂM.
    de_lai: tien(s.income - s.expense - s.transfer, du.base),
    thieu_ty_gia: s.hasMissingRate,
    pham_vi: ro.phamVi,
    ghi_chu
  };
}
function nganSach(input, du) {
  const thangKey = docThang(input.thang);
  const ro = dungRo(du, { tu_thang: input.thang, den_thang: input.thang });
  const tenDanhMuc = new Map(du.categories.map((c) => [c.id, c.name]));
  const chaCua = new Map(du.categories.map((c) => [c.id, c.parent_id]));
  const parentOf = (categoryId) => chaCua.get(categoryId) ?? null;
  const currencyOf = currencyOfCua(du);
  const budgetsThang = du.budgets.filter((b) => b.month_key === input.thang);
  const thangTruoc = monthKeyString(addMonths(thangKey, -1));
  const coDon = budgetsThang.some((b) => b.rollover);
  const roTruoc = coDon ? dungRo(du, { tu_thang: thangTruoc, den_thang: thangTruoc }) : null;
  const carry = roTruoc === null ? /* @__PURE__ */ new Map() : carryFromPreviousMonth(
    du.budgets.filter((b) => b.month_key === thangTruoc),
    roTruoc.txs,
    currencyOf,
    du.base,
    roTruoc.rates,
    parentOf,
    roTruoc.transferIds
  );
  const bc = buildBudgetReport(
    budgetsThang,
    ro.txs,
    currencyOf,
    du.base,
    ro.rates,
    parentOf,
    carry,
    ro.transferIds
  );
  const ghi_chu = [];
  if (bc.hasMissingRate) {
    ghi_chu.push("Thi\u1EBFu t\u1EF7 gi\xE1 cho \xEDt nh\u1EA5t m\u1ED9t kho\u1EA3n \u2014 s\u1ED1 \u0111\xE3 ti\xEAu l\xE0 CH\u01AFA \u0110\u1EE6.");
  }
  if (coDon) {
    ghi_chu.push(
      `C\xF3 h\u1EA1n m\u1EE9c b\u1EADt d\u1ED3n: ph\u1EA7n ch\u01B0a ti\xEAu c\u1EE7a th\xE1ng ${thangTruoc} \u0111\xE3 \u0111\u01B0\u1EE3c c\u1ED9ng v\xE0o h\u1EA1n m\u1EE9c th\xE1ng n\xE0y, \u0111\xFAng nh\u01B0 tab Ng\xE2n s\xE1ch trong app.`
    );
  }
  if (bc.lines.length === 0) {
    ghi_chu.push(`Ch\u01B0a \u0111\u1EB7t ng\xE2n s\xE1ch n\xE0o \xE1p cho th\xE1ng ${input.thang}.`);
  }
  return {
    dong: bc.lines.map((l) => ({
      danh_muc: tenDanhMuc.get(l.categoryId) ?? "(danh m\u1EE5c \u0111\xE3 xo\xE1)",
      han_muc: tien(l.budgeted, du.base),
      da_tieu: tien(l.spent, du.base),
      con_lai: tien(l.budgeted - l.spent, du.base),
      // Đọc `status` của app, KHÔNG tự so `spent > budgeted`: ngưỡng vượt là luật của app
      // (statusOf trong progress.ts), và hai ngưỡng khác nhau là một cái bug im lặng.
      vuot: l.status === "over",
      // Dòng "mốc theo dõi" là con của một nhóm đã có trần cha — hạn mức của nó KHÔNG phải
      // một trần thật. Không nói ra thì Claude sẽ đọc nó như trần và cộng trùng vào tổng.
      chi_la_moc_theo_doi: l.isMarker
    })),
    thieu_ty_gia: bc.hasMissingRate,
    pham_vi: ro.phamVi,
    ghi_chu
  };
}

// api/_handler.ts
var KHOANG = z.object({
  tu_thang: z.string().optional().describe("Th\xE1ng \u0111\u1EA7u, d\u1EA1ng 'YYYY-MM'"),
  den_thang: z.string().optional().describe("Th\xE1ng cu\u1ED1i; b\u1ECF tr\u1ED1ng = b\u1EB1ng tu_thang"),
  tu_ngay: z.string().optional().describe("Ng\xE0y \u0111\u1EA7u, d\u1EA1ng 'YYYY-MM-DD'"),
  den_ngay: z.string().optional().describe("Ng\xE0y cu\u1ED1i, T\xCDNH C\u1EA2 ng\xE0y n\xE0y")
});
var ra = (v) => ({
  content: [{ type: "text", text: JSON.stringify(v, null, 2) }]
});
function dungServer(du) {
  const server = new McpServer({ name: "so-gao", version: "1.0.0" });
  server.registerTool(
    "truy_van",
    {
      description: "Truy v\u1EA5n ch\xE9o s\u1ED5 chi ti\xEAu: ch\u1ECDn \u0110O G\xCC v\xE0 X\u1EBA THEO CHI\u1EC0U N\xC0O, t\u1EF1 do ph\u1ED1i. \u0110\xE2y l\xE0 tool ch\xEDnh \u2014 d\xF9ng n\xF3 cho h\u1EA7u h\u1EBFt c\xE2u h\u1ECFi. N\xF3 tr\u1EA3 l\u1EDDi \u0111\u01B0\u1EE3c nh\u1EEFng c\xE2u app kh\xF4ng c\xF3 m\xE0n h\xECnh n\xE0o tr\u1EA3 l\u1EDDi, v\xED d\u1EE5 chi v\xE0o ng\xE0y l\u1EC5 Nh\u1EADt so v\u1EDBi ng\xE0y th\u01B0\u1EDDng, hay kho\u1EA3n ghi mu\u1ED9n c\xF3 to h\u01A1n kho\u1EA3n ghi ngay kh\xF4ng. Ti\u1EC1n tr\u1EA3 v\u1EC1 k\xE8m chu\u1ED7i \u0111\xE3 format \u2014 \u0110\u1EEANG t\u1EF1 chia \u0111\u01A1n v\u1ECB. N\u1EBFu thieu_ty_gia = true th\xEC ph\u1EA3i n\xF3i r\xF5 v\u1EDBi ng\u01B0\u1EDDi d\xF9ng l\xE0 s\u1ED1 ch\u01B0a \u0111\u1EE7.",
      inputSchema: z.object({
        do_luong: z.enum(["tong_tien", "so_lan", "trung_binh_moi_lan", "lon_nhat", "do_tre_ghi"]),
        xe_theo: z.array(
          z.enum([
            "danh_muc",
            "danh_muc_cha",
            "nhan",
            "tai_khoan",
            "thang",
            "tuan",
            "thu_trong_tuan",
            "gio_nhap",
            "ngay_le_nhat",
            "co_khoan",
            "need_level",
            "cost_type",
            "la_gui_tien"
          ])
        ).max(2).describe("0 t\u1EDBi 2 chi\u1EC1u. R\u1ED7ng = m\u1ED9t d\xF2ng t\u1ED5ng."),
        loai: z.enum(["chi", "thu", "chuyen"]).optional().describe(
          "M\u1EB7c \u0111\u1ECBnh 'chi'. 'chuyen' = chuy\u1EC3n t\xE0i s\u1EA3n (g\u1EEDi ti\u1EC1n v\u1EC1 VN); kho\u1EA3n chuy\u1EC3n gi\u1EEFa hai t\xE0i kho\u1EA3n c\u1EE7a ch\xEDnh m\xECnh kh\xF4ng thu\u1ED9c lo\u1EA1i n\xE0o, \u0111\xFAng nh\u01B0 tab B\xE1o c\xE1o."
        ),
        loc: z.object({
          danh_muc: z.array(z.string()).optional().describe("T\xCAN danh m\u1EE5c, kh\xF4ng ph\u1EA3i id"),
          nhan: z.array(z.string()).optional().describe("T\xCAN nh\xE3n"),
          tai_khoan: z.array(z.string()).optional().describe("T\xCAN t\xE0i kho\u1EA3n"),
          tien_te: z.array(z.enum(["JPY", "VND", "USD"])).optional(),
          la_gui_tien: z.boolean().optional().describe("true = ch\u1EC9 kho\u1EA3n g\u1EEDi ti\u1EC1n v\u1EC1 VN"),
          need_level: z.array(z.string()).optional().describe("M\u1EE9c nhu c\u1EA7u c\u1EE7a danh m\u1EE5c: 'essential' (b\u1EAFt bu\u1ED9c) / 'flexible' (s\u1EDF th\xEDch)"),
          cost_type: z.array(z.string()).optional().describe("Chi c\u1ED1 \u0111\u1ECBnh vs bi\u1EBFn \u0111\u1ED5i: 'fixed' / 'variable'")
        }).optional(),
        khoang: KHOANG,
        sap_xep: z.enum(["giam", "tang", "ten"]).optional(),
        gioi_han: z.number().int().positive().max(200).optional()
      })
    },
    async (input) => ra(truyVan(input, du))
  );
  server.registerTool(
    "thoi_quen_ghi_chep",
    {
      description: "Th\xF3i quen ghi ch\xE9p c\u1EE7a ng\u01B0\u1EDDi d\xF9ng: \u0111\u1ED9 tr\u1EC5 t\u1EEB l\xFAc ti\u1EC1n \u0111i t\u1EDBi l\xFAc g\xF5 v\xE0o app, gi\u1EDD nh\u1EADp, th\u1EE9 trong tu\u1EA7n, v\xE0 danh m\u1EE5c n\xE0o hay b\u1ECB ghi mu\u1ED9n nh\u1EA5t. \u0110\xE2y l\xE0 d\u1EEF li\u1EC7u KH\xD4NG m\xE0n h\xECnh n\xE0o c\u1EE7a app hi\u1EC7n. L\u01B0u \xFD \u0111\xE2y l\xE0 d\u1EEF li\u1EC7u v\u1EC1 H\xC0NH VI, kh\xF4ng ph\u1EA3i v\u1EC1 ti\u1EC1n \u2014 n\xF3i v\u1EC1 n\xF3 m\u1ED9t c\xE1ch ch\u1EEBng m\u1EF1c.",
      inputSchema: z.object({ khoang: KHOANG })
    },
    async (input) => ra(thoiQuenGhiChep(input, du))
  );
  server.registerTool(
    "lich_su_ty_gia",
    {
      description: "L\u1ECBch s\u1EED t\u1EF7 gi\xE1 theo ng\xE0y. B\u1EA3ng n\xE0y ch\u1EC9 t\xEDch t\u1EEB cu\u1ED1i th\xE1ng 7/2026 v\xE0 ch\u1EC9 ghi v\xE0o nh\u1EEFng ng\xE0y ng\u01B0\u1EDDi d\xF9ng m\u1EDF app, n\xEAn kho\u1EA3ng tr\u1ED1ng l\xE0 b\xECnh th\u01B0\u1EDDng. LU\xD4N \u0111\u1ECDc tr\u01B0\u1EDDng `chieu` tr\u01B0\u1EDBc khi di\u1EC5n gi\u1EA3i con s\u1ED1 \u2014 chi\u1EC1u t\u1EF7 gi\xE1 l\xE0 ch\u1ED7 d\u1EC5 \u0111\u1ECDc ng\u01B0\u1EE3c nh\u1EA5t.",
      inputSchema: z.object({
        tu_ngay: z.string().describe("'YYYY-MM-DD'"),
        den_ngay: z.string().describe("'YYYY-MM-DD', t\xEDnh c\u1EA3 ng\xE0y n\xE0y")
      })
    },
    async (input) => ra(lichSuTyGia(input, du))
  );
  server.registerTool(
    "bao_cao_thang",
    {
      description: "M\u1ED0C \u0110\u1ED0I CHI\u1EBEU: thu / chi / chuy\u1EC3n t\xE0i s\u1EA3n / ph\u1EA7n \u0111\u1EC3 l\u1EA1i c\u1EE7a m\u1ED9t th\xE1ng, \u0111\xFAng b\u1EB1ng s\u1ED1 m\xE0 tab B\xE1o c\xE1o trong app hi\u1EC7n. D\xF9ng tool n\xE0y \u0111\u1EC3 ki\u1EC3m ch\u1EE9ng con s\u1ED1 b\u1EA1n l\u1EA5y t\u1EEB truy_van. N\u1EBFu hai b\xEAn l\u1EC7ch nhau, h\xE3y n\xF3i th\u1EB3ng v\u1EDBi ng\u01B0\u1EDDi d\xF9ng l\xE0 c\xF3 b\u1EA5t th\u01B0\u1EDDng thay v\xEC ch\u1ECDn m\u1ED9t s\u1ED1.",
      inputSchema: z.object({ thang: z.string().describe("'YYYY-MM'") })
    },
    async (input) => ra(baoCaoThang(input, du))
  );
  server.registerTool(
    "ngan_sach",
    {
      description: "M\u1ED0C \u0110\u1ED0I CHI\u1EBEU: h\u1EA1n m\u1EE9c, \u0111\xE3 ti\xEAu, c\xF2n l\u1EA1i c\u1EE7a t\u1EEBng ng\xE2n s\xE1ch trong m\u1ED9t th\xE1ng \u2014 \u0111\xFAng b\u1EB1ng s\u1ED1 tab Ng\xE2n s\xE1ch hi\u1EC7n. D\xF2ng c\xF3 chi_la_moc_theo_doi = true l\xE0 m\u1ED1c theo d\xF5i c\u1EE7a m\u1ED9t danh m\u1EE5c con, KH\xD4NG ph\u1EA3i m\u1ED9t tr\u1EA7n th\u1EADt; \u0111\u1EEBng c\u1ED9ng n\xF3 v\xE0o t\u1ED5ng.",
      inputSchema: z.object({ thang: z.string().describe("'YYYY-MM'") })
    },
    async (input) => ra(nganSach(input, du))
  );
  return server;
}
async function handler(req, res) {
  let cauhinh;
  try {
    cauhinh = docCauhinh(process.env);
  } catch (e) {
    res.status(500).json({ error: e.message });
    return;
  }
  const header = req.headers.authorization ?? "";
  const gui = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (gui !== cauhinh.token) {
    res.status(401).json({ error: "Thi\u1EBFu ho\u1EB7c sai bearer token." });
    return;
  }
  try {
    const sb = taoClient(cauhinh);
    const du = await napDuLieu(sb, cauhinh.userId);
    const server = dungServer(du);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: void 0 });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
}
export {
  handler as default
};
