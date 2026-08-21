# Nối Sổ Gạo vào Claude — MCP server

Ngày: 2026-08-21

## Mục tiêu

Cho Claude **thấy những gì các màn hình của app không cho thấy**, rồi hỏi nó bằng
tiếng Việt ở app Claude (Claude Code trên PC trước, điện thoại sau).

Tiêu chí thành công không phải "chat được về tiền" — mà là **trả lời được câu mà app
hiện không trả lời nổi**. Ba loại câu làm mốc:

1. *"Chi vào ngày lễ Nhật có khác ngày thường không?"* — [jpHolidays.ts](../../../src/lib/jpHolidays.ts)
   đã có, chưa màn hình nào dùng nó để soi chi tiêu.
2. *"Tháng nào gửi tiền về VN nhiều thì tiêu ở Nhật có co lại không?"* — hai số ở hai
   tab khác nhau, chỗ nối không tồn tại.
3. *"Khoản tôi ghi muộn ba ngày có to hơn khoản ghi ngay không?"* — `transactions.created_at`
   không màn hình nào hiện.

## Quyết định đã chốt (với user)

- **Chiều nối là app → Claude**, không phải Claude → app. Không có UI chat trong Sổ Gạo,
  app không đổi gì. Chat diễn ra ở app Claude, nên **không tốn API Anthropic** — dùng
  gói người dùng đang trả.
- **MCP server là một function trên Vercel**, không phải Supabase edge function.
  > **Lý do ban đầu đã SAI, sửa lại 2026-08-21 sau bản deploy đầu.** Spec viết: "Vercel chạy
  > Node nên `import` thẳng được `src/*.ts`, không phải bundle". Không đúng: Vercel biên dịch
  > `.ts` sang `.js` nhưng **giữ nguyên chuỗi import**, mà ESM của Node đòi import tương đối
  > phải có đuôi `.js`. Bản deploy đầu tiên trả `500 FUNCTION_INVOCATION_FAILED` với
  > `ERR_MODULE_NOT_FOUND: /var/task/src/mcp/env`. Nên **Vercel cũng phải bundle**, y như Deno
  > — xem `npm run bundle:mcp` và `tests/mcpBundle.test.ts`.
  >
  > Lý do CÒN LẠI để vẫn chọn Vercel thay vì edge function: bundle này để package trong
  > `node_modules` ở ngoài (Vercel tự cài), nên nó 41KB chứ không phải một bản nhồi cả
  > `@supabase/supabase-js` + SDK MCP; và app đã deploy sẵn ở đó nên không thêm chỗ phải trông.
- **Làm hai chặng.** Chặng 1: xác thực bằng bearer token, dùng được ngay trên 2 PC qua
  Claude Code. Chặng 2: thêm OAuth để claude.ai và app điện thoại nhận được connector.
  Logic tool nằm ở module thuần nên chặng 2 chỉ thêm tầng xác thực, không viết lại tool.
- **Trung tâm là một tool truy vấn chéo**, không phải năm tool bọc năm màn hình. Bọc
  màn hình thì Claude chỉ phục vụ lại cái user đã thấy — theo user, đó là phần vô ích nhất.
- **Vẫn phơi báo cáo tháng + ngân sách, nhưng đổi vai: làm mốc đối chiếu.** Khi Claude
  nói một con số mà tab Báo cáo nói số khác, user phải biết được cái nào sai. Phát hiện
  không kiểm chứng được về tiền thì tệ hơn không có phát hiện.
- **Không phơi bảng thô, không cho chạy SQL.** Đã có tiền lệ sai thật: `7dc3834` sửa
  khối 04 dùng rổ giao dịch khác khối 01; bút toán điều chỉnh ¥1.661.218 từng làm mẫu số
  phồng lên (xem chú thích [monthReport.ts:161](../../../src/features/reports/monthReport.ts:161)).
  Claude chạy `select sum(amount)` sẽ ra số trông hợp lý và sai.
- **Server chỉ đọc.** Không có tool nào ghi, sửa, xoá dữ liệu.

## Phạm vi

- Thư mục mới `src/mcp/`: `basket.ts` (dựng rổ giao dịch đúng), `tools/*.ts` (5 tool,
  thuần, có unit test), `format.ts` (hình dạng số tiền trả về).
