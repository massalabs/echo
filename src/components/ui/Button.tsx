import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?:
    | 'primary'
    | 'secondary'
    | 'danger'
    | 'ghost'
    | 'outline'
    | 'gradient-emerald'
    | 'gradient-blue'
    | 'circular'
    | 'link'
    | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'custom';
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  fullWidth?: boolean;
  title?: string;
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
  title,
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed';

  const variantClasses = {
    primary:
      'bg-primary hover:bg-primary/90 disabled:bg-muted text-primary-foreground focus:ring-ring',
    secondary:
      'bg-secondary hover:bg-secondary/80 disabled:bg-muted text-secondary-foreground disabled:text-muted-foreground focus:ring-ring',
    danger:
      'bg-destructive hover:bg-destructive/90 disabled:bg-destructive/50 text-destructive-foreground focus:ring-ring',
    ghost: 'bg-transparent hover:bg-accent text-foreground focus:ring-ring',
    outline:
      'bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm hover:shadow-md',
    'gradient-emerald':
      'bg-gradient-to-r from-emerald-500 to-emerald-600 dark:from-emerald-600 dark:to-emerald-700 text-white hover:from-emerald-600 hover:to-emerald-700 dark:hover:from-emerald-700 dark:hover:to-emerald-800 shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 transform hover:scale-[1.02] active:scale-[0.98]',
    'gradient-blue':
      'bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 text-white hover:from-blue-600 hover:to-purple-700 dark:hover:from-blue-700 dark:hover:to-purple-800 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transform hover:scale-[1.02] active:scale-[0.98]',
    circular:
      'rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/50 active:scale-95',
    link: 'bg-transparent text-primary hover:text-primary/80 underline p-0 shadow-none',
    icon: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full p-2',
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm rounded-lg',
    md: 'px-4 py-3 text-base rounded-xl',
    lg: 'px-6 py-4 text-lg rounded-xl',
    custom: '', // Allow full customization via className
  };

  const widthClasses = fullWidth ? 'w-full' : '';

  // For circular and icon variants, don't apply default size classes
  const shouldApplySize =
    variant !== 'circular' && variant !== 'icon' && size !== 'custom';

  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${
    shouldApplySize ? sizeClasses[size] : ''
  } ${widthClasses} ${className}`.trim();

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={combinedClasses}
      title={title}
    >
      {loading && (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      )}
      {children}
    </button>
  );
};

export default Button;
