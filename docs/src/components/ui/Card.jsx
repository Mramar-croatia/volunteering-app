import React from 'react';

export const Card = ({ children, className = '' }) => (
  <div className={`card ${className}`}>{children}</div>
);

export const CardHeader = ({ title, actions }) => (
  <div className="card-header">
    <h3 className="card-title">{title}</h3>
    {actions && <div className="card-actions">{actions}</div>}
  </div>
);

export const CardBody = ({ children, className = '' }) => (
  <div className={`card-body ${className}`}>{children}</div>
);