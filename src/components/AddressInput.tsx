import React, { useState, useEffect, useCallback } from 'react';
import { isValidAddress, formatMassaAddress } from '../utils/addressUtils';

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  showFormattedAddress?: boolean;
  className?: string;
  disabled?: boolean;
  onValidationChange?: (isValid: boolean | null) => void;
}

const AddressInput: React.FC<AddressInputProps> = ({
  value,
  onChange,
  placeholder = 'Enter address',
  label = 'Address',
  showFormattedAddress = true,
  className = '',
  disabled = false,
  onValidationChange,
}) => {
  const [isValid, setIsValid] = useState<boolean | null>(null);

  // Live validation
  useEffect(() => {
    if (value.trim()) {
      const valid = isValidAddress(value.trim());
      setIsValid(valid);
      onValidationChange?.(valid);
    } else {
      setIsValid(null);
      onValidationChange?.(null);
    }
  }, [value, onValidationChange]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const inputClasses = `w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 border rounded-xl focus:ring-2 focus:border-transparent dark:text-white placeholder-gray-500 dark:placeholder-gray-400 ${
    isValid === true
      ? 'border-green-500 focus:ring-green-500'
      : isValid === false
        ? 'border-red-500 focus:ring-red-500'
        : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${
    isValid !== null ? 'pr-10' : ''
  } ${className}`;

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={inputClasses}
        />
        {isValid !== null && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            {isValid ? (
              <svg
                className="w-5 h-5 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
          </div>
        )}
      </div>
      {value && (
        <div className="mt-2 flex items-center justify-between">
          {showFormattedAddress && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {formatMassaAddress(value)}
            </div>
          )}
          {isValid === false && (
            <div className="text-sm text-red-500">Invalid address format</div>
          )}
          {isValid === true && (
            <div className="text-sm text-green-500">Valid address</div>
          )}
        </div>
      )}
    </div>
  );
};

export default AddressInput;
