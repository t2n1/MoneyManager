<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **MoneyManager** (9423 symbols, 22688 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

Xem [CLAUDE.md](CLAUDE.md#quy-ước-xuyên-module) — mục "Quy ước xuyên module".

Ở đó có 7 luật trải trên nhiều file mà đọc một file lẻ sẽ không thấy: cửa dữ liệu duy nhất
(`hooks/queries.ts` + ngoại lệ auth), migration phải kèm `database.types.ts`, mọi thứ theo tháng
qua `getMonthRange`, thiếu tỷ giá thì loại ra chứ không quy 1:1, sửa luật `src/` thì phải
`npm run bundle:rules`, toán thuần nằm ngoài React, và wiki nằm ở đâu.

Cố tình để một bản duy nhất chứ không copy sang đây: hai bản sao của cùng một bộ luật là chuyện
sớm muộn lệch nhau — cùng lý do `scripts/bundle-rules.mjs` không copy bộ luật sang `supabase/functions`.

<!-- wiki-extract:end -->
