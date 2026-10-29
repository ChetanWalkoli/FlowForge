import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export type ButtonSize = 'default' | 'sm';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'default',
      iconOnly = false,
      leftIcon,
      rightIcon,
      className = '',
      children,
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    const classes = [
      'ff-btn',
      `ff-btn--${variant}`,
      size === 'sm' ? 'ff-btn--sm' : '',
      iconOnly ? 'ff-btn--icon-only' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} type={type} className={classes} {...rest}>
        {leftIcon && <span aria-hidden="true">{leftIcon}</span>}
        {children}
        {rightIcon && <span aria-hidden="true">{rightIcon}</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';

