import React from 'react';

export const Badge = ({ children, color = 'gray' }) => {
  const styleMap = {
    gray: 'badge-gray',
    green: 'badge-green',
    blue: 'badge-blue',
    yellow: 'badge-yellow',
  };
  return <span className={`badge ${styleMap[color] || 'badge-gray'}`}>{children}</span>;
};