import { useState } from 'react'
import { getFontScalePref, setFontScalePref, type FontScalePref } from '../lib/fontScale'

/** Đọc/ghi lựa chọn cỡ chữ toàn app. */
export function useFontScale() {
  const [pref, setPref] = useState<FontScalePref>(getFontScalePref)

  const update = (next: FontScalePref) => {
    setFontScalePref(next)
    setPref(next)
  }

  return { pref, setFontScale: update }
}
