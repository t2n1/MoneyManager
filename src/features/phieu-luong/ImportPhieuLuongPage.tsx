import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileUp } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import { ActionButton } from '../../components/ui/ActionButton'
import { Card } from '../../components/ui/Card'
import {
  invalidateTransactionData,
  useAccounts,
  useCategories,
  useCreateAccount,
  useCreateCategory,
  useDauPhieuLuong,
  useDebtPayments,
  useDebts,
  invalidateDebts,
} from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import { confirmDialog, showToast } from '../../lib/dialog'
import { repo } from '../../data'
import { hasTaxCategories } from '../tax/categories'
import { bocPhieu, type Phieu } from './boc'
import { docPdfWeb } from './docPdfWeb'
import { PageHeader, actionButtonClass } from '../../components/ui'
import {
  DANH_MUC_THUE_CHA,
  DANH_MUC_THUE_CON,
  DANH_MUC_PHU_CAP,
  NHAN_DI_LAI,
  NHAN_HUU,
  NHAN_LA_THEO,
  TEN_NO_CONG_TY,
  TEN_TK_HUU,
  TK_HUU_MOI,
  dungKeHoach,
  gomTrung,
  phieuLoi,
  type DongKeHoach,
} from './nhap'

const TEN_YUCHO = /yucho/i

/**
 * `input.files` la MOT BO SUU TAP SONG (FileList), khong phai mot ban chup — do
 * that trong trinh duyet: dat `input.value = ''` xoa luon file BEN TRONG chinh no
 * cung mot doi tuong, khong phai mot ban sao roi rac. Chup lai thanh MANG THUONG
 * (Array.from) truoc khi reset input, hoac danh sach se rong khong con file nao
 * ngay khi handler goi toi no lan sau. THUAN — khong dung DOM ngoai `files` truyen
 * vao, nen test duoc ma khong can dung trinh duyet that.
 */
export function layDanhSachFile(files: FileList | null): File[] {
  return files ? Array.from(files) : []
}

