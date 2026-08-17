// TỆP SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
// Nguồn: src/features/notifications/serverBundle.ts (và mọi thứ nó import)
// Sinh lại: npm run bundle:rules
// Sửa tay ở đây sẽ bị lần chạy sau ghi đè, và tests/pushBundle.test.ts sẽ đỏ.

// src/features/notifications/types.ts
var RECENT_TXS_DAYS = 90;
var NOTIFICATION_TYPES = [
  "account-shortfall",
  "account-negative",
  "debt-overdue",
  "debt-due-soon",
  "bill-due",
  "planned-due",
  "budget-over",
  "budget-pace",
  "budget-parent-over",
  "tag-budget-over",
  "card-statement-day",
  "recurring-suggestion",
  "stale-entry",
  "savings-milestone",
  "networth-record",
  "monthly-summary",
  // Cuối mảng = hiển thị sau cùng trong nhóm việc-cần-làm: đây là tin ít gấp nhất
  // (lệch kế hoạch cả đời, không phải "hết tiền tuần này").
  "lifetime-drift",
  // Hai luật về ĐỘ TIN CẬY của dữ liệu (§4.9) đứng CUỐI: chúng không gấp — không có
  // hạn chót nào — nhưng chúng nói rằng những con số phía trên đang được đo bằng một
  // cái thước thiếu vạch, nên vẫn thuộc nhóm việc-cần-làm chứ không phải tin-để-biết.
  "data-uncategorized",
  "data-reconcile",
  // Cuối cùng: điểm gãy mức chi nói về NHIỀU THÁNG, không có hạn chót nào, và việc nó
  // đề nghị (sửa hạn mức) là việc ngồi xuống mới làm được. Đứng trên hai luật độ-tin-cậy
  // thì nó đẩy một việc "khi nào rảnh" lên trên một việc đang làm sai số liệu hôm nay.
  "trend-level-shift"
];
var NOTIFICATION_META = {
  "account-shortfall": {
    kind: "action",
    label: "T\xE0i kho\u1EA3n s\u1EAFp kh\xF4ng \u0111\u1EE7 ti\u1EC1n",
    hint: "Nh\xECn tr\u01B0\u1EDBc 14 ng\xE0y: ti\u1EC1n trong v\xED c\xF3 \u0111\u1EE7 tr\u1EA3 th\u1EBB v\xE0 c\xE1c kho\u1EA3n \u0111\u1ECBnh k\u1EF3 kh\xF4ng."
  },
  "account-negative": {
    kind: "action",
    label: "T\xE0i kho\u1EA3n \u0111ang \xE2m",
    hint: "S\u1ED1 d\u01B0 xu\u1ED1ng d\u01B0\u1EDBi 0 \u2014 th\u01B0\u1EDDng l\xE0 ghi nh\u1EA7m ho\u1EB7c qu\xEAn ghi m\u1ED9t kho\u1EA3n thu."
  },
  "debt-overdue": {
    kind: "action",
    label: "N\u1EE3 / cho vay qu\xE1 h\u1EA1n",
    hint: "\u0110\xE3 qua ng\xE0y h\u1EB9n m\xE0 kho\u1EA3n \u0111\xF3 ch\u01B0a t\u1EA5t to\xE1n."
  },
  "debt-due-soon": {
    kind: "action",
    label: "N\u1EE3 / cho vay s\u1EAFp \u0111\u1EBFn h\u1EA1n",
    hint: "C\xF2n 7 ng\xE0y ho\u1EB7c \xEDt h\u01A1n l\xE0 t\u1EDBi ng\xE0y h\u1EB9n."
  },
  "bill-due": {
    kind: "action",
    label: "Kho\u1EA3n c\u1EA7n thanh to\xE1n",
    hint: "Quy t\u1EAFc \u0111\u1ECBnh k\u1EF3 ki\u1EC3u NH\u1EAEC t\u1EDBi h\u1EA1n m\xE0 ch\u01B0a ghi (vd g\u1EEDi ti\u1EC1n v\u1EC1 nh\xE0). B\xE1m t\u1EDBi khi b\u1EA1n x\xE1c nh\u1EADn \u0111\xE3 ghi \u2014 app kh\xF4ng t\u1EF1 ghi h\u1ED9 v\xEC s\u1ED1 ti\u1EC1n m\u1ED7i l\u1EA7n m\u1ED9t kh\xE1c."
  },
  "planned-due": {
    kind: "action",
    label: "Kho\u1EA3n s\u1EAFp chi t\u1EDBi h\u1EA1n",
    hint: "M\u1ED9t kho\u1EA3n trong danh s\xE1ch S\u1EAFp chi \u0111\xE3 t\u1EDBi h\u1EA1n (ho\u1EB7c s\u1EAFp t\u1EDBi, tu\u1EF3 b\u1EA1n \u0111\u1EB7t nh\u1EAFc tr\u01B0\u1EDBc m\u1EA5y ng\xE0y). B\xE1m t\u1EDBi khi b\u1EA1n \u0111\xE1nh d\u1EA5u \u0111\xE3 chi ho\u1EB7c b\u1ECF."
  },
  "budget-over": {
    kind: "action",
    label: "V\u01B0\u1EE3t ng\xE2n s\xE1ch th\xE1ng",
    hint: "M\u1ED9t m\u1EE5c \u0111\xE3 ti\xEAu qu\xE1 h\u1EA1n m\u1EE9c \u0111\u1EB7t cho th\xE1ng n\xE0y."
  },
  "budget-pace": {
    kind: "action",
    label: "Ti\xEAu nhanh h\u01A1n nh\u1ECBp",
    hint: "M\u1EDBi qua m\u1ED9t ph\u1EA7n ba th\xE1ng \u0111\xE3 d\xF9ng g\u1EA7n h\u1EBFt h\u1EA1n m\u1EE9c \u2014 b\xE1o s\u1EDBm \u0111\u1EC3 c\xF2n k\u1ECBp gh\xECm l\u1EA1i."
  },
  "budget-parent-over": {
    kind: "action",
    label: "Nh\xF3m v\u01B0\u1EE3t tr\u1EA7n",
    hint: "C\u1EA3 nh\xF3m \u0111\xE3 ti\xEAu qu\xE1 tr\u1EA7n \u0111\u1EB7t \u1EDF m\u1EE5c cha; k\xE8m t\u1ED1i \u0111a 2 m\u1EE5c con \u0111ang ti\xEAu nhi\u1EC1u nh\u1EA5t."
  },
  "tag-budget-over": {
    kind: "action",
    label: "Nh\xE3n v\u01B0\u1EE3t tr\u1EA7n",
    hint: "Chi mang m\u1ED9t nh\xE3n \u0111\xE3 qu\xE1 tr\u1EA7n \u0111\u1EB7t cho nh\xE3n \u0111\xF3 (c\u1EA3 \u0111\u1EE3t ho\u1EB7c th\xE1ng n\xE0y, t\xF9y nh\xE3n)."
  },
  "card-statement-day": {
    kind: "info",
    label: "Ng\xE0y ch\u1ED1t sao k\xEA th\u1EBB",
    hint: "H\xF4m nay th\u1EBB ch\u1ED1t k\u1EF3 \u2014 mua t\u1EEB mai s\u1EBD tr\u1EA3 v\xE0o th\xE1ng sau."
  },
  "recurring-suggestion": {
    kind: "info",
    label: "G\u1EE3i \xFD t\u1EA1o quy t\u1EAFc \u0111\u1ECBnh k\u1EF3",
    hint: "Ph\xE1t hi\u1EC7n m\u1ED9t kho\u1EA3n tr\u1EA3 \u0111\u1EC1u \u0111\u1EB7n m\xE0 ch\u01B0a c\xF3 quy t\u1EAFc."
  },
  "stale-entry": {
    kind: "info",
    label: "L\xE2u ch\u01B0a ghi s\u1ED5",
    hint: "T\u1EEB 3 ng\xE0y kh\xF4ng ghi giao d\u1ECBch n\xE0o; nhi\u1EC1u nh\u1EA5t m\u1ED9t l\u1EA7n m\u1ED7i tu\u1EA7n."
  },
  "savings-milestone": {
    kind: "info",
    label: "M\u1EE5c ti\xEAu ti\u1EBFt ki\u1EC7m ch\u1EA1m m\u1ED1c",
    hint: "\u0110\u1EA1t 25%, 50%, 75% ho\u1EB7c 100% m\u1EE5c ti\xEAu."
  },
  "networth-record": {
    kind: "info",
    label: "T\xE0i s\u1EA3n r\xF2ng l\u1EADp k\u1EF7 l\u1EE5c",
    hint: "Cao nh\u1EA5t t\u1EEB tr\u01B0\u1EDBc t\u1EDBi nay; nhi\u1EC1u nh\u1EA5t m\u1ED9t l\u1EA7n m\u1ED7i th\xE1ng."
  },
  "monthly-summary": {
    kind: "info",
    label: "T\u1ED5ng k\u1EBFt th\xE1ng",
    hint: "V\xE0o ng\xE0y \u0111\u1EA7u k\u1EF3 m\u1EDBi: th\xE1ng v\u1EEBa r\u1ED3i chi bao nhi\xEAu, thu bao nhi\xEAu, \u0111\u1EC3 d\xE0nh bao nhi\xEAu."
  },
  "lifetime-drift": {
    kind: "action",
    label: "Thu chi l\u1EC7ch k\u1EBF ho\u1EA1ch Lifetime",
    hint: `Thu ho\u1EB7c chi th\u1EF1c t\u1EBF ${RECENT_TXS_DAYS} ng\xE0y g\u1EA7n \u0111\xE2y l\u1EC7ch kh\u1ECFi gi\u1EA3 \u0111\u1ECBnh c\u1EE7a k\u1ECBch b\u1EA3n (k\u1EC3 c\u1EA3 khi k\u1EBF ho\u1EA1ch \u0111\u1EC3 thu 0 m\xE0 s\u1ED5 c\xF3 thu nh\u1EADp), k\xE8m m\u1ED1c \xE2m d\u1ECBch bao nhi\xEAu n\u0103m.`
  },
  "data-uncategorized": {
    kind: "action",
    label: "Giao d\u1ECBch ch\u01B0a g\u1EAFn danh m\u1EE5c",
    hint: "Kho\u1EA3n ch\u01B0a c\xF3 danh m\u1EE5c kh\xF4ng v\xE0o \u0111\u01B0\u1EE3c b\xE1o c\xE1o hay ng\xE2n s\xE1ch \u2014 nh\u1EAFc khi d\u1ED3n l\u1EA1i."
  },
  "data-reconcile": {
    kind: "action",
    label: "T\xE0i kho\u1EA3n l\xE2u ch\u01B0a \u0111\u1ED1i chi\u1EBFu",
    hint: "Qu\xE1 30 ng\xE0y kh\xF4ng so s\u1ED1 d\u01B0 s\u1ED5 v\u1EDBi s\u1ED1 th\u1EADt th\xEC m\u1ECDi t\u1ED5ng \u0111\u1EC1u c\xF3 th\u1EC3 \u0111\xE3 l\u1EC7ch."
  },
  "trend-level-shift": {
    kind: "action",
    label: "M\u1EE9c chi \u0111\u1ED5i h\u1EB3n so v\u1EDBi tr\u01B0\u1EDBc",
    hint: "Khi m\u1EE9c chi h\u1EB1ng th\xE1ng b\u01B0\u1EDBc sang m\u1ED9t b\u1EADc kh\xE1c v\xE0 \u1EDF y\xEAn \u0111\xF3 v\xE0i th\xE1ng \u2014 d\u1EA5u hi\u1EC7u h\u1EA1n m\u1EE9c \u0111ang \u0111\u1EB7t theo n\u1EBFp s\u1ED1ng c\u0169. Kh\xF4ng b\xE1o cho dao \u0111\u1ED9ng v\u1EB7t c\u1EE7a m\u1ED9t th\xE1ng."
  }
};

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

