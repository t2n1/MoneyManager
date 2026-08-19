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
    expect(form).toMatch(/kind === 'lend' \|\| kind === 'borrow'\)?\s*&&\s*\(?\s*<DebtFields/)
    expect(form).toMatch(/kind === 'family' \|\| kind === 'ownvn'\)?\s*&&\s*\(?\s*<RemitFields/)
  })

  it('khong con banner vai tro — hang Dang da noi dang nao dang bat', () => {
    expect(form).not.toMatch(/roleMeta/)
  })
})

describe('"Luu va nhap tiep" phai o LAI man o CA 10 dang', () => {
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

describe('nhan nut Luu khong nuot mot cau hoan chinh', () => {
  it('chi ho "Con thieu: …" duoc ghep vao nhan nut', () => {
    // Nam cau `missing` la CAU HOAN CHINH (dai nhat 130 ky tu). Ghep vao mot nut
    // `flex-1` ~131px o 360px la vo 3-4 dong ngay trong khoi ghim day, an chieu cao cua
    // vung cuon — va cau do da hien nguyen van ngay TREN nut.
    expect(form).toMatch(/missing\?\.startsWith\('Còn thiếu: '\)/)
    expect(form).toMatch(/missingPhrase/)
  })

  it('ly do cua hai dang tra no nam trong khoi GHIM day, khong trong vung cuon', () => {
    const pinned = form.indexOf('Đáy ghim')
    const reason = form.indexOf('Hai dạng trả nợ chưa nhập được')
    expect(pinned).toBeGreaterThan(0)
    expect(reason).toBeGreaterThan(pinned)
  })
})
