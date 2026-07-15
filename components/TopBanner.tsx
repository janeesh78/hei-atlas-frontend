'use client';

export default function TopBanner() {
  return (
    <div className="w-full bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-2.5 flex items-center justify-center gap-2">
        {/* Stethoscope icon */}
        <svg
          className="w-4 h-4 md:w-[18px] md:h-[18px] text-slate-500 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 4v6a5 5 0 0010 0V4M9 20a3 3 0 100-6 3 3 0 000 6zm0 0a8 8 0 008-8v-2"
          />
        </svg>
        <p className="text-xs md:text-sm font-semibold text-slate-600 tracking-wide text-center">
          Built by oncologists for oncologists
        </p>
      </div>
    </div>
  );
}
