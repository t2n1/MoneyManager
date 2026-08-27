# Kế hoạch triển khai — nút "Tra hộ" số cho mốc cuộc đời

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm nút "Tra hộ" cạnh ô số tiền của một mốc cuộc đời — bấm thì AI tra web,
trả về dải thấp/giữa/cao kèm nguồn, người dùng chọn một mức, số vào bản nháp.

**Architecture:** Hai file `.ts` THUẦN mang toàn bộ luật (dựng câu hỏi, đọc kết quả), một
edge function giữ khoá API, một sheet hiện kết quả, một nút trong popover đã có. Không sửa
`draft.ts` — đường ghi `note` và `amountMinor` đã thông sẵn.

**Tech Stack:** TypeScript · React 19 · vitest · TanStack Query · Supabase Edge Functions (Deno)

**Spec:** [`docs/superpowers/specs/2026-08-27-tra-so-tuong-lai-design.md`](../specs/2026-08-27-tra-so-tuong-lai-design.md)

## Global Constraints

Mọi task đều phải theo, không nhắc lại ở từng task:

- **Toán thuần nằm ngoài React.** File `.ts` không JSX, không `import` React, không
  `Date.now()`, có unit test. Component render số, không tính số.
- **Không chêm giá trị tuỳ ý vào UI.** Mọi màu / cỡ chữ / bán kính đều phải là token đã
  có tên. Không `text-[0.8125rem]`. `tests/designSystem.test.ts` là ban cứng.
- **Không tự viết `<h1>`, `<h2>`, `<select>`, hay nút nền xanh.** Dùng `<PageHeader>`,
  `<SectionTitle>`, `<Select>`, `<ActionButton>` từ `src/components/ui`.
- **Mọi con số tiền đi qua `<Money>`; số đếm/%/tháng đi qua `<Num>`.**
- **Không dùng float cho tiền.** Tiền là số nguyên minor units.
- **Thiếu tỷ giá thì loại ra, không coi là 1:1.** Quy ước `hasMissingRate` toàn repo.
- **Hai bản `Repo` phải cùng thoả interface** — thêm method một bên mà quên bên kia là
  lỗi biên dịch.
- Lệnh: `npm test` (vitest run) · `npm run lint` (oxlint) · `npm run build` (tsc -b && vite build)
- Một file test đơn lẻ: `npx vitest run <đường dẫn>`

## Quyết định đã chốt trong lúc đọc mã

Ba điều đã kiểm tận nơi, đừng đi kiểm lại:

1. **Không sửa `draft.ts`.** `patchDraftEvent` nhận `Partial<Omit<DraftEvent,'id'>>` (có
   `note`), và `planDraftSave` đã so `note` để ghi xuống DB. Đường thông sẵn.
2. **`LIFE_PRESETS` có 6 mẫu nhưng sinh ra 11 loại mốc.** Nút bấm trên MỐC, nên luật hỏi
   gắn theo NHÃN MỐC, không theo mẫu.
3. **Mốc không mang mã mẫu.** `DraftEvent` không có trường nào nói nó ra từ mẫu nào. Nên
   ghép luật bằng **so nhãn đúng từng ký tự**. Người dùng đổi tên mốc thì rơi về đường
   "tra chung" — đúng ý spec, không cần migration.

## Cấu trúc file

| File | Trách nhiệm | Task |
|---|---|---|
| `src/features/lifetime/traSo.ts` | THUẦN. Bảng luật 11 loại mốc + dựng câu hỏi. | 1 |
| `src/features/lifetime/traSo.test.ts` | Test task 1, gồm phép thử khoá "không gửi tiền đi". | 1 |
| `src/features/lifetime/traSoKetQua.ts` | THUẦN. Đọc kết quả model, kiểm, từ chối cái sai. | 2 |
| `src/features/lifetime/traSoKetQua.test.ts` | Test task 2, 5 ca. | 2 |
| `supabase/functions/tra-so/index.ts` | Cầu giữ khoá API. Không có luật tiền. | 3 |
| `src/data/repo.ts` | Thêm `traSo()` vào interface + kiểu. | 4 |
| `src/data/supabaseRepo.ts` | `traSo()` gọi edge function. | 4 |
| `src/data/demoRepo.ts` | `traSo()` trả kết quả mẫu. | 4 |
| `src/hooks/queries.ts` | Hook `useTraSo()`. | 4 |
| `src/features/lifetime/TraSoSheet.tsx` | Màn kết quả. Chỉ render. | 5 |
| `src/features/lifetime/EventEditorPopover.tsx` | Nút "Tra hộ" + nối vào nháp. | 6 |

---

### Task 1: `traSo.ts` — bảng luật và dựng câu hỏi

**Files:**
- Create: `src/features/lifetime/traSo.ts`
- Test: `src/features/lifetime/traSo.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode` từ `src/lib/currencies`
- Produces:
  - `interface MocDeTra { nhan: string; kind: 'income' | 'expense'; namBatDau: number; namKetThuc: number | null; nuoc: string | null; tien: CurrencyCode }`
  - `interface CauHoi { van: string; laMocCoSan: boolean }`
  - `function dungCauHoi(moc: MocDeTra): CauHoi`
  - `const LUAT_HOI: Record<string, string>` — 11 khoá

**Vì sao `MocDeTra` không có trường tiền:** đó chính là phép bảo đảm "không gửi tiền đi".
Kiểu dữ liệu không mang số dư / thu nhập / số tiền hiện tại của mốc thì không có đường
nào để chúng lọt vào câu hỏi. Test ở Bước 6 khoá điều đó lại.

- [ ] **Bước 1: Viết test thất bại cho mốc có sẵn**

Tạo `src/features/lifetime/traSo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dungCauHoi, LUAT_HOI, type MocDeTra } from './traSo'

const moc = (over: Partial<MocDeTra> & Pick<MocDeTra, 'nhan'>): MocDeTra => ({
  kind: 'expense',
  namBatDau: 2029,
  namKetThuc: null,
  nuoc: 'JP',
  tien: 'JPY',
  ...over,
})

describe('dungCauHoi — mốc sinh từ mẫu', () => {
  it('nhận ra nhãn có sẵn và dùng luật riêng của nó', () => {
    const r = dungCauHoi(moc({ nhan: 'Chi phí cưới' }))
    expect(r.laMocCoSan).toBe(true)
    expect(r.van).toContain('ご祝儀')
    expect(r.van).toContain('2029')
    expect(r.van).toContain('JPY')
  })

  it('mốc THU được nói rõ là khoản thu', () => {
    const r = dungCauHoi(moc({ nhan: 'Trợ cấp trẻ em (児童手当)', kind: 'income' }))
    expect(r.laMocCoSan).toBe(true)
    expect(r.van).toContain('khoản THU')
  })
})
```

- [ ] **Bước 2: Chạy test, xác nhận nó đỏ**

Run: `npx vitest run src/features/lifetime/traSo.test.ts`
Expected: FAIL — `Failed to resolve import "./traSo"`

- [ ] **Bước 3: Viết `traSo.ts`**

Tạo `src/features/lifetime/traSo.ts`:

