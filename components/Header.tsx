'use client';

import { useState } from 'react';

interface HeaderProps {
  dropdownOpen: boolean;
  onDropdownToggle: () => void;
  dropdownRef: React.RefObject<HTMLDivElement>;
  onDropdownItemClick: (item: string) => void;
}

export default function Header({ dropdownOpen, onDropdownToggle, dropdownRef, onDropdownItemClick }: HeaderProps) {
  return (
    <header className="w-full border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo - Centered */}
          <div className="flex-1 text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Hei Atlas
            </h1>
          </div>

          {/* Right Section - Buttons and Dropdown */}
          <div className="flex-1 flex items-center justify-end gap-3 md:gap-4">
            {/* Login Button */}
            <button
              className="btn-secondary text-sm md:text-base"
              onClick={() => console.log('Login clicked')}
            >
              Login
            </button>

            {/* Signup Button */}
            <button
              className="btn-primary text-sm md:text-base"
              onClick={() => console.log('Signup clicked')}
            >
              Signup
            </button>

            {/* Resources Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={onDropdownToggle}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-50 rounded font-medium transition-colors text-sm md:text-base"
              >
                Resources
                <svg
                  className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="dropdown-menu">
                  <button
                    onClick={() => onDropdownItemClick('Download App')}
                    className="dropdown-item"
                  >
                    Download App
                  </button>
                  <button
                    onClick={() => onDropdownItemClick('User Guide')}
                    className="dropdown-item border-t border-gray-200"
                  >
                    User Guide
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
