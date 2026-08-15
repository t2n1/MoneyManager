// Tang 2 — tu boc phieu luong tu thu muc PDF roi ghi vao so.
// Xem docs/superpowers/specs/2026-08-14-nhap-phieu-luong-design.md
//
// Chay:
//   node scripts/nhap-phieu-luong.mjs "<thu-muc-pdf>"           xem truoc
//   node scripts/nhap-phieu-luong.mjs "<thu-muc-pdf>" --ghi     ghi that
//   node scripts/nhap-phieu-luong.mjs --go                      go lo nhap
//   node scripts/nhap-phieu-luong.mjs --tao-danh-muc            tao 6 danh muc
//
// KHOA — vi sao KHONG dung SUPABASE_SERVICE_ROLE_KEY nhu nhap-sao-ke-rakuten.mjs:
// `transactions` chi co policy "own rows" (auth.uid() = user_id), khong co bang phu
// nao mo cho `authenticated` nhu `fund_aliases`, nen mot JWT dang nhap thuong cua
// CHINH chu tai khoan thoa het ca doc lan ghi. Service role la quyen rong hon muc
// can. Lay token theo thu tu: bien moi truong SUPABASE_ACCESS_TOKEN, hoac o nhap KIN
// (khong hien man hinh, khong vao argv, khong vao lich su shell).
//
// VAN AN TOAN nam o BUOC GHI, sau sau chot deu chay TRUOC no:
//   1. du 6 danh muc thue theo dung ten     4. chua co dong nao mang dau (chong trung)
//   2. moi phieu qua hai dang thuc tu kiem  5. thu-them == chi-them, va thu-them > 0
//   3. moi phieu neo dung MOT khoan Yucho   6. co --ghi + xac nhan y/N mac dinh KHONG
//
// Chot 5 co phan "> 0" vi mot ly do da tra gia: 202312K co rong 420.000 > gop
// 400.000 (hoan thue cuoi nam 90.000 lon hon tong khau tru 70.000 — so minh hoa,
// khong phai so that), nen dong thu them phai AM — ma DB co check(amount > 0).
// Bat bien "thu == chi == gop - rong" BAO DUNG cho ca nay vi ca ba deu bang
// -20.000. Chi chot dau moi bat duoc.

import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'
import { createClient } from '@supabase/supabase-js'
const { DANH_MUC_THUE_CHA, DANH_MUC_THUE_CON, dungKeHoach, gomTrung, phieuLoi } =
  await import('../src/features/phieu-luong/nhap.ts')
const { bocPhieu } = await import('../src/features/phieu-luong/boc.ts')
const { docPdfNode } = await import('./phieu-luong/docPdfNode.mjs')
// paging.ts khong co import nao ca (thuan logic) nen nap thang duoc o day, giong
// cach hai dong tren da nap boc.ts/nhap.ts — khong can ban rieng cho CLI. Web dung
// ham nay qua supabaseRepo.ts (listYuchoIncome/listDauPhieuLuong); CLI phai lam
// giong vi ca hai deu doc tu cung mot bang `transactions` bi PostgREST cat im lang
// o 1.000 dong (xem src/data/paging.ts).
const { fetchAllPages } = await import('../src/data/paging.ts')

const TEN_YUCHO = /yucho/i
const DAU_TIEN_TO = '給与 '

// --- doc .env.local ---------------------------------------------------------
function docEnv() {
  let txt = ''
  try {
    txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  } catch {
    thoat('Khong doc duoc .env.local o goc repo.')
  }
  const lay = (k) => txt.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
  const url = lay('VITE_SUPABASE_URL')
  const anon = lay('VITE_SUPABASE_ANON_KEY')
  if (!url || !anon) thoat('Thieu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong .env.local.')
  return { url, anon }
}

async function hoiKin(nhan) {
  // Doc mot dong khong hien ky tu.
  //
  // Dong nhac phai in TRUOC khi tat _writeToOutput: readline in ca cau hoi QUA
  // _writeToOutput, nen tat truoc roi moi goi question() thi an luon dong nhac —
  // nguoi dung thay man hinh trong va tuong script treo.
  stdout.write(`${nhan}: `)
  const rl = createInterface({ input: stdin, output: stdout, terminal: true })
  rl._writeToOutput = () => {}
  const v = await new Promise((res) => rl.question('', res))
  rl.close()
  stdout.write('\n')
  return v.trim()
}

async function hoiYN(cauHoi) {
  if (!stdin.isTTY) return false
  const rl = createInterface({ input: stdin, output: stdout })
  const v = await new Promise((res) => rl.question(`${cauHoi} [y/N] `, res))
  rl.close()
  return /^y(es)?$/i.test(v.trim())
}

