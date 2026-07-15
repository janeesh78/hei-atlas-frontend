'use client';

export default function Footer() {
  return (
    <footer className="w-full border-t border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
          <button
            onClick={() => console.log('Privacy Policy clicked')}
            className="text-sm md:text-base text-gray-600 hover:text-gray-900 transition-colors"
          >
            Privacy Policy
          </button>
          <div className="hidden md:block w-px h-4 bg-gray-300"></div>
          <button
            onClick={() => console.log('Terms clicked')}
            className="text-sm md:text-base text-gray-600 hover:text-gray-900 transition-colors"
          >
            Terms
          </button>
          <div className="hidden md:block w-px h-4 bg-gray-300"></div>
          <button
            onClick={() => console.log('Contact clicked')}
            className="text-sm md:text-base text-gray-600 hover:text-gray-900 transition-colors"
          >
            Contact
          </button>
        </div>
      </div>
    </footer>
  );
}