- Thư mục mới `api/`: `api/_handler.ts` (nguồn) → `api/mcp.js` (bundle đã commit, là function
  thật) — vỏ vận chuyển MCP qua HTTP trên Vercel. Repo hiện
  chưa có `api/`; thêm nó là lần đầu app có endpoint riêng.
- Sửa [README.md](../../../README.md): nguyên tắc *"Không backend riêng"* cần nói rõ nó
  đúng với **đường dữ liệu của app** (client → Supabase, RLS), không còn đúng tuyệt đối.
- Sửa [.mcp.json](../../../.mcp.json): thêm server `so-gao` cạnh `gitnexus`.
- devDependency mới: `@vercel/node` (chỉ để lấy type `VercelRequest`/`VercelResponse`).
  Spec ban đầu ghi `tsx` "để Node nạp được `.ts` từ `src/`" — không cần, vì `src/` được gói
  vào bundle chứ không nạp lúc chạy.

**Không thuộc đợt này:** UI chat trong app · tự phân loại category (spec riêng, đó là
việc duy nhất còn lại thật sự cần nằm trong app) · nhận xét báo cáo tháng sinh sẵn (chat
với Claude còn hơn) · OAuth của chặng 2 (cần phép thử riêng, xem mục H).

## A. Kiến trúc

```
app Claude  ──MCP/HTTP──▶  api/mcp.js  ──▶  src/mcp/tools/*.ts  ──▶  src/mcp/basket.ts
(PC, phone)                (vỏ mỏng:        (thuần, có test)         │
                            xác thực,                               ├─▶ Supabase (chỉ đọc)
                            định tuyến)                             └─▶ hàm sẵn có của app:
                                                                        monthReport.ts,
                                                                        buildBudgetReport,
                                                                        aggregate.ts
```

**Vỏ mỏng là chủ ý.** `api/_handler.ts` chỉ xác thực + định tuyến + trả JSON. Không một luật
tiền nào nằm trong đó, để chặng 2 (OAuth) và một transport khác sau này không phải sửa
gì bên trong.

**Một lệch có chủ ý so với [CLAUDE.md](../../../CLAUDE.md), ghi ra để không ai tưởng là lỗi:**
luật "cửa duy nhất là `hooks/queries.ts`" áp cho `src/features/`. MCP server không phải
React, không dùng hook được — nó đọc Supabase trực tiếp (như 6 script trong `scripts/`
đang làm) rồi nạp vào các hàm **thuần** của app. Cái phải giữ là *không viết lại luật tiền*,
và cách này giữ được: `basket.ts` gọi lại đúng bộ lọc app dùng.

Đọc trọn bảng thì qua [fetchAllPages](../../../src/data/paging.ts) — PostgREST chặn ở 1000 dòng.

## B. Rổ giao dịch — chỗ quyết định số đúng hay sai

`basket.ts` là **chỗ duy nhất** dựng tập giao dịch cho mọi tool. Nó phải:

- Lọc `is_debt_flow` và `exclude_from_stats` — đúng như `sumIncomeExpense` (aggregate.ts)
  và `sumInBase` (ledgerShared.ts).
- Cắt tháng bằng [getMonthRange(key, monthStartDay)](../../../src/lib/dates.ts:25), tôn
  trọng ngày bắt đầu tháng của user. Không tự `startOf('month')`.
- Quy đổi bằng [convertToBase](../../../src/lib/rates.ts:98). Thiếu tỷ giá thì **loại khoản
  đó khỏi tổng và bật cờ**, không bao giờ coi 1:1.

## C. Hình dạng dữ liệu trả về

Ba luật, áp cho mọi tool:

1. **Tiền trả về kèm chuỗi đã format**, không để Claude tự chia đơn vị:
   `{ don_vi: 'JPY', so: 12400, hien: '¥12.400' }`. `so` là số nguyên đơn vị nhỏ nhất,
   đúng như DB.
2. **Mọi tổng kèm cờ thiếu tỷ giá**: `{ thieu_ty_gia: true, so_khoan_bi_loai: 3 }`. Claude
   được dặn phải nói "chưa đủ dữ liệu" khi cờ bật, không cộng bừa.