// src/lib/rates.ts
function convertToBase(minor, from, base, rates) {
  if (from === base) return minor;
  const rate = rates[from];
  if (!rate) return null;
  const fromMajor = minor / 10 ** CURRENCIES[from].decimals;
  const baseMajor = fromMajor / rate;
  return Math.round(baseMajor * 10 ** CURRENCIES[base].decimals);
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
function isBankClosed(isoDate) {
  const d = dow(isoDate);
  if (d === 0 || d === 6) return true;
  const md = isoDate.slice(5);
  if (md === "12-31" || md === "01-02" || md === "01-03") return true;
  return isJapaneseHoliday(isoDate);
}
function shiftToBusinessDay(isoDate) {
  let d = isoDate;
  for (let i = 0; i < 10 && isBankClosed(d); i++) d = addDaysISO(d, 1);
  return d;
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
function daysBetween(aISO, bISO) {
  const a = Date.parse(aISO + "T00:00:00Z");
  const b = Date.parse(bISO + "T00:00:00Z");
  return Math.round((b - a) / 864e5);
}
function addDaysISO2(iso2, delta) {
  const d = /* @__PURE__ */ new Date(iso2 + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function nextCardDueDate(dueDay, todayISO) {
  return nextCardDuePeriod(dueDay, todayISO).payISO;
}
function nextCardDuePeriod(dueDay, todayISO) {
  const [ty, tm] = todayISO.split("-").map(Number);
  for (let i = 0; i < 14; i++) {
    const k = addMonths({ year: ty, month: tm }, i);
    const dim = new Date(k.year, k.month, 0).getDate();
    const periodISO2 = `${k.year}-${pad2(k.month)}-${pad2(Math.min(dueDay, dim))}`;
    const payISO = shiftToBusinessDay(periodISO2);
    if (payISO >= todayISO) return { periodISO: periodISO2, payISO };
  }
  const periodISO = `${ty}-${pad2(tm)}-${pad2(dueDay)}`;
  return { periodISO, payISO: shiftToBusinessDay(periodISO) };
}

// src/features/assets/depreciation.ts
var DAYS_PER_MONTH = 365.25 / 12;

// src/features/assets/aggregate.ts
function cardFunding(cards, sourceById, owedById) {
  const owedOf = (c) => owedById?.get(c.id) ?? (c.balance < 0 ? -c.balance : 0);
  const bySource = /* @__PURE__ */ new Map();
  for (const c of cards) {
    if (!c.paymentAccountId) continue;
    const src = sourceById.get(c.paymentAccountId);
    if (!src || src.currency !== c.currency) continue;
    const list = bySource.get(src.id);
    if (list) list.push(c);
    else bySource.set(src.id, [c]);
  }
  const byCard = /* @__PURE__ */ new Map();
  const groups = [];
  for (const [sourceId, list] of bySource) {
    const src = sourceById.get(sourceId);
    const shared = list.length >= 2;
    const totalOwed = list.reduce((s, c) => s + owedOf(c), 0);
    let remaining = src.balance;
    for (const c of list) {
      const owed = owedOf(c);
      const avail = Math.max(remaining, 0);
      byCard.set(c.id, {
        sourceId,
        sourceName: src.name,
        currency: src.currency,
        sourceBalance: src.balance,
        owed,
        shared,
        enough: avail >= owed,
        shortfall: Math.max(0, owed - avail)
      });
      remaining -= owed;
    }
    groups.push({
      sourceId,
      sourceName: src.name,
      currency: src.currency,
      sourceBalance: src.balance,
      totalOwed,
      cardCount: list.length,
      owingCount: list.filter((c) => owedOf(c) > 0).length,
      enough: src.balance >= totalOwed,
      shortfall: Math.max(0, totalOwed - src.balance)
    });
  }
  return { byCard, groups };
}

// src/lib/recurring.ts
var pad3 = (n) => String(n).padStart(2, "0");
var daysInMonth = (year, month) => new Date(year, month, 0).getDate();
function nthDueDate(startISO, frequency, n) {
  const [y, m, d] = startISO.split("-").map(Number);
  if (frequency === "weekly") return addDaysISO2(startISO, 7 * n);
  if (frequency === "monthly") {
    const total = m - 1 + n;
    const year2 = y + Math.floor(total / 12);
    const month = total % 12 + 1;
    return `${year2}-${pad3(month)}-${pad3(Math.min(d, daysInMonth(year2, month)))}`;
  }
  const year = y + n;
  return `${year}-${pad3(m)}-${pad3(Math.min(d, daysInMonth(year, m)))}`;
}
function listDueDates(rule, todayISO) {
  if (rule.is_paused) return [];
  const out = [];
  for (let n = 0; ; n++) {
    const due = nthDueDate(rule.start_on, rule.frequency, n);
    if (due > todayISO) break;
    if (rule.end_on && due > rule.end_on) break;
    if (rule.last_generated_on && due <= rule.last_generated_on) continue;
    out.push(due);
  }
  return out;
}
function nextDueDate(rule) {
  for (let n = 0; ; n++) {
    const due = nthDueDate(rule.start_on, rule.frequency, n);
    if (rule.end_on && due > rule.end_on) return null;
    if (rule.last_generated_on && due <= rule.last_generated_on) continue;
    return due;
  }
}
function daysBetweenISO(aISO, bISO) {
  const a = Date.parse(aISO + "T00:00:00Z");
  const b = Date.parse(bISO + "T00:00:00Z");
  return Math.round((b - a) / 864e5);
}
function billStatuses(rules, todayISO) {
  const out = [];
  for (const rule of rules) {
    if (rule.mode !== "remind" || rule.is_paused) continue;
    const dueISO = nextDueDate(rule);
    if (dueISO === null) continue;
    const daysLeft = daysBetweenISO(todayISO, dueISO);
    if (daysLeft > (rule.remind_days_before ?? 0)) continue;
    out.push({
      ruleId: rule.id,
      dueISO,
      daysLeft,
      // listDueDates trả đúng các kỳ ≤ hôm nay còn chưa xong — cùng một phép đếm mà
      // engine catch-up dùng, nên hai bên không thể lệch nhau về "kỳ nào còn nợ".
      overdueCount: listDueDates(rule, todayISO).length
    });
  }
  return out.sort((a, b) => a.dueISO < b.dueISO ? -1 : a.dueISO > b.dueISO ? 1 : 0);
}

// src/features/notifications/rules/accountRules.ts
var SHORTFALL_HORIZON_DAYS = 14;
var SPENDABLE_TYPES = /* @__PURE__ */ new Set(["cash", "bank", "ic", "ewallet"]);
function recurringImpact(input, accountId, untilISO) {
  let outgoing = 0;
  let incoming = 0;
  const labels = [];
  for (const r of input.recurringRules) {
    if (r.is_paused) continue;
    if (r.type === "transfer") continue;
    if (r.account_id !== accountId) continue;
    let hits = 0;
    for (let n = 0; ; n++) {
      const due = nthDueDate(r.start_on, r.frequency, n);
      if (due > untilISO) break;
      if (r.end_on && due > r.end_on) break;
      if (due <= input.todayISO) continue;
      hits++;
      if (hits > 60) break;
    }
    if (hits === 0) continue;
    if (r.type === "expense") {
      outgoing += r.amount * hits;
      labels.push(
        `${r.note || "Kho\u1EA3n \u0111\u1ECBnh k\u1EF3"} ${input.formatMoney(r.amount * hits, input.currencyOf(accountId))}`
      );
    } else {
      incoming += r.amount * hits;
    }
  }
  return { outgoing, incoming, labels };
}
function shortfallFacts(input, account, owedBase, extraLabels, untilISO) {
  const impact = recurringImpact(input, account.id, untilISO);
  const owe = owedBase + impact.outgoing;
  const have = account.balance + impact.incoming;
  if (have >= owe) return null;
  const parts = [...extraLabels, ...impact.labels];
  const listed = parts.length > 0 ? ` \xB7 ${parts.join(" \xB7 ")}` : "";
  return {
    owe,
    have,
    detail: `${SHORTFALL_HORIZON_DAYS} ng\xE0y t\u1EDBi ph\u1EA3i tr\u1EA3 ${input.formatMoney(owe, account.currency)}${listed}`
  };
}
function pushShortfallIfNeeded(out, input, account, owedBase, extraLabels, untilISO) {
  const facts = shortfallFacts(input, account, owedBase, extraLabels, untilISO);
  if (!facts) return;
  out.push({
    key: `account-shortfall:${account.id}`,
    kind: "action",
    type: "account-shortfall",
    severity: "high",
    title: `${account.name} thi\u1EBFu ${input.formatMoney(facts.owe - facts.have, account.currency)}`,
    detail: facts.detail,
    onISO: untilISO,
    to: `/assets/account/${account.id}`
  });
}
function accountRules(input) {
  const out = [];
  const negativeReported = /* @__PURE__ */ new Set();
  for (const a of input.accounts) {
    if (a.is_archived || !SPENDABLE_TYPES.has(a.type)) continue;
    if (a.balance >= 0) continue;
    negativeReported.add(a.id);
    out.push({
      key: `account-negative:${a.id}`,
      kind: "action",
      type: "account-negative",
      severity: "high",
      title: `${a.name} \u0111ang \xE2m ${input.formatMoney(-a.balance, a.currency)}`,
      detail: "Th\u01B0\u1EDDng l\xE0 ghi nh\u1EA7m ho\u1EB7c qu\xEAn ghi m\u1ED9t kho\u1EA3n thu.",
      to: `/assets/account/${a.id}`
    });
  }
  const untilISO = addDaysISO2(input.todayISO, SHORTFALL_HORIZON_DAYS);
  const cards = input.accounts.filter((a) => a.type === "card" && !a.is_archived && a.payment_due_day != null).filter((a) => nextCardDueDate(a.payment_due_day, input.todayISO) <= untilISO).map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    balance: a.balance,
    baseValue: null,
    creditLimit: a.credit_limit,
    paymentDueDay: a.payment_due_day,
    statementDay: a.statement_day,
    paymentAccountId: a.payment_account_id,
    includeInTotals: a.include_in_totals,
    hidden: a.is_hidden
  }));
  const sourceById = new Map(
    input.accounts.filter((a) => !a.is_archived && a.type !== "card").map((a) => [a.id, { id: a.id, name: a.name, currency: a.currency, balance: a.balance }])
  );
  const { groups } = cardFunding(cards, sourceById);
  const sourcesSeen = /* @__PURE__ */ new Set();
  for (const g of groups) {
    sourcesSeen.add(g.sourceId);
    const cardNames = cards.filter((c) => c.paymentAccountId === g.sourceId && c.currency === g.currency).map((c) => `${c.name} ${input.formatMoney(c.balance < 0 ? -c.balance : 0, c.currency)}`);
    const source = {
      id: g.sourceId,
      name: g.sourceName,
      currency: g.currency,
      balance: g.sourceBalance
    };
    if (negativeReported.has(g.sourceId)) {
      const facts = shortfallFacts(input, source, g.totalOwed, cardNames, untilISO);
      if (facts) {
        const row = out.find((n) => n.key === `account-negative:${g.sourceId}`);
        if (row) row.detail = `${facts.detail} \xB7 ${row.detail}`;
      }
      continue;
    }
    pushShortfallIfNeeded(out, input, source, g.totalOwed, cardNames, untilISO);
  }
  for (const a of input.accounts) {
    if (a.is_archived || !SPENDABLE_TYPES.has(a.type)) continue;
    if (sourcesSeen.has(a.id)) continue;
    if (negativeReported.has(a.id)) continue;
    pushShortfallIfNeeded(out, input, a, 0, [], untilISO);
  }
  return out;
}

// src/features/notifications/rules/debtRules.ts
var DUE_SOON_DAYS = 7;
var GROUP_FROM = 3;
var DEBTS_ROUTE = "/debts";
function label(d) {
  return d.direction === "i_owe" ? `M\xECnh n\u1EE3 ${d.counterparty}` : `${d.counterparty} n\u1EE3 m\xECnh`;
}
function lines(list, type, severity, one, many) {
  if (list.length === 0) return [];
  if (list.length >= GROUP_FROM) {
    return [
      {
        key: `${type}:group`,
        kind: "action",
        type,
        severity,
        title: many(list.length),
        to: DEBTS_ROUTE
      }
    ];
  }
  return list.map((d) => ({
    key: `${type}:${d.id}`,
    kind: "action",
    type,
    severity,
    title: one(d),
    onISO: d.due_on ?? void 0,
    to: DEBTS_ROUTE
  }));
}
function debtRules(input) {
  const open = input.debts.filter((d) => d.status === "open" && d.due_on);
  const overdue = [];
  const dueSoon = [];
  for (const d of open) {
    const days = daysBetween(input.todayISO, d.due_on);
    if (days < 0) overdue.push(d);
    else if (days <= DUE_SOON_DAYS) dueSoon.push(d);
  }
  return [
    ...lines(
      overdue,
      "debt-overdue",
      "high",
      (d) => `${label(d)} ${input.formatMoney(d.principal, d.currency)} \u2014 qu\xE1 h\u1EA1n ${-daysBetween(input.todayISO, d.due_on)} ng\xE0y`,
      (n) => `${n} kho\u1EA3n n\u1EE3 \u0111\xE3 qu\xE1 h\u1EA1n`
    ),
    ...lines(
      dueSoon,
      "debt-due-soon",
      "medium",
      (d) => {
        const days = daysBetween(input.todayISO, d.due_on);
        const when = days === 0 ? "h\xF4m nay" : `trong ${days} ng\xE0y`;
        return `${label(d)} ${input.formatMoney(d.principal, d.currency)} \u2014 \u0111\u1EBFn h\u1EA1n ${when}`;
      },
      (n) => `${n} kho\u1EA3n n\u1EE3 s\u1EAFp \u0111\u1EBFn h\u1EA1n`
    )
  ];
}

// src/features/notifications/rules/billRules.ts
function billRules(input) {
  const ruleById = new Map(input.recurringRules.map((r) => [r.id, r]));
  const out = [];
  for (const b of billStatuses(input.recurringRules, input.todayISO)) {
    const rule = ruleById.get(b.ruleId);
    if (!rule) continue;
    const money = input.formatMoney(rule.amount, input.currencyOf(rule.account_id));
    const ten = rule.note.trim() || "Kho\u1EA3n \u0111\u1ECBnh k\u1EF3";
    out.push({
      // dueISO trong mã: xác nhận xong kỳ này thì kỳ sau là một tin MỚI, không bị
      // "đã đọc" của kỳ trước làm im.
      key: `bill-due:${b.ruleId}:${b.dueISO}`,
      kind: "action",
      type: "bill-due",
      // Quá hạn là mức đỏ: nó nổi lên cả dải nhắc ở đầu Sổ, vì quên gửi tiền về nhà
      // không phải thứ chờ tới lúc mở chuông mới biết.
      severity: b.daysLeft < 0 ? "high" : b.daysLeft === 0 ? "medium" : "low",
      title: b.daysLeft < 0 ? `Ch\u01B0a ghi "${ten}" ${money}` : b.daysLeft === 0 ? `H\xF4m nay t\u1EDBi h\u1EA1n "${ten}" ${money}` : `${b.daysLeft} ng\xE0y n\u1EEFa t\u1EDBi h\u1EA1n "${ten}" ${money}`,
      detail: detailOf(b.daysLeft, b.overdueCount),
      onISO: b.dueISO,
      // Mở thẳng form đã điền sẵn theo quy tắc + đúng kỳ đang nợ. Dẫn về danh sách
      // quy tắc thì người dùng còn phải tự tìm lại đúng dòng vừa được nhắc.
      to: `/entry?rule=${b.ruleId}&on=${b.dueISO}`
    });
  }
  return out;
}
function detailOf(daysLeft, overdueCount) {
  if (daysLeft > 0) return "Ghi tr\u01B0\u1EDBc c\u0169ng \u0111\u01B0\u1EE3c \u2014 b\u1EA5m \u0111\u1EC3 m\u1EDF form \u0111\xE3 \u0111i\u1EC1n s\u1EB5n.";
  if (overdueCount > 1) return `\u0110ang n\u1EE3 ${overdueCount} k\u1EF3 ch\u01B0a ghi. B\u1EA5m \u0111\u1EC3 ghi k\u1EF3 c\u0169 nh\u1EA5t.`;
  if (daysLeft === 0) return "B\u1EA5m \u0111\u1EC3 m\u1EDF form \u0111\xE3 \u0111i\u1EC1n s\u1EB5n, s\u1EEDa s\u1ED1 ti\u1EC1n r\u1ED3i l\u01B0u.";
  return `Qu\xE1 h\u1EA1n ${-daysLeft} ng\xE0y. B\u1EA5m \u0111\u1EC3 m\u1EDF form \u0111\xE3 \u0111i\u1EC1n s\u1EB5n.`;
}

// src/features/planned/planned.ts
function daysUntil(fromISO, toISO) {
  const a = Date.parse(fromISO + "T00:00:00Z");
  const b = Date.parse(toISO + "T00:00:00Z");
  return Math.round((b - a) / 864e5);
}
function plannedDue(rows, todayISO) {
  const out = [];
  for (const r of rows) {
    if (r.status !== "planned") continue;
    if (r.remind_days_before === null) continue;
    const daysLeft = daysUntil(todayISO, r.due_on);
    if (daysLeft > r.remind_days_before) continue;
    out.push({
      id: r.id,
      title: r.title,
      dueISO: r.due_on,
      daysLeft,
      amount: r.amount,
      currency: r.currency
    });
  }
  return out.sort((a, b) => a.dueISO < b.dueISO ? -1 : a.dueISO > b.dueISO ? 1 : 0);
}

// src/features/notifications/rules/plannedRules.ts
function plannedRules(input) {
  if (!input.plannedExpenses) return [];
  return plannedDue(input.plannedExpenses, input.todayISO).map((d) => {
    const money = d.amount > 0 ? ` ${input.formatMoney(d.amount, d.currency)}` : "";
    return {
      // KHÔNG có phần kỳ trong mã: khoản một lần chỉ tới hạn đúng một lần, và đọc
      // xong vẫn phải bám tới khi được đánh dấu đã chi (kind = 'action').
      key: `planned-due:${d.id}`,
      kind: "action",
      type: "planned-due",
      // Quá hạn là mức đỏ — nổi lên cả dải nhắc ở đầu Sổ.
      severity: d.daysLeft < 0 ? "high" : d.daysLeft === 0 ? "medium" : "low",
      title: d.daysLeft < 0 ? `Ch\u01B0a chi "${d.title}"${money}` : d.daysLeft === 0 ? `H\xF4m nay t\u1EDBi h\u1EA1n "${d.title}"${money}` : `${d.daysLeft} ng\xE0y n\u1EEFa t\u1EDBi h\u1EA1n "${d.title}"${money}`,
      detail: d.daysLeft < 0 ? `Qu\xE1 h\u1EA1n ${-d.daysLeft} ng\xE0y. B\u1EA5m \u0111\u1EC3 ghi kho\u1EA3n n\xE0y.` : "B\u1EA5m \u0111\u1EC3 ghi kho\u1EA3n n\xE0y, ho\u1EB7c d\u1EDDi h\u1EA1n / b\u1ECF n\u1EBFu kh\xF4ng c\u1EA7n n\u1EEFa.",
      onISO: d.dueISO,
      to: "/planned"
    };
  });
}

// src/features/notifications/rules/budgetRules.ts
var PACE_GAP = 0.25;
var PACE_MIN_ELAPSED = 1 / 3;
var PACE_MIN_SHARE = 0.05;
var BUDGET_ROUTE = "/budget";
function budgetRules(input) {
  const report = input.budgetReport;
  if (!report) return [];
  if (report.hasMissingRate) return [];
  const out = [];
  const nameOf = (id) => input.categories.find((c) => c.id === id)?.name ?? "Danh m\u1EE5c \u0111\xE3 x\xF3a";
  const monthKey = monthKeyForDate(input.todayISO, input.monthStartDay);
  const range = getMonthRange(monthKey, input.monthStartDay);
  const totalDays = daysBetween(range.start, range.end);
  const elapsedDays = daysBetween(range.start, input.todayISO);
  const elapsed = totalDays > 0 ? Math.min(1, Math.max(0, elapsedDays / totalDays)) : 0;
  const realLines = report.lines.filter((l) => !l.isMarker && l.budgeted > 0);
  const totalBudgeted = report.totalBudgeted;
  for (const l of realLines) {
    const children = input.categories.filter(
      (c) => c.parent_id === l.categoryId && !c.is_archived
    );
    if (l.spent > l.budgeted) {
      const over = input.formatMoney(l.spent - l.budgeted, input.base);
      const usage = `\u0110\xE3 ti\xEAu ${input.formatMoney(l.spent, input.base)} / ${input.formatMoney(l.budgeted, input.base)}`;
      if (children.length > 0) {
        const topChildren = children.map((c) => ({ name: c.name, spent: report.spentByCategory.get(c.id) ?? 0 })).filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 2);
        const blame = topChildren.length > 0 ? ` \u2014 ch\u1EE7 y\u1EBFu do ${topChildren.map((c) => c.name).join(" v\xE0 ")}` : "";
        out.push({
          key: `budget-parent-over:${l.categoryId}`,
          kind: "action",
          type: "budget-parent-over",
          severity: "high",
          title: `Nh\xF3m ${nameOf(l.categoryId)} v\u01B0\u1EE3t tr\u1EA7n ${over}${blame}`,
          detail: usage,
          to: BUDGET_ROUTE
        });
      } else {
        out.push({
          key: `budget-over:${l.categoryId}`,
          kind: "action",
          type: "budget-over",
          severity: "high",
          title: `${nameOf(l.categoryId)} \u0111\xE3 v\u01B0\u1EE3t ng\xE2n s\xE1ch ${over}`,
          detail: usage,
          to: BUDGET_ROUTE
        });
      }
      continue;
    }
    if (elapsed < PACE_MIN_ELAPSED) continue;
    if (totalBudgeted > 0 && l.budgeted / totalBudgeted < PACE_MIN_SHARE) continue;
    const spentRatio = l.spent / l.budgeted;
    if (spentRatio - elapsed <= PACE_GAP) continue;
    out.push({
      key: `budget-pace:${l.categoryId}`,
      kind: "action",
      type: "budget-pace",
      severity: "medium",
      // Gọi tên y như nhánh "đã vượt" ở trên: cùng một danh mục mà lúc thì "Nhóm Sinh
      // hoạt", lúc thì "Sinh hoạt" thì người dùng tưởng là hai chỗ khác nhau.
      title: `${children.length > 0 ? "Nh\xF3m " : ""}${nameOf(l.categoryId)} ti\xEAu nhanh h\u01A1n nh\u1ECBp`,
      detail: `M\u1EDBi qua ${Math.round(elapsed * 100)}% th\xE1ng \u0111\xE3 d\xF9ng ${Math.round(spentRatio * 100)}% h\u1EA1n m\u1EE9c (${input.formatMoney(l.spent, input.base)} / ${input.formatMoney(l.budgeted, input.base)})`,
      to: BUDGET_ROUTE
    });
  }
  return out;
}

