// The Gmail logo (the four-colour M) on a white rounded tile, used where the app says reminders come by email
// (owner, 2026-10-29: "เอารูป Gmail จริงๆมาใส่"). Keep the official colours; do not recolour or restyle it.
export function GmailLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${className}`} role="img" aria-label="Gmail"
      style={{ width: size, height: size, borderRadius: size * 0.24, background: '#FFFFFF' }}>
      <svg viewBox="52 42 88 66" width={size * 0.62} height={size * 0.62 * 0.75} aria-hidden="true">
        <path fill="#4285F4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
        <path fill="#34A853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
        <path fill="#FBBC04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
        <path fill="#EA4335" d="M72 74V48l24 18 24-18v26L96 92" />
        <path fill="#C5221F" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
      </svg>
    </span>
  );
}