const thoat = (msg) => {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

async function taoClient() {
  const { url, anon } = docEnv()
  let token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    if (!stdin.isTTY) thoat('Thieu SUPABASE_ACCESS_TOKEN (va khong co terminal de hoi).')
    token = await hoiKin('Access token (Application > Local Storage > sb-*-auth-token > access_token)')
  }
  if (!token) thoat('Khong co token.')
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// --- tai du lieu so --------------------------------------------------------
async function taiSo(sb) {
  const { data: accs, error: e1 } = await sb.from('accounts').select('id,name,currency')
  if (e1) thoat(`Doc accounts loi: ${e1.message} (token con han khong?)`)
  const yucho = accs.find((a) => TEN_YUCHO.test(a.name))
  if (!yucho) thoat('Khong tim thay tai khoan Yucho Bank.')

  const { data: cats, error: e2 } = await sb.from('categories').select('id,name,type,parent_id')
  if (e2) thoat(`Doc categories loi: ${e2.message}`)

  // Phan trang: moi phieu luong ghi them 1 dong thu Yucho, va so co the da nap
  // nhieu nam lich su — tran 1.000 dong cua PostgREST cat im lang. Thieu MOT
  // khoan thu la phieu luong DUNG do khong neo duoc, bao "khong thay" sai cho.
  // `id` lam chot cuoi vi occurred_on khong don tri (xem src/data/paging.ts).
  // Y het supabaseRepo.ts:listYuchoIncome — CLI va web phai doc cung mot cach.
  const thu = await fetchAllPages(async (from, to) => {
    const r = await sb
      .from('transactions')
      .select('id,occurred_on,amount,note,account_id,category_id')
      .eq('type', 'income')
      .eq('account_id', yucho.id)
      .order('occurred_on')
      .order('id')
      .range(from, to)
    if (r.error) thoat(`Doc transactions loi: ${r.error.message}`)
    return r
  })

  // Phan trang: moi phieu luong ghi ~7 dong mang dau `給与 …` (~420 dong hien tai,
  // tang ~7/thang) — cung ly do voi thu o tren. Thieu dau o day la chot chong
  // nhap trung cho phep NHAP TRUNG VAO SO THAT. Y het supabaseRepo.ts:listDauPhieuLuong.
  const daCo = await fetchAllPages(async (from, to) => {
    const r = await sb
      .from('transactions')
      .select('id,note')
      .like('note', `${DAU_TIEN_TO}%`)
      .order('id')
      .range(from, to)
    if (r.error) thoat(`Doc dong da nhap loi: ${r.error.message}`)
    return r
  })

  return { yucho, cats, thu, daCo }
}

// --- che do: tao danh muc --------------------------------------------------
async function taoDanhMuc(sb, ghi) {
  const { data: cats } = await sb.from('categories').select('id,name,type,parent_id')
  const coCha = cats.find((c) => c.type === 'expense' && c.name === DANH_MUC_THUE_CHA)
  const canTao = DANH_MUC_THUE_CON.filter(
    (c) => !cats.some((x) => x.type === 'expense' && x.name === c.name),
  )
  console.log(`\nDanh muc cha '${DANH_MUC_THUE_CHA}': ${coCha ? 'da co' : 'CHUA CO'}`)
  console.log(`Danh muc con can tao: ${canTao.length}/${DANH_MUC_THUE_CON.length}`)
  for (const c of canTao) console.log(`  + ${c.icon} ${c.name}  [${c.need_level} · ${c.cost_type}]`)
  if (!coCha) console.log(`  + 🏛️ ${DANH_MUC_THUE_CHA}  (cha)`)
  if (!ghi) return console.log('\n(xem truoc — them --ghi de tao that)')
  if (!coCha && canTao.length === 0) return console.log('\nKhong co gi de tao.')

  let chaId = coCha?.id
  if (!chaId) {
    const { data, error } = await sb
      .from('categories')
      .insert({ name: DANH_MUC_THUE_CHA, type: 'expense', icon: '🏛️' })
      .select('id')
      .single()
    if (error) thoat(`Tao danh muc cha loi: ${error.message}`)
    chaId = data.id
  }
  for (const c of canTao) {
    const { error } = await sb.from('categories').insert({
      name: c.name,
      type: 'expense',
      icon: c.icon,
      parent_id: chaId,
      need_level: c.need_level,
      cost_type: c.cost_type,
    })
    if (error) thoat(`Tao '${c.name}' loi: ${error.message}`)
    console.log(`  ✓ ${c.name}`)
  }
  console.log('\nXong. Chay lai lenh nhap de xem truoc.')
}

// --- che do: go ------------------------------------------------------------
async function goLoNhap(sb, ghi) {
  // Phan trang: khong the bao "N dong se bi xoa" DUNG neu truy van bi PostgREST
  // cat im lang o 1.000 dong — ca sac nhat la in con so THAP HON that roi van xoa
  // HET (delete() ben duoi khong bi tran nay, no xoa theo dieu kien chu khong doc
  // tung trang), tuc hop xac nhan noi dung sai ve mot thao tac pha huy.
  const data = await fetchAllPages(async (from, to) => {
    const r = await sb.from('transactions').select('id,occurred_on,amount,note,type')
      .like('note', `${DAU_TIEN_TO}%`)
      .order('id')
      .range(from, to)
    if (r.error) thoat(`Doc loi: ${r.error.message}`)
    return r
  })
  console.log(`\n${data.length} dong mang dau '${DAU_TIEN_TO}…' se bi xoa.`)
  for (const t of data.slice(0, 8)) console.log(`  ${t.occurred_on} ${t.type} ${t.amount} — ${t.note}`)
  if (data.length > 8) console.log(`  … +${data.length - 8} dong nua`)
  if (!ghi) return console.log('\n(xem truoc — them --ghi de xoa that)')
  if (data.length === 0) return
  const { error: e2 } = await sb.from('transactions').delete().like('note', `${DAU_TIEN_TO}%`)
  if (e2) thoat(`Xoa loi: ${e2.message}`)
  console.log(`\n✓ Da xoa ${data.length} dong.`)
}

// --- che do: nhap ---------------------------------------------------------
// dungKeHoach() ban than la ham THUAN, dung chung voi trang web (nhap.ts) — CLI
// khong con giu ban sao rieng nua, tranh hai noi tinh ra hai ke hoach khac nhau
// tu cung mot lo PDF va cung mot so.
function inKeHoach(kh) {
  const dat = kh.filter((k) => k.trangThai === 'dat')
  const daNhap = kh.filter((k) => k.trangThai === 'da-nhap')
  const tuChoi = kh.filter((k) => k.trangThai === 'tu-choi')
  console.log(
    `\n=== ${dat.length} phieu san sang · ${daNhap.length} da nhap roi · ${tuChoi.length} tu choi ===\n`,
  )
  for (const r of dat) {
    const chi = r.chi.map((c) => `${c.note.split(' · ')[1]} ${c.is_refund ? '−' : ''}${c.amount}${c.exclude_from_stats ? '' : ' [trong Chi]'}`)
    console.log(`  ${r.dau}  neo ${r.neo.occurred_on} (${r.neo.amount})`)
    const t2 = r.thuKhac ? `  + ${r.thuKhac.amount} [trong Thu]` : ''
    console.log(`      thu +${r.thu.amount} [ngoai Thu/Chi]${t2}  |  chi: ${chi.join(' · ')}`)
  }
  // "da nhap roi" KHONG phai loi — phan biet voi "tu choi" thay vi gop chung mot
  // danh sach "bo qua" nhu ban cu, de nguoi doc khong tuong nham la co gi do sai.
  if (daNhap.length) {
    console.log('\n--- Da nhap roi (khong phai loi, khong can lam gi) ---')
    for (const k of daNhap) console.log(`  = ${k.phieu.file} (${k.dau})`)
  }
  if (tuChoi.length) {
    console.log('\n--- Tu choi ---')
    for (const k of tuChoi) console.log(`  X ${k.phieu.file}\n      ${k.lyDo}`)
  }
  // +1 cho thuKhac khi co: ghiKeHoach ghi CA dong nay, nen dem thieu no la loi hen
  // "Ghi N dong THAT?" thap hon so dong thuc su sap ghi vao so.
  const dong = dat.reduce((s, r) => s + 1 + (r.thuKhac ? 1 : 0) + r.chi.length, 0)
  const soThu = dat.reduce((s, r) => s + 1 + (r.thuKhac ? 1 : 0), 0)
  const tongThu = dat.reduce((s, r) => s + r.thu.amount + (r.thuKhac ? r.thuKhac.amount : 0), 0)
  console.log(`\nTong: ${dong} dong (${soThu} thu + ${dong - soThu} chi) · thu them ${tongThu} ¥`)
  console.log('So du KHONG doi: thu vao chi ra cung ngay cung tai khoan, triet tieu.')
}

async function ghiKeHoach(sb, ok) {
  let n = 0
  for (const r of ok) {
    const rows = [r.thu, ...(r.thuKhac ? [r.thuKhac] : []), ...r.chi]
    const { error } = await sb.from('transactions').insert(rows)
    if (error) thoat(`Ghi '${r.dau}' loi: ${error.message}\nDa ghi ${n} phieu truoc do — chay --go de go het.`)
    n += 1
    stdout.write(`\r  da ghi ${n}/${ok.length} phieu`)
  }
  stdout.write('\n')
  return n
}

// --- main -----------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2)
  const co = (f) => args.includes(f)
  const ghi = co('--ghi')
  const daXacNhan = co('--da-xac-nhan') // chi dung khi da xac nhan NGOAI terminal
  const duong = args.find((a) => !a.startsWith('--'))

  const sb = await taoClient()

  if (co('--tao-danh-muc')) return taoDanhMuc(sb, ghi)
  if (co('--go')) return goLoNhap(sb, ghi)
  if (!duong) thoat('Thieu duong dan thu muc PDF. Xem dau file de biet cach chay.')

  // Nhan THU MUC PDF, tu boc — khong con buoc trung gian phieu-luong.json.
  const { readdirSync, statSync } = await import('node:fs')
  if (!statSync(duong).isDirectory()) thoat(`Khong phai thu muc: ${duong}`)
  const tenFiles = readdirSync(duong).filter((f) => f.endsWith('.pdf')).sort()
  if (tenFiles.length === 0) thoat(`Khong co file .pdf nao trong ${duong}`)
  const phieuList = []
  for (const f of tenFiles) {
    try {
      phieuList.push(bocPhieu(await docPdfNode(`${duong}/${f}`), f))
    } catch (e) {
      // phieuLoi() dung CHUNG voi web (ImportPhieuLuongPage.tsx) de hai ben tra
      // ve CUNG MOT HINH DANG Phieu — CLI khong co kieu nen truoc day khong gi
      // bat duoc neu hai ben lech nhau (xem finding review round cuoi).
      phieuList.push(phieuLoi(f, `doc PDF loi: ${e.message}`))
    }
  }
  console.log(`Da boc ${phieuList.length} file tu ${duong}`)
  const so = await taiSo(sb)

  // Chot 1 — du danh muc theo dung TEN.
  const ten = new Set(so.cats.filter((c) => c.type === 'expense').map((c) => c.name))
  const thieu = DANH_MUC_THUE_CON.map((c) => c.name).filter((n) => !ten.has(n))
  if (thieu.length) {
    thoat(
      `Thieu ${thieu.length} danh muc thue:\n    ${thieu.join('\n    ')}\n` +
        '  Chay:  node scripts/nhap-phieu-luong.mjs --tao-danh-muc --ghi',
    )
  }
  if (!ten.has('Đi chợ')) thoat("Thieu danh muc 'Đi chợ' (cho 社内販売精算).")

  // gomTrung() goi rieng o day CHI de bao "trung byte, gop lam mot" cho nguoi dung —
  // dungKeHoach ben duoi tu goi lai ham nay, khong doi chu ky cua no.
  const { daGop } = gomTrung(phieuList)
  for (const g of daGop) console.log(`  i trung byte, gop lam mot: ${g.files.join(' = ')}`)

  // dungKeHoach() la ham THUAN dung chung voi trang web — unpack `so` thanh tung
  // tham so rieng thay vi truyen ca cuc, vi hinh dang cua ham do web quyet dinh.
  const idTheoTen = new Map(so.cats.filter((c) => c.type === 'expense').map((c) => [c.name, c.id]))
  const dauDaCo = new Set(so.daCo.map((t) => t.note.split(' · ')[0]))
  const kh = dungKeHoach(phieuList, so.thu, so.yucho.id, idTheoTen, dauDaCo)
  inKeHoach(kh)

  const dat = kh.filter((k) => k.trangThai === 'dat')
  if (!ghi) return console.log('\n(xem truoc — them --ghi de ghi that)')
  if (dat.length === 0) return console.log('\nKhong co phieu nao de ghi.')

  // +1 cho thuKhac khi co — cung ly do voi inKeHoach() o tren.
  const dong = dat.reduce((s, r) => s + 1 + (r.thuKhac ? 1 : 0) + r.chi.length, 0)
  const thuan = daXacNhan || (await hoiYN(`\nGhi ${dong} dong vao so THAT?`))
  if (!thuan) return console.log('Huy — khong ghi gi.')
  const n = await ghiKeHoach(sb, dat)
  console.log(`\n✓ Da ghi ${n} phieu. Go lai:  node scripts/nhap-phieu-luong.mjs --go --ghi`)
}

main().catch((e) => thoat(e.stack || e.message))