// src/features/notifications/rules/tagRules.ts
function tagRules(input) {
  if (!input.tagBudgets) return [];
  const out = [];
  for (const l of input.tagBudgets) {
    if (l.status !== "over") continue;
    const over = Math.round(l.spent - l.budget);
    out.push({
      // Kỳ 'monthly' phải có phần kỳ trong mã, nếu không thì tháng sau vẫn im vì
      // người dùng đã đọc tin của tháng này. Kỳ 'total' KHÔNG có kỳ — nó vượt một
      // lần rồi vượt mãi, và đọc xong là xong, không có mốc nào để hiện lại.
      key: l.period === "monthly" ? `tag-budget-over:${l.tagId}:${monthKeyOf(input)}` : `tag-budget-over:${l.tagId}`,
      kind: "action",
      type: "tag-budget-over",
      severity: "medium",
      title: `Nh\xE3n "${l.name}" v\u01B0\u1EE3t tr\u1EA7n ${input.formatMoney(over, input.base)}`,
      detail: l.period === "monthly" ? `Th\xE1ng n\xE0y ${input.formatMoney(Math.round(l.spent), input.base)} / tr\u1EA7n ${input.formatMoney(l.budget, input.base)}.` : `C\u1EA3 \u0111\u1EE3t ${input.formatMoney(Math.round(l.spent), input.base)} / d\u1EF1 tr\xF9 ${input.formatMoney(l.budget, input.base)}.`,
      to: "/budget"
    });
  }
  return out;
}
function monthKeyOf(input) {
  const [y, m, d] = input.todayISO.split("-").map(Number);
  const shift = d < input.monthStartDay ? -1 : 0;
  const total = y * 12 + (m - 1) + shift;
  const year = Math.floor(total / 12);
  const month = total % 12 + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

// src/features/notifications/rules/cardRules.ts
var pad4 = (n) => String(n).padStart(2, "0");
var daysInMonth2 = (year, month) => new Date(year, month, 0).getDate();
function cardRules(input) {
  const [y, m, d] = input.todayISO.split("-").map(Number);
  const lastDay = daysInMonth2(y, m);
  const out = [];
  for (const a of input.accounts) {
    if (a.type !== "card" || a.is_archived) continue;
    if (a.statement_day == null) continue;
    const closeDay = Math.min(a.statement_day, lastDay);
    if (d !== closeDay) continue;
    out.push({
      key: `card-statement-day:${a.id}:${y}-${pad4(m)}`,
      kind: "info",
      type: "card-statement-day",
      severity: "low",
      title: `H\xF4m nay ${a.name} ch\u1ED1t sao k\xEA`,
      detail: "Mua t\u1EEB mai s\u1EBD tr\u1EA3 v\xE0o k\u1EF3 th\xE1ng sau.",
      onISO: input.todayISO,
      to: `/assets/account/${a.id}`
    });
  }
  return out;
}

// src/lib/recurringRadar.ts
function ruleKey(type, accountId, categoryId, amount) {
  return `${type}|${accountId}|${categoryId ?? ""}|${amount}`;
}
function median(sorted) {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
var daysBetween2 = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
function commonNote(notes) {
  const count = /* @__PURE__ */ new Map();
  for (const n of notes) {
    const t = n.trim();
    if (t) count.set(t, (count.get(t) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [n, c] of count) {
    if (c > bestN) {
      best = n;
      bestN = c;
    }
  }
  return best;
}
function detectRecurring(txs, existingKeys, todayISO, opts = {}) {
  const minOccurrences = opts.minOccurrences ?? 3;
  const activeWithinDays = opts.activeWithinDays ?? 45;
  const groups = /* @__PURE__ */ new Map();
  for (const t of txs) {
    if (t.type !== "expense" && t.type !== "income") continue;
    if (t.is_debt_flow || t.exclude_from_stats || t.recurring_rule_id || t.is_refund) continue;
    const key = ruleKey(t.type, t.account_id, t.category_id, t.amount);
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  const out = [];
  for (const [key, arr] of groups) {
    if (arr.length < minOccurrences || existingKeys.has(key)) continue;
    const dates = arr.map((t) => t.occurred_on).sort();
    const lastDate = dates[dates.length - 1];
    if (daysBetween2(lastDate, todayISO) > activeWithinDays) continue;
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween2(dates[i - 1], dates[i]));
    const med = median([...gaps].sort((a, b) => a - b));
    let frequency = null;
    if (med >= 25 && med <= 35) frequency = "monthly";
    else if (med >= 6 && med <= 8) frequency = "weekly";
    if (!frequency) continue;
    const first = arr[0];
    out.push({
      key,
      type: first.type,
      account_id: first.account_id,
      category_id: first.category_id,
      amount: first.amount,
      note: commonNote(arr.map((t) => t.note)),
      frequency,
      occurrences: arr.length,
      lastDate
    });
  }
  out.sort((a, b) => b.occurrences - a.occurrences);
  return out;
}

// src/features/reports/aggregate.ts
var expenseSign = (t) => t.is_refund ? -1 : 1;

// src/features/notifications/rules/rhythmRules.ts
var STALE_DAYS = 3;
var MILESTONES = [25, 50, 75, 100];
var RECORD_MIN_SNAPSHOTS = 3;
function isoWeekKey(iso2) {
  const d = /* @__PURE__ */ new Date(iso2 + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 864e5));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
function rhythmRules(input) {
  const out = [];
  if (input.recentTxs.length > 0) {
    const lastISO = input.recentTxs.reduce(
      (m, t) => t.occurred_on > m ? t.occurred_on : m,
      input.recentTxs[0].occurred_on
    );
    const idle = daysBetween(lastISO, input.todayISO);
    if (idle >= STALE_DAYS) {
      out.push({
        key: `stale-entry:${isoWeekKey(input.todayISO)}`,
        kind: "info",
        type: "stale-entry",
        severity: "low",
        title: `\u0110\xE3 ${idle} ng\xE0y ch\u01B0a ghi giao d\u1ECBch n\xE0o`,
        to: "/entry"
      });
    }
  }
  const existingKeys = new Set(
    input.recurringRules.map((r) => ruleKey(r.type, r.account_id, r.category_id, r.amount))
  );
  for (const s of detectRecurring(input.recentTxs, existingKeys, input.todayISO)) {
    out.push({
      key: `recurring-suggestion:${s.key}`,
      kind: "info",
      type: "recurring-suggestion",
      severity: "low",
      title: `Th\u1EA5y ${input.formatMoney(s.amount, input.currencyOf(s.account_id))} tr\u1EA3 \u0111\u1EC1u ${s.frequency === "weekly" ? "m\u1ED7i tu\u1EA7n" : "m\u1ED7i th\xE1ng"}${s.note ? ` cho "${s.note}"` : ""}`,
      detail: "T\u1EA1o quy t\u1EAFc \u0111\u1ECBnh k\u1EF3 \u0111\u1EC3 kh\u1ECFi ph\u1EA3i ghi tay m\u1ED7i k\u1EF3?",
      to: "/recurring"
    });
  }
  const balanceOf = new Map(input.accounts.map((a) => [a.id, a.balance]));
  for (const g of input.savingsGoals) {
    if (g.target_amount <= 0) continue;
    const have = balanceOf.get(g.account_id) ?? 0;
    const pct2 = have / g.target_amount * 100;
    const reached = MILESTONES.filter((m) => pct2 >= m);
    if (reached.length === 0) continue;
    const top = reached[reached.length - 1];
    out.push({
      key: `savings-milestone:${g.id}:${top}`,
      kind: "info",
      type: "savings-milestone",
      severity: "low",
      title: `${g.name} \u0111\xE3 \u0111\u1EA1t ${top}% m\u1EE5c ti\xEAu`,
      detail: `${input.formatMoney(have, input.currencyOf(g.account_id))} / ${input.formatMoney(g.target_amount, input.currencyOf(g.account_id))}`,
      to: "/assets"
    });
  }
  if (input.networthSnapshots.length >= RECORD_MIN_SNAPSHOTS) {
    const sorted = [...input.networthSnapshots].sort(
      (a, b) => a.snapshot_on.localeCompare(b.snapshot_on)
    );
    const latest = sorted[sorted.length - 1];
    const isRecord = sorted.slice(0, -1).every((s) => s.net_worth < latest.net_worth);
    if (isRecord) {
      const key = monthKeyString(monthKeyForDate(latest.snapshot_on, input.monthStartDay));
      out.push({
        key: `networth-record:${key}`,
        kind: "info",
        type: "networth-record",
        severity: "low",
        title: `T\xE0i s\u1EA3n r\xF2ng cao nh\u1EA5t t\u1EEB tr\u01B0\u1EDBc t\u1EDBi nay: ${input.formatMoney(latest.net_worth, input.base)}`,
        to: "/assets"
      });
    }
  }
  const thisMonth = monthKeyForDate(input.todayISO, input.monthStartDay);
  const thisRange = getMonthRange(thisMonth, input.monthStartDay);
  if (thisRange.start === input.todayISO) {
    const prev = addMonths(thisMonth, -1);
    const prevRange = getMonthRange(prev, input.monthStartDay);
    let spent = 0;
    let earned = 0;
    let missingRate = false;
    for (const t of input.recentTxs) {
      if (t.occurred_on < prevRange.start || t.occurred_on >= prevRange.end) continue;
      if (t.exclude_from_stats || t.is_debt_flow) continue;
      if (t.type !== "expense" && t.type !== "income") continue;
      const v = convertToBase(t.amount, input.currencyOf(t.account_id), input.base, input.rates);
      if (v === null) {
        missingRate = true;
        break;
      }
      if (t.type === "expense") spent += v * expenseSign(t);
      else earned += v;
    }
    if (!missingRate) {
      out.push({
        key: `monthly-summary:${monthKeyString(prev)}`,
        kind: "info",
        type: "monthly-summary",
        severity: "low",
        title: `Th\xE1ng ${prev.month}: chi ${input.formatMoney(spent, input.base)}, thu ${input.formatMoney(earned, input.base)}`,
        detail: `\u0110\u1EC3 d\xE0nh ${input.formatMoney(earned - spent, input.base)}`,
        to: "/reports"
      });
    }
  }
  return out;
}

// src/features/lifetime/project.ts
function convertLifetimeMinor(minor, from, to, fxMajor) {
  if (from === to) return minor;
  const fromMajor = minor / 10 ** CURRENCIES[from].decimals;
  return Math.round(fromMajor * fxMajor * 10 ** CURRENCIES[to].decimals);
}
function phaseForYear(sorted, year) {
  let found = sorted[0];
  for (const p of sorted) {
    if (p.startYear <= year) found = p;
    else break;
  }
  return found;
}
function projectLifetime(input) {
  const {
    currentYear,
    birthYear,
    endAge,
    displayCurrency,
    startingAssetsMinor,
    realReturnBps,
    bandSpreadBps,
    inflationBps,
    nominalTerms,
    phases,
    events
  } = input;
  if (phases.length === 0) return [];
  const sortedPhases = [...phases].sort((a, b) => a.startYear - b.startYear);
  const lastYear = birthYear + endAge;
  if (lastYear < currentYear) return [];
  const inflation = nominalTerms ? inflationBps / 1e4 : 0;
  const rates = [realReturnBps, realReturnBps - bandSpreadBps, realReturnBps + bandSpreadBps].map(
    (bps) => {
      const real = bps / 1e4;
      return nominalTerms ? (1 + real) * (1 + inflation) - 1 : real;
    }
  );
  const assets = [startingAssetsMinor, startingAssetsMinor, startingAssetsMinor];
  const out = [];
  for (let year = currentYear; year <= lastYear; year++) {
    const phase = phaseForYear(sortedPhases, year) ?? sortedPhases[0];
    const infl = (1 + inflation) ** (year - currentYear);
    const incomeMinor = Math.round(
      convertLifetimeMinor(
        phase.annualIncomeMinor,
        phase.currency,
        displayCurrency,
        phase.fxToDisplay
      ) * infl
    );
    const expenseMinor = Math.round(
      convertLifetimeMinor(
        phase.annualExpenseMinor,
        phase.currency,
        displayCurrency,
        phase.fxToDisplay
      ) * infl
    );
    const yearEvents = [];
    for (const e of events) {
      if (e.startYear > year) continue;
      if (e.endYear !== null && e.endYear < year) continue;
      const converted = convertLifetimeMinor(
        e.amountMinor,
        e.currency,
        displayCurrency,
        e.fxToDisplay
      );
      yearEvents.push({
        id: e.id,
        label: e.label,
        kind: e.kind,
        amountDisplayMinor: Math.round(converted * (e.inflate ? infl : 1))
      });
    }
    const eventIncome = yearEvents.filter((e) => e.kind === "income").reduce((s, e) => s + e.amountDisplayMinor, 0);
    const eventExpense = yearEvents.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amountDisplayMinor, 0);
    const netFlowMinor = incomeMinor + eventIncome - expenseMinor - eventExpense;
    for (let i = 0; i < assets.length; i++) {
      assets[i] = Math.round(assets[i] * (1 + rates[i])) + netFlowMinor;
    }
    out.push({
      year,
      age: year - birthYear,
      country: phase.country,
      phaseLabel: phase.label,
      incomeMinor,
      expenseMinor,
      events: yearEvents,
      netFlowMinor,
      assetsEndMinor: assets[0],
      // Trùm CẢ BA nhánh, kể cả nhánh trung tâm assets[0]: khi tài sản xuyên qua 0 thì
      // trung tâm có thể chạy ra ngoài hai nhánh biên. Xem JSDoc assetsPessimisticMinor.
      assetsPessimisticMinor: Math.min(assets[0], assets[1], assets[2]),
      assetsOptimisticMinor: Math.max(assets[0], assets[1], assets[2])
    });
  }
  return out;
}

// src/features/lifetime/insights.ts
function firstNegativeYear(rows, branch) {
  for (const r of rows) {
    const v = branch === "low" ? r.assetsPessimisticMinor : r.assetsEndMinor;
    if (v < 0) return r.year;
  }
  return null;
}

// src/features/notifications/rules/lifetimeRules.ts
var DRIFT_THRESHOLD = 0.15;
var WINDOW_DAYS = RECENT_TXS_DAYS;
var MIN_WINDOW_DAYS = 30;
function lifetimeRules(input) {
  const lt = input.lifetime;
  if (!lt) return [];
  const currentYear = Number(input.todayISO.slice(0, 4));
  const sorted = [...lt.phases].sort((a, b) => a.startYear - b.startYear);
  if (sorted.length === 0) return [];
  const phase = phaseForYear(sorted, currentYear);
  if (!phase || phase.annualExpenseMinor <= 0) return [];
  const windowTxs = input.recentTxs.filter((t) => {
    const days2 = daysBetween(t.occurred_on, input.todayISO);
    return (t.type === "expense" || t.type === "income") && !t.exclude_from_stats && !t.is_debt_flow && input.currencyOf(t.account_id) === phase.currency && days2 >= 0 && days2 <= WINDOW_DAYS;
  });
  if (windowTxs.length === 0) return [];
  const oldest = windowTxs.reduce(
    (m, t) => t.occurred_on < m ? t.occurred_on : m,
    windowTxs[0].occurred_on
  );
  const days = daysBetween(oldest, input.todayISO);
  if (days < MIN_WINDOW_DAYS) return [];
  let planRowsCache = null;
  const planRows = () => planRowsCache ??= projectLifetime(lt);
  function consequenceOf(actualRows) {
    const planNeg = firstNegativeYear(planRows(), "low");
    const actualNeg = firstNegativeYear(actualRows, "low");
    if (actualNeg === null && planNeg !== null) return `M\u1ED1c \xE2m ${planNeg} bi\u1EBFn m\u1EA5t.`;
    if (actualNeg === null) return "B\u1EA3n chi\u1EBFu v\u1EABn kh\xF4ng n\u0103m n\xE0o \xE2m.";
    if (planNeg === null) return `V\u1EDBi m\u1EE9c n\xE0y, t\xE0i s\u1EA3n c\xF3 th\u1EC3 \xE2m t\u1EEB ${actualNeg}.`;
    if (actualNeg !== planNeg) return `M\u1ED1c \xE2m d\u1ECBch t\u1EEB ${planNeg} sang ${actualNeg}.`;
    return `M\u1ED1c \xE2m v\u1EABn \u1EDF ${actualNeg}.`;
  }
  const out = [];
  const expenseSum = windowTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount * expenseSign(t), 0);
  if (expenseSum > 0) {
    const actualAnnual = Math.round(expenseSum / days * 365);
    const planned = phase.annualExpenseMinor;
    const drift = (actualAnnual - planned) / planned;
    if (Math.abs(drift) >= DRIFT_THRESHOLD) {
      const actualRows = projectLifetime({
        ...lt,
        // So bằng THAM CHIẾU (`p === phase`), không bằng `p.startYear`: `sorted` là bản
        // sao của mảng nên nó giữ ĐÚNG các object của `lt.phases`, và `phase` là một
        // trong số đó — so tham chiếu vừa chính xác vừa rẻ hơn. So theo giá trị chỉ an
        // toàn nhờ `unique (scenario_id, start_year)` của Postgres; `demoRepo` không
        // ràng buộc gì, nên dữ liệu demo có hai chặng cùng `start_year` sẽ bị GHI ĐÈ CẢ HAI.
        phases: lt.phases.map((p) => p === phase ? { ...p, annualExpenseMinor: actualAnnual } : p)
      });
      const pct2 = Math.abs(Math.round(drift * 100));
      const direction = drift > 0 ? "cao h\u01A1n" : "th\u1EA5p h\u01A1n";
      out.push({
        // Việc-cần-làm → mã KHÔNG chứa kỳ, để một việc chỉ báo một lần tới khi hết.
        key: "lifetime-drift:current",
        kind: "action",
        type: "lifetime-drift",
        severity: "low",
        title: `Chi th\u1EF1c t\u1EBF ${direction} k\u1EBF ho\u1EA1ch ${pct2}%`,
        // Nói RA con số và cửa sổ đã dùng. Không có nó thì "cao hơn 83%" là một tỷ lệ
        // không ai kiểm lại được: người dùng không biết luật đã lấy bao nhiêu ngày và
        // ra bao nhiêu một năm, nên cũng không phát hiện được lúc nó tính sai.
        detail: `Quy n\u0103m ${input.formatMoney(actualAnnual, phase.currency)} theo ${days} ng\xE0y g\u1EA7n \u0111\xE2y. ` + consequenceOf(actualRows),
        to: "/assets?view=future"
      });
    }
  }
  const incomeSum = windowTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  if (incomeSum > 0) {
    const actualAnnual = Math.round(incomeSum / days * 365);
    const planned = phase.annualIncomeMinor;
    let title = null;
    if (planned > 0) {
      const drift = (actualAnnual - planned) / planned;
      if (Math.abs(drift) >= DRIFT_THRESHOLD) {
        const pct2 = Math.abs(Math.round(drift * 100));
        title = `Thu th\u1EF1c t\u1EBF ${drift > 0 ? "cao h\u01A1n" : "th\u1EA5p h\u01A1n"} k\u1EBF ho\u1EA1ch ${pct2}%`;
      }
    } else if (actualAnnual >= DRIFT_THRESHOLD * phase.annualExpenseMinor) {
      title = "S\u1ED5 c\xF3 thu nh\u1EADp, k\u1EBF ho\u1EA1ch \u0111ang \u0111\u1EC3 thu 0";
    }
    if (title !== null) {
      const actualRows = projectLifetime({
        ...lt,
        phases: lt.phases.map((p) => p === phase ? { ...p, annualIncomeMinor: actualAnnual } : p)
      });
      out.push({
        key: "lifetime-drift:income",
        kind: "action",
        type: "lifetime-drift",
        severity: "low",
        title,
        detail: `Quy n\u0103m ${input.formatMoney(actualAnnual, phase.currency)} theo ${days} ng\xE0y g\u1EA7n \u0111\xE2y. ` + consequenceOf(actualRows),
        to: "/assets?view=future"
      });
    }
  }
  return out;
}

// src/features/categories/flowCategories.ts
var DEBT_FLOW_CATEGORY_NAMES = {
  /** chi — mình cho người khác vay */
  lend: "Cho vay",
  /** thu — mình đi vay */
  borrow: "\u0110i vay",
  /** thu — người ta trả lại mình */
  collect: "Thu n\u1EE3",
  /** chi — mình trả nợ */
  repay: "Tr\u1EA3 n\u1EE3"
};
var ADJUST_CATEGORY_NAME = "\u0110i\u1EC1u ch\u1EC9nh s\u1ED1 d\u01B0";
var FLOW_NAMES = /* @__PURE__ */ new Set([
  ...Object.values(DEBT_FLOW_CATEGORY_NAMES),
  ADJUST_CATEGORY_NAME
]);

// src/features/notifications/rules/dataRules.ts
var RECONCILE_STALE_DAYS = 30;
var UNCATEGORIZED_MIN = 3;
function uncategorizedRule(input) {
  const chua = input.recentTxs.filter(
    (t) => t.category_id == null && t.type !== "transfer" && !t.exclude_from_stats
  );
  if (chua.length < UNCATEGORIZED_MIN) return [];
  return [
    {
      // Mã KHÔNG chứa số lượng: thêm một khoản chưa phân loại nữa mà mã đổi thì việc
      // này "mới" trở lại và trạng thái đã ẩn mất tác dụng. Một tình huống, một mã.
      key: "data-uncategorized:all",
      kind: "action",
      type: "data-uncategorized",
      severity: "medium",
      title: `${chua.length} giao d\u1ECBch ch\u01B0a g\u1EAFn danh m\u1EE5c`,
      detail: "B\xE1o c\xE1o v\xE0 ng\xE2n s\xE1ch \u0111ang t\xEDnh thi\u1EBFu ch\u1ED7 n\xE0y.",
      to: "/so"
    }
  ];
}
function reconcileStaleRule(input) {
  const adjustCatIds = new Set(
    input.categories.filter((c) => c.name === ADJUST_CATEGORY_NAME).map((c) => c.id)
  );
  const cutoff = addDaysISO2(input.todayISO, -RECONCILE_STALE_DAYS);
  const lanCuoi = /* @__PURE__ */ new Map();
  for (const t of input.recentTxs) {
    if (t.category_id == null || !adjustCatIds.has(t.category_id)) continue;
    const cu2 = lanCuoi.get(t.account_id);
    if (!cu2 || t.occurred_on > cu2) lanCuoi.set(t.account_id, t.occurred_on);
  }
  const cu = input.accounts.filter(
    (a) => !a.is_archived && !a.is_hidden && a.include_in_totals && (lanCuoi.get(a.id) ?? "") < cutoff
  );
  if (cu.length === 0) return [];
  return [
    {
      key: "data-reconcile:all",
      kind: "action",
      type: "data-reconcile",
      severity: "low",
      title: cu.length === 1 ? `${cu[0].name} ch\u01B0a \u0111\u1ED1i chi\u1EBFu qu\xE1 ${RECONCILE_STALE_DAYS} ng\xE0y` : `${cu.length} t\xE0i kho\u1EA3n ch\u01B0a \u0111\u1ED1i chi\u1EBFu qu\xE1 ${RECONCILE_STALE_DAYS} ng\xE0y`,
      detail: "S\u1ED1 d\u01B0 tr\xEAn m\xE0n c\xF3 th\u1EC3 \u0111\xE3 l\u1EC7ch s\u1ED1 th\u1EADt.",
      to: "/assets"
    }
  ];
}
function dataRules(input) {
  return [...uncategorizedRule(input), ...reconcileStaleRule(input)];
}

// src/features/reports/trends.ts
var DEFAULT_CP = { minSegment: 3, threshold: 2.5, maxPoints: 3 };
var mean = (xs) => xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
function bestSplit(values, from, to, minSegment) {
  let best = null;
  for (let i = from + minSegment; i <= to - minSegment; i++) {
    const a = values.slice(from, i);
    const b = values.slice(i, to);
    const ma = mean(a);
    const mb = mean(b);
    const ss = a.reduce((s, x) => s + (x - ma) ** 2, 0) + b.reduce((s, x) => s + (x - mb) ** 2, 0);
    const df = a.length + b.length - 2;
    if (df <= 0) continue;
    const pooledVar = ss / df;
    const se = Math.sqrt(pooledVar * (1 / a.length + 1 / b.length));
    const score = se === 0 ? ma === mb ? 0 : Number.POSITIVE_INFINITY : Math.abs(mb - ma) / se;
    if (!best || score > best.score) best = { index: i, before: ma, after: mb, score };
  }
  return best;
}
function detectChangePoints(values, opts = {}) {
  const { minSegment, threshold, maxPoints } = { ...DEFAULT_CP, ...opts };
  const found = [];
  const search = (from, to) => {
    if (found.length >= maxPoints || to - from < minSegment * 2) return;
    const cp = bestSplit(values, from, to, minSegment);
    if (!cp || cp.score < threshold) return;
    found.push(cp);
    search(from, cp.index);
    search(cp.index, to);
  };
  search(0, values.length);
  return found.sort((a, b) => a.index - b.index);
}

// src/features/notifications/rules/trendRules.ts
var LEVEL_SHIFT_MIN_MONTHS = 12;
var LEVEL_SHIFT_MIN_SEGMENT = 4;
var LEVEL_SHIFT_MIN_PCT = 15;
var pct = (before, after) => before === 0 ? null : Math.round((after - before) / Math.abs(before) * 100);
function levelShiftRule(input) {
  const series = input.monthlyExpense;
  if (!series || series.length < LEVEL_SHIFT_MIN_MONTHS) return [];
  const values = series.map((p) => p.value);
  const points = detectChangePoints(values, {
    minSegment: LEVEL_SHIFT_MIN_SEGMENT,
    maxPoints: 1
  });
  if (points.length === 0) return [];
  const cp = points[points.length - 1];
  const doi = pct(cp.before, cp.after);
  if (doi === null || Math.abs(doi) < LEVEL_SHIFT_MIN_PCT) return [];
  const len = cp.after > cp.before;
  const ranh = (cp.before + cp.after) / 2;
  const doanSau = values.slice(cp.index);
  const oYen = len ? doanSau.every((v) => v >= ranh) : doanSau.every((v) => v <= ranh);
  if (!oYen) return [];
  const thangGay = series[cp.index].month;
  const soThang = values.length - cp.index;
  const tran = input.budgetReport?.totalBudgeted;
  const vuotTran = tran != null && tran > 0 && cp.after > tran;
  const detail = vuotTran ? `M\u1EE9c m\u1EDBi ${input.formatMoney(Math.round(cp.after), input.base)}/th\xE1ng, cao h\u01A1n t\u1ED5ng h\u1EA1n m\u1EE9c ${input.formatMoney(tran, input.base)}. H\u1EA1n m\u1EE9c \u0111ang \u0111\u1EB7t theo n\u1EBFp c\u0169.` : `Trung b\xECnh ${soThang} th\xE1ng g\u1EA7n \u0111\xE2y ${input.formatMoney(Math.round(cp.after), input.base)}/th\xE1ng, tr\u01B0\u1EDBc \u0111\xF3 ${input.formatMoney(Math.round(cp.before), input.base)}.`;
  return [
    {
      key: `trend-level-shift:${thangGay}`,
      kind: "action",
      type: "trend-level-shift",
      // Không bao giờ 'high': không có hạn chót nào, và một việc "ngồi xuống rồi sửa
      // ngân sách" mà xếp ngang với "mai bị trừ tiền thẻ" là làm hỏng cả thang mức độ.
      severity: "medium",
      title: `M\u1EE9c chi \u0111\u1ED5i h\u1EB3n t\u1EEB ${thangGay} \u2014 ${len ? "t\u0103ng" : "gi\u1EA3m"} ${Math.abs(doi)}%`,
      detail,
      to: "/budget"
    }
  ];
}

// src/features/notifications/rules.ts
var SEVERITY_RANK = { high: 0, medium: 1, low: 2 };
var TYPE_RANK = new Map(NOTIFICATION_TYPES.map((t, i) => [t, i]));
function arrangeNotifications(list, offTypes) {
  const off = new Set(offTypes);
  const sorted = [...list].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return TYPE_RANK.get(a.type) - TYPE_RANK.get(b.type);
  });
  const kept = sorted.filter((n) => !off.has(n.type));
  const actions = kept.filter((n) => n.kind === "action");
  const infos = kept.filter((n) => n.kind === "info");
  return {
    actionsAll: actions,
    infosAll: infos,
    // Lấy từ `sorted`, tức TRƯỚC khi lọc loại đã tắt — CỐ Ý. Dọn dẹp ở AppLayout coi
    // "mã đã lưu mà không có trong allKeys" là việc đã xong và XÓA dòng trạng thái.
    // Nếu allKeys lấy từ `kept` thì tắt "Vượt ngân sách tháng" trong cài đặt sẽ xóa
    // sạch trạng thái đã đọc của budget-over:*, và bật lại là mọi mục đỏ như mới dù
    // người dùng đã đọc từ lâu. Tắt một loại KHÔNG phải là đã xử lý xong việc đó.
    allKeys: sorted.map((n) => n.key)
  };
}
function buildNotifications(input) {
  const all = [
    ...accountRules(input),
    ...debtRules(input),
    ...billRules(input),
    ...plannedRules(input),
    ...budgetRules(input),
    ...tagRules(input),
    ...cardRules(input),
    ...rhythmRules(input),
    ...lifetimeRules(input),
    ...dataRules(input),
    ...levelShiftRule(input)
  ];
  return arrangeNotifications(all, input.offTypes);
}

