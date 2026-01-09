import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'error' | 'warning' | 'info' | 'neutral';
  className?: string;
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  const variants = {
    success: 'bg-success-50 text-success-700 border-success-200',
    error: 'bg-error-50 text-error-700 border-error-200',
    warning: 'bg-warning-50 text-warning-700 border-warning-200',
    info: 'bg-primary-50 text-primary-700 border-primary-200',
    neutral: 'bg-neutral-100 text-neutral-700 border-neutral-200'
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
