// Test ĐỌC FILE, không render. Repo không có hạ tầng test component (0 file *.test.tsx,
// không jsdom), và ở task này thứ cần chốt là CẤU TRÚC: những chuỗi/biến đã chết phải
// biến mất khỏi source, không sót một nhánh nào. Loại test này bền hơn test render ở
// chỗ nó không thể xanh nhờ một điều kiện `false` che mất code.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Ở tests/ chứ không phải src/: file này đọc filesystem bằng `node:fs`, mà
// tsconfig.app.json cố ý chỉ khai `types: ["vite/client"]` để không ai import được
// `node:fs` vào code chạy trên trình duyệt (xem đầu tests/designSystem.test.ts). Để
// trong src thì `npx tsc -b` đỏ ngay ở dòng import.
//
// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager")
// nên pathname trả về đã percent-encode → ENOENT.
const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')

const form = read('features/transactions/TransactionForm.tsx')
const page = read('features/transactions/EntryPage.tsx')
const roles = read('features/transactions/entryRoles.ts')

describe('nut "Dac biet" va ca lop dropdown bien mat', () => {
  it('khong con chuoi "Dac biet" o dau ca', () => {
    expect(form).not.toMatch(/Đặc biệt/)
    expect(page).not.toMatch(/Đặc biệt/)
  })

  it('khong con portal roleTriggerSlot', () => {
    expect(form).not.toMatch(/roleTriggerSlot/)
    expect(page).not.toMatch(/roleSlot|setRoleSlot/)
  })

  it('khong con ba bo segmented rieng — chi con DirectionTabs', () => {
    for (const dead of ['TYPE_TABS', 'DEBT_TABS', 'REMIT_TABS', 'ROLE_META', 'ROLE_ORDER']) {
      expect(form).not.toMatch(new RegExp(dead))
    }
    expect(form).toMatch(/<DirectionTabs/)
  })
})

describe('ba ham dan xuat chuyen sang bang', () => {
  it('entryRoles khong con roleTxType / roleAmountLabel / roleHidesCategoryGrid', () => {
    for (const dead of ['roleTxType', 'roleAmountLabel', 'roleHidesCategoryGrid']) {
      expect(roles).not.toMatch(new RegExp(dead))
    }
  })

  it('nhung interface va initial* thi GIU — chung con duoc dung', () => {
    for (const keep of ['SplitValue', 'DebtValue', 'RemitValue',
                        'initialSplit', 'initialDebt', 'initialRemit',
                        'SERVICES', 'parseRoleParam']) {
      expect(roles).toMatch(new RegExp(keep))
    }
  })
})

describe('dai do ngan sach o dau form bien mat', () => {
  it('EntryPage khong con useBudgetAlert va khong con Link to /budget', () => {
    expect(page).not.toMatch(/useBudgetAlert/)
    expect(page).not.toMatch(/overCount/)
    expect(page).not.toMatch(/danh mục vượt ngân sách/)
  })
})