3. **Mọi trả về nhắc lại phạm vi đã áp**: khoảng ngày thật sau khi cắt tháng, bộ lọc đã
   dùng, số dòng vào rổ. Để Claude phát biểu được giả định của mình thay vì nói như thể
   con số là tuyệt đối.

## D. Tool 1 — `truy_van` (trung tâm)

Claude chọn **đo cái gì** và **xẻ theo chiều nào**, tự do phối. Rổ thì code app dựng, nên
không có đường nào lách được luật ở mục B.

| Tham số | Giá trị |
|---|---|
| `do_luong` | `tong_tien` · `so_lan` · `trung_binh_moi_lan` · `lon_nhat` · `do_tre_ghi` |
| `xe_theo` | tối đa 2 chiều: `danh_muc` · `danh_muc_cha` · `nhan` · `tai_khoan` · `thang` · `tuan` · `thu_trong_tuan` · `gio_nhap` · `ngay_le_nhat` · `co_khoan` · `need_level` · `cost_type` · `la_gui_tien` |
| `loc` | cùng bộ trường trên, cộng `loai` (chi/thu/chuyển) và `tien_te` |
| `khoang` | `tu_thang`/`den_thang`, hoặc `tu_ngay`/`den_ngay` |
| `sap_xep`, `gioi_han` | mặc định tiền giảm dần, 20 dòng |

Giới hạn **2 chiều** là chủ ý: ba chiều trở lên thì bảng nở ra hàng trăm dòng, tốn token
và Claude đọc kém hơn. Cần sâu hơn thì lọc rồi xẻ lại.

`ngay_le_nhat` và `gio_nhap` là hai chiều app **chưa từng** xẻ theo — đây là phần "thấy
cái user không thấy" nằm ngay trong tool trung tâm, không phải phần phụ.

## E. Tool 2 — `thoi_quen_ghi_chep`

Phơi khoảng lệch giữa `occurred_on` (tiền đi) và `created_at` (lúc gõ vào).

Nói cho đúng phạm vi: `transactions.created_at` **không màn hình nào hiện**, nhưng app
**có** dùng nó — làm tiêu chí phá hoà khi sắp giao dịch cùng ngày
([filter.ts:67](../../../src/features/transactions/filter.ts:67), và `supabaseRepo` sắp
theo `occurred_on, created_at, id`). Tức là "lúc user gõ vào" đang lặng lẽ quyết định thứ
tự hiển thị, mà chưa bao giờ được đọc như một dữ kiện. Đó đúng là chỗ tool này lấp.

Trả về: phân bố độ trễ (ghi ngay / 1–2 ngày / 3–7 / hơn tuần), giờ nhập theo khung,
thứ trong tuần, và **danh mục nào hay bị ghi muộn nhất**.

**Đây là dữ liệu về hành vi, không phải về tiền** — nó cho biết user thức khuya hay không,
cuối tuần có mở app không. User đã đồng ý đưa vào đợt đầu sau khi được nói rõ điểm này.

Chồng lấn với `do_luong=do_tre_ghi` của `truy_van` là có chủ ý, và ranh giới là: ở `truy_van`
độ trễ là **một con số** xẻ theo chiều bất kỳ ("danh mục nào ghi muộn nhất"); ở đây là
**phân bố** đầy đủ ("tôi ghi chép kiểu gì").

## F. Tool 3 — `lich_su_ty_gia`

`fx_history` tích dữ liệu từ migration 0029 (cuối tháng 7) và **chưa màn hình nào đọc** —
kế hoạch hồi đó ghi thẳng là để dành cho luật "tỷ giá đẹp" đợt sau. Tool này phơi nó ra
theo khoảng ngày.

Cảnh báo phải ghi vào mô tả tool: `fx_history.rates` và `life_*.fx_to_display` là **hai
chiều ngược nhau** (xem [data-model-matrix.md](../../data-model-matrix.md)). Tool trả
đúng một chiều, và nói rõ chiều nào.

## G. Tool 4+5 — `bao_cao_thang`, `ngan_sach` (mốc đối chiếu)

Gọi lại `monthReport.ts` và `buildBudgetReport` không sửa gì. Rẻ, và tồn tại để con số
của Claude khớp được với màn hình. Xem phép thử bắt buộc ở mục I.

## H. Xác thực

