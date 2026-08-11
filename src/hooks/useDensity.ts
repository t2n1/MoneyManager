import { useEffect, useSyncExternalStore } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { showToast } from '../lib/dialog'
import {
  densityFromProfile,
  getMirroredDensity,
  setMirroredDensity,
  subscribeDensity,
  type DensityPref,
} from '../lib/density'
import { PROFILE_MUTATION_KEY, useProfile, useUpdateProfile } from './queries'

/**
 * Ba hook cho ba vai, cố ý KHÔNG gộp thành một:
 *
 *   useDensity()        — chỉ ĐỌC. Dùng ở hàng chục chỗ (Guide, ExplainBox, VerdictNote,
 *                         mọi thẻ có chữ hướng dẫn). Không chạm React Query.
 *   useDensitySync()    — bơm giá trị từ hồ sơ vào bản sao. Gọi MỘT lần ở AppLayout.
 *   useDensityControl() — đọc + ghi. Chỉ nút trong Cài đặt dùng.
 *
 * Gộp lại thì mỗi chỗ đọc cũng kéo theo một `useQuery(['profile'])` và một
 * `useMutation` — hàng chục observer cho một việc mà chỉ một nút cần làm. Tách ra còn
 * nói đúng ý định: phần lớn chỗ gọi không có quyền ghi cài đặt này.
 */

/** Đọc chế độ trình bày đang áp dụng. `visual` là thứ hầu hết chỗ gọi cần. */
export function useDensity(): { pref: DensityPref; visual: boolean } {
  // useSyncExternalStore chứ không phải useState: nguồn nằm ngoài React (src/lib/density.ts),
  // nên bấm đổi ở Cài đặt là MỌI chỗ đang hiện chữ hướng dẫn cùng ẩn/hiện trong một lần
  // render. Nếu mỗi component giữ state riêng thì chỉ cái vừa bấm đổi.
  const pref = useSyncExternalStore(subscribeDensity, getMirroredDensity)
  return { pref, visual: pref === 'visual' }
}

/**
 * Đồng bộ hồ sơ → bản sao ở máy. Gọi đúng một lần, ở AppLayout.
 *
 * Vì sao ở AppLayout chứ không nhét vào `useDensity`: hook đọc có ở hàng chục
 * component, effect sẽ chạy hàng chục lần mỗi khi hồ sơ đổi tham chiếu. Ở đây thì đúng
 * một lần, và AppLayout là vỏ của mọi route cần đăng nhập nên không màn nào bị bỏ sót.
 *
 * Máy mới (bản sao còn trống) vẫn có một nhịp hiện chế độ mặc định trước khi hồ sơ về.
 * Chấp nhận: chặn render để đợi thì cả app trắng màn, mà lúc đó phần lớn màn hình đang
 * hiện khung xương chờ chính hồ sơ đó rồi.
 *
 * Đây là chỗ làm nên việc "đổi ở máy này, máy kia thấy": hồ sơ có `staleTime` hữu hạn
 * (useProfile.ts) nên nhấc máy khác lên — cold start hoặc focus lại cửa sổ — là có lượt
 * tải mới, rồi effect này ghi giá trị đó vào bản sao.
 */
export function useDensitySync() {
  const { data: profile } = useProfile()
  // densityFromProfile, KHÔNG phải parseDensity: hồ sơ thiếu cột (bản cache tải trước
  // migration 0040) phải ra null = "chưa nói gì", không phải giá trị mặc định. Xem
  // chú thích ở src/lib/density.ts — dùng parseDensity ở đây là ép chế độ về Gọn.
  const fromProfile = densityFromProfile(profile?.density_pref)

  // Đang có lượt ghi hồ sơ chạy thì ĐỪNG bơm. Từ khi hồ sơ có staleTime hữu hạn
  // (useProfile.ts), một lượt tải nền bắt đầu TRƯỚC lúc bấm có thể về SAU và mang giá
  // trị cũ — không chặn thì công tắc vừa bấm lật ngược rồi lật lại, thấy rõ trên màn
  // Cài đặt. Bản sao ở máy chính là "bản nháp" của cài đặt này, giống cách
  // NotificationSettingsPage cho `pendingOff` thắng hồ sơ trong lúc chờ.
  const dangGhi = useIsMutating({ mutationKey: PROFILE_MUTATION_KEY }) > 0

  useEffect(() => {
    if (dangGhi) return
    if (fromProfile !== null) setMirroredDensity(fromProfile)
  }, [fromProfile, dangGhi])
}

/** Đọc + ghi, cho nút trong Cài đặt. `saving` để khoá nút trong lúc gửi. */
export function useDensityControl(): {
  pref: DensityPref
  visual: boolean
  setDensity: (next: DensityPref) => void
  saving: boolean
} {
  const { pref, visual } = useDensity()
  const updateProfile = useUpdateProfile()

  const setDensity = (next: DensityPref) => {
    const truoc = pref
    // Đổi bản sao TRƯỚC: người bấm thấy đổi ngay, không đợi vòng mạng.
    setMirroredDensity(next)
    updateProfile.mutate(
      { density_pref: next },
      {
        onError: () => {
          // Trả về giá trị cũ. Không trả thì màn hình nói một đằng mà hồ sơ một nẻo,
          // và lần mở app sau `useDensitySync` sẽ lặng lẽ lật lại — người dùng tưởng
          // app tự đổi cài đặt.
          setMirroredDensity(truoc)
          showToast('Chưa lưu được cách trình bày. Kiểm tra mạng rồi thử lại.')
        },
      },
    )
  }

  return { pref, visual, setDensity, saving: updateProfile.isPending }
}
