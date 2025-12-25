import React from 'react';

export const Input = ({ label, ...props }) => (
  <div className="form-group">
    {label && <label>{label}</label>}
    <input className={`form-control ${props.className || ''}`} {...props} />
  </div>
);

export const Select = ({ label, options, ...props }) => (
  <div className="form-group">
    {label && <label>{label}</label>}
    <select className="form-control" {...props}>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

export const SearchInput = (props) => (
  <input className="search-input" {...props} />
);