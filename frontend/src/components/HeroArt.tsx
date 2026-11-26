// Decorative hero illustration: a phone with a payment receipt, highlighted reference and a protective shield.
export function HeroArt() {
  return (
    <svg viewBox="0 0 360 320" className="h-auto w-full max-w-md xl:max-w-lg" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="ha-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eaf1fe" />
          <stop offset="1" stopColor="#f8fafc" />
        </linearGradient>
        <linearGradient id="ha-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f6feb" />
          <stop offset="1" stopColor="#0b2545" />
        </linearGradient>
      </defs>
      <circle cx="190" cy="160" r="150" fill="url(#ha-bg)" />
      {/* phone */}
      <rect x="110" y="36" width="150" height="260" rx="22" fill="#0b2545" />
      <rect x="120" y="50" width="130" height="232" rx="14" fill="#ffffff" />
      <rect x="160" y="40" width="50" height="6" rx="3" fill="#1e3a5f" />
      {/* receipt */}
      <text x="134" y="78" fontSize="9" fill="#64748b" fontFamily="Inter, sans-serif">Paid to</text>
      <rect x="134" y="84" width="70" height="7" rx="3" fill="#0f172a" />
      <text x="134" y="118" fontSize="22" fontWeight="700" fill="#0f172a" fontFamily="Inter, sans-serif">₹48,000</text>
      <rect x="134" y="128" width="46" height="12" rx="6" fill="#dcfce7" />
      <text x="140" y="137" fontSize="7.5" fill="#15803d" fontFamily="Inter, sans-serif">Completed</text>
      <rect x="134" y="152" width="92" height="5" rx="2.5" fill="#cbd5e1" />
      <text x="134" y="176" fontSize="7.5" fill="#64748b" fontFamily="Inter, sans-serif">UPI reference</text>
      <rect x="130" y="181" width="104" height="20" rx="5" fill="#eaf1fe" stroke="#1f6feb" strokeWidth="1.5" />
      <text x="136" y="195" fontSize="10" fontWeight="600" fill="#0b2545" fontFamily="Inter, sans-serif">0123 4567 8901</text>
      <rect x="134" y="214" width="80" height="5" rx="2.5" fill="#e2e8f0" />
      <rect x="134" y="226" width="60" height="5" rx="2.5" fill="#e2e8f0" />
      <rect x="134" y="248" width="102" height="20" rx="6" fill="#1f6feb" />
      <text x="152" y="261" fontSize="8.5" fontWeight="600" fill="#ffffff" fontFamily="Inter, sans-serif">Confirm details</text>
      {/* shield */}
      <path d="M262 150s34-14 34-42V82l-34-12-34 12v26c0 28 34 42 34 42Z" fill="url(#ha-shield)" />
      <path d="m249 108 9 9 17-17" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* call bubble */}
      <rect x="14" y="222" width="96" height="40" rx="12" fill="#ffffff" stroke="#e2e8f0" />
      <circle cx="34" cy="242" r="11" fill="#dc2626" />
      <path d="M30 238.5c.7 2.6 2.6 4.8 5.3 5.8l1.5-1.4 2.4 1-.5 2.6c-5.4-.3-9.8-4.6-10.1-10l2.6-.5 1 2.4Z" fill="#ffffff" />
      <text x="51" y="239" fontSize="7" fill="#64748b" fontFamily="Inter, sans-serif">Helpline</text>
      <text x="51" y="252" fontSize="12" fontWeight="700" fill="#0f172a" fontFamily="Inter, sans-serif">1930</text>
    </svg>
  );
}
