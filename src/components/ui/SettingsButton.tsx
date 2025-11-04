import React from 'react';

interface SettingsButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  badge?: React.ReactNode;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

const SettingsButton: React.FC<SettingsButtonProps> = ({
  icon,
  label,
  onClick,
  badge,
  variant = 'default',
  disabled = false,
}) => {
  const textColor =
    variant === 'danger'
      ? 'text-red-500 dark:text-red-400'
      : 'text-black dark:text-white';
  const iconColor =
    variant === 'danger'
      ? 'text-red-500 dark:text-red-400'
      : 'text-black dark:text-white';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-white dark:bg-gray-800 rounded-lg h-[54px] flex items-center px-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className={`w-5 h-5 ${iconColor} mr-4`}>{icon}</span>
      <span className={`text-base font-semibold ${textColor} flex-1 text-left`}>
        {label}
      </span>
      {badge && <div className="ml-auto">{badge}</div>}
    </button>
  );
};

export default SettingsButton;
