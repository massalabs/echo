import { parseUnits } from '@massalabs/massa-web3';
import currency from 'currency.js';

// Parse

/**
 * reverse format FT amount
 */
export function parseAmount(amount: string, tokenDecimal: number): bigint {
  return parseUnits(amount, tokenDecimal);
}

// Format
export interface FormattedAmount {
  preview: string;
  full: string;
}

// Format the amount, parameter must be a string in the smallest unit or a bigint
export function formatAmount(
  amount: string | bigint,
  decimals = 9,
  separator = ','
): FormattedAmount {
  if (typeof amount === 'bigint') {
    amount = amount.toString();
  }
  amount = amount as string;
  const decimal = '.';

  if (amount.length < decimals) {
    amount = padWithZeros(amount, decimals + 1);
  }

  const integerPart = amount.substring(0, amount.length - decimals);
  const decimalPart = amount.substring(amount.length - decimals);

  const formattedIntegerPart = currency(`${integerPart}`, {
    separator: separator,
    decimal: decimal,
    symbol: '',
    precision: 0,
  }).format();

  let preview: string;
  if (formattedIntegerPart === '0' && decimalPart.startsWith('00')) {
    preview = `${formattedIntegerPart}${decimal}${roundDecimalPartToTwoSignificantDigit(
      decimalPart
    )}`;
  } else {
    preview = currency(`${formattedIntegerPart}${decimal}${decimalPart}`, {
      separator,
      decimal,
      symbol: '',
    }).format();
  }

  return {
    preview: removeTrailingZeros(preview),
    full: removeTrailingZeros(
      `${formattedIntegerPart}${decimal}${decimalPart}`
    ),
  };
}

// Internal functions

// Internal function to pad a string with zeros
function padWithZeros(input: string, length: number): string {
  return input.padStart(length, '0');
}

// Internal function to remove trailing zeros
function removeTrailingZeros(numStr: string): string {
  return numStr.replace(/\.?0+$/, '');
}

const leadingZeroes = /^0+/;

function removeLeadingZeros(numStr: string): string {
  return numStr.replace(leadingZeroes, '');
}

// Internal function to round the decimal part to significant digit
export function roundDecimalPartToTwoSignificantDigit(
  decimalPart: string
): string {
  function countLeadingZeros(str: string) {
    // Match leading zeros using a regular expression
    const result = str.match(leadingZeroes);

    // If the result isn't null (meaning there are leading zeros), return the length, otherwise return 0
    return result ? result[0].length : 0;
  }

  // Strip leading zeroes
  const significantPart = removeLeadingZeros(decimalPart);

  if (significantPart === '') {
    // Input is all zeroes
    return '0';
  }

  const formattedByCurrency = currency(`0.${significantPart}`, {
    separator: '',
    decimal: '.',
    symbol: '',
  }).format({
    // precision option is not taken in account
    // https://github.com/scurker/currency.js/issues/293
    decimal: '',
  });
  const trimmedZero = removeLeadingZeros(
    removeTrailingZeros(formattedByCurrency)
  );

  // If rounding causes a carry-over (e.g. 0.009 -> 0.01), handle it
  if (formattedByCurrency.startsWith('1.')) {
    return '0'.repeat(countLeadingZeros(decimalPart) - 1) + trimmedZero;
  }

  return '0'.repeat(countLeadingZeros(decimalPart)) + trimmedZero;
}
