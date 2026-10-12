/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export default function AppLogo({ size = 'md', showText = true, className = '' }: AppLogoProps) {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-11 h-11',
    lg: 'w-16 h-16',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-2xl',
  };

  const subtitleSizes = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Emblem SVG Logo */}
      <div className={`relative shrink-0 ${iconSizes[size]} rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 p-1.5 shadow-md border border-emerald-400/30 flex items-center justify-center overflow-hidden group`}>
        {/* Subtle background shine */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />
        
        <svg viewBox="0 0 100 100" className="w-full h-full text-white relative z-10 fill-none stroke-current" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {/* Outer Badge Ring */}
          <circle cx="50" cy="50" r="44" className="stroke-emerald-300/40" strokeWidth="2" strokeDasharray="4 2" />
          
          {/* Egg Shape */}
          <path
            d="M 50 16 C 32 16, 22 42, 22 64 C 22 78, 34 88, 50 88 C 66 88, 78 78, 78 64 C 78 42, 68 16, 50 16 Z"
            className="fill-amber-400/20 stroke-amber-300"
            strokeWidth="3.5"
          />

          {/* Rooster Silhouette Crest inside Egg */}
          <path
            d="M 44 42 C 40 38, 38 32, 42 28 C 45 31, 48 29, 50 25 C 52 29, 55 31, 58 28 C 62 32, 60 38, 56 42"
            className="fill-amber-400 stroke-amber-200"
            strokeWidth="1.5"
          />

          {/* Chick / Hatching Sprout Leaves */}
          <path
            d="M 50 78 C 50 62, 38 56, 32 58 C 38 68, 48 76, 50 78 Z"
            className="fill-emerald-300/90 stroke-emerald-100"
            strokeWidth="1.5"
          />
          <path
            d="M 50 78 C 50 62, 62 56, 68 58 C 62 68, 52 76, 50 78 Z"
            className="fill-teal-300/90 stroke-teal-100"
            strokeWidth="1.5"
          />

          {/* Sun / Growth Ray Accent */}
          <circle cx="50" cy="46" r="4" className="fill-amber-300 stroke-amber-100" />
        </svg>
      </div>

      {showText && (
        <div className="leading-tight">
          <div className={`font-black text-slate-800 tracking-tight uppercase ${textSizes[size]}`}>
            New Vision<span className="text-emerald-600"> Farms</span>
          </div>
          <div className={`font-bold text-amber-600 uppercase tracking-widest text-[8px] sm:text-[9px]`}>
            Farm & Hatchery
          </div>
        </div>
      )}
    </div>
  );
}
