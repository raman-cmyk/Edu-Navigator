import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

/*
 * Buttons say what happens. Primary is filled --ink; secondary is a --rule
 * outline on --surface; destructive is an outline, never a colored fill.
 * --blaze never appears on a button — its power is scarcity. See docs/04.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface BaseProps {
  variant?: Variant;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
}

function classesFor(variant: Variant, fullWidth: boolean): string {
  const base =
    'inline-flex items-center justify-center gap-s2 rounded-md px-s4 py-s2 text-body font-body no-underline transition-transform duration-75 active:scale-[0.99]';
  const width = fullWidth ? 'w-full' : '';
  const byVariant: Record<Variant, string> = {
    primary: 'bg-ink text-paper',
    secondary: 'bg-surface text-ink border border-rule',
    ghost: 'bg-transparent text-ink',
    destructive: 'bg-paper text-ink border border-ink',
  };
  return `${base} ${byVariant[variant]} ${width}`.trim();
}

interface ButtonProps
  extends BaseProps,
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', fullWidth = false, className = '', children, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={`${classesFor(variant, fullWidth)} ${className}`} {...rest}>
      {children}
    </button>
  );
});

interface ButtonLinkProps extends BaseProps {
  to: string;
}

export function ButtonLink({
  variant = 'primary',
  fullWidth = false,
  className = '',
  to,
  children,
}: ButtonLinkProps) {
  return (
    <Link className={`btn ${classesFor(variant, fullWidth)} ${className}`} to={to}>
      {children}
    </Link>
  );
}
