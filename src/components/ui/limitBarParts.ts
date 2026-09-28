// Hình học của <LimitBar> — hàm thuần để test được (repo không render component trong
// test, cùng lý do với sparklinePath.ts).
//
// Hai dáng:
//   · 'fill'  — chưa vượt: một khối tô từ trái, rộng `pct`% của thanh.
//   · 'split' — ĐÃ vượt: thanh là TOÀN BỘ số đã chi, chia hai phần theo tỷ lệ:
//               `solid` = phần nằm trong trần (trần / đã chi), `rest` = phần vượt.
//               Chi ¥332k trên trần ¥280k → solid 0,84, rest 0,16. Kẹp 100% như bản cũ
//               thì mọi mức vượt trông y hệt nhau; chia ra thì vượt 5% và vượt 60% khác
//               hình. Chỉ e-ink vẽ phần `rest` (sọc gỉ sắt); Sáng/Tối vẫn là thanh đầy.

export type LimitBarParts =
  | { kind: 'fill'; pct: number }
  | { kind: 'split'; solid: number; rest: number }

/**
 * Hệ số `flex-grow` cho hai phần của dáng 'split'. KHÔNG dùng thẳng `solid`/`rest`: tổng
 * flex-grow < 1 thì trình duyệt chỉ chia ĐÚNG phần đó của chỗ trống — nên ở Sáng/Tối, nơi
 * phần vượt bị ẩn, khối tô đứng một mình với grow 0,84 chỉ rộng 84% chứ không đầy thanh
 * (đo thật: 310/369px). Nhân cả hai lên để cái nhỏ hơn bằng 1: tỷ lệ giữa hai phần giữ
 * nguyên, và phần còn lại một mình thì luôn ≥ 1 → đầy thanh.
 */
export function splitGrow(solid: number, rest: number): { solid: number; rest: number } {
  const k = 1 / Math.min(solid > 0 ? solid : 1, rest > 0 ? rest : 1)
  return { solid: solid * k, rest: rest * k }
}

/** `ratio` = đã chi / trần, có thể > 1. NaN / âm / vô cực được xử lý, không vẽ bậy. */
export function limitBarParts(ratio: number): LimitBarParts {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    // Vô cực dương = trần 0 mà đã chi (nếu nơi gọi không kẹp về 1): toàn bộ là phần vượt.
    return ratio === Infinity ? { kind: 'split', solid: 0, rest: 1 } : { kind: 'fill', pct: 0 }
  }
  if (ratio <= 1) return { kind: 'fill', pct: ratio * 100 }
  const solid = 1 / ratio
  return { kind: 'split', solid, rest: 1 - solid }
}
