<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **MoneyManager** (21415 symbols, 58052 relationships, 671 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "master"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "master" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/MoneyManager/context` | Codebase overview, check index freshness |
| `gitnexus://repo/MoneyManager/clusters` | All functional areas |
| `gitnexus://repo/MoneyManager/processes` | All execution flows |
| `gitnexus://repo/MoneyManager/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

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