// src/features/notifications/pushInputPlan.ts
function missingRateCurrencies(accountCurrencies, base, rates) {
  const canKiem = new Set(accountCurrencies);
  canKiem.delete(base);
  return [...canKiem].filter((c) => !Number.isFinite(rates[c])).sort();
}
function earliestNeededDate(todayISO, monthStartDay, recentDays) {
  const thisMonth = monthKeyForDate(todayISO, monthStartDay);
  const prevMonthStart = getMonthRange(
    monthKeyForDate(addDaysISO2(getMonthRange(thisMonth, monthStartDay).start, -1), monthStartDay),
    monthStartDay
  ).start;
  const recentStart = addDaysISO2(todayISO, -recentDays);
  return prevMonthStart < recentStart ? prevMonthStart : recentStart;
}
function splitTxWindows(txs, todayISO, monthStartDay, recentDays) {
  const thisMonth = monthKeyForDate(todayISO, monthStartDay);
  const prevMonth = monthKeyForDate(
    addDaysISO2(getMonthRange(thisMonth, monthStartDay).start, -1),
    monthStartDay
  );
  const recentStart = addDaysISO2(todayISO, -recentDays);
  const monthTxs = [];
  const prevMonthTxs = [];
  const recentTxs = [];
  for (const t of txs) {
    const key = monthKeyForDate(t.occurred_on, monthStartDay);
    if (key.year === thisMonth.year && key.month === thisMonth.month) monthTxs.push(t);
    else if (key.year === prevMonth.year && key.month === prevMonth.month) prevMonthTxs.push(t);
    if (t.occurred_on >= recentStart) recentTxs.push(t);
  }
  return { monthTxs, prevMonthTxs, recentTxs };
}

