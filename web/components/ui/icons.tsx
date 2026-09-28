/** Brand glyphs missing from lucide-react. Everything else: import from "lucide-react". */
type P = { className?: string; size?: number };

export function XIcon({ className, size = 16 }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden>
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.19L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.57L16.67 19.2Z" />
    </svg>
  );
}

export function TelegramIcon({ className, size = 16 }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden>
      <path d="M21.94 4.3 18.9 19.04c-.23 1.02-.83 1.28-1.69.8l-4.66-3.44-2.25 2.17c-.25.25-.46.46-.94.46l.34-4.76 8.66-7.83c.38-.34-.08-.52-.58-.19L7.07 13.02 2.46 11.58c-1-.31-1.02-1 .21-1.48L20.66 3.1c.84-.31 1.57.19 1.28 1.2Z" />
    </svg>
  );
}

/** ETH diamond — the one allowed cool colour (brief §10.1). */
export function EthIcon({ className, size = 16 }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#627EEA" />
      <path d="M12.37 3v6.65l5.62 2.51L12.37 3Z" fill="#fff" fillOpacity=".6" />
      <path d="M12.37 3 6.75 12.16l5.62-2.51V3Z" fill="#fff" />
      <path d="M12.37 16.47v4.52L18 13.2l-5.63 3.27Z" fill="#fff" fillOpacity=".6" />
      <path d="M12.37 20.99v-4.52L6.75 13.2l5.62 7.79Z" fill="#fff" />
      <path d="m12.37 15.42 5.62-3.26-5.62-2.51v5.77Z" fill="#fff" fillOpacity=".2" />
      <path d="m6.75 12.16 5.62 3.26V9.65l-5.62 2.51Z" fill="#fff" fillOpacity=".6" />
    </svg>
  );
}
