// Logo "Sổ Gạo" — bản inline của public/favicon.svg để sidebar và màn đăng nhập
// dùng chung một hình. Sửa hình thì sửa CẢ HAI file (favicon.svg là nguồn cho
// icon PWA nên không import lẫn nhau được).
export function AppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="120" fill="#008236" />
      <rect x="132" y="100" width="248" height="312" rx="36" fill="#ffffff" />
      <rect x="176" y="100" width="10" height="312" fill="#b9f8cf" />
      <path d="M322 100h40v78l-20-18-20 18z" fill="#fbbf24" />
      <g fill="#008236">
        <ellipse cx="283" cy="250" rx="23" ry="52" transform="rotate(-36 283 350)" />
        <ellipse cx="283" cy="250" rx="23" ry="52" transform="rotate(36 283 350)" />
        <ellipse cx="283" cy="240" rx="24" ry="55" />
      </g>
    </svg>
  )
}