// src/features/notifications/pushPlan.ts
var PUSH_BODY_ITEMS = 3;
var PUSH_TAG = "sct-viec-can-lam";
var PUSH_LIST_ROUTE = "/?notif=1";
var SEVERITY_RANK2 = { high: 0, medium: 1, low: 2 };
function planPush(actions, stateRows) {
  const pushed = new Set(stateRows.filter((r) => r.pushed_at).map((r) => r.key));
  const fresh = actions.filter((n) => n.kind === "action" && !pushed.has(n.key));
  if (fresh.length === 0) return null;
  const severity = fresh.reduce(
    (worst, n) => SEVERITY_RANK2[n.severity] < SEVERITY_RANK2[worst] ? n.severity : worst,
    "low"
  );
  const keys = fresh.map((n) => n.key);
  if (fresh.length === 1) {
    const only = fresh[0];
    return {
      title: only.title,
      body: only.detail ?? "",
      to: only.to,
      severity,
      tag: PUSH_TAG,
      keys
    };
  }
  const named = fresh.slice(0, PUSH_BODY_ITEMS).map((n) => n.title);
  const rest = fresh.length - named.length;
  const parts = rest > 0 ? [...named, `v\xE0 ${rest} vi\u1EC7c n\u1EEFa`] : named;
  return {
    title: `${fresh.length} vi\u1EC7c c\u1EA7n \u0111\u1EC3 \xFD`,
    body: parts.join(" \xB7 "),
    to: PUSH_LIST_ROUTE,
    severity,
    tag: PUSH_TAG,
    keys
  };
}

