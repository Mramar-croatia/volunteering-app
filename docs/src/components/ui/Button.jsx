import React from 'react';

export const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  const baseClass = variant === 'ghost' ? 'btn btn-ghost' : 'btn btn-primary';
  return (
    <button className={`${baseClass} ${className}`} {...props}>
      {children}
    </button>
  );
};