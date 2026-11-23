import React from 'react';

interface NexoraLogoProps {
  size?: number;
  className?: string;
}

export const NexoraLogo: React.FC<NexoraLogoProps> = ({ size = 32, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect width="64" height="64" rx="14" fill="#0B1220" />
    <rect x="1.5" y="1.5" width="61" height="61" rx="12.5" stroke="#1E293B" strokeWidth="1.5" />
    <g strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="32" y1="13" x2="48.5" y2="22.5" stroke="#3B82F6" />
      <line x1="48.5" y1="22.5" x2="48.5" y2="41.5" stroke="#38BDF8" />
      <line x1="48.5" y1="41.5" x2="32" y2="51" stroke="#22D3EE" />
      <line x1="32" y1="51" x2="15.5" y2="41.5" stroke="#38BDF8" />
      <line x1="15.5" y1="41.5" x2="15.5" y2="22.5" stroke="#3B82F6" />
      <line x1="15.5" y1="22.5" x2="32" y2="13" stroke="#22D3EE" />
      <line x1="32" y1="32" x2="32" y2="13" stroke="#38BDF8" />
      <line x1="32" y1="32" x2="48.5" y2="41.5" stroke="#3B82F6" />
      <line x1="32" y1="32" x2="15.5" y2="41.5" stroke="#22D3EE" />
    </g>
    <circle cx="32" cy="13" r="3.2" fill="#0B1220" stroke="#22D3EE" strokeWidth="2" />
    <circle cx="48.5" cy="22.5" r="3" fill="#0B1220" stroke="#3B82F6" strokeWidth="2" />
    <circle cx="48.5" cy="41.5" r="3.2" fill="#0B1220" stroke="#38BDF8" strokeWidth="2" />
    <circle cx="32" cy="51" r="3" fill="#0B1220" stroke="#22D3EE" strokeWidth="2" />
    <circle cx="15.5" cy="41.5" r="3.2" fill="#0B1220" stroke="#3B82F6" strokeWidth="2" />
    <circle cx="15.5" cy="22.5" r="3" fill="#0B1220" stroke="#38BDF8" strokeWidth="2" />
    <circle cx="32" cy="32" r="5" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.8" />
  </svg>
);
