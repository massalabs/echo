export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePassword(value: string): PasswordValidationResult {
  if (!value || value.trim().length === 0) {
    return { valid: false, error: 'Password is required' };
  }

  if (value.length < 8) {
    return {
      valid: false,
      error: 'Password must be at least 8 characters long',
    };
  }

  return { valid: true };
}