**Chặng 1 — 2 PC.** Bearer token dài trong biến môi trường Vercel, khai trong `.mcp.json`
dạng `{"type":"http","url":…,"headers":{…}}` cạnh `gitnexus`. Server đọc Supabase bằng
service-role key + một `user_id` cố định trong env.

Nói thẳng rủi ro: service-role **đi vòng qua RLS**, nên token đó là toàn bộ hàng rào. Bù
lại, server không có đường ghi nào — token lộ thì thiệt hại là bị đọc, không bị sửa. Token
không nằm trong git.

**Chặng 2 — điện thoại.** Cần OAuth; đây là đòi hỏi của Claude, không phải lựa chọn. Đã
xác nhận từ tài liệu: custom connector có trên gói Team và chạy cả trên app điện thoại,
nhưng **trên Team chỉ Owner thêm được** connector vào tổ chức. User **không phải Owner**,
nên chặng 2 sẽ dùng **tài khoản cá nhân** — gói Free cũng thêm được connector, giới hạn
đúng một cái, mà ta cần đúng một.

**Chưa chốt:** thư viện/cách dựng OAuth provider trên Vercel. Cần một phép thử riêng, rẻ,
trước khi cam kết. Không hứa chi tiết thứ chưa đo.

**Việc của user, ngoài tầm code:** tài khoản cá nhân đi theo điều khoản người dùng thường,
khác Team — trong đó có cài đặt cho phép hay không cho phép dùng hội thoại để huấn luyện.
Nên kiểm tra cài đặt đó trước khi bật connector.

## I. Kiểm thử

Theo lệ repo: `.test.ts` nằm cạnh file, Vitest.

- `basket.test.ts` — lọc `is_debt_flow`/`exclude_from_stats`, cắt tháng theo
  `monthStartDay`, loại khoản thiếu tỷ giá và bật cờ.
- Mỗi tool một file test: từng `do_luong`, từng chiều xẻ, khoảng rỗng, đa tiền tệ.
- **Phép thử bất biến, cái quan trọng nhất:** `truy_van` với `do_luong=tong_tien`,
  `xe_theo=thang` trên một tháng phải **bằng đúng** tổng chi mà `bao_cao_thang` trả cho
  tháng đó. Lệch là một trong hai đang dùng rổ khác — đúng loại lỗi mà `7dc3834` đã sửa
  một lần. Cùng tinh thần với phép thử "tổng ròng mọi dòng = phần để lại của khối 01"
  trong `monthReport.test.ts`.
- Khoảng rỗng phải trả **rỗng kèm lời giải thích**, không trả 0 đồng.

## J. Hỏng thì sao

| Hỏng | Xử lý |
|---|---|
| Token sai/lộ | Đổi biến môi trường Vercel. Không cần deploy lại code. |
| Vercel free tier ngủ | Câu đầu chậm vài giây. Chấp nhận, không giữ ấm bằng cron. |
| Tháng chưa có dữ liệu | Trả rỗng + nói rõ "chưa có giao dịch trong khoảng này". |
| Thiếu tỷ giá | Cờ bật, tool nói số khoản bị loại. Không quy 1:1. |
| Claude ghép sai hai chiều | Phạm vi trả về (mục C.3) cho user tự soát lại. |
| Supabase lỗi | Trả lỗi thật kèm tên bảng, không trả rỗng giả vờ thành công. |

## K. Chi phí

$0 tăng thêm: chat tính vào gói Claude user đã trả, Vercel free tier, không gọi API
Anthropic lần nào. Đây là lý do chọn chiều app → Claude thay vì chat trong app — chat
trong app ước ~$13/tháng ở 100 câu.

## L. Đã biết, cố ý chưa làm

- **Điện thoại chưa dùng được sau chặng 1.** Đây là hạn chế đã biết, không phải lỗi.
- **Ba tool để đợt sau:** số dư tài sản/nợ, khoản định kỳ đang chạy, phát hiện chi bất thường.
  `truy_van` phủ được phần lớn câu hỏi về chúng.
- **`created_at` của `accounts`/`categories`/`budgets`/`tags`** cũng không màn hình nào hiện
  (lịch sử user dựng hệ thống ghi chép của chính mình). Chưa phơi ở đợt này.
- **Không có tool ghi.** Nếu sau này muốn Claude sửa được dữ liệu thì đó là spec khác, và
  phải bàn lại phần xác thực từ đầu.