```ts
// Dựng câu hỏi gửi cho model — THUẦN, không React, không mạng, không đồng hồ.
//
// VÌ SAO CÓ FILE NÀY. Cái làm một câu trả lời về chi phí cưới ĐÚNG không phải model
// giỏi, mà là việc BIẾT phải hỏi "đã trừ ご祝儀 chưa". Khảo sát ゼクシィ 2024 cho ¥3.439.000
// là 総額 — số tổng cả tiệc; tiền người ta thực móc ra thấp hơn nhiều sau tiền mừng.
// Model không tự biết mình phải trừ. Bảng LUAT_HOI dưới đây là chỗ giữ những cái "phải
// hỏi cho đúng" đó.
//
// KHOÁ RIÊNG TƯ. `MocDeTra` CỐ Ý không có trường tiền nào — không số dư, không thu nhập,
// không số tiền hiện tại của mốc. Một lượt tra không cần chúng, nên chúng không được có
// đường nào lọt vào câu hỏi gửi ra ngoài. Đây là ràng buộc ở tầng KIỂU DỮ LIỆU, và
// `traSo.test.ts` khoá lại bằng phép thử. Thêm trường tiền vào đây là phá lời hứa đó.
import type { CurrencyCode } from '../../lib/currencies'

/** Mốc cần tra. Không mang tiền — xem khối chú thích đầu file. */
export interface MocDeTra {
  /** Nhãn của mốc. Khớp đúng ký tự với khoá `LUAT_HOI` thì được hỏi kỹ. */
  nhan: string
  kind: 'income' | 'expense'
  namBatDau: number
  namKetThuc: number | null
  /** Nước của CHẶNG phủ năm bắt đầu (từ `phaseForYear`), không phải của mốc. */
  nuoc: string | null
  /** Tiền của CHẶNG (từ `currencyAt`). Câu trả lời phải theo đúng đồng này. */
  tien: CurrencyCode
}

export interface CauHoi {
  van: string
  /**
   * true = nhãn khớp `LUAT_HOI`, câu hỏi dựng TỪ LUẬT nên không chứa chữ người dùng gõ.
   * false = mốc tự đặt tên, nhãn đi vào câu hỏi nguyên văn → UI phải cảnh báo trước khi gửi.
   */
  laMocCoSan: boolean
}

/**
 * "Phải hỏi cho đúng cái gì" của 11 loại mốc mà `LIFE_PRESETS` sinh ra.
 *
 * KHOÁ LÀ NHÃN, KHÔNG PHẢI MÃ MẪU: `DraftEvent` không mang mã mẫu nào, nên đây là đường
 * ghép duy nhất không cần đổi schema. Người dùng đổi tên mốc thì rơi về "tra chung" —
 * đúng ý bản thiết kế, không phải lỗi.
 *
 * 6 mẫu sinh ra 11 mốc: riêng "Sinh con" đẻ ra 5. Chép nhãn từ `presets.ts` NGUYÊN VĂN,
 * kể cả gạch nối dài (–, U+2013) trong "Nuôi con 0–6 tuổi".
 */
export const LUAT_HOI: Record<string, string> = {
  'Chi phí cưới':
    'Lấy TỔNG chi phí (総額) trung bình rồi TRỪ tiền mừng (ご祝儀) ước tính, để ra số tiền ' +
    'người ta THỰC MÓC RA. Nói rõ giả định bao nhiêu khách. Nếu khảo sát đổi cách đo giữa ' +
    'các năm thì phải cảnh báo là không so trực tiếp được.',
  'Trợ cấp trẻ em (児童手当)':
    'Tra LUẬT hiện hành, không tra bài báo cũ — mức này đổi theo luật. Nói rõ mức theo độ ' +
    'tuổi và theo thứ tự con, và ngưỡng thu nhập nếu còn áp dụng.',
  'Nuôi con 0–6 tuổi':
    'Nói rõ có gồm tiền nhà trẻ / mẫu giáo không, và chính sách miễn học phí mầm non ' +
    '(幼保無償化) đã được trừ chưa.',
  'Nuôi con 7–15 tuổi':
    'Tách trường công và trường tư. Nói rõ có gồm tiền học thêm (塾) không.',
  'Nuôi con 16–17 tuổi':
    'Tách cấp ba công và tư. Nói rõ trợ cấp học phí cấp ba (高等学校等就学支援金) đã trừ chưa.',
  'Con vào đại học':
    'TÁCH ba mức: quốc lập, tư thục thường, và y/nha khoa — chênh nhau nhiều lần. Tách ' +
    'tiền nhập học năm đầu (入学金) ra khỏi học phí hằng năm.',
  'Trả trước mua nhà':
    'Nói rõ tỷ lệ trả trước thông thường và trên giá nhà bao nhiêu. Cộng cả các khoản ' +
    'thuế phí lúc mua (諸費用) và nói rõ chúng chiếm bao nhiêu phần trăm.',
  // KHÔNG viết con số nào vào luật (kể cả "nhân 12"): luật nói model phải HỎI cái gì,
  // không nói sẵn đáp án — và phép thử khoá ở traSo.test.ts cấm mọi chữ số ngoài năm.
  'Trả vay mua nhà':
    'Nói rõ lãi suất giả định, kỳ hạn bao nhiêu năm, và đây là số MỖI NĂM. Nếu nguồn cho ' +
    'số theo tháng thì phải quy sang số mỗi năm và nói rõ là đã quy.',
  'Lương hưu':
    'TÁCH 老齢基礎年金 (phần quốc dân) và 老齢厚生年金 (phần công ty) thành hai khoản, đừng ' +
    'gộp. Nói rõ số 満額 của phần cơ bản đổi HÀNG NĂM và đang lấy của năm nào.',
  'Chi phí chuyển nhà, thủ tục':
    'Khoản một lần. Nói rõ gồm những gì — vận chuyển, visa/thủ tục, đặt cọc nhà mới.',
  'Hỗ trợ bố mẹ':
    'Số theo mức sống ở Việt Nam, tra nguồn Việt Nam. KHÔNG quy từ số của Nhật sang.',
}

const CHUNG =
  'Tôi không rõ khoản này thường hết bao nhiêu. Đây là mốc do tôi tự đặt tên nên có thể ' +
  'có những cái bẫy tôi không biết — nếu con số phổ biến trên mạng là số gộp, số chưa trừ ' +
  'trợ cấp, hay số của một phạm vi khác với điều tôi hỏi, hãy nói ra.'

/** Phần chung mọi câu hỏi: khuôn trả lời + quyền nói "không biết". */
function khuonTraLoi(tien: CurrencyCode): string {
  return [
    '',
    'CÁCH TRẢ LỜI — chỉ trả về JSON, không thêm chữ nào ngoài JSON:',
    '{',
    '  "khong_biet": false,',
    `  "tien": "${tien}",`,
    '  "thap": <số>, "giua": <số>, "cao": <số>,   // đơn vị LỚN, không phải cent',
    '  "dien_giai": "<một đoạn ngắn: số này là gì, đã trừ/chưa trừ những gì>",',
    '  "canh_bao": ["<mỗi cảnh báo một chuỗi>"],',
    '  "nguon": { "ten": "<tên khảo sát/cơ quan>", "url": "<link>", "nam": <năm khảo sát> }',
    '}',
    '',
    'BA RÀNG BUỘC BẮT BUỘC:',
    `1. Mọi số phải theo đồng ${tien}. Không được trả lời bằng đồng khác.`,
    '2. Phải có nguồn tra được. Không bịa số. Không tìm được nguồn đáng tin thì đặt',
    '   "khong_biet": true và nói lý do ở "dien_giai" — trả lời "không biết" là ĐÚNG,',
    '   không phải thất bại.',
    '3. "thap"/"cao" là dải thật của khoản này, không phải ±10% quanh "giua".',
  ].join('\n')
}

/**
 * Dựng câu hỏi cho một mốc.
 *
 * Nhãn khớp `LUAT_HOI` thì câu hỏi dựng TỪ LUẬT — nhãn không đi vào phần mô tả, nên
 * không có chữ nào người dùng gõ lọt ra ngoài. Không khớp thì nhãn đi vào nguyên văn và
 * `laMocCoSan` là false để UI cảnh báo trước khi gửi.
 */
export function dungCauHoi(moc: MocDeTra): CauHoi {
  const luat = LUAT_HOI[moc.nhan]
  const laMocCoSan = luat !== undefined
  const nuoc = moc.nuoc ?? 'không rõ nước'
  const loai = moc.kind === 'income' ? 'khoản THU' : 'khoản CHI'
  const khoang =
    moc.namKetThuc === null
      ? `từ năm ${moc.namBatDau} trở đi`
      : moc.namBatDau === moc.namKetThuc
        ? `năm ${moc.namBatDau}`
        : `mỗi năm trong khoảng ${moc.namBatDau}–${moc.namKetThuc}`

  const than = laMocCoSan ? luat : `Khoản "${moc.nhan}". ${CHUNG}`

  return {
    laMocCoSan,
    van: [
      `Tôi đang dựng bản chiếu tài sản dài hạn. Cần một con số cho một ${loai} ở ${nuoc}, ${khoang}.`,
      '',
      than,
      khuonTraLoi(moc.tien),
    ].join('\n'),
  }
}
```