describe('TagPicker khong bi gac boi dang nao', () => {
  it('khong con MOT dieu kien nao truoc <TagPicker', () => {
    // Truoc day: {activeRole === 'none' && <TagPicker …>} — an nhan o 5 tren 10 dang.
    // Soat chuoi `activeRole === 'none' && <TagPicker` la vo nghia sau khi ca bien
    // activeRole bi ban: no xanh du co mot cong MOI nao khac moc vao day. Nen chot
    // dang phu dinh CHUNG: khong `&&` nao dung ngay truoc <TagPicker.
    expect(form).toMatch(/<TagPicker/)
    expect(form).not.toMatch(/&&\s*\(?\s*<TagPicker/)
    expect(form).not.toMatch(/\?\s*\(?\s*<TagPicker/)
  })

  it('khong con bien activeRole nao ca — kind la state duy nhat', () => {
    expect(form).not.toMatch(/activeRole/)
  })
})

describe('nut Luu mot layout', () => {
  it('nhan phu la "Luu va nhap tiep"', () => {
    // "Tiep tuc" khong noi tiep cai gi.
    expect(form).toMatch(/Lưu và nhập tiếp/)
  })

  it('chuoi "Tiep tuc" bien mat o CA HAI file, va prop continueLabel chet han', () => {
    // Chuoi do nam o EntryPage.tsx:243, KHONG o TransactionForm — soat mot file
    // thi test xanh ma chuoi van song.
    for (const src of [form, page]) expect(src).not.toMatch(/Tiếp tục/)
    for (const src of [form, page]) expect(src).not.toMatch(/continueLabel/)
  })
})

describe('ba cong role-field gac dung dang', () => {
  it('SplitFields chi o split, DebtFields o lend|borrow, RemitFields o family|ownvn', () => {
    // Map sai o day la bug HANH VI im lang: field hien sai dang, dung loai loi ma
    // ca goi ban giao sinh ra de chua. Test dem chuoi activeRole khong bat duoc.
    // Ca ba assertion deu chot LIEN KE (dieu kien → component), khong chi chot chuoi
    // dieu kien tu do: chuoi tu do van xanh khi dieu kien dung gac SAI component.
    expect(form).toMatch(/kind === 'split'\s*&&\s*\(?\s*<SplitFields/)
    // `debtOnly` (Khach no cong) cung dung DebtFields: no cung tao mot khoan no, chi
    // khac o cho khong co dong nao roi vi.
    expect(form).toMatch(
      /kind === 'lend' \|\| kind === 'borrow' \|\| debtOnly\)?\s*&&\s*\(?\s*<DebtFields/,
    )
    expect(form).toMatch(/kind === 'family' \|\| kind === 'ownvn'\)?\s*&&\s*\(?\s*<RemitFields/)
  })

  it('khong con banner vai tro — hang Dang da noi dang nao dang bat', () => {
    expect(form).not.toMatch(/roleMeta/)
  })
})

describe('"Luu va nhap tiep" phai o LAI man o CA 11 dang', () => {
  it('co keepGoing di xuyen onSubmitRole, va EntryPage chi navigate khi KHONG keepGoing', () => {
    // Nhanh orchestrator chay TRUOC nhanh giao dich thuong trong handleSubmit, nen neu
    // no khong biet "nhap tiep" thi o nam dang (split/family/lend/borrow/ownvn) nut phu
    // luu xong roi RA KHOI man — dung nguoc nhan cua chinh no. Cung hop dong voi
    // onSubmitWithFee da co san trong file.
    expect(form).toMatch(/onSubmitRole\?: \(payload: RoleSubmit, keepGoing: boolean\)/)
    expect(form).toMatch(/role: 'split', base, value: splitVal \}, keepGoing\)/)
    expect(form).toMatch(/role: 'debt', base, value: debtValue \}, keepGoing\)/)
    expect(form).toMatch(/role: 'remit', base, value: remitValue \}, keepGoing\)/)
    // Cong `!keepGoing` phai o TRONG handleRole. Soat roi ca file thi vo nghia: chinh
    // onSubmitWithFee ngay duoi cung co mot cong y het, nen assertion se xanh du
    // handleRole mat cong cua no. Chan bang khoang cach (than handleRole ~340 ky tu;
    // cong thu hai cach 3.700).
    expect(page).toMatch(
      /handleRole\(payload: RoleSubmit, keepGoing: boolean\)[\s\S]{0,800}?if \(!keepGoing\) \{\s*navigate\('\/so'\)/,
    )
  })
})