// src/lib/pushSchedule.ts
function localPartsIn(nowISO, tz) {
  const at = new Date(nowISO);
  const format = (timeZone) => new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    // h23 là cố ý: mặc định của một số locale trả '24' cho nửa đêm, và '24' thì
    // không so sánh được với push_hour (0..23).
    hourCycle: "h23"
  }).formatToParts(at);
  let parts;
  try {
    parts = format(tz);
  } catch {
    parts = format("UTC");
  }
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour"))
  };
}
function dueForPush(nowISO, pushHour, pushTz, lastSentISO) {
  const now = localPartsIn(nowISO, pushTz);
  if (now.hour < pushHour) return false;
  if (lastSentISO) {
    const last = localPartsIn(lastSentISO, pushTz);
    if (last.date >= now.date) return false;
  }
  return true;
}

// src/features/budgets/progress.ts
function statusOf(ratio) {
  if (ratio >= 1) return "over";
  if (ratio >= 0.8) return "warn";
  return "ok";
}
function buildBudgetReport(budgets, monthTxs, currencyOf, base, rates, parentOf = () => null, carryByCat = /* @__PURE__ */ new Map()) {
  const spentByCat = /* @__PURE__ */ new Map();
  let hasMissingRate = false;
  for (const t of monthTxs) {
    if (t.type !== "expense" || !t.category_id || t.exclude_from_stats) continue;
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
  const budgetedIds = new Set(budgets.map((b) => b.category_id));
  let totalBudgeted = 0;
  let totalSpent = 0;
  let overCount = 0;
  let warnCount = 0;
  const lines2 = [];
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
    lines2.push({ categoryId: b.category_id, budgeted, carried, spent, ratio, status, isMarker });
  }
  lines2.sort((a, b) => b.ratio - a.ratio);
  const totalRatio = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0;
  const totalStatus = statusOf(totalRatio);
  return {
    lines: lines2,
    totalBudgeted,
    totalSpent,
    totalStatus,
    overCount,
    warnCount,
    hasMissingRate,
    spentByCategory: spentByCat
  };
}
function carryFromPreviousMonth(prevBudgets, prevMonthTxs, currencyOf, base, rates, parentOf = () => null) {
  const prev = buildBudgetReport(prevBudgets, prevMonthTxs, currencyOf, base, rates, parentOf);
  const carry = /* @__PURE__ */ new Map();
  for (const line of prev.lines) {
    carry.set(line.categoryId, Math.max(0, line.budgeted - line.spent));
  }
  return carry;
}