- [ ] **Bước 4: Chạy test, xác nhận nó xanh**

Run: `npx vitest run src/features/lifetime/traSo.test.ts`
Expected: PASS — 2 test

- [ ] **Bước 5: Thêm test cho mốc tự đặt tên**

Thêm vào `traSo.test.ts`:

```ts
describe('dungCauHoi — mốc tự đặt tên', () => {
  it('nhãn lạ thì laMocCoSan false và nhãn đi vào câu hỏi nguyên văn', () => {
    const r = dungCauHoi(moc({ nhan: 'Sửa bếp' }))
    expect(r.laMocCoSan).toBe(false)
    expect(r.van).toContain('Sửa bếp')
  })

  it('đổi tên một mốc có sẵn thì rơi về tra chung, không nổ', () => {
    const r = dungCauHoi(moc({ nhan: 'Chi phí cưới ' })) // thừa một dấu cách
    expect(r.laMocCoSan).toBe(false)
  })

  it('mốc có năm kết thúc thì nói rõ là số MỖI NĂM', () => {
    const r = dungCauHoi(moc({ nhan: 'Sửa bếp', namBatDau: 2030, namKetThuc: 2035 }))
    expect(r.van).toContain('mỗi năm trong khoảng 2030–2035')
  })
})
```

- [ ] **Bước 6: Thêm phép thử KHOÁ "không gửi tiền đi"**

Đây là phép thử quan trọng nhất của cả kế hoạch. Thêm vào `traSo.test.ts`:

```ts
describe('khoá riêng tư', () => {
  const NHAN_CO_SAN = Object.keys(LUAT_HOI)

  it('có đúng 11 loại mốc có sẵn', () => {
    expect(NHAN_CO_SAN).toHaveLength(11)
  })

  it('MocDeTra không mang trường tiền nào', () => {
    const m = moc({ nhan: 'Chi phí cưới' })
    expect(Object.keys(m).sort()).toEqual(
      ['kind', 'nhan', 'namBatDau', 'namKetThuc', 'nuoc', 'tien'].sort(),
    )
  })

  it('câu hỏi của mốc có sẵn KHÔNG chứa nhãn mốc', () => {
    // Đây là tính chất riêng tư thật sự: với mốc có sẵn, câu hỏi dựng TỪ LUẬT, nên
    // không có chữ nào của người dùng đi ra ngoài. Nếu ai đó về sau chèn nhãn vào câu
    // hỏi, test này đỏ — và nó PHẢI đỏ, vì đó là đổi lời hứa.
    for (const nhan of NHAN_CO_SAN) {
      const van = dungCauHoi(moc({ nhan, namBatDau: 2029, namKetThuc: null })).van
      expect(van).not.toContain(nhan)
    }
  })

  it('câu hỏi của mốc có sẵn không chứa số nào ngoài năm', () => {
    // Số dư, thu nhập, số tiền hiện tại của mốc KHÔNG được có đường nào lọt vào.
    // Năm là số duy nhất được phép, và nó nằm trong khoảng 1900–2200.
    //
    // KHÔNG có lối thoát "chữ số này có trong nhãn": test trên đã khẳng định nhãn không
    // hề xuất hiện, nên một lối thoát như vậy chỉ che mất rò rỉ chứ không cứu ca thật nào.
    for (const nhan of NHAN_CO_SAN) {
      const van = dungCauHoi(moc({ nhan, namBatDau: 2029, namKetThuc: null })).van
      // Bỏ phần khuôn trả lời (có đánh số 1. 2. 3.) — chỉ soi phần mô tả mốc.
      const phanMoTa = van.split('CÁCH TRẢ LỜI')[0]
      for (const s of phanMoTa.match(/\d+/g) ?? []) {
        const n = Number(s)
        expect(n >= 1900 && n <= 2200).toBe(true)
      }
    }
  })
})
```

- [ ] **Bước 7: Chạy toàn bộ test của file, xác nhận xanh**

Run: `npx vitest run src/features/lifetime/traSo.test.ts`
Expected: PASS — 9 test

Nếu test "không chứa số nào ngoài năm" đỏ: có một luật trong `LUAT_HOI` chứa con số cụ
thể. **Bỏ con số đó ra khỏi luật — KHÔNG nới test.** Luật nói model phải hỏi cái gì,
không nói sẵn đáp án; một con số trong luật là mầm của đúng thứ `presets.ts` cảnh báo.

Nếu test "không chứa nhãn mốc" đỏ: `dungCauHoi` đang chèn `moc.nhan` vào câu hỏi của mốc
có sẵn. Đó là rò rỉ chữ người dùng gõ ra ngoài — sửa mã, không sửa test.

- [ ] **Bước 8: Lint và commit**

```bash
npm run lint
git add src/features/lifetime/traSo.ts src/features/lifetime/traSo.test.ts
git commit -m "feat(tuong-lai): bang luat hoi 11 loai moc + dung cau hoi tra so"
```

---

### Task 2: `traSoKetQua.ts` — đọc và kiểm kết quả

**Files:**
- Create: `src/features/lifetime/traSoKetQua.ts`
- Test: `src/features/lifetime/traSoKetQua.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode` từ `src/lib/currencies`, `CURRENCIES` từ cùng chỗ
- Produces:
  - `interface KetQuaTra { thapMinor: number; giuaMinor: number; caoMinor: number; tien: CurrencyCode; dienGiai: string; canhBao: string[]; nguon: { ten: string; url: string; nam: number | null } }`
  - `type LoiTra = { loi: 'doc-khong-ra' | 'sai-tien' | 'khong-nguon' | 'khong-tim-duoc'; noiDung: string }`
  - `function docKetQua(tho: unknown, tienChang: CurrencyCode): KetQuaTra | LoiTra`
  - `function laLoi(r: KetQuaTra | LoiTra): r is LoiTra`

- [ ] **Bước 1: Viết test thất bại cho ca tốt**

Tạo `src/features/lifetime/traSoKetQua.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { docKetQua, laLoi, type KetQuaTra } from './traSoKetQua'

const tho = (over: Record<string, unknown> = {}) => ({
  khong_biet: false,
  tien: 'JPY',
  thap: 1_100_000,
  giua: 1_700_000,
  cao: 3_400_000,
  dien_giai: 'Đã trừ ご祝儀 ước tính cho 52 khách.',
  canh_bao: ['Khảo sát 2025 đổi cách đo, không so được với 2024.'],
  nguon: { ten: 'ゼクシィ結婚トレンド調査', url: 'https://souken.zexy.net/', nam: 2024 },
  ...over,
})

describe('docKetQua — ca tốt', () => {
  it('quy sang minor units theo số lẻ của đồng tiền', () => {
    const r = docKetQua(tho(), 'JPY') as KetQuaTra
    expect(laLoi(r)).toBe(false)
    // JPY có 0 số lẻ → minor bằng major
    expect(r.thapMinor).toBe(1_100_000)
    expect(r.giuaMinor).toBe(1_700_000)
    expect(r.caoMinor).toBe(3_400_000)
    expect(r.nguon.ten).toBe('ゼクシィ結婚トレンド調査')
    expect(r.canhBao).toHaveLength(1)
  })
})
```

- [ ] **Bước 2: Chạy test, xác nhận nó đỏ**

Run: `npx vitest run src/features/lifetime/traSoKetQua.test.ts`
Expected: FAIL — `Failed to resolve import "./traSoKetQua"`

- [ ] **Bước 3: Viết `traSoKetQua.ts`**

Tạo `src/features/lifetime/traSoKetQua.ts`:

```ts
// Đọc kết quả model trả về — THUẦN, không React, không mạng.
//
// LUẬT XUYÊN SUỐT: KHÔNG ĐOÁN. Mỗi ca hỏng ở đây đều trả về một mã lỗi để UI nói thẳng
// ra, chứ không có nhánh nào "sửa tạm cho chạy tiếp". Lý do: con số này đi vào một bản
// chiếu 40 năm rồi được vẽ thành đồ thị trơn tru — một cú đoán sai ở đây không có gì
// bắt được về sau. Thà không có số còn hơn có số sai (cùng quy ước `hasMissingRate`).
//
// Riêng ca SAI ĐỒNG TIỀN: KHÔNG tự quy đổi. Model trả lời bằng USD trong khi chặng dùng
// JPY nghĩa là nó đã hiểu sai câu hỏi, nên con số đó sai ở tầng NGHĨA chứ không phải sai
// đơn vị — quy đổi chỉ làm một câu trả lời sai trông như đúng.
import { CURRENCIES, type CurrencyCode } from '../../lib/currencies'

export interface KetQuaTra {
  thapMinor: number
  giuaMinor: number
  caoMinor: number
  tien: CurrencyCode
  dienGiai: string
  canhBao: string[]
  nguon: { ten: string; url: string; nam: number | null }
}

/**
 * Năm kiểu hỏng, khớp đúng năm dòng bảng "Xử lý hỏng" của bản thiết kế.
 *
 * `khong-goi-duoc` tách riêng khỏi `doc-khong-ra` là CỐ Ý: mất mạng và "kết quả lộn xộn"
 * là hai chuyện khác nhau, và tiêu chí nghiệm thu của bản thiết kế là "hỏng thì hỏng ồn
 * ào, nói rõ hỏng ở đâu". Gộp lỗi mạng vào lỗi phân tích là nói sai chỗ hỏng.
 */
export type LoiTra = {
  loi: 'khong-goi-duoc' | 'doc-khong-ra' | 'sai-tien' | 'khong-nguon' | 'khong-tim-duoc'
  noiDung: string
}

export function laLoi(r: KetQuaTra | LoiTra): r is LoiTra {
  return 'loi' in r
}

/** Số tiền nhập theo đơn vị LỚN rồi quy về minor. Cùng phép tính với EventEditorPopover. */
function sangMinor(major: number, tien: CurrencyCode): number {
  return Math.round(major * 10 ** CURRENCIES[tien].decimals)
}

function laSoDuong(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

function laChuoiCo(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

export function docKetQua(tho: unknown, tienChang: CurrencyCode): KetQuaTra | LoiTra {
  if (typeof tho !== 'object' || tho === null) {
    return { loi: 'doc-khong-ra', noiDung: 'Kết quả không phải một đối tượng.' }
  }
  const o = tho as Record<string, unknown>

  // Model tự nhận không biết — đây là câu trả lời ĐÚNG, không phải hỏng.
  if (o.khong_biet === true) {
    return {
      loi: 'khong-tim-duoc',
      noiDung: laChuoiCo(o.dien_giai) ? o.dien_giai : 'Không tìm được nguồn đáng tin.',
    }
  }

  if (!laSoDuong(o.thap) || !laSoDuong(o.giua) || !laSoDuong(o.cao)) {
    return { loi: 'doc-khong-ra', noiDung: 'Thiếu hoặc sai một trong ba mức thấp/giữa/cao.' }
  }
  if (!(o.thap <= o.giua && o.giua <= o.cao)) {
    return { loi: 'doc-khong-ra', noiDung: 'Ba mức không tăng dần: thấp ≤ giữa ≤ cao.' }
  }
  if (!laChuoiCo(o.tien)) {
    return { loi: 'doc-khong-ra', noiDung: 'Thiếu đồng tiền.' }
  }
  if (o.tien !== tienChang) {
    return {
      loi: 'sai-tien',
      noiDung: `Trả lời bằng ${o.tien} trong khi chặng này dùng ${tienChang}.`,
    }
  }

  // Không có nguồn thì không có số. UI dựa vào đây để KHÔNG hiện nút "Lấy".
  const nguon = o.nguon
  if (typeof nguon !== 'object' || nguon === null) {
    return { loi: 'khong-nguon', noiDung: 'Không kèm nguồn nào.' }
  }
  const n = nguon as Record<string, unknown>
  if (!laChuoiCo(n.ten) || !laChuoiCo(n.url)) {
    return { loi: 'khong-nguon', noiDung: 'Nguồn thiếu tên hoặc link.' }
  }

  return {
    thapMinor: sangMinor(o.thap, tienChang),
    giuaMinor: sangMinor(o.giua, tienChang),
    caoMinor: sangMinor(o.cao, tienChang),
    tien: tienChang,
    dienGiai: laChuoiCo(o.dien_giai) ? o.dien_giai : '',
    canhBao: Array.isArray(o.canh_bao) ? o.canh_bao.filter(laChuoiCo) : [],
    nguon: { ten: n.ten, url: n.url, nam: laSoDuong(n.nam) ? n.nam : null },
  }
}
```

- [ ] **Bước 4: Chạy test, xác nhận nó xanh**

Run: `npx vitest run src/features/lifetime/traSoKetQua.test.ts`
Expected: PASS — 1 test

- [ ] **Bước 5: Thêm test cho bốn ca hỏng**

Thêm vào `traSoKetQua.test.ts`:

```ts
describe('docKetQua — bốn ca hỏng', () => {
  it('sai đồng tiền thì chặn, KHÔNG tự quy đổi', () => {
    const r = docKetQua(tho({ tien: 'USD' }), 'JPY')
    expect(laLoi(r) && r.loi).toBe('sai-tien')
  })

  it('không có nguồn thì từ chối', () => {
    const r = docKetQua(tho({ nguon: { ten: '', url: '' } }), 'JPY')
    expect(laLoi(r) && r.loi).toBe('khong-nguon')
  })

  it('model nhận không biết thì trả về lý do, không phải lỗi kỹ thuật', () => {
    const r = docKetQua(tho({ khong_biet: true, dien_giai: 'Không có khảo sát nào.' }), 'JPY')
    expect(laLoi(r) && r.loi).toBe('khong-tim-duoc')
    expect(laLoi(r) && r.noiDung).toBe('Không có khảo sát nào.')
  })

  it('ba mức không tăng dần thì từ chối', () => {
    const r = docKetQua(tho({ thap: 5_000_000 }), 'JPY')
    expect(laLoi(r) && r.loi).toBe('doc-khong-ra')
  })

  it('rác hoàn toàn thì từ chối, không nổ', () => {
    expect(laLoi(docKetQua(null, 'JPY'))).toBe(true)
    expect(laLoi(docKetQua('xin chào', 'JPY'))).toBe(true)
    expect(laLoi(docKetQua({}, 'JPY'))).toBe(true)
  })

  it('đồng tiền có số lẻ thì quy minor đúng', () => {
    const r = docKetQua(tho({ tien: 'USD', thap: 1.5, giua: 2, cao: 3 }), 'USD') as KetQuaTra
    expect(laLoi(r)).toBe(false)
    expect(r.thapMinor).toBe(150)
    expect(r.giuaMinor).toBe(200)
  })
})
```

- [ ] **Bước 6: Chạy test, xác nhận xanh**

Run: `npx vitest run src/features/lifetime/traSoKetQua.test.ts`
Expected: PASS — 7 test

Nếu ca `USD` đỏ vì `CURRENCIES.USD` không tồn tại: mở `src/lib/currencies.ts`, chọn một
đồng có `decimals: 2` đang có thật trong đó và dùng đồng ấy.

- [ ] **Bước 7: Lint và commit**

```bash
npm run lint
git add src/features/lifetime/traSoKetQua.ts src/features/lifetime/traSoKetQua.test.ts
git commit -m "feat(tuong-lai): doc va kiem ket qua tra so, tu choi thay vi doan"
```

---

### Task 3: Edge function `tra-so` — cầu giữ khoá API

**Files:**
- Create: `supabase/functions/tra-so/index.ts`

**Interfaces:**
- Nhận POST `{ van: string }` · Trả `{ ok: true, ketQua: unknown }` hoặc `{ ok: false, loi: string }`
- Consumes: không import gì từ `src/` — **không phải chạy `npm run bundle:rules`**

