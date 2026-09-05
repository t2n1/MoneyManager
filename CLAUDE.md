<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **MoneyManager** (9212 symbols, 22198 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "master"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/MoneyManager/context` | Codebase overview, check index freshness |
| `gitnexus://repo/MoneyManager/clusters` | All functional areas |
| `gitnexus://repo/MoneyManager/processes` | All execution flows |
| `gitnexus://repo/MoneyManager/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
<!-- wiki-extract:start — viết tay, KHÔNG phải gitnexus sinh ra. Nằm ngoài marker gitnexus nên sống sót qua `analyze`. -->

# Quy ước xuyên module

Rút từ wiki GitNexus (`.gitnexus/wiki/`, 65 trang, local + gitignore) và **đã đối chiếu code**.
Chỉ giữ những luật trải trên nhiều file — thứ đọc một file lẻ sẽ không thấy. Nguyên tắc sản phẩm
(< 5 giây, không dùng float, `MoneyField`, không backend riêng) nằm ở [README.md](README.md), không nhắc lại.

## Tầng dữ liệu — cửa duy nhất là `hooks/queries.ts`

Code trong `src/features/` gọi dữ liệu qua hook trong [src/hooks/queries.ts](src/hooks/queries.ts), không gọi
`repo` trực tiếp. `repo` được chọn **một lần lúc import** từ `isDemoMode`, nên không có nhánh
`if (demo)` nào trong feature.

- `import type { ... } from '../../data/repo'` là **được** — 5 file trong `features/lifetime` và
  `features/transactions` đang làm vậy. Chỉ cấm gọi *hàm* của repo.
- Ngoại lệ runtime duy nhất là **Supabase Auth**: [AuthProvider.tsx](src/features/auth/AuthProvider.tsx),
  [LoginPage.tsx](src/features/auth/LoginPage.tsx), và `signOut()` trong
  [SettingsPage.tsx:207](src/features/settings/SettingsPage.tsx:207) gọi `getSupabase()` thẳng.
  Đây là auth, không phải truy vấn dữ liệu.
- Mỗi `mutationFn` phải có invalidation nằm ngay cạnh nó trong `queries.ts`.
- Hai bản `Repo` (`supabaseRepo`, `demoRepo`) phải cùng thoả interface — thêm method một bên mà
  quên bên kia là lỗi biên dịch.
- Đọc trọn bảng thì qua `fetchAllPages` ([src/data/paging.ts](src/data/paging.ts)) — PostgREST chặn ở 1000 dòng.

## Đổi schema là đổi hai file

[src/types/database.types.ts](src/types/database.types.ts) **viết tay, không có codegen**. Migration mà không
sửa file này thì compiler vẫn im, query chết lúc chạy. Cùng một commit.

## Mọi thứ theo tháng đi qua `getMonthRange`

[getMonthRange(key, monthStartDay)](src/lib/dates.ts:25) là chỗ duy nhất định nghĩa "một tháng", và nó tôn trọng
cài đặt ngày bắt đầu tháng của người dùng. Tự tính `startOf('month')` là bỏ qua cài đặt đó và ra số sai
lặng lẽ. Chuỗi chuẩn: `BudgetView → useBudgetReport → useMonthTransactions → getMonthRange`.

## Thiếu tỷ giá thì loại ra, không coi là 1:1

[convertToBase](src/lib/rates.ts:98) trả `null` khi thiếu rate. Quy ước toàn repo (69 file dùng `hasMissingRate`):
loại khoản đó khỏi tổng, bật cờ `hasMissingRate`, UI hiện `≈` để nói thẳng là số chưa đủ.
Không bao giờ quy 1:1 — thà thiếu còn hơn bịa.

## Sửa luật trong `src/` thì phải gói lại cho code phía server

Không có gì phía server import trực tiếp từ `src/`. Có **hai** bộ bundle đã commit, hai lệnh
khác nhau — cả hai đều phải sinh lại khi sửa luật tiền trong `src/`.

**Edge function (Deno)** dùng bundle **đã commit**:
`supabase/functions/{push-notify/_rules.js, stock-refresh/_holdings.js, fund-refresh/_funds.js}`.
Sửa luật notification / holdings / funds trong `src/` thì:

```bash
npm run bundle:rules
```

rồi commit luôn file `_*.js` sinh ra. Quên là chuông trong app nói một đằng, edge function nói một nẻo.
Guard: [tests/pushBundle.test.ts](tests/pushBundle.test.ts) fail khi bundle cũ.

**MCP server (Vercel function)** dùng `api/mcp.mjs`, gói từ `api/_handler.ts`:

```bash
npm run bundle:mcp
```

Vercel biên dịch `.ts` sang `.js` nhưng **giữ nguyên chuỗi import**, mà ESM của Node đòi import
tương đối có đuôi — bản deploy đầu tiên chết đúng vì thế (`ERR_MODULE_NOT_FOUND:
/var/task/src/mcp/env`). Nguồn tên `_handler.ts` là cố ý: Vercel bỏ qua file trong `api/` bắt đầu
bằng `_`, nên chỉ có đúng một function. Guard: [tests/mcpBundle.test.ts](tests/mcpBundle.test.ts).

## Đụng tới giao diện thì mở [docs/design-system.md](docs/design-system.md) trước

Đó là **sổ tra cứu**, không phải ghi chép: Phần I có công thức tám bước và một khuôn màn
dán-là-chạy (khuôn đó đã được biên dịch và chạy qua guardrail thật, không phải viết mẫu).

Ba luật hay bị vi phạm nhất, nói luôn ở đây để khỏi phải mở file mới biết:

- **Đừng chêm giá trị tuỳ ý.** Mọi màu, cỡ chữ, bán kính, giãn chữ, thời lượng đều đã có
  tên. `text-[0.8125rem]` từng mọc lên 91 chỗ ở 28 file đúng vì guardrail cũ liệt kê giá
  trị thay vì cấm cả dạng. Cần cỡ chưa có → đặt tên ở `src/index.css` trước.
- **Đừng tự viết `<h1>`, `<h2>`, `<select>`, hay nút nền xanh.** Dùng `<PageHeader>`,
  `<SectionTitle>`, `<Select>`, `<ActionButton>`. Cả bốn đều là ban cứng trong
  `tests/designSystem.test.ts`.
- **Mọi con số đi qua `<Money>` (tiền) hoặc `<Num>` (đếm, %, số tháng).** Khác nhau ở chỗ
  `<Money>` đi qua chế độ riêng tư — che một trục thời gian là con số bên cạnh hết nghĩa.

`npm test` bắt được vi phạm ở mức nguồn, nhưng **không** thấy ba thứ: chế độ Sáng (mặc
định của phiên xem là Tối), cỡ chữ 1,25× ở 375px, và biểu thức JSX bị codemod biến thành
chuỗi (`title="{debt.counterparty}"` — hợp kiểu nên tsc xanh). Phải mở app xem.

## Toán thuần nằm ngoài React

Hàm tính tiền sống trong file `.ts` riêng, không JSX, có unit test (`aggregate.ts`, `amortization.ts`,
`debtPaymentPosting.ts`...). Component render số, không tính số. Feature khác import file thuần này,
không import UI của nhau.

## Wiki

`.gitnexus/wiki/index.html` — 65 trang, mở bằng browser, không commit (`.gitnexus/.gitignore` = `*`).
Regenerate: `node .gitnexus/run.cjs wiki --provider claude --force` (~48 phút).

Wiki do LLM viết nên **không phải nguồn chân lý** — nó không có cơ chế báo cũ như index. Hai chỗ đã
biết là sai: nó nói feature code "never imports from data/repo.ts" và luật này "has no exceptions" —
cả hai đều không đúng, bản đúng ở mục đầu trang này. Mâu thuẫn với code thì tin code.

<!-- wiki-extract:end -->