describe('nhan nut Luu khong nuot cau ly do', () => {
  // Truoc: chi ho "Con thieu: …" duoc ghep vao nhan ("Luu · con thieu so tien"), ho cau
  // hoan chinh thi khong. Gio KHONG ho nao duoc ghep — cau ly do da hien nguyen van o
  // dong ghim ngay TREN nut, o moi be rong, nen ghep len nut la noi hai lan cung mot cau.
  // Va chinh ban ghep do lam nhan vo dong: nut `flex-1` rong 135px o 375px, con
  // "Luu · con thieu so tien" can ~175px — do la trang thai NGAY KHI mo man.

  it('khong con co che ghep cau `missing` vao nhan', () => {
    expect(form).not.toMatch(/missingPhrase/)
    // `missing?.startsWith` VAN con, nhung cho viec khac: `shortMissing` quyet dinh cau
    // do hien bang mat hay chi `sr-only`. Khong con ai NOI no vao nhan nut — do la dieu
    // duy nhat khoi test nay canh, va no duoc chot o `it` ke duoi bang chinh khoi saveLabel.
    expect(form).toMatch(/const shortMissing = /)
  })

  it('thieu field -> nhan dung la Luu, khong noi suy vao', () => {
    const i = form.indexOf('const saveLabel =')
    expect(i).toBeGreaterThan(0)
    const block = form.slice(i, i + 400)
    // Khong con bat ky phep noi chuoi nao mang `missing` vao nhan.
    expect(block).not.toMatch(/\$\{missing/)
    expect(block).toContain('missing')
    expect(block).toContain("? 'Lưu'")
  })

  it('dong ly do ghim TREN nut van con trong DOM — bo ghep thi cho nay la noi duy nhat', () => {
    expect(form).toMatch(/\{!error && missing && \(/)
    expect(form).toMatch(/<p className=\{shortMissing \? 'sr-only'/)
  })
})

describe('task 8: guard payWiringPending da bi go — repay/collect da nhap duoc', () => {
  it('khong con bien payWiringPending, khong con cau "chua nhap duoc o man nay"', () => {
    // Task 6 dat guard nay CO CHU DICH, chi cho toi khi DebtPickerField co (task 8).
    // Guard con song thi hai dang tra no van bi khoa Luu du da chon khoan no.
    expect(form).not.toMatch(/payWiringPending/)
    expect(form).not.toMatch(/Hai dạng trả nợ chưa nhập được/)
  })

  it('co DebtPickerField va onSubmitPayment thay guard', () => {
    expect(form).toMatch(/<DebtPickerField/)
    expect(form).toMatch(/onSubmitPayment/)
  })
})

describe('MOT ban so cho ca man Nhap', () => {
  const planned = read('features/transactions/PlannedFields.tsx')

  it('o "Uoc tinh" khong dung components/MoneyField — cai do tu dung ban so thu hai', () => {
    // `components/MoneyField` tu dung mot ban so INLINE ngay duoi o, kem nut "Thu ban
    // phim" rieng. Dung cho cac sheet khong co ban so nao san; nhung man Nhap da co mot
    // cai ghim o day, nen dat them cai nay vao la hai kieu ban so tren cung mot man.
    expect(planned).not.toMatch(/components\/MoneyField/)
    expect(planned).toMatch(/PadMoneyField/)
  })

  it('ban so + nut xoa lui dung CUNG mot cong `padShown`', () => {
    // Lech nhau la de lai mot minh nut ⌫ go vao o khong co ban so nao dang mo.
    expect(form).toMatch(/const padShown = !plannedMode \|\| activeField === 'planned\.amount'/)
    const gates = form.match(/\{padShown && \(/g) ?? []
    expect(gates.length).toBe(2)
    expect(form).not.toMatch(/\{!plannedMode && \(\s*<div className="lg:hidden">/)
  })

  it('phim go vao plannedDraft.amount, KHONG vao digits', () => {
    // Truoc day o "Uoc tinh" nam ngoai `activeField` nen so go am tham vao `digits` va
    // hien ra thanh mot so tien nguoi dung khong he nhap luc lat ve "Da chi".
    const i = form.indexOf("activeField === 'planned.amount'", form.indexOf('function onNumPadKey'))
    expect(i).toBeGreaterThan(0)
    expect(form.slice(i, i + 200)).toMatch(/setPlannedDraft/)
  })

  it('lat Se chi <-> Da chi dat dich go theo dung man dang mo', () => {
    // Hai chieu, khong phai mot: sang "Se chi" thi ban so nham o "Uoc tinh" (o DAU cua
    // man do); ve "Da chi" thi tra ve o chinh — thieu nua sau la de `activeField` mac o
    // 'planned.amount' trong khi ban so hien lai vi `!plannedMode`, tuc moi phim go vao
    // mot khoan da roi khoi man.
    const i = form.indexOf('setWantsPlanned(v === ')
    expect(i).toBeGreaterThan(0)
    expect(form.slice(i, i + 1500)).toMatch(
      /setActiveField\(v === 'future' \? 'planned\.amount' : 'main'\)/,
    )
  })

  it('cham mot o CHU thi nha ban so ra — mot cho bat cho ca khoi', () => {
    // `onFocusCapture` o goc PlannedFields + `[data-pad-row]` bao hang o tien. Dan
    // `onFocus` len tung o thi o them sau se quen, ma loi luc do la "ban so nam chinh
    // inh trong luc dang go chu" — thu khong ai nghi ra de di thu.
    expect(planned).toMatch(/onFocusCapture=\{\(e\) =>/)
    expect(planned).toMatch(/closest\('\[data-pad-row\]'\)/)
    expect(planned).toMatch(/data-pad-row/)
    expect(form).toMatch(/onLeaveAmount=\{\(\) => setActiveField\('main'\)\}/)
  })
})

describe('vien "numpad dang nham vao toi" khong bi khoi cuon cat', () => {
  const roles = read('features/transactions/roleFields.tsx')

  it('PadMoneyField dung outline lui VAO TRONG, khong dung ring', () => {
    // `ring` cua Tailwind ve bang box-shadow, tuc NGOAI hop vien. O nay ngoi trong
    // `min-w-0 flex-1` nen mep TRAI trung dung mep long khoi cuon (`overflow-y-auto` ->
    // truc ngang cung clip): do o 360px thay o nam 12->244, long khoi 12->348, nen 2px
    // ring ben trai bi cat sach. §4.6 cung da bo hang shadow.
    expect(roles).toMatch(/outline outline-2 -outline-offset-2 outline-accent/)
    const i = roles.indexOf('export function PadMoneyField')
    const j = roles.indexOf('export function FeeField')
    // Bo dong chu thich truoc khi bat: chinh chu thich o do giai thich vi sao KHONG dung
    // `ring`, nen bat chuoi tran se do vinh vien.
    const code = roles
      .slice(i, j)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    expect(code).not.toMatch(/ring-2|ring-accent/)
  })
})

describe('"Uoc tinh" dung TRUOC "Chi cai gi"', () => {
  const planned = read('features/transactions/PlannedFields.tsx')
  const roles = read('features/transactions/roleFields.tsx')

  it('nhan "Uoc tinh" xuat hien truoc nhan "Chi cai gi" trong DOM', () => {
    // Thu tu DOM = thu tu doc + thu tu tieu diem (khong co `order-*` nao o day), nen
    // indexOf la du: man Nhap co ban so ghim day va bat "Se chi" la no nham ngay o
    // "Uoc tinh", nen o dau tien trong tam tay phai la o ma ban so dang go vao.
    const iMoney = planned.indexOf('Ước tính')
    const iTitle = planned.indexOf('Chi cái gì')
    expect(iMoney).toBeGreaterThan(0)
    expect(iTitle).toBeGreaterThan(0)
    expect(iMoney).toBeLessThan(iTitle)
  })

  it('o "Chi cai gi" KHONG con autoFocus', () => {
    // Tu gianh tieu diem o o thu hai la keo nguoi dung nguoc lai, va tren mobile no bat
    // ban phim he thong ngay luc mo man — khong ai xin.
    const i = planned.indexOf('id="entry-planned-title"')
    expect(i).toBeGreaterThan(0)
    // Bat THUOC TINH (dau dong), khong phai chu "autoFocus" o bat ky dau: chinh chu
    // thich ngay tren o do noi ve viec da bo autoFocus, nen bat chuoi tran se do mai.
    expect(planned.slice(i, i + 900)).not.toMatch(/^\s*autoFocus/m)
  })

  it('autoFocus cua o "Uoc tinh" chi an tren desktop', () => {
    // `autoFocus` dat len o `hidden lg:block`: `display:none` khong nhan duoc tieu diem
    // nen tren mobile day la no-op — KHONG co ban phim he thong nao bat len. Ten prop
    // phai noi dung dieu do, va no phai o dung o desktop.
    expect(planned).toMatch(/autoFocusDesktop/)
    const i = roles.indexOf('autoFocus={autoFocusDesktop}')
    expect(i).toBeGreaterThan(0)
    expect(roles.slice(i, i + 600)).toMatch(/hidden lg:block/)
    // ...va khong dat len nut cham cua mobile (nut do dung TRUOC input trong file).
    const btn = roles.indexOf('<button', roles.indexOf('export function PadMoneyField'))
    expect(roles.slice(btn, i)).not.toMatch(/autoFocus/)
  })
})

describe('hang chip vua MOT dong o 375px', () => {
  const tabs = read('features/transactions/DirectionTabs.tsx')

  it('khong con nhan "Dang" hien tren mat, nhung radiogroup van co ten', () => {
    // Nhan do an ~40px (chu + gap) va chinh 40px do day chip cuoi xuong dong hai.
    expect(tabs).not.toMatch(/>Dạng</)
    expect(tabs).toMatch(/aria-label="Dạng giao dịch"/)
  })

  it('van giu flex-wrap: co chu 1.25 va man 320px thi PHAI xuong dong', () => {
    // Do duoc o 375px font 1.25: chip xuong 2 dong, khong tran ngang. Bo flex-wrap la
    // doi mot dong thang o co chu thuong bang mot hang chip bi cat o co chu lon.
    expect(tabs).toMatch(/flex-wrap/)
  })

  it('nhan `repay` la "Tra no", khong phai "Toi tra no"', () => {
    const shape = read('features/transactions/entryShape.ts')
    expect(shape).toMatch(/kind: 'repay'[\s\S]{0,60}label: 'Trả nợ'/)
  })
})

describe('dong "Con thieu" khong chiem cho cua mat', () => {
  it('ho cau ngan di `sr-only`, ho cau hoan chinh van hien', () => {
    // Nut Luu da mo va o con trong nam ngay tren man, nen "Con thieu: so tien." khong
    // noi them gi cho MAT. Nhung "nut mo" khong tu giai thich duoc voi trinh doc man
    // hinh, nen cau o lai trong DOM chu khong bi bo han.
    expect(form).toMatch(/const shortMissing = missing\?\.startsWith\('Còn thiếu: '\) \?\? false/)
    expect(form).toMatch(/shortMissing \? 'sr-only' :/)
  })
})

describe('dang "Khach no cong" khong dung toi vi nao', () => {
  const validation = read('features/transactions/entryValidation.ts')

  it('CA HAI cong tai khoan deu mo cho debtOnly', () => {
    // Cong 1 o entryValidation, cong 2 o handleSubmit. Sua mot cai thi nut Luu sang len
    // roi bam khong co gi xay ra — im lang, khong cau bao nao, khong ca mot dong console.
    expect(validation).toMatch(/shape\.writes !== 'debtOnly' && !s\.hasAccount/)
    expect(form).toMatch(/const noAccountNeeded = plannedMode \|\| debtOnly/)
    expect(form).toMatch(/!noAccountNeeded && !effectiveAccountId/)
  })

  it('khong ghi LAST_ACCOUNT_KEY khi khong co vi nao', () => {
    // `localStorage.setItem(key, null)` ghi ra chuoi "null", va lan mo man sau di tim
    // mot vi co id "null".
    for (const m of form.matchAll(/localStorage\.setItem\(LAST_ACCOUNT_KEY, ([^)]+)\)/g))
      expect(m[1]).not.toBe('null')
    const guarded = form.match(/if \(effectiveAccountId\) localStorage\.setItem\(LAST_ACCOUNT_KEY/g)
    expect(guarded?.length).toBe(2)
  })

  it('o loai tien RIENG, khong doc srcCurrency', () => {
    // srcCurrency = vi dang chon ?? 'JPY'. Dang nay khong co vi, nen doc no la nguoi an
    // tien VND nhan mot khoan no ghi bang JPY ma khong ai noi gi.
    expect(form).toMatch(/const debtCurrency = debtOnly \? owedCurrency : srcCurrency/)
    expect(form).toMatch(/aria-label="Loại tiền của khoản nợ"/)
    // Payload gui di phai mang loai tien cua KHOAN NO, khong phai cua vi.
    expect(form).toMatch(/srcCurrency: debtCurrency,/)
  })

  it('cong tac giai ngan bi khoa, khong dua vao canRecordReal', () => {
    // canRecordReal noi "chua chon duoc vi"; day noi "dang nay khong co viec do".
    expect(form).toMatch(/canRecordReal=\{!debtOnly && canRecordReal\}/)
    expect(form).toMatch(/writes === 'debtOnly'\)?\s*\n?\s*setDebtVal\(\(v\) => \(\{ \.\.\.v, withTransaction: false, fee: 0 \}\)\)/)
  })

  it('bo chon nguoi cu loc theo origin — khong moi mot khoan se bi tu choi gop', () => {
    expect(form).toMatch(/p\.origin === 'earned' && p\.incomeCategoryId === categoryId/)
  })

  it('hang vi + ngay bi an', () => {
    expect(form).toMatch(/\{!debtOnly && \(\s*\n\s*<div className="flex flex-wrap items-center gap-2">/)
  })
})

// ---------------------------------------------------------------------------
// Chỗ nào nhúng <TransactionForm> thì chỗ đó phải rộng bằng lưới HAI CỘT của nó.
//
// 2026-08-20: sheet "Sửa giao dịch" trên PC vỡ giao diện. Không phải lỗi CSS lạ —
// từ `lg` TransactionForm tự chia hai cột với cột phải CỐ ĐỊNH 20rem
// (`lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]`), mà sheet lại kẹp panel ở
// `max-w-lg` (32rem). Đo trên trình duyệt ở 1280px: `grid-template-columns`
// ra đúng `144px 320px` — cột trái 144px, và dải danh mục tràn 352px trong 144px.
// EntryPage đã nới `lg:max-w-5xl` chính vì lý do này (xem chú thích ở đó); sheet
// bị bỏ sót khi lưới hai cột ra đời (5326f60).
//
// Vì sao canh bằng test đọc-chuỗi chứ không render: repo không có jsdom/test
// component, và jsdom cũng không tính layout nên không dựng lại được cảnh cột
// trái bị bóp. Cái đo được chắc chắn là con số max-w viết trong class.
const sheet = read('features/transactions/EditTransactionSheet.tsx')

/** Thang `max-w-*` của Tailwind, đơn vị rem. */
const TW_MAX_W: Record<string, number> = {
  xs: 20, sm: 24, md: 28, lg: 32, xl: 36,
  '2xl': 42, '3xl': 48, '4xl': 56, '5xl': 64, '6xl': 72, '7xl': 80,
}

/** Sàn bề rộng ở `lg`. Cột phải 20rem + gap 1rem + padding panel 2rem = 23rem chi
 *  phí cứng; muốn cột TRÁI không hẹp hơn cả bản mobile (32rem) thì panel phải
 *  ≥ 55rem → nấc Tailwind gần nhất là `4xl` (56rem). */
const LG_FLOOR_REM = 56

/** Bề rộng thực tế ở `lg`: có `lg:max-w-*` thì lấy nó, không thì `max-w-*` gốc
 *  cũng áp ở lg (không breakpoint nào ghi đè). */
function effectiveLgMaxWRem(src: string): number | null {
  const lg = [...src.matchAll(/\blg:max-w-([\w]+)\b/g)]
    .map((m) => TW_MAX_W[m[1]])
    .filter((n): n is number => n !== undefined)
  if (lg.length) return Math.min(...lg)
  const base = [...src.matchAll(/(?<![\w:-])max-w-([\w]+)\b/g)]
    .map((m) => TW_MAX_W[m[1]])
    .filter((n): n is number => n !== undefined)
  return base.length ? Math.min(...base) : null
}

describe('vung chua TransactionForm du rong cho luoi hai cot o lg', () => {
  it('form THUC SU dat cot phai co dinh 20rem tu lg', () => {
    // Neu luoi hai cot bi bo di thi hai phep thu duoi day het y nghia — chot lai
    // tien de, de test khong con xanh vi mot ly do khac.
    expect(form).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,20rem\)\]/)
  })

  it('EntryPage noi den 5xl', () => {
    expect(effectiveLgMaxWRem(page)).toBeGreaterThanOrEqual(LG_FLOOR_REM)
  })

  it('sheet Sua giao dich cung noi ra o lg, khong ket o max-w-lg', () => {
    expect(effectiveLgMaxWRem(sheet)).toBeGreaterThanOrEqual(LG_FLOOR_REM)
  })

  it('sheet VAN giu max-w-lg lam nen cho dien thoai/tablet', () => {
    // Bo han max-w o nen thi tren tablet 768px sheet keo het be rong ma van MOT cot.
    expect(sheet).toMatch(/(?<![\w:-])max-w-lg\b/)
  })
})

describe('khoi cuon cua man Nhap chi keo DOC, khong panning ngang', () => {
  it('khoi cuon mang CA overflow-x-hidden, khong chi overflow-y-auto', () => {
    // `overflow-y-auto` mot minh KHONG clip truc ngang — luat CSS tinh lai `visible` o
    // truc con lai thanh `auto`, tuc no thanh mot vung cuon THAT, keo duoc bang ngon tay.
    // Trieu chung do duoc (bao 2026-08-21): bat "Se chi" tren dien thoai thi ca form keo
    // sang trai/phai duoc, trong khi "Da chi" thi khong — chi vi nhanh "Se chi" co mot o
    // nho ra. Bo class nay la loi do quay lai ngay lan sau co field moi nho ra vai px.
    const i = form.indexOf('ref={scrollRef}')
    expect(i).toBeGreaterThan(0)
    const cls = form.slice(i, i + 400)
    expect(cls).toMatch(/overflow-y-auto overflow-x-hidden/)
  })

  it('hai dai cuon ngang CO CHU Y van tu mang overflow-x-auto', () => {
    // Neu dai nao dua vao viec khoi cuon ngoai "auto" ho thi fix tren se cat mat noi
    // dung thay vi cho cuon. Chung phai la vung cuon RIENG.
    expect(form).toMatch(/flex gap-1\.5 overflow-x-auto/)
  })
})