// src/features/tags/budget.ts
var spendSign = (r) => r.is_refund ? -1 : 1;
function tagSpendTotals(rows, currencyOf, base, rates, within = () => true) {
  const byTag = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  let hasMissingRate = false;
  for (const r of rows) {
    if (!within(r.occurred_on)) continue;
    const pair = `${r.tag_id}\0${r.transaction_id}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const raw = convertToBase(r.amount, currencyOf(r.account_id), base, rates);
    if (raw === null) {
      hasMissingRate = true;
      continue;
    }
    byTag.set(r.tag_id, (byTag.get(r.tag_id) ?? 0) + raw * spendSign(r));
  }
  return { byTag, hasMissingRate };
}
function buildTagBudgetReport({
  tags,
  rows,
  currencyOf,
  base,
  rates,
  monthStart,
  monthEnd
}) {
  const budgeted = tags.filter((t) => t.budget_amount != null && t.budget_amount > 0);
  if (budgeted.length === 0) return { lines: [], hasMissingRate: false };
  const inMonth = (iso2) => iso2 >= monthStart && iso2 < monthEnd;
  const all = tagSpendTotals(rows, currencyOf, base, rates);
  const month = tagSpendTotals(rows, currencyOf, base, rates, inMonth);
  const lines2 = budgeted.map((t) => {
    const period = t.budget_period;
    const spent = (period === "monthly" ? month.byTag : all.byTag).get(t.id) ?? 0;
    const budget = t.budget_amount;
    const ratio = spent / budget;
    return {
      tagId: t.id,
      name: t.name,
      color: t.color,
      period,
      spent,
      budget,
      ratio,
      remaining: budget - spent,
      status: statusOf(ratio)
    };
  });
  lines2.sort((a, b) => b.ratio - a.ratio);
  return { lines: lines2, hasMissingRate: all.hasMissingRate || month.hasMissingRate };
}

// src/features/lifetime/buildInput.ts
var DEFAULT_INFLATION_BPS = 200;
function pickActive(scenarios) {
  const primaries = scenarios.filter((s) => s.is_primary);
  const pool = primaries.length > 0 ? primaries : scenarios;
  return [...pool].sort((a, b) => a.sort_order - b.sort_order)[0];
}
function buildLifetimeInput(args) {
  const { scenarios, phases: allPhases, events: allEvents, birthYear, todayISO } = args;
  if (!birthYear) return void 0;
  if (!scenarios || !allPhases || !allEvents) return void 0;
  const active = pickActive(scenarios);
  if (!active) return void 0;
  const phases = allPhases.filter((p) => p.scenario_id === active.id).map((p) => ({
    startYear: p.start_year,
    label: p.label,
    country: p.country,
    currency: p.currency,
    annualIncomeMinor: p.annual_income_minor,
    annualExpenseMinor: p.annual_expense_minor,
    fxToDisplay: p.fx_to_display
  }));
  if (phases.length === 0) return void 0;
  const events = allEvents.filter((e) => e.scenario_id === active.id).map((e) => ({
    id: e.id,
    startYear: e.start_year,
    endYear: e.end_year,
    kind: e.kind,
    amountMinor: e.amount_minor,
    currency: e.currency,
    label: e.label,
    fxToDisplay: e.fx_to_display,
    inflate: e.inflate
  }));
  return {
    // Năm hiện tại suy từ `todayISO` chứ KHÔNG gọi `new Date()` ở đây: hook gọi hàm
    // này đã đọc đồng hồ một lần: hai lần đọc trong cùng một lượt render có thể rơi
    // hai bên nửa đêm và cho ra hai năm khác nhau.
    currentYear: Number(todayISO.slice(0, 4)),
    birthYear,
    endAge: active.end_age,
    displayCurrency: active.display_currency,
    startingAssetsMinor: active.starting_assets_minor,
    realReturnBps: active.real_return_bps,
    bandSpreadBps: active.band_spread_bps,
    inflationBps: args.annualInflationBps ?? DEFAULT_INFLATION_BPS,
    nominalTerms: active.nominal_terms,
    phases,
    events
  };
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
export {
  PAGE_SIZE,
  PUSH_LIST_ROUTE,
  PUSH_TAG,
  RECENT_TXS_DAYS,
  addDaysISO2 as addDaysISO,
  addMonths,
  buildBudgetReport,
  buildLifetimeInput,
  buildNotifications,
  buildTagBudgetReport,
  carryFromPreviousMonth,
  dueForPush,
  earliestNeededDate,
  fetchAllPages,
  getMonthRange,
  localPartsIn,
  missingRateCurrencies,
  monthKeyForDate,
  monthKeyString,
  planPush,
  splitTxWindows,
  toISODate
};
