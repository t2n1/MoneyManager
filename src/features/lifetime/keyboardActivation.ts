// Phím "bấm nút" cho các nút KHÔNG có `onClick` React thật — THUẦN, không React.
//
// VÌ SAO CÓ FILE NÀY. `PhaseLane` và `EventPins` vẽ khối chặng / icon mốc / chốt kết thúc
// bằng `<button>` thật, nhưng bấm-và-kéo của chúng đi qua `useYearDrag` (nhận
// `onPointerDown`/`onPointerMove`/`onPointerUp`), KHÔNG qua `onClick`. Một `<button>` HTML
// gốc tự dịch Enter/Space thành một sự kiện `click`, chứ KHÔNG thành `pointerdown` — nên
// nếu không tự bắt Enter/Space trong `onKeyDown` thì Tab tới rồi bấm phím không gọi được gì
// cả. Phát hiện review 2026-09-09, Finding 1 (CRITICAL): sửa một chặng/mốc ĐÃ CÓ trở thành
// thao tác chỉ-dùng-chuột, đúng thứ repo này coi là lỗi (comment ở
// `LifetimeChartCard.tsx:1358`).
//
// Tách hàm này ra thay vì viết `key === 'Enter' || key === ' '` lặp lại ba lần (khối chặng,
// icon mốc, chốt kết thúc): một bản duy nhất, và test được mà không cần DOM.
export function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}