**Vì sao function này không có luật tiền nào:** nó chỉ chuyển câu hỏi đi và trả kết quả
thô về. Toàn bộ việc kiểm nằm ở `traSoKetQua.ts` phía app, nơi có unit test. Đặt ranh
giới ở đây thì không có bản sao luật nào để trôi lệch — khác hẳn `push-notify` và
`stock-refresh`, hai chỗ buộc phải gói `_rules.js` vì chúng TÍNH tiền.

- [ ] **Bước 1: Viết function**

Tạo `supabase/functions/tra-so/index.ts`:

```ts
// Edge function tra-so — cầu giữ khoá API cho nút "Tra hộ" ở màn Tương lai.
//
// VÌ SAO PHẢI CÓ. Khoá API không được nằm phía trình duyệt: mọi biến VITE_* bị nhúng vào
// bundle công khai, ai mở mã nguồn cũng lấy được khoá và tiêu hạn mức.
//
// FUNCTION NÀY CỐ TÌNH NGU. Không phép tính tiền nào, không đụng DB. Việc kiểm kết quả
// nằm ở src/features/lifetime/traSoKetQua.ts, nơi có unit test. Nhờ vậy KHÔNG phải gói
// bundle như push-notify/stock-refresh — không có bản sao luật nào để trôi lệch.
//
// APP KHÔNG ĐƯỢC CHỌN MODEL. Model, độ dài tối đa và công tắc tra web đều ghim ở đây.
// Nếu để app gửi lên thì một lỗi vòng lặp phía app đốt sạch hạn mức trong vài giây.
//
// Chạy thử tại máy:  supabase functions serve tra-so
// Deploy:            supabase functions deploy tra-so
// Đặt khoá:          supabase secrets set AI_API_KEY=...

// deno-lint-ignore-file no-explicit-any
const AI_API_KEY = (Deno.env.get('AI_API_KEY') ?? '').trim()

/** Dài tối đa của câu hỏi. Chặn app gửi lên một câu khổng lồ vì lỗi. */
const MAX_VAN = 4000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ĐOẠN DUY NHẤT PHỤ THUỘC NHÀ CUNG CẤP. Đổi hãng = sửa đúng hàm này.
//
// CỐ Ý KHÔNG dựng khung cắm mô-đun ở đây. Lý do không phải "cho gọn" mà là: hãng chưa
// được chốt (xem mục "Quyết định còn treo" trong bản thiết kế), và cách quyết là chạy
// thử THẬT cùng một câu hỏi qua hai bên. Một khung cắm dựng trước khi biết mình cần gì
// là dựng sai. Khi đã chốt, ~30 dòng này là tất cả những gì phải đụng.
// ─────────────────────────────────────────────────────────────────────────────
async function goiNhaCungCap(van: string): Promise<unknown> {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': AI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: van }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 2000, temperature: 0 },
      }),
    },
  )
  if (!res.ok) throw new Error(`Nhà cung cấp trả ${res.status}: ${await res.text()}`)
  const data: any = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? ''
  // Model hay bọc JSON trong ```json … ``` dù đã dặn. Bóc ra trước khi parse.
  const sach = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim()
  return JSON.parse(sach)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, loi: 'Chỉ nhận POST.' }, 405)

  // Đòi đã đăng nhập. Supabase đã kiểm chữ ký JWT trước khi tới đây (deploy KHÔNG dùng
  // --no-verify-jwt, khác stock-refresh vốn do cron gọi); ở đây chỉ cần chắc là có.
  if (!req.headers.get('Authorization')) {
    return json({ ok: false, loi: 'Chưa đăng nhập.' }, 401)
  }
  if (!AI_API_KEY) {
    return json({ ok: false, loi: 'Thiếu AI_API_KEY phía server.' }, 500)
  }

  let van: unknown
  try {
    van = (await req.json())?.van
  } catch {
    return json({ ok: false, loi: 'Thân yêu cầu không phải JSON.' }, 400)
  }
  if (typeof van !== 'string' || van.trim().length === 0) {
    return json({ ok: false, loi: 'Thiếu câu hỏi.' }, 400)
  }
  if (van.length > MAX_VAN) {
    return json({ ok: false, loi: `Câu hỏi dài quá ${MAX_VAN} ký tự.` }, 400)
  }

  try {
    return json({ ok: true, ketQua: await goiNhaCungCap(van) })
  } catch (e) {
    return json({ ok: false, loi: e instanceof Error ? e.message : String(e) }, 502)
  }
})
```

- [ ] **Bước 2: Kiểm bằng tay tại máy**

Function này không có unit test (nó chỉ chuyển tiếp; phần đáng test đã ở task 1–2). Kiểm
bằng tay một lần:

```bash
supabase functions serve tra-so
```

Ở cửa sổ khác, kiểm ca **thiếu đăng nhập** — phải trả 401:

```bash
curl -s -X POST http://localhost:54321/functions/v1/tra-so -H "Content-Type: application/json" -d "{\"van\":\"thu\"}"
```

Expected: `{"ok":false,"loi":"Chưa đăng nhập."}`

- [ ] **Bước 3: Kiểm ca câu hỏi rỗng**

```bash
curl -s -X POST http://localhost:54321/functions/v1/tra-so -H "Content-Type: application/json" -H "Authorization: Bearer test" -d "{\"van\":\"\"}"
```

Expected: `{"ok":false,"loi":"Thiếu câu hỏi."}`

- [ ] **Bước 4: Commit**

```bash
git add supabase/functions/tra-so/index.ts
git commit -m "feat(tra-so): edge function giu khoa API, khong co luat tien nao"
```

**Chưa deploy.** Deploy và đặt khoá là việc của người dùng sau khi chốt hãng — xem mục
"Việc người dùng phải tự làm" ở cuối kế hoạch.

---

### Task 4: `traSo()` trong hai bản repo + hook

**Files:**
- Modify: `src/data/repo.ts` — thêm kiểu + method vào interface `Repo`
- Modify: `src/data/supabaseRepo.ts` — gọi edge function
- Modify: `src/data/demoRepo.ts` — trả kết quả mẫu
- Modify: `src/hooks/queries.ts` — thêm `useTraSo()`

**Interfaces:**
- Consumes: `CauHoi` từ task 1 (chỉ dùng trường `van`); `CurrencyCode` từ `src/lib/currencies`
- Produces: `traSo(van: string, tien: CurrencyCode): Promise<unknown>` trên `Repo`;
  `useTraSo()` trả về mutation nhận `{ van, tien }`

**Vì sao đi qua repo chứ không gọi thẳng:** luật của repo là feature không tự gọi mạng.
Quan trọng hơn — bản demo phải bấm được nút này mà không cần mạng, không cần khoá. Gọi
thẳng từ feature thì chế độ demo vỡ, và compiler không bắt được.

- [ ] **Bước 1: Thêm vào interface `Repo`**

Trong `src/data/repo.ts`, ngay sau khối `// --- Lifetime: chiếu tài sản ròng cả đời ---`
(sau `deleteLifeEvent`), thêm:

```ts
  /**
   * Gửi một câu hỏi tra số cho nhà cung cấp AI, trả về JSON THÔ.
   *
   * Trả `unknown` là cố ý: việc kiểm nằm ở `traSoKetQua.docKetQua`, nơi có unit test.
   * Repo không được kiểm hộ — hai chỗ kiểm là hai chỗ trôi lệch.
   *
   * `tien` phải truyền vào chứ không suy từ `van`: bản DEMO cần biết đồng tiền của chặng
   * để trả về đúng đồng đó. Ghim cứng một đồng thì `docKetQua` sẽ từ chối với `sai-tien`
   * ở mọi chặng dùng đồng khác — tức chế độ demo hiện LỖI thay vì hiện tính năng, đúng
   * cái hỏng mà kiến trúc đi-qua-repo sinh ra để chặn. Dò đồng tiền trong chuỗi `van` là
   * đoán, và cả `traSoKetQua.ts` được viết quanh luật KHÔNG ĐOÁN.
   */
  traSo(van: string, tien: CurrencyCode): Promise<unknown>
```

- [ ] **Bước 2: Cài vào `supabaseRepo`**

Trong `src/data/supabaseRepo.ts`, thêm cạnh các method lifetime khác:

