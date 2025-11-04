import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  fullWidth = false,
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed';

  const variantClasses = {
    primary:
      'bg-primary hover:bg-primary/90 disabled:bg-muted text-primary-foreground focus:ring-ring',
    secondary:
      'bg-secondary hover:bg-secondary/80 disabled:bg-muted text-secondary-foreground disabled:text-muted-foreground focus:ring-ring',
    danger:
      'bg-destructive hover:bg-destructive/90 disabled:bg-destructive/50 text-destructive-foreground focus:ring-ring',
    ghost: 'bg-transparent hover:bg-accent text-foreground focus:ring-ring',
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm rounded-lg',
    md: 'px-4 py-3 text-base rounded-xl',
    lg: 'px-6 py-4 text-lg rounded-xl',
  };

  const widthClasses = fullWidth ? 'w-full' : '';

  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClasses} ${className}`;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={combinedClasses}
    >
      {loading && (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      )}
      {children}
    </button>
  );
};

export default Button;
