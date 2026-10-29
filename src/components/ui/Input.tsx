import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
  optional?: boolean;
  mono?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      optional = false,
      mono = false,
      id,
      required,
      className = '',
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    const inputClasses = [
      'ff-field__input',
      error ? 'ff-field__input--invalid' : '',
      mono ? 'ff-field__input--mono' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="ff-field">
        <div className="ff-field__label-row">
          <label htmlFor={inputId} className="ff-field__label">
            {label}
          </label>
          {required ? (
            <span className="ff-field__badge">Required</span>
          ) : optional ? (
            <span className="ff-field__badge">Optional</span>
          ) : null}
        </div>
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? errorId : helperText ? helperId : undefined
          }
          className={inputClasses}
          {...rest}
        />
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

Input.displayName = 'Input';