```ts
  async traSo(van: string, tien: CurrencyCode) {
    const { data, error } = await getSupabase().functions.invoke('tra-so', { body: { van, tien } })
    if (error) {
      // `invoke()` ném FunctionsHttpError ở MỌI mã non-2xx, và ném TRƯỚC khi đọc body —
      // nên `data` là null và `error.message` chỉ là câu chung "non-2xx status code".
      // Câu lỗi thật của function nằm chưa đọc trong `error.context`. Không moi nó ra thì
      // người dùng luôn thấy một câu tiếng Anh vô nghĩa thay cho "Chưa đăng nhập" hay
      // "Hết hạn mức" — tức app nói SAI chỗ hỏng, đúng thứ tiêu chí nghiệm thu cấm.
      throw new Error((await docLoiTuContext(error)) ?? error.message)
    }
    if (!data?.ok) throw new Error(data?.loi ?? 'Không tra được.')
    return data.ketQua as unknown
  },
```

Kèm hàm phụ. Nó nằm trên ĐƯỜNG XỬ LÝ LỖI nên tuyệt đối không được tự ném — ném ở đây là
nuốt mất lỗi gốc. `context` có thể vắng, có thể không phải JSON, có thể đã bị consume:

```ts
/** Moi câu lỗi thật ra khỏi FunctionsHttpError. `null` khi không moi được. */
async function docLoiTuContext(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context
  if (typeof (ctx as Response)?.json !== 'function') return null
  try {
    const body = await (ctx as Response).json()
    const loi = (body as { loi?: unknown })?.loi
    return typeof loi === 'string' && loi.trim().length > 0 ? loi : null
  } catch {
    return null
  }
}
```

- [ ] **Bước 3: Cài vào `demoRepo`**

Trong `src/data/demoRepo.ts`, thêm cạnh các method lifetime khác:

```ts
  async traSo(_van: string, tien: CurrencyCode) {
    // Bản demo không gọi mạng và không có khoá. Trả một kết quả mẫu để người xem thấy
    // ĐÚNG luồng — nhưng luôn là số này bất kể hỏi gì.
    //
    // PHẢI DỘI LẠI `tien` NHẬN VÀO, không được ghim cứng một đồng: `docKetQua` từ chối
    // với `sai-tien` khi đồng trả về khác đồng của chặng, nên ghim JPY thì mọi chặng
    // VND/USD ở chế độ demo hiện LỖI thay vì hiện tính năng.
    //
    // Đổi lại, ĐỘ LỚN của ba con số dưới đây viết theo JPY nên chỉ đúng nghĩa khi chặng
    // là JPY. Không tra số mẫu riêng cho từng đồng: đây là bản demo, và `dien_giai` nói
    // thẳng đó là số mẫu — thà lộ liễu là số giả còn hơn trông như số đã tra cho đồng đó.
    return {
      khong_biet: false,
      tien,
      thap: 1_100_000,
      giua: 1_700_000,
      cao: 3_400_000,
      dien_giai:
        'SỐ MẪU CỦA BẢN DEMO — không phải số đã tra cho khoản bạn đang hỏi, và độ lớn ' +
        'viết theo yên Nhật. Bản thật sẽ trả về: tổng chi phí trung bình ¥3.439.000 cho ' +
        '52 khách, đã trừ ご祝儀 ước tính để ra số thực móc ra.',
      canh_bao: [
        'Khảo sát 2025 đổi cách đo — số mới ¥2.986.000 không so trực tiếp được với 2024.',
        'Khoảng phổ biến nhất chỉ chiếm 18,6%, nên đây là dải rộng.',
      ],
      nguon: { ten: 'ゼクシィ結婚トレンド調査', url: 'https://souken.zexy.net/', nam: 2024 },
    }
  },
```

- [ ] **Bước 4: Chạy build để xác nhận hai bản repo khớp interface**

Run: `npm run build`
Expected: PASS. Nếu đỏ vì thiếu method ở một bản — đó chính là cái chốt đang làm việc,
thêm nốt bên còn thiếu.

- [ ] **Bước 5: Thêm hook vào `queries.ts`**

Trong `src/hooks/queries.ts`, thêm cạnh các hook lifetime:

```ts
/**
 * Tra số cho một mốc. Là mutation chứ không phải query: nó chỉ chạy khi người dùng BẤM,
 * và không có gì để invalidate — kết quả không được lưu ở đâu cả, nó vào bản nháp rồi
 * người dùng tự quyết.
 */
export function useTraSo() {
  return useMutation({
    mutationFn: ({ van, tien }: { van: string; tien: CurrencyCode }) => repo.traSo(van, tien),
  })
}
```

`CurrencyCode` phải có trong khối `import type` sẵn có ở đầu `queries.ts` — kiểm trước khi
thêm, đừng thêm một dòng import trùng.

- [ ] **Bước 6: Chạy toàn bộ test + build**

Run: `npm test && npm run build`
Expected: PASS cả hai

- [ ] **Bước 7: Lint và commit**

```bash
npm run lint
git add src/data/repo.ts src/data/supabaseRepo.ts src/data/demoRepo.ts src/hooks/queries.ts
git commit -m "feat(tuong-lai): traSo() o ca hai ban repo, demo van bam duoc nut"
```

---

### Task 5: `TraSoSheet.tsx` — màn kết quả

**Files:**
- Create: `src/features/lifetime/TraSoSheet.tsx`

**Interfaces:**
- Consumes: `KetQuaTra`, `LoiTra`, `laLoi` từ task 2; `Money` và `ActionButton` từ `src/components/ui`
- Produces:
  ```ts
  interface Props {
    dangChay: boolean
    ketQua: KetQuaTra | LoiTra | null
    tien: CurrencyCode
    canhBaoRiengTu: boolean   // true khi mốc tự đặt tên — hiện trước khi gửi
    onChon: (minor: number, ghiChu: string) => void
    onDong: () => void
  }
  export function TraSoSheet(props: Props): JSX.Element
  ```

**Khuôn sheet:** chép đúng lớp ngoài của `EventFormSheet.tsx` — `fixed inset-0 z-40 flex
items-end justify-center bg-black/40 lg:items-center animate-overlay-in`, bên trong là
phần tử `role="dialog"`. Đừng tự nghĩ khuôn mới.

- [ ] **Bước 1: Đọc `EventFormSheet.tsx` để chép khuôn**

Run: `sed -n '100,140p' src/features/lifetime/EventFormSheet.tsx`

Chép nguyên lớp phủ, lớp `role="dialog"`, cách đóng bằng phím Esc và bằng bấm ra ngoài.

**Đối chiếu `className` của lớp `role="dialog"` TỪNG TOKEN** với chuỗi ở Bước 2 — cùng một
chuỗi đang chạy ở `PhaseFormSheet.tsx` và `assets/CardMonthAdjustSheet.tsx`. Lệch token nào
thì tin `EventFormSheet`, không tin kế hoạch này. `designSystem.test.ts` **không** bắt được
kiểu lệch này (nó đặt trần số lần dùng `rounded-2xl`, không đặt sàn), nên mắt bạn là lưới duy nhất.

- [ ] **Bước 2: Viết `TraSoSheet.tsx`**

Tạo `src/features/lifetime/TraSoSheet.tsx`. Ba trạng thái, và không trạng thái nào dẫn
tới một con số lặng lẽ đi vào kịch bản:

