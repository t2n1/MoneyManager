# Màn hình 退職金 (はぐくみ企業年金) — bản thiết kế

Ngày 2026-08-26. Chốt với chủ app qua brainstorming. Chưa code gì.

## Câu hỏi màn này trả lời

"Chế độ hưu trí công ty đang bắt tôi tham gia — tôi được gì, mất gì, và tới lúc nghỉ nó
là bao nhiêu."

Hôm nay không màn nào trả lời được. Trang Tài sản đếm ¥50.000 của `退職金` vào tổng, tab
Quỹ Nhật (sau đợt sửa 2026-08-26) hiện một dòng chiếu tới năm nghỉ — nhưng phần "được gì,
mất gì" thì cả app không có, dù dữ liệu để tính đã nằm sẵn trong 59 phiếu lương đã nhập.

**Màn này KHÔNG khuyên đóng bao nhiêu.** Nó hiện số và nguồn của từng số. Mức đóng là
quyết định của người dùng với 基金 hoặc phòng nhân sự — app không phải người tư vấn tài
chính và không được đóng vai đó.

## Chế độ này là gì (đã tra, không đoán)

Nguồn: <https://bpcom.jp/hagukumikikin/> và sheet mô phỏng cá nhân của chủ app (2025-08).

| | |
|---|---|
| Loại | 選択制確定給付企業年金 (DB), cơ chế キャッシュバランスプラン |
| 元本 | 元本保証; thiếu hụt thì chủ doanh nghiệp bù |
| Lãi | 給付利率 đặt theo **từng 事業年度**; 事業年度 2025 = **0,3%/năm**; cộng qua 月次再評価率. Giấy nói rõ không bảo đảm cho tương lai |
| Nguồn tiền | 前払い退職金制度（選択制）— một phần lương chuyển thành 資産形成DB手当, 掛金 trích từ đó |
| Mức đóng | ¥1.000 tới ¥73.000/tháng (プラン③ = MAX). Chủ app đang đóng **¥10.000** |
| Rút | Nhận được cả khi 中途退職, và cả lúc 休職・育児/介護休業 |

Lãi 0,3% nhỏ tới mức gần như không đáng kể. Chính đồ thị của 基金, mức ¥20.000/tháng:

| Đóng | Tiền đóng | Lãi | Lãi/tiền đóng |
|---|---|---|---|
| 3 năm | ¥720.000 | ¥4.328 | 0,60% |
| 9 năm | ¥2.160.000 | ¥32.660 | 1,51% |
| 15 năm | ¥3.600.000 | ¥87.622 | 2,43% |

Chỗ đáng tiền của chế độ là giảm 社会保険料 + thuế, không phải lãi (bảng dưới).

## Ba nguồn số, ba độ tin — luật xuyên suốt màn này

Đây là bất biến quan trọng nhất của bản thiết kế: **mỗi con số phải nói ra nó thuộc loại
nào**, vì ba loại này sai theo ba kiểu khác nhau.

| Loại | Nghĩa | Ví dụ | Dấu trên màn |
|---|---|---|---|
| **Đo** | Từ số trên phiếu lương / sổ | số dư ¥50.000, nhịp ¥10.000/tháng, 標準報酬月額 tụt mấy bậc | không dấu |
| **Sàn** | Cộng trừ thuần, không giả định gì | ¥3.570.000 tới 2056 | chữ "ít nhất" |
| **Ước** | Có giả định về luật hoặc tương lai | thuế giảm, lãi 0,3%, lương hưu mất | dấu `≈` + `<EstimateMark>` |

## Bốn phát hiện làm bài toán khả thi

### ① 標準報酬月額 suy được từ phiếu lương, không cần bảng suất theo tỉnh