export function ImportPhieuLuongPage() {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const createCategory = useCreateCategory()
  const createAccount = useCreateAccount()
  const { data: dauTrongSo = [] } = useDauPhieuLuong()
  const { data: debts = [] } = useDebts()
  const { data: debtPayments = [] } = useDebtPayments()
  const [keHoach, setKeHoach] = useState<DongKeHoach[] | null>(null)
  const [daGop, setDaGop] = useState<{ key: string; files: string[] }[]>([])
  const [dangBoc, setDangBoc] = useState(false)
  const [dangGhi, setDangGhi] = useState(false)
  const [dangXoa, setDangXoa] = useState(false)
  const [daGhi, setDaGhi] = useState<{ phieu: number; dong: number } | null>(null)
  // Chan click kep THAT: state (dangGhi/dangXoa) chi dung de HIEN thi (nhan nut,
  // disabled) — no khong doc duoc gia tri moi cho toi khi component render lai,
  // nen trong luc await confirmDialog() (truoc khi setDangGhi(true) chay) hai
  // lan bam lien tiep van cung doc thay false. Ref thi doc/ghi NGAY, dong bo,
  // nen dat co ngay dau ham (truoc ca khi mo hop thoai xac nhan) la chan that.
  const dangGhiRef = useRef(false)
  const dangXoaRef = useRef(false)

  const yucho = accounts.find((a) => TEN_YUCHO.test(a.name))
  // Khớp theo TEN CHINH XAC, khong regex: 退職金 la ten tai khoan do chinh app tao ra
  // (TK_HUU_MOI), va mot regex long tay se nhan bua sang tai khoan khac cua nguoi dung.
  const tkHuu = accounts.find((a) => a.name === TEN_TK_HUU)
  const chiPhi = categories.filter((c) => c.type === 'expense')
  /**
   * Danh muc THU nhan 通勤手当. Loc theo type='income' chu khong tim ca bang: so co the
   * co mot 'Phu cap di lai' loai CHI do nguoi dung tu tao, va dat category_id loai chi
   * vao mot dong `type: 'income'` la dung mot dong khong hien o bao cao nao.
   */
  const dmPhuCap = categories.find((c) => c.type === 'income' && c.name === DANH_MUC_PHU_CAP)
  const thieuDanhMuc = DANH_MUC_THUE_CON.map((c) => c.name).filter(
    (n) => !chiPhi.some((c) => c.name === n),
  )

  /**
   * Khoản `KOME` công ty nợ, khớp ĐÚNG TỪNG KÝ TỰ — sổ đã có `Minh KOME` (một NGƯỜI),
   * và khớp kiểu "chứa" là trừ tiền công ty vào khoản Minh nợ.
   */
  const noKome = debts.find(
    (d) => d.counterparty === TEN_NO_CONG_TY && d.direction === 'owed_to_me' && d.status === 'open',
  )
  const conLaiKome = noKome
    ? noKome.principal -
      debtPayments.filter((t) => t.debt_id === noKome.id).reduce((s2, t) => s2 + t.amount, 0)
    : 0
  const no = noKome ? { id: noKome.id, conLai: conLaiKome } : null
  /**
   * Tên GẦN GIỐNG. Không có khoản `KOME` thì phiếu rơi về cách cũ (chỉ rút khỏi Thu) —
   * đúng cho phiếu cũ, nhưng nếu người dùng TƯỞNG mình đã tạo khoản nợ đó rồi mà chỉ đặt
   * tên lệch, thì cách rơi lại kia lặng lẽ. Nói ra chỗ lệch, đừng để họ tự đoán.
   */
  const tenGanGiong = !noKome
    ? debts
        .filter((d) => d.counterparty !== TEN_NO_CONG_TY && d.counterparty.includes(TEN_NO_CONG_TY))
        .map((d) => d.counterparty)
    : []

  // Nhan File[] (da chup san bang layDanhSachFile), KHONG nhan FileList: FileList
  // song se rong truoc khi ham nay kip doc, vi onChange da dat input.value = ''
  // TRUOC khi goi ham nay (xem chu thich tai onChange ben duoi).
  async function chonFile(files: File[]) {
    if (!files.length || !yucho) return
    setDangBoc(true)
    try {
      const phieuList: Phieu[] = []
      for (const f of files) {
        try {
          phieuList.push(bocPhieu(await docPdfWeb(f), f.name))
        } catch (e) {
          // phieuLoi() dung CHUNG voi CLI (nhap-phieu-luong.mjs) de hai ben tra ve
          // CUNG MOT HINH DANG Phieu khi khong doc duoc PDF.
          phieuList.push(phieuLoi(f.name, `đọc PDF lỗi: ${(e as Error).message}`))
        }
      }
      // gomTrung() lai o day CHI de lay daGop hien cho nguoi dung biet — dungKeHoach
      // tu goi lai ham nay ben trong, khong doi chu ky cua no.
      setDaGop(gomTrung(phieuList).daGop)
      const thu = await repo.listYuchoIncome(yucho.id)
      /**
       * Doc TUOI o day, KHONG dung `dauTrongSo` cua useDauPhieuLuong.
       *
       * Hook do phuc vu viec hien nut go lo — mot quyet dinh hien thi, sai thi thay ngay.
       * Con tap dau nay quyet dinh CO GHI hay khong: query dang loading (hoac stale) tra
       * ve [] , va [] nghia la "chua ky nao duoc nhap" → ca 55 phieu duoc ghi TRUNG. Chon
       * file ngay khi vua mo trang la du de gap. Mot luot fetch trung re hon nhieu.
       */
      const dauDaCo = new Set(await repo.listDauPhieuLuong())
      const idTheoTen = new Map(chiPhi.map((c) => [c.name, c.id]))
      setKeHoach(
        dungKeHoach(
          phieuList, thu, yucho.id, idTheoTen, dauDaCo, tkHuu?.id ?? null, no,
          dmPhuCap?.id ?? null,
        ),
      )
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không đọc được dữ liệu sổ, thử lại.', 'error')
    } finally {
      setDangBoc(false)
    }
  }

  async function taoDanhMuc() {
    try {
      // Chi tao danh muc CHA khi chua co — trung voi cach CLI kiem tra coCha, tranh
      // tao trung 'Thuế & An sinh' cho nguoi chi thieu vai danh muc con.
      let chaId: string | undefined
      if (hasTaxCategories(categories)) {
        chaId = categories.find((c) => c.type === 'expense' && c.name === DANH_MUC_THUE_CHA)?.id
      } else {
        const cha = await createCategory.mutateAsync({
          name: DANH_MUC_THUE_CHA, type: 'expense', icon: '🏛️', parent_id: null,
        })
        chaId = cha.id
      }
      for (const c of DANH_MUC_THUE_CON) {
        if (chiPhi.some((x) => x.name === c.name)) continue
        await createCategory.mutateAsync({ ...c, type: 'expense', parent_id: chaId })
      }
      showToast('Đã tạo danh mục')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không tạo được danh mục, thử lại.', 'error')
    }
  }

  /** Danh muc THU nhan 通勤手当 (xem DANH_MUC_PHU_CAP). */
  async function taoDmPhuCap() {
    try {
      await createCategory.mutateAsync({
        name: DANH_MUC_PHU_CAP, type: 'income', icon: '🚉', parent_id: null,
      })
      showToast(`Đã tạo danh mục ${DANH_MUC_PHU_CAP}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không tạo được danh mục, thử lại.', 'error')
    }
  }

  /**
   * Tao tai khoan 退職金 (DB掛金 — hagukumikikin.jp). Currency lay theo TAI KHOAN NEO,
   * khong gan cung 'JPY': luong vao dau thi tien huu tinh theo dong tien do.
   */
  async function taoTkHuu() {
    if (!yucho) return
    try {
      await createAccount.mutateAsync({ ...TK_HUU_MOI, currency: yucho.currency })
      showToast(`Đã tạo tài khoản ${TEN_TK_HUU}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không tạo được tài khoản, thử lại.', 'error')
    }
  }

  if (!yucho) {
    return (
      <div className="p-3">
        <BackLink to="/settings/data" aria-label="Dữ liệu" />
        <p className="mt-3 text-sm text-money-out">Không tìm thấy tài khoản Yucho Bank.</p>
      </div>
    )
  }

  const dat = keHoach?.filter((k) => k.trangThai === 'dat') ?? []
  // +k.cap.length: khoi 支給 (hoan phi di lai / DB掛金) cung duoc ghi, dem thieu la loi hen.
  const soDong = dat.reduce(
    (s, k) => s + 1 + (k.thuKhac ? 1 : 0) + k.chi.length + k.cap.length + (k.traNo ? 1 : 0),
    0,
  )
  // Chep ra bien rieng: TS khong giu suy luan "khac undefined" cua yucho xuyen
  // qua bien ngoai khi dung trong ham long ben duoi (ghi/goLo).
  const tenYucho = yucho.name

  async function ghi() {
    // dangGhiRef, khong phai state dangGhi: xem chu thich o khai bao ref phia
    // tren — chan tu day, TRUOC ca khi mo hop thoai xac nhan, moi la chan that.
    if (dangGhiRef.current) return
    dangGhiRef.current = true
    try {
      if (
        !(await confirmDialog({
          title: `Ghi ${soDong} dòng vào sổ?`,
          message: `${dat.length} phiếu lương, ghi vào tài khoản "${tenYucho}".`,
          confirmLabel: 'Ghi',
        }))
      )
        return
      setDangGhi(true)
      let nPhieu = 0
      let nDong = 0
      // Dau cua tung phieu da ghi XONG (ca thu lan chi) — de bao chinh xac
      // "nhung phieu nao" neu vong lap duoi day dung giua chung vi loi.
      const dauDaGhi: string[] = []
      try {
        for (const k of dat) {
          for (const row of [k.thu!, ...(k.thuKhac ? [k.thuKhac] : []), ...k.chi, ...k.cap]) {
            await repo.createTransaction(row)
            nDong += 1
          }
          /**
           * Bật cờ dòng neo SAU CÙNG, sau khi mọi dòng của phiếu đã ghi xong.
           *
           * Phiếu có 通勤手当 cần dòng neo nằm NGOÀI thống kê (xem `dungCap` trong
           * nhap.ts). Đặt cờ TRƯỚC mà ghi dòng lỗi giữa đường thì Thu của tháng đó tụt
           * mất cả khoản lương ròng; đặt SAU thì trạng thái dở dang tệ nhất là Thu bị
           * PHỒNG (dòng neo + dòng 'lương thực nhận' cùng tính) — cả hai đều nhìn thấy
           * ngay, nhưng phồng thì cộng thêm, còn tụt thì mất tiền, và mất khó nhận ra
           * hơn khi soát sổ.
           */
          /**
           * Lần trả nợ đi qua `createDebtPayment`, KHÔNG qua `createTransaction`: nó tự
           * dựng giao dịch và tự đọc `debts.origin` để đặt `is_debt_flow`
           * (features/debts/debtPaymentPosting.ts:31). Tự đặt cờ ở đây là giành việc của
           * khoản nợ, và sẽ sai ngay khi khoản nợ mang `origin = 'earned'`.
           */
          if (k.traNo && k.neo) {
            await repo.createDebtPayment({
              debt_id: k.traNo.debtId,
              amount: k.traNo.amount,
              paid_on: k.neo.occurred_on,
              // Dấu `給与 …` PHẢI nằm trong note của lần trả: gỡ lô tìm debt_payments theo
              // đúng tiền tố này (xem supabaseRepo.xoaPhieuLuong).
              note: k.traNo.dong.note,
              transaction: k.traNo.dong,
            })
            nDong += 1
          }
          if (k.suaNeo && k.neo) {
            await repo.updateTransaction(k.neo.id, { exclude_from_stats: true })
          }
          nPhieu += 1
          dauDaGhi.push(k.dau)
        }
        invalidateTransactionData(qc)
        invalidateDebts(qc)
        // Xoa ke hoach NGAY sau khi ghi xong: dat[] rong lai thi nut Ghi bien mat
        // khoi giao dien, chan dut duong bam lai de ghi trung batch vua xong.
        setKeHoach(null)
        setDaGhi({ phieu: nPhieu, dong: nDong })
        showToast(`Đã ghi ${nPhieu} phiếu · ${nDong} dòng`)
      } catch (e) {
        // nDong > 0: mot phan da ghi THAT vao so truoc khi loi xay ra — so du
        // sai lech that su cho toi khi xu ly xong, dung nhu "Số dư không đổi"
        // ben tren hua chi dung khi ca lo tron ven.
        //   1. hien nut "Xoá mọi dòng phiếu lương" (qua setDaGhi) — chon o day
        //      la vi tu Ruling 1 no XOA TOAN BO lich su phieu luong tung nhap,
        //      khong chi lo nay, nen KHONG duoc goi y no la cach "sua" mot lan
        //      ghi do — nguoi dung phai tu quyet co chap nhan mat ca lich su
        //      hay khong, thong diep loi chi noi that da xay ra chuyen gi.
        //   2. xoa ke hoach (setKeHoach null) — dat[] cu VAN con nhung mot vai
        //      phieu trong do da ghi thanh cong roi; de nut "Ghi" song la bam
        //      lai se ghi TRUNG dung nhung phieu vua thanh cong.
        // nDong === 0 (chua ghi duoc dong nao) thi an toan de giu nguyen ke
        // hoach cho nguoi dung bam Ghi lai — khong co gi de ghi trung ca.
        if (nDong > 0) {
          invalidateTransactionData(qc)
          invalidateDebts(qc)
          setKeHoach(null)
          setDaGhi({ phieu: nPhieu, dong: nDong })
        }
        // nDong > 0 nhung nPhieu === 0: loi xay ra GIUA CHUNG cac dong cua phieu
        // DAU TIEN (dauDaGhi chi duoc day sau khi ca phieu ghi xong) — khong
        // duoc noi "0 phiếu ()", phai noi ro la phieu dau con dang dang.
        showToast(
          e instanceof Error
            ? nDong > 0
              ? nPhieu > 0
                ? `Ghi lỗi: ${e.message}. Đã ghi ${nDong} dòng của ${nPhieu} phiếu (${dauDaGhi.join(' · ')}) trước khi dừng — mở Sổ giao dịch để kiểm tra.`
                : `Ghi lỗi: ${e.message}. Đã ghi ${nDong} dòng dở dang của phiếu đầu tiên (chưa phiếu nào ghi xong) trước khi dừng — mở Sổ giao dịch để kiểm tra.`
              : `Ghi lỗi: ${e.message}. Chưa ghi được dòng nào.`
            : 'Ghi lỗi, thử lại.',
          'error',
        )
      } finally {
        setDangGhi(false)
      }
    } finally {
      dangGhiRef.current = false
    }
  }

  // Khong con nhan tham so dau (Ruling F4): repo.xoaPhieuLuong() luon xoa TOAN
  // BO dong mang tien to `給与 `, khong chi lo dang hien tren man — hop xac nhan
  // va nhan nut ben duoi phai noi dung dieu do (xem <button> "Xoá mọi dòng
  // phiếu lương" — KHONG con goi la "Gỡ lô này", chu "này" khong con dung).
  async function goLo() {
    // dangXoaRef: cung ly do voi dangGhiRef o ham ghi() phia tren.
    if (dangXoaRef.current) return
    dangXoaRef.current = true
    try {
      if (
        !(await confirmDialog({
          title: 'Xoá mọi dòng mang dấu 給与 … ?',
          message:
            'Xoá TOÀN BỘ dòng đã nhập từ phiếu lương trong sổ — không chỉ lô vừa ghi ở trên. Không hoàn tác được.',
          confirmLabel: 'Xoá',
          danger: true,
        }))
      )
        return
      setDangXoa(true)
      try {
        const r = await repo.xoaPhieuLuong()
        invalidateTransactionData(qc)
        invalidateDebts(qc)
        // Noi ro ca viec thu hai: tra dong neo ve thong ke. Nguoi dung khong the doan
        // ra viec do da xay ra neu ta im — va neu no KHONG xay ra thi Thu bi thieu.
        showToast(
          [
            `Đã xoá ${r.dong} dòng`,
            r.neo > 0 && `trả ${r.neo} dòng neo về thống kê`,
            r.traNo > 0 && `hoàn ${r.traNo} lần trả nợ ${TEN_NO_CONG_TY}`,
          ]
            .filter(Boolean)
            .join(' · '),
        )
        setDaGhi(null)
      } catch (e) {
        showToast(e instanceof Error ? `Xoá lỗi: ${e.message}` : 'Xoá lỗi, thử lại.', 'error')
      } finally {
        setDangXoa(false)
      }
    } finally {
      dangXoaRef.current = false
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <PageHeader title="Nhập phiếu lương từ PDF" back="/settings/data" flush />

      {/*
        KHONG chan o input nhu thieuDanhMuc: hai thu nay chi can cho phieu CO 通勤手当
        hoac DB掛金 — 10/12 thang phieu khong co nhan nao trong hai nhan do, va chan het
        thi thanh chan oan. Phieu thuc su can se bi dungKeHoach() TU CHOI kem ly do.
      */}
      {(!dmPhuCap || !tkHuu || tenGanGiong.length > 0) && (
        <Card>
          <p className="text-sm text-fg-secondary">
            Phiếu có <span className="text-fg-primary">通勤手当</span> (phụ cấp đi lại) hoặc{' '}
            <span className="text-fg-primary">DB掛金</span> (退職金) sẽ bị từ chối cho tới khi có
            đủ:
          </p>
          <ul className="mt-1 text-sm text-fg-secondary">
            {!dmPhuCap && (
              <li className="text-money-out">· thiếu danh mục thu “{DANH_MUC_PHU_CAP}”</li>
            )}
            {!tkHuu && <li className="text-money-out">· thiếu tài khoản “{TEN_TK_HUU}”</li>}
          </ul>
          {tenGanGiong.length > 0 && (
            <p className="mt-2 text-sm text-money-out">
              Không có khoản nợ nào tên đúng “{TEN_NO_CONG_TY}” — {NHAN_LA_THEO} sẽ chỉ bị rút
              khỏi Thu, KHÔNG trừ vào nợ. Sổ đang có tên gần giống:{' '}
              {tenGanGiong.map((t) => `“${t}”`).join(', ')} — khớp theo tên đúng từng ký tự nên
              chúng không được dùng.
            </p>
          )}
          {!dmPhuCap && (
            <ActionButton
              variant="primary"
              onClick={taoDmPhuCap}
              disabled={createCategory.isPending}
              className="mt-2 mr-2"
            >
              {createCategory.isPending ? 'Đang tạo…' : `Tạo danh mục ${DANH_MUC_PHU_CAP}`}
            </ActionButton>
          )}
          {!tkHuu && (
            <button
              type="button"
              onClick={taoTkHuu}
              disabled={createAccount.isPending}
              className={actionButtonClass('primary', 'mt-2')}
            >
              {createAccount.isPending ? 'Đang tạo…' : `Tạo tài khoản ${TEN_TK_HUU}`}
            </button>
          )}
        </Card>
      )}

      {thieuDanhMuc.length > 0 && (
        <Card>
          <p className="text-sm text-money-out">
            Thiếu {thieuDanhMuc.length} danh mục Thuế &amp; An sinh. Phải tạo trước khi nhập.
          </p>
          <ul className="mt-1 text-sm text-fg-secondary">
            {thieuDanhMuc.map((n) => <li key={n}>· {n}</li>)}
          </ul>
          <button
            type="button"
            onClick={taoDanhMuc}
            disabled={createCategory.isPending}
            className={actionButtonClass('primary', 'mt-2')}
          >
            {createCategory.isPending ? 'Đang tạo…' : 'Tạo 6 danh mục'}
          </button>
        </Card>
      )}

      <Card
        as="label"
        className="flex cursor-pointer items-center gap-3 focus-within:ring-2 focus-within:ring-accent"
      >
        <FileUp className="h-5 w-5 text-fg-muted" />
        <span className="flex-1 text-sm text-fg-primary">
          {dangBoc ? 'Đang bóc…' : 'Chọn file PDF (chọn được nhiều file)'}
        </span>
        <input
          type="file" multiple accept="application/pdf" className="sr-only"
          disabled={dangBoc || thieuDanhMuc.length > 0}
          onChange={(e) => {
            // Chup TRUOC khi reset: e.target.files la FileList SONG — dat value=''
            // xoa luon file BEN TRONG chinh no, nen phai chuyen sang mang thuong
            // truoc, khong thi chonFile nhan duoc danh sach da rong (da do that
            // trong trinh duyet, khong phai suy doan).
            const danhSach = layDanhSachFile(e.target.files)
            // Reset ngay SAU KHI chup: khong thi chon LAI dung 3 file cu (Buoc 6
            // muc 5 cua brief) se khong sinh su kien change lan hai, va trang
            // dung yen tai cho.
            e.target.value = ''
            chonFile(danhSach)
          }}
        />
      </Card>

      {daGop.length > 0 && (
        <p className="text-sm text-fg-muted">
          Đã gộp {daGop.length} nhóm file trùng nội dung làm một:{' '}
          {daGop.map((g) => g.files.join(' = ')).join(' · ')}
        </p>
      )}

      {keHoach && (
        <Card>
          <p className="text-sm font-semibold text-fg-primary">
            {dat.length} phiếu sẵn sàng · {soDong} dòng
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Số dư không đổi: thu vào chi ra cùng ngày cùng tài khoản, triệt tiêu.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {keHoach.map((k) => (
              <li key={k.phieu.file} className="border-t border-border-subtle pt-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-fg-primary">{k.dau || k.phieu.file}</span>
                  <span className={
                    k.trangThai === 'dat' ? 'text-money-in'
                      : k.trangThai === 'da-nhap' ? 'text-fg-muted' : 'text-money-out'
                  }>
                    {k.trangThai === 'dat' ? 'sẵn sàng'
                      : k.trangThai === 'da-nhap' ? 'đã nhập rồi' : 'từ chối'}
                  </span>
                </div>
                {k.lyDo && <p className="mt-0.5 text-fg-secondary">{k.lyDo}</p>}
                {k.trangThai === 'dat' && k.neo && (
                  <p className="mt-0.5 text-fg-muted">
                    neo {k.neo.occurred_on} · giữ lại {formatMoney(k.thu!.amount, 'JPY')}
                    {k.thuKhac && ` · mua hàng ${formatMoney(k.thuKhac.amount, 'JPY')}`}
                  </p>
                )}
                {/*
                  Noi RO viec sua dong neo, khong de no xay ra am tham: day la lan duy
                  nhat trang nay sua mot dong DA CO trong so, khong chi them dong moi.
                */}
                {k.trangThai === 'dat' && k.suaNeo && (
                  <p className="mt-0.5 text-fg-secondary">
                    {/* Hai nhan doc lap: phieu co the co mot, ca hai, va so 0 thi khong
                        duoc in ra — ban dau in cung mot dong "hoan phi di lai ¥0". */}
                    {[
                      (k.phieu.cap[NHAN_DI_LAI] ?? 0) > 0 &&
                        `hoàn phí đi lại ${formatMoney(k.phieu.cap[NHAN_DI_LAI], 'JPY')}`,
                      (k.phieu.cap[NHAN_LA_THEO] ?? 0) > 0 &&
                        `ứng chi hộ ${formatMoney(k.phieu.cap[NHAN_LA_THEO], 'JPY')}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}{' '}
                    → ra khỏi Thu; dòng neo ra ngoài thống kê, giữ nguyên số
                  </p>
                )}
                {k.trangThai === 'dat' && k.traNo && (
                  <p className="mt-0.5 text-fg-secondary">
                    {NHAN_LA_THEO} {formatMoney(k.traNo.amount, 'JPY')} → trừ vào nợ{' '}
                    {TEN_NO_CONG_TY}
                  </p>
                )}
                {k.trangThai === 'dat' && (k.phieu.cap[NHAN_HUU] ?? 0) !== 0 && (
                  <p className="mt-0.5 text-fg-secondary">
                    {NHAN_HUU} {formatMoney(Math.abs(k.phieu.cap[NHAN_HUU]), 'JPY')} → {TEN_TK_HUU}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dat.length > 0 && (
        <ActionButton variant="primary" disabled={dangGhi} onClick={ghi}>
          {dangGhi ? 'Đang ghi…' : `Ghi ${soDong} dòng`}
        </ActionButton>
      )}
      {/*
        `daGhi ||` chua du: `daGhi` la state, reload la mat, nen nguoi da nhap o luot
        truoc thi KHONG con duong go lo nao trong giao dien — va khong the lam nut hien
        lai, vi moi ky deu da nhap nen chang con gi de ghi. Hoi theo SO: co dong phieu
        luong trong so thi luon co duong go.
      */}
      {(daGhi || dauTrongSo.length > 0) && (
        <Card>
          {daGhi ? (
            <p className="text-sm text-money-in">Đã ghi {daGhi.phieu} phiếu · {daGhi.dong} dòng.</p>
          ) : (
            <p className="text-sm text-fg-secondary">
              Trong sổ đang có {dauTrongSo.length} kỳ phiếu lương đã nhập.
            </p>
          )}
          <button
            type="button" disabled={dangXoa} onClick={goLo}
            className={actionButtonClass('danger', 'mt-2 border border-money-out')}
          >
            {dangXoa ? 'Đang xoá…' : 'Xoá mọi dòng phiếu lương'}
          </button>
        </Card>
      )}
    </div>
  )
}