```tsx
// Màn kết quả "Tra hộ" — CHỈ RENDER, không tính số. Mọi phép kiểm đã xong ở
// traSoKetQua.docKetQua trước khi component này thấy dữ liệu.
//
// BA TRẠNG THÁI, và không cái nào dẫn tới một con số lặng lẽ đi vào kịch bản:
//   đang chạy      → không có nút Lấy
//   lỗi bất kỳ     → không có nút Lấy, nói thẳng hỏng ở đâu
//   có kết quả     → ba nút Lấy, mỗi nút kèm sẵn ghi chú nguồn
import { useEffect } from 'react'
import { ActionButton, Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { laLoi, type KetQuaTra, type LoiTra } from './traSoKetQua'

interface Props {
  dangChay: boolean
  ketQua: KetQuaTra | LoiTra | null
  tien: CurrencyCode
  /** true = mốc tự đặt tên, chữ người dùng gõ sẽ đi ra ngoài. Cảnh báo TRƯỚC khi gửi. */
  canhBaoRiengTu: boolean
  onChon: (minor: number, ghiChu: string) => void
  onDong: () => void
}

/** Câu ghi vào ô Ghi chú của mốc. Sáu tháng sau mở lại còn biết số ở đâu ra. */
function ghiChuTu(k: KetQuaTra, mucDaChon: number): string {
  const nam = k.nguon.nam === null ? '' : ` ${k.nguon.nam}`
  const canhBao = k.canhBao.length > 0 ? ` — ${k.canhBao.join(' ')}` : ''
  return `Tra hộ: ${mucDaChon} ${k.tien}. Nguồn: ${k.nguon.ten}${nam} (${k.nguon.url}). ${k.dienGiai}${canhBao}`
}

export function TraSoSheet({ dangChay, ketQua, tien, canhBaoRiengTu, onChon, onDong }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDong()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDong])

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onDong}
    >
      {/*
        Chuỗi className dưới đây chép NGUYÊN SI từ EventFormSheet.tsx — cùng một chuỗi
        đang chạy ở PhaseFormSheet và CardMonthAdjustSheet. Đừng rút gọn:

        · `max-h-[92vh]` + `overflow-y-auto` KHÔNG phải trang trí. Thân sheet này dài
          tuỳ ý (đoạn diễn giải + danh sách cảnh báo không chặn số lượng), mà khung
          ngoài là `fixed inset-0 items-end` không có overflow. Bỏ hai lớp này thì ở
          375px với vài cảnh báo, nội dung nở quá đỉnh màn và ba nút "Lấy" bị đẩy ra
          ngoài, không cuộn tới được — tức component hỏng đúng việc nó sinh ra để làm.
        · `pb-[max(1rem,env(...))]` giữ nút cuối khỏi nằm đè vạch home trên iPhone.
        · `rounded-2xl` là bán kính theo VAI TRÒ "sheet trượt lên"
          (docs/design-system.md:266), không theo kích cỡ sheet.

        `max-h-[92vh]` và `pb-[max(...)]` đúng là giá trị tuỳ ý, và vẫn hợp lệ: luật
        "không chêm giá trị tuỳ ý" nhắm vào màu / cỡ chữ / bán kính — những thứ CÓ
        token. Chiều cao khung nhìn và safe-area không có token nào.
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tra số cho mốc"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {canhBaoRiengTu && (
          <p className="mb-3 rounded-md bg-surface-sunken p-2 text-sm text-fg-secondary">
            Đây là mốc bạn tự đặt tên, nên tên mốc sẽ được gửi ra ngoài. Đừng gõ chuyện riêng.
          </p>
        )}

        {dangChay && <p className="py-6 text-center text-sm text-fg-secondary">Đang tra…</p>}

        {!dangChay && ketQua !== null && laLoi(ketQua) && (
          <div className="py-2">
            <p className="text-sm font-medium text-fg-primary">Không lấy được số</p>
            <p className="mt-1 text-sm text-fg-secondary">{ketQua.noiDung}</p>
            <p className="mt-3 text-sm text-fg-secondary">Số bạn đang có giữ nguyên.</p>
          </div>
        )}

        {!dangChay && ketQua !== null && !laLoi(ketQua) && (
          <div>
            <div className="space-y-1">
              {(
                [
                  ['Thấp', ketQua.thapMinor],
                  ['Giữa', ketQua.giuaMinor],
                  ['Cao', ketQua.caoMinor],
                ] as const
              ).map(([ten, minor]) => (
                <button
                  key={ten}
                  type="button"
                  onClick={() => onChon(minor, ghiChuTu(ketQua, minor))}
                  className="flex min-h-9 w-full items-center justify-between rounded-md border border-border-strong px-2.5 py-1 text-sm text-fg-primary transition hover:bg-surface-sunken active:scale-95"
                >
                  <span>{ten}</span>
                  <Money amount={minor} currency={tien} />
                </button>
              ))}
            </div>

            <p className="mt-3 text-sm text-fg-secondary">{ketQua.dienGiai}</p>

            {ketQua.canhBao.map((c) => (
              <p key={c} className="mt-2 text-sm text-fg-secondary">
                ⚠ {c}
              </p>
            ))}

            <p className="mt-3 text-sm text-fg-secondary">
              Nguồn: {ketQua.nguon.ten}
              {ketQua.nguon.nam !== null && ` ${ketQua.nguon.nam}`}
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <ActionButton onClick={onDong}>Bỏ qua</ActionButton>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Bước 3: Kiểm chữ ký `<ActionButton>`**

`<Money>` đã kiểm rồi: prop là **`amount`** (minor units) và `currency` — mã trên đã dùng
đúng, đừng đổi thành `minor`.

`<ActionButton>` thì đọc rồi hãy dùng:

Run: `sed -n '40,70p' src/components/ui/ActionButton.tsx`

Xem nó nhận `variant` gì và có bắt buộc prop nào không. Sửa lời gọi cho khớp.

- [ ] **Bước 4: Chạy build và test hệ thiết kế**

Run: `npm run build && npx vitest run tests/designSystem.test.ts`
Expected: PASS cả hai

Nếu `designSystem.test.ts` đỏ: có một giá trị tuỳ ý trong `className`. Đọc thông báo lỗi,
thay bằng token đã có tên. Không thêm giá trị mới vào danh sách cho phép.

- [ ] **Bước 5: Lint và commit**

```bash
npm run lint
git add src/features/lifetime/TraSoSheet.tsx
git commit -m "feat(tuong-lai): man ket qua tra so, khong ca nao lam so sai lot vao"
```

---

### Task 6: Nút "Tra hộ" trong `EventEditorPopover` và nối vào nháp

**Files:**
- Modify: `src/features/lifetime/EventEditorPopover.tsx`

**Interfaces:**
- Consumes: `dungCauHoi`, `MocDeTra` (task 1) · `docKetQua`, `KetQuaTra`, `LoiTra` (task 2)
  · `useTraSo()` (task 4) · `TraSoSheet` (task 5)
- Produces: không có export mới. Popover nhận thêm hai prop:
  ```ts
  /** Chặng phủ năm bắt đầu của mốc — cho nước và tiền. Null thì ẩn nút "Tra hộ". */
  chang: { nuoc: string | null; tien: CurrencyCode } | null
  ```

**Vì sao truyền chặng vào chứ không tự dò:** popover không có danh sách chặng, và
`phaseForYear` là khái niệm của bản chiếu — hai bản chép của nó sẽ trôi lệch (JSDoc trong
`project.ts` đã ghi rõ điều này từng xảy ra). Chỗ gọi popover đã có `phases` trong tay.

- [ ] **Bước 1: Tìm chỗ dựng `<EventEditorPopover>` và xem nó có `phases` không**

Run: `grep -rn "EventEditorPopover" src/features/lifetime/*.tsx`

Mở chỗ gọi. Nó phải có bản nháp (có `draft.phases`) để tính được chặng. Dùng `currencyAt`
và `phaseForYear` sẵn có:

```ts
import { currencyAt } from './fxModel'
import { phaseForYear } from './project'
```

- [ ] **Bước 2: Thêm prop `chang` và truyền từ chỗ gọi**

Chữ ký thật (đã kiểm, đừng đi kiểm lại):

```ts
phaseForYear<T extends { startYear: number }>(sorted: T[], year: number): T | undefined
```

**Hai cái bẫy:** nó trả `undefined` chứ KHÔNG phải `null`, và nó đòi mảng **đã sắp theo
`startYear`** — truyền mảng chưa sắp thì nó trả sai lặng lẽ.

Ở chỗ gọi, tính:

```tsx
chang={(() => {
  const sorted = [...draft.phases].sort((a, b) => a.startYear - b.startYear)
  const p = phaseForYear(sorted, event.startYear)
  return p === undefined
    ? null
    : {
        nuoc: p.country,
        tien: currencyAt(sorted, event.startYear, draft.displayCurrency),
      }
})()}
```

- [ ] **Bước 3: Thêm trạng thái và nút vào popover**

Trong `EventEditorPopover.tsx`, thêm import và trạng thái:

```tsx
import { useState } from 'react'
import { useTraSo } from '../../hooks/queries'
import { dungCauHoi } from './traSo'
import { docKetQua, type KetQuaTra, type LoiTra } from './traSoKetQua'
import { TraSoSheet } from './TraSoSheet'
```

Trong thân component:

```tsx
const [moSheet, setMoSheet] = useState(false)
const [ketQua, setKetQua] = useState<KetQuaTra | LoiTra | null>(null)
const traSo = useTraSo()

const cauHoi =
  chang === null
    ? null
    : dungCauHoi({
        nhan: event.label,
        kind: event.kind,
        namBatDau: event.startYear,
        namKetThuc: event.endYear,
        nuoc: chang.nuoc,
        tien: chang.tien,
      })

function batDauTra() {
  if (cauHoi === null || chang === null) return
  setKetQua(null)
  setMoSheet(true)
  // Truyền cả `tien`: bản demo dội lại đúng đồng đó, nếu không `docKetQua` sẽ từ chối
  // với `sai-tien` ở mọi chặng không phải JPY. Xem JSDoc `Repo.traSo`.
  traSo.mutate({ van: cauHoi.van, tien: chang.tien }, {
    onSuccess: (tho) => setKetQua(docKetQua(tho, chang.tien)),
    // Mất mạng / function lỗi / hết hạn mức đều dừng ở đây — dùng 'khong-goi-duoc',
    // KHÔNG dùng 'doc-khong-ra' (đó là mã cho kết quả đọc không ra, nói sai chỗ hỏng).
    onError: (e) =>
      setKetQua({ loi: 'khong-goi-duoc', noiDung: e instanceof Error ? e.message : String(e) }),
  })
}
```

- [ ] **Bước 4: Đặt nút cạnh ô số tiền**

Tìm dòng có `onPatch({ amountMinor: toMinor(...) })` (khoảng dòng 133). Bọc ô tiền và nút
vào một hàng:

```tsx
<div className="flex items-end gap-1.5">
  <input
    className={FIELD}
    defaultValue={toMajor(event.amountMinor, event.currency)}
    onChange={(e) => onPatch({ amountMinor: toMinor(e.target.value, event.currency) })}
  />
  {cauHoi !== null && (
    <button
      type="button"
      onClick={batDauTra}
      className="min-h-9 shrink-0 rounded-md border border-border-strong px-2.5 py-1 text-sm font-medium text-fg-secondary transition hover:bg-surface-sunken active:scale-95"
    >
      Tra hộ
    </button>
  )}
</div>
```

Giữ nguyên mọi thuộc tính sẵn có của `<input>` — chỉ bọc thêm, không sửa.

- [ ] **Bước 5: Gắn sheet và nối kết quả vào nháp**

Cuối phần trả về của popover:

```tsx
{moSheet && chang !== null && cauHoi !== null && (
  <TraSoSheet
    dangChay={traSo.isPending}
    ketQua={ketQua}
    tien={chang.tien}
    canhBaoRiengTu={!cauHoi.laMocCoSan}
    onDong={() => setMoSheet(false)}
    onChon={(minor, ghiChu) => {
      onPatch({ amountMinor: minor, note: ghiChu })
      setMoSheet(false)
    }}
  />
)}
```

`onPatch` đi thẳng vào `patchDraftEvent`, và `planDraftSave` đã so `note` — nên số VÀ ghi
chú cùng vào bản nháp, đồ thị đổi ngay, chỉ ghi xuống DB khi bấm Lưu. Không sửa `draft.ts`.

- [ ] **Bước 6: Chạy toàn bộ test và build**

Run: `npm test && npm run build && npm run lint`
Expected: PASS cả ba

- [ ] **Bước 7: Xem bằng mắt ở chế độ demo**

`npm test` KHÔNG thấy ba thứ: chế độ Sáng, cỡ chữ 1,25× ở 375px, và biểu thức JSX bị biến
thành chuỗi. Phải mở app xem.

Mở app ở chế độ demo, vào Tương lai, bấm một chip mốc, bấm "Tra hộ". Kiểm đủ bốn:

1. Sheet mở, hiện ba mức từ kết quả mẫu của `demoRepo`.
2. Bấm "Giữa" → ô tiền đổi, **đồ thị đổi ngay**, thanh `DraftBanner` hiện ra.
3. Mở "chi tiết mốc" (nút ⋯) → ô Ghi chú đã có câu nguồn.
4. Bấm "Bỏ thay đổi" → số quay về như cũ, ghi chú cũng quay về.

Đổi sang chế độ Sáng và thu màn còn 375px, xem lại sheet một lần.

- [ ] **Bước 8: Commit**

```bash
git add src/features/lifetime/EventEditorPopover.tsx
git commit -m "feat(tuong-lai): nut Tra ho canh o tien, ket qua vao ban nhap"
```

---

## Việc người dùng phải tự làm (không thuộc kế hoạch code)

Ba việc này cần thẻ/khoá nên **không được tự làm hộ**:

1. **Chốt hãng** bằng bộ đề ở [`../notes/2026-08-27-de-thu-ba-hang-ai.md`](../notes/2026-08-27-de-thu-ba-hang-ai.md).
   Câu 2 là câu quyết định. Chốt xong thì sửa `goiNhaCungCap` trong task 3.
2. **Lấy khoá API** và đặt hạn mức chi hàng tháng để một lỗi vòng lặp không đốt sạch.
3. **Đặt khoá và deploy:**
   ```bash
   supabase secrets set AI_API_KEY=...
   supabase functions deploy tra-so
   ```
   Deploy **không** dùng `--no-verify-jwt` — khác `stock-refresh` vốn do cron gọi. Nút này
   do người đã đăng nhập bấm, nên phải để Supabase kiểm JWT.

## Tự soát

**Phủ spec:** Luồng người dùng → task 5+6. Bốn luật cố định → không tự chạy (task 6, chỉ
chạy khi bấm), nháp không DB (task 6 `onPatch`), note ghi nguồn (task 5 `ghiChuTu`), tiền
theo chặng (task 1 `MocDeTra.tien` + task 2 ca `sai-tien`). Kiến trúc server → task 3.
Đi qua repo + demo → task 4. Luật hỏi 11 loại → task 1. Dữ liệu gửi đi + cảnh báo riêng
tư → task 1 bước 6, task 5 `canhBaoRiengTu`. Năm ca hỏng → task 2 (4 ca) + task 5 (hiện
lỗi) + task 6 (`onError` bắt ca mất mạng). Phép thử → task 1 bước 6, task 2 bước 5.
Quyết định treo → task 3 `goiNhaCungCap` + mục "Việc người dùng phải tự làm".

**Chỗ spec nói mà kế hoạch cố ý bỏ:** spec ghi "phải mở đường ghi `note` trong
`draft.ts`". Đã kiểm tận nơi: `planDraftSave` đã so `note` sẵn. Spec đã được sửa lại.

**Khớp kiểu:** `dungCauHoi` trả `CauHoi { van, laMocCoSan }` — task 6 dùng cả hai trường.
`docKetQua` trả `KetQuaTra | LoiTra` — task 5 phân nhánh bằng `laLoi`. `repo.traSo` trả
`unknown` — task 6 đưa thẳng vào `docKetQua(tho, chang.tien)`. Tên nhất quán suốt.

**Đã kiểm tận nơi, đừng kiểm lại:** `<Money>` nhận `amount` (minor) + `currency`, không
phải `minor`. `phaseForYear(sorted, year)` trả `T | undefined` (KHÔNG phải `null`) và đòi
mảng đã sắp. `planDraftSave` đã so `note`. `LIFE_PRESETS` có đúng 6 mẫu / 11 loại mốc.

**Hai chỗ vẫn phải ĐỌC TRƯỚC KHI VIẾT**, vì kế hoạch không chép sẵn: chữ ký
`<ActionButton>` (task 5 bước 3) và khuôn sheet của `EventFormSheet` (task 5 bước 1).