厚生年金保険料率 = 18,300% toàn quốc, phần người lao động **9,150%**, cố định từ
平成29年9月1日 (nguồn: [bảng 令和8年度 của 日本年金機構](https://www.nenkin.go.jp/service/kounen/hokenryo/ryogaku/ryogakuhyo/20200825.html)).

```
標準報酬月額 = 厚生年金保険料 (trên phiếu) ÷ 0,09150
```

Có 標準報酬月額 rồi thì suất 健康保険 của chính công ty đó cũng chia ra được — **không cần
biết tỉnh nào, 協会けんぽ hay 健康保険組合**. Suất đo từ phiếu thì luôn là suất hiện hành;
bảng tra thì mỗi năm cũ đi một lần.

### ② Biên các bậc là trung điểm, nên bảng chỉ cần 32 con số

報酬月額 của bậc `n` = `[ (月額[n-1]+月額[n])/2 , (月額[n]+月額[n+1])/2 )`.

Kiểm bậc 19 (¥300.000): dưới `(280.000+300.000)/2 = 290.000` ✓, trên
`(300.000+320.000)/2 = 310.000` ✓. Kiểm bậc 2 (¥98.000): `93.000`–`101.000` ✓.

Nên bảng lưu **một mảng 32 mức 標準報酬月額**, biên tính ra. Ít dữ liệu cứng hơn, và mỗi
biên đều có một bài test đối chiếu với PDF gốc.

Thang 標準報酬月額 (厚生年金, 令和8年度), bậc 1→32:

```
88.000  98.000 104.000 110.000 118.000 126.000 134.000 142.000
150.000 160.000 170.000 180.000 190.000 200.000 220.000 240.000
260.000 280.000 300.000 320.000 340.000 360.000 380.000 410.000
440.000 470.000 500.000 530.000 560.000 590.000 620.000 650.000
```

Đã kiểm bằng máy, không đọc mắt: suy lại thang từ **cột tiền phí** của PDF
(`全額 ÷ 0,183` và `折半額 ÷ 0,0915` khớp nhau tới đồng, 32/32 dòng) ra đúng 32 con số
trên. Và **31/31 biên** theo luật trung điểm đều xuất hiện nguyên văn trong PDF, tất cả
tròn nghìn.

**Luật trung điểm chỉ đúng cho biên TRONG.** Bậc 1 không có biên dưới
(`93.000円未満`), bậc 32 không có biên trên (`635.000円以上`). `gradeOf()` mà đánh chỉ số
`月額[n-1]` / `月額[n+1]` một cách vô tư là hoặc nổ hoặc ra `NaN` ở hai đầu.

**健康保険 dùng cùng thang này, lệch 3 bậc.** Chính PDF của 協会けんぽ ghi `4（1）等級` và
`35（32）等級` → `bậc 健保 = bậc 厚年 + 3`, tức 健保 có thêm ba bậc thấp
(58.000 / 68.000 / 78.000 — đã kiểm có trong PDF) và một số bậc cao hơn ¥650.000.

**Thang cao của 健保 KHÔNG kiểm được** — `pdftotext` báo `Unknown character collection
'Adobe-Japan1'` trên PDF đó và rơi dòng; giá trị cao nhất trích được là ¥980.000. Nên
spec này **không** khai một con số trần nào cho 健保.

Cách tránh hẳn vấn đề: `gradeOf()` chỉ nhận 報酬月額 trong khoảng **¥88.000–¥650.000**
(thang đã kiểm), ngoài khoảng đó trả `null` và màn nói "ngoài khoảng app kiểm được". Lương
chủ app ~¥310.000, còn xa cả hai đầu. Cần thang 健保 đầy đủ thì lúc đó tra lại nguồn và
thêm test, không đoán trước.

### ③ Công thức mất lương hưu dựng lại đúng con số của 基金

老齢厚生年金, phần 報酬比例 (giai đoạn từ 2003/04):

```
平均標準報酬額 × 5,481/1000 × số tháng tham gia
```

Tụt 1 bậc quanh mức lương chủ app = ¥20.000 標準報酬月額. Một năm tham gia:
`20.000 × 5,481/1000 × 12 = ¥1.315,44`. Sheet của 基金 ghi **¥1.315**. Khớp tới từng yên
→ hệ số này kiểm được, không phải tự bịa. Đây là bài test đầu tiên phải xanh.

### ④ Phần thuế KHÔNG dựng lại được từ luật — phải hiệu chuẩn theo giấy

Đã thử và thất bại, ghi lại để người sau khỏi thử lại:

| Cách tính | Ra | Giấy ghi |
|---|---|---|
| `240.000 × 15%` (所得税 5% + 住民税 10%) | ¥36.000 | ¥28.080 |
| Trừ thêm phần 社保控除 mất đi (`−240.000+34.992`) × 15% | ¥30.751 | ¥28.080 |
| Trừ thêm 給与所得控除 giảm theo | ¥23.551 | ¥28.080 |

Không cách nào khớp, vì số thật phụ thuộc 扶養, các 控除 riêng, và mức lương chính xác —
app không có. **Nên phần thuế nội suy theo ba điểm đo của 基金**, không dựng từ luật:

| 掛金/tháng | 掛金/năm | 社会保険料/năm | 所得・住民税/năm | Tiết kiệm/năm |
|---|---|---|---|---|
| ¥0 | ¥0 | ¥630.456 | ¥308.280 | — |
| ¥20.000 (プラン①/②) | ¥240.000 | ¥595.464 | ¥280.200 | **¥63.072** |
| ¥73.000 (プラン③) | ¥876.000 | ¥524.616 | ¥220.440 | **¥193.680** |

Ba điểm này thành **ground truth của bộ test**: model nào không dựng lại đúng chúng thì
test đỏ, không được dùng.

Nội suy tuyến tính **chỉ cho phần thuế** (thuế biến đổi trơn theo thu nhập). Phần
社会保険料 là **bậc thang** — nội suy thẳng ở đó là sai về nguyên tắc, phải đi qua
`gradeOf()`.

## Rủi ro đã biết — phải chặn, không được im

### R1. Dòng 厚生年金基金 làm phép chia 9,15% sai

Bảng của 日本年金機構 ghi: `厚生年金基金加入員 …13,300%～15,900%`. Ai là thành viên
厚生年金基金 (khác 確定給付企業年金) thì suất 厚生年金保険 bị giảm theo 免除保険料率, và
`厚生年金保険料 ÷ 0,0915` cho ra 標準報酬月額 **sai**.

`nhap.ts:56` có map `厚生年金基金` → nên khả năng phiếu có dòng đó là thật.

**Chặn:** phiếu nào có dòng `厚生年金基金` thì `standardMonthlyOf()` trả `null`, màn hiện
"không suy được 標準報酬 từ phiếu này" và tắt khối 社会保険料 + khối lương hưu. Thà không
nói còn hơn nói sai.

### R2. 定時決定 chưa tới nên chưa có gì mà đo

掛金 bắt đầu 4/2026. 標準報酬 chỉ đổi ở **定時決定** (tháng 9, dựa lương tháng 4–6) hoặc
随時改定. Bốn phiếu đã có (5→8/2026) gần như chắc vẫn ở bậc cũ.

**Chặn:** khối "đã giảm được" nói thẳng `chờ phiếu 09/2026`, **không** lấp bằng số ước
tính. Chủ app đã chốt cách này. Từ 9/2026 nó tự có số thật, không cần sửa code.

Nhịp của ba khoản khác nhau, màn phải nói đúng từng cái:

| Khoản | Bắt đầu giảm | Đo được? |
|---|---|---|
| 所得税 | ngay, 4/2026 | **không** — cần giả định "nếu không đóng" → ước tính |
| 社会保険料 | phiếu 9/2026 (定時決定) | **có** — 標準報酬月額 tụt bậc là quan sát trực tiếp |
| 住民税 | tháng 6/2027 (thuế theo thu nhập năm trước) | không → ước tính |

### R3. Sheet hiệu chuẩn cũ đi khi lương đổi

Ba điểm ¥63.072/¥193.680 là của mức lương lúc 基金 in sheet (2025-08). Lương chủ app đã
đổi (thu nhập tháng ~¥250.000 năm 2022 → ~¥310.000 năm 2026).

**Chặn:** màn ghi rõ ngày của sheet đang dùng để hiệu chuẩn, và có ô cho người dùng nhập
ba điểm mới khi 基金 gửi sheet mới. Không có sheet mới thì vẫn dùng sheet cũ nhưng nói ra
là đang dùng số của ngày nào.

### R4. Bước sang 40 tuổi làm 健康保険料 nhảy — không phải do 掛金

PDF của 協会けんぽ (Tokyo, 令和8年度) ghi: 介護保険第2号被保険者 là người **40–64 tuổi**,
và với họ suất 健康保険 `9,85%` + 子ども・子育て支援金 `0,23%` **cộng thêm** 介護保険
`1,62%` (phần người lao động một nửa, ~0,81%).

Nghĩa là dòng 健康保険料 trên phiếu nhảy một bậc **đúng vào tháng sinh nhật 40**, trong khi
標準報酬月額 không đổi. Màn này đọc cú nhảy đó thành "掛金 có tác dụng" là kết luận sai
ngược dấu — 掛金 làm phí GIẢM, 介護保険 làm phí TĂNG, và nếu hai việc xảy ra gần nhau thì
chúng che nhau.

**Chặn:** phần "đã giảm được" **chỉ** đọc 標準報酬月額 (suy từ 厚生年金保険料, không chịu
ảnh hưởng 介護保険), **không** đọc số tiền 健康保険料. Bậc tụt là bậc tụt; tiền 健康保険
thay đổi có thể vì ba lý do khác nhau nên không dùng làm bằng chứng.

### R5. Ba điểm hiệu chuẩn KHÔNG gồm 子ども・子育て支援金

Sheet của 基金 tự ghi: khoản `子ども・子育て支援金` (施行 2026年4月) không nằm trong phần
社会保険料 nó tính. Suất Tokyo 令和8年度 là `0,23%`.

Nghĩa là ¥595.464 / ¥524.616 trên sheet **thấp hơn** số thật từ tháng 4/2026, nên phần
"tiết kiệm được" hiệu chuẩn từ chúng hơi lạc quan.

**Chặn:** không tự cộng bù (không biết suất tỉnh nào áp cho chủ app). Ghi cạnh khối hiệu
chuẩn rằng sheet không tính khoản này, để người đọc biết con số nghiêng về đâu.

### R6. Lãi 0,3% là mức của một năm tài chính

**Chặn:** ô sửa được, mặc định 0,3%, lưu kèm ngày sửa lần cuối, và ghi `給付利率 事業年度
2025` cạnh con số. Chủ app đã chốt phương án ô sửa được.

## Kiến trúc

Không có gì phía server đổi (không đụng edge function, không cần `npm run bundle:rules`).
**Có một migration**: hai tham số người dùng sửa được thêm vào `profile` — và theo
`CLAUDE.md`, migration đó phải đi cùng commit với `src/types/database.types.ts` (file viết
tay, không codegen; quên là compiler im mà query chết lúc chạy).

### Toán thuần — file `.ts`, không JSX, có unit test

| File | Việc | Test then chốt |
|---|---|---|
| `src/features/tax/shakaiHoken.ts` | thang 標準報酬月額, `gradeOf(reward, ladder)`, `standardMonthlyFromPension(premium)`, `rateFrom(premium, standard)` | dựng lại đúng 32 biên từ PDF; bậc 19 = 290k–310k; trả `null` khi có 厚生年金基金 |
| `src/features/tax/kikinBenefit.ts` | nội suy thuế theo ba điểm hiệu chuẩn; ghép với `gradeOf()` cho phần 社保 | **dựng lại đúng ¥63.072 và ¥193.680** |
| `src/features/tax/nenkinLoss.ts` | `5,481/1000` — lương hưu mất theo số bậc tụt × số tháng tham gia | dựng lại đúng **¥1.315/năm** của giấy |
| `src/features/assets/balanceAccrual.ts` | **đã có.** Thêm tham số lãi vào `projectBalance()`, hiệu chuẩn theo đồ thị 基金 (Q2) | dựng lại đúng ba điểm ¥4.328 / ¥32.660 / ¥87.622 ở 3 / 9 / 15 năm, mức ¥20.000/tháng |

Đặt ở `features/tax/` chứ không `features/assets/`: đây là luật thuế/an sinh Nhật, dùng
được cho màn khác sau này. `features/assets/` chỉ mượn qua import file thuần.

### Đọc dữ liệu

Thêm vào `src/hooks/queries.ts` (cửa duy nhất):

- Dùng lại `useLifePhases()` (vừa thêm 2026-08-26) cho năm ngừng làm.
- Dùng lại `useRangeTransactions()` cho khoản đóng và cho các dòng 健康保険料 / 厚生年金保険 /
  所得税 / 住民税. **Lưu ý:** những dòng này mang `exclude_from_stats = true`
  (`nhap.ts:363`) — đọc bảng gốc thì thấy, nhưng mọi tool/báo cáo lọc theo cờ đó thì
  không. Đây là lý do MCP `truy_van` trả rỗng khi thử.

### Màn hình

Route mới `/assets/retirement`, lazy như mọi route khác ở `App.tsx`. Vào từ dòng 退職金 ở
tab Quỹ Nhật và từ trang chi tiết tài khoản.

Vì sao trang riêng chứ không nhét vào trang chi tiết tài khoản: đây là câu "chế độ này lãi
lỗ thế nào", không phải "tài khoản này có gì" — cùng lý do `InvestPage` tách khỏi
`AccountDetailPage`.

Năm khối, theo đúng thứ tự người đọc cần:

1. **Đang có** — số dư, nhịp đóng (trung vị, xem `measureMonthlyContribution`), lịch sử
   đóng theo tháng.
2. **Tới lúc nghỉ** — năm lấy từ chặng cuối trang Tương lai (kèm tên chặng); "ít nhất" và
   "lãi X%/năm" là hai dòng riêng, không gộp.
3. **Đã giảm được** — ba khoản, ba nhịp, khoản nào chưa tới kỳ thì nói chưa tới.
4. **Đánh đổi** — lương hưu 厚生年金 mất bao nhiêu, kèm điều kiện "chỉ khi tụt bậc".
5. **Thử mức đóng khác** — ô nhập ¥1.000–¥73.000, mọi số mang dấu `≈`.

Giao diện: mở `docs/design-system.md` trước. `<PageHeader>`, `<SectionTitle>`,
`<Money>`/`<Num>`, `<EstimateMark>` cho mọi số ước tính, không giá trị tuỳ ý.

### Bắt buộc kiểm bằng mắt, `npm test` không thấy

Theo `CLAUDE.md`: chế độ Sáng, cỡ chữ 1,25× ở 375px, và biểu thức JSX bị codemod biến
thành chuỗi. Màn này nhiều số và nhiều chú thích dài nên cả ba đều có thật khả năng.

## Không làm (YAGNI)

- **Không** mô hình 所得税 từ 源泉徴収税額表. Đã chứng minh không khớp (mục ④).
- **Không** bảng suất 健康保険 theo 47 tỉnh. Đo từ phiếu (mục ①).
- **Không** so sánh với iDeCo / NISA. Câu khác, màn khác.
- **Không** tính 一時金 vs 年金 lúc nhận, cũng không tính thuế lúc nhận
  (退職所得控除). Chưa ai hỏi, và nó cần số năm làm việc tại công ty — dữ liệu app không có.
- **Không** khuyên mức đóng. Xem đầu tài liệu.

## Hai quyết định đã chốt trong spec này

Ghi lại vì cả hai đều có phương án khác nghe hợp lý, và người sửa sau cần biết vì sao
không chọn phương án đó.

### Q1. Hai tham số người dùng sửa lưu vào `profile`

Lãi % và ba điểm hiệu chuẩn (kèm ngày của sheet) → **cột mới trong `profile`**, không phải
bảng `kikin_settings` riêng. Vài trường, và một người chỉ có một 基金 — một bảng riêng chỉ
để giữ ba số là thêm một `Repo` method ở cả hai bản (`supabaseRepo` + `demoRepo`) mà không
mua được gì.

### Q2. Lãi hiệu chuẩn theo đồ thị 基金, không ghép tháng thuần

Ghép tháng ở `0,3%/12` cho ra **¥81.800** ở mốc 15 năm; giấy của 基金 ghi **¥87.622** — họ
nhiều hơn ~7%, và không rõ 月次再評価率 của họ cộng theo quy tắc gì.

Chọn **hiệu chuẩn theo ba điểm đồ thị** (¥4.328 / ¥32.660 / ¥87.622 ở 3 / 9 / 15 năm, mức
¥20.000/tháng) — cùng khuôn với phần thuế, và không phải chờ 基金 trả lời. Hai phương án bị
loại: hỏi 基金 (chặn cả tính năng vì một câu hỏi qua thư), và ghép tháng thuần kèm câu "app
tính thấp hơn ~7%" (đúng nhưng bắt người đọc tự bù trong đầu).

Lãi vốn dĩ là loại **Ước** trên màn (`≈` + `<EstimateMark>`), nên hiệu chuẩn không làm nó
kém trung thực đi — chỉ làm nó gần bảng mà người dùng thật sự đối chiếu.
