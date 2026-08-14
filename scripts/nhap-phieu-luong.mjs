// Tang 2 — ghi phieu luong da boc (phieu-luong.json) vao so.
// Xem docs/superpowers/specs/2026-08-14-nhap-phieu-luong-design.md
//
// Chay:
//   node scripts/phieu-luong/boc.py <thu-muc-pdf> -o phieu-luong.json   (tang 1, Python)
//
//   node scripts/nhap-phieu-luong.mjs phieu-luong.json                  xem truoc
//   node scripts/nhap-phieu-luong.mjs phieu-luong.json --ghi            ghi that
//   node scripts/nhap-phieu-luong.mjs phieu-luong.json --go             go lo nhap
//   node scripts/nhap-phieu-luong.mjs --tao-danh-muc                    tao 6 danh muc
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
// Chot 5 co phan "> 0" vi mot ly do da tra gia: 202312K co rong 500.678 > gop
// 485.610 (hoan thue cuoi nam 88.544 lon hon tong khau tru 73.476), nen dong thu
// them phai AM — ma DB co check(amount > 0). Bat bien "thu == chi == gop - rong"
// BAO DUNG cho ca nay vi ca ba deu bang -15.068. Chi chot dau moi bat duoc.

import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import {
  DANH_MUC_THUE_CHA,
  DANH_MUC_THUE_CON,
  dauGhiChu,
  dungDong,
  gomTrung,
  kiemDong,
  timNeo,
} from './phieu-luong/logic.mjs'

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

  const { data: thu, error: e3 } = await sb
    .from('transactions')
    .select('id,occurred_on,amount,note,account_id,category_id')
    .eq('type', 'income')
    .eq('account_id', yucho.id)
    .order('occurred_on')
  if (e3) thoat(`Doc transactions loi: ${e3.message}`)

  const { data: daCo, error: e4 } = await sb
    .from('transactions')
    .select('id,note')
    .like('note', `${DAU_TIEN_TO}%`)
  if (e4) thoat(`Doc dong da nhap loi: ${e4.message}`)

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
  const { data, error } = await sb.from('transactions').select('id,occurred_on,amount,note,type')
    .like('note', `${DAU_TIEN_TO}%`)
  if (error) thoat(`Doc loi: ${error.message}`)
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
function dungKeHoach(phieuList, so) {
  const idTheoTen = new Map(
    so.cats.filter((c) => c.type === 'expense').map((c) => [c.name, c.id]),
  )
  const dauDaCo = new Set(so.daCo.map((t) => t.note.split(' · ')[0]))
  const daDung = new Set()
  const ok = []
  const boQua = []

  // Chot 0 — gom file trung TRUOC khi neo, neu khong chot neo se bao sai nguyen nhan.
  const trung = gomTrung(phieuList)
  for (const g of trung.boQua) boQua.push({ p: { file: g.files.join(' + ') }, ly_do: g.ly_do })
  for (const g of trung.daGop) {
    console.log(`  i trung byte, gop lam mot: ${g.files.join(' = ')}`)
  }

  for (const p of trung.giu) {
    if (p.loi?.length) {
      boQua.push({ p, ly_do: `tang 1 bao loi: ${p.loi.join(' ; ')}` })
      continue
    }
    const neo = timNeo(so.thu, p, so.yucho.id, daDung)
    if (!neo.ok) {
      boQua.push({ p, ly_do: neo.ly_do })
      continue
    }
    const dau = dauGhiChu(neo.row.occurred_on, p.kind)
    if (dauDaCo.has(dau)) {
      boQua.push({ p, ly_do: `da nhap roi (dau '${dau}' da co trong so)` })
      continue
    }
    let dong
    try {
      dong = dungDong(p, neo.row, idTheoTen)
    } catch (e) {
      boQua.push({ p, ly_do: e.message })
      continue
    }
    const loi = kiemDong(p, dong.thu, dong.chi, dong.thuKhac)
    if (loi.length) {
      boQua.push({ p, ly_do: loi.join(' ; ') })
      continue
    }
    daDung.add(neo.row.id)
    ok.push({ p, neo: neo.row, dau, ...dong })
  }
  return { ok, boQua }
}

function inKeHoach({ ok, boQua }) {
  console.log(`\n=== ${ok.length} phieu san sang · ${boQua.length} phieu bo qua ===\n`)
  for (const r of ok) {
    const chi = r.chi.map((c) => `${c.note.split(' · ')[1]} ${c.is_refund ? '−' : ''}${c.amount}${c.exclude_from_stats ? '' : ' [trong Chi]'}`)
    console.log(`  ${r.dau}  neo ${r.neo.occurred_on} (${r.neo.amount})`)
    const t2 = r.thuKhac ? `  + ${r.thuKhac.amount} [trong Thu]` : ''
    console.log(`      thu +${r.thu.amount} [ngoai Thu/Chi]${t2}  |  chi: ${chi.join(' · ')}`)
  }
  if (boQua.length) {
    console.log('\n--- Bo qua ---')
    for (const b of boQua) console.log(`  X ${b.p.file}\n      ${b.ly_do}`)
  }
  const dong = ok.reduce((s, r) => s + 1 + r.chi.length, 0)
  const tongThu = ok.reduce((s, r) => s + r.thu.amount, 0)
  console.log(`\nTong: ${dong} dong (${ok.length} thu + ${dong - ok.length} chi) · thu them ${tongThu} ¥`)
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
  if (!duong) thoat('Thieu duong dan phieu-luong.json. Xem dau file de biet cach chay.')

  const phieuList = JSON.parse(readFileSync(duong, 'utf8'))
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

  const kh = dungKeHoach(phieuList, so)
  inKeHoach(kh)

  if (!ghi) return console.log('\n(xem truoc — them --ghi de ghi that)')
  if (kh.ok.length === 0) return console.log('\nKhong co phieu nao de ghi.')

  const dong = kh.ok.reduce((s, r) => s + 1 + r.chi.length, 0)
  const thuan = daXacNhan || (await hoiYN(`\nGhi ${dong} dong vao so THAT?`))
  if (!thuan) return console.log('Huy — khong ghi gi.')
  const n = await ghiKeHoach(sb, kh.ok)
  console.log(`\n✓ Da ghi ${n} phieu. Go lai:  node scripts/nhap-phieu-luong.mjs --go --ghi`)
}

main().catch((e) => thoat(e.stack || e.message))
