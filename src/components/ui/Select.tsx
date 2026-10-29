import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  helperText?: string;
  error?: string;
  optional?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      options,
      helperText,
      error,
      optional = false,
      id,
      required,
      className = '',
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    const selectClasses = [
      'ff-field__select',
      error ? 'ff-field__input--invalid' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="ff-field">
        <div className="ff-field__label-row">
          <label htmlFor={selectId} className="ff-field__label">
            {label}
          </label>
          {required ? (
            <span className="ff-field__badge">Required</span>
          ) : optional ? (
            <span className="ff-field__badge">Optional</span>
          ) : null}
        </div>
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? errorId : helperText ? helperId : undefined
          }
          className={selectClasses}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {error ? (
          <div id={errorId} role="alert" className="ff-field__error">
            <AlertCircle size={13} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : helperText ? (
          <div id={helperId} className="ff-field__helper">
            {helperText}
          </div>
        ) : null}
      </div>
    );
  },
);

Select.displayName = 'Select';

