import React, { useState, useCallback, useEffect } from 'react';
import { useWalletStore } from '../../stores/walletStore';
import AddressInput from '../AddressInput';
import Button from '../ui/Button';
import BaseModal from '../ui/BaseModal';
import { formatBalance } from '../../stores/walletStore';
import ConfirmTransactionDialog from './ConfirmTransactionDialog';
import FeeConfigModal, { FeeConfig } from './FeeConfigModal';
import { useAccountStore } from '../../stores/accountStore';
import { useSend } from '@massalabs/react-ui-kit';
import TokenSelect from './TokenSelect';

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const SendModal: React.FC<SendModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedTokenIndex, setSelectedTokenIndex] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showFeeConfig, setShowFeeConfig] = useState(false);
  const [isValidRecipient, setIsValidRecipient] = useState<boolean | null>(
    null
  );

  const tokens = useWalletStore.use.tokens();
  const provider = useAccountStore.use.provider();
  const feeConfig = useWalletStore.use.feeConfig();
  const setFeeConfig = useWalletStore.use.setFeeConfig();
  const refreshBalances = useWalletStore.use.refreshBalances();
  const selectedToken = tokens[selectedTokenIndex];
  const availableBalance = selectedToken?.balance || 0n;

  // Use the ui-kit send hook
  const { sendAsset, isProcessing } = useSend({
    // TODO - Fix when ui-kit new version
    // @ts-expect-error - provider type mismatch
    provider: provider,
  });

  // Calculate amount in bigint for validation
  const amountBigInt = amount
    ? BigInt(
        Math.floor(parseFloat(amount) * 10 ** (selectedToken?.decimals || 9))
      )
    : 0n;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setRecipient('');
      setAmount('');
      setError(null);
      setIsConfirming(false);
      setShowConfirmation(false);
      setIsValidRecipient(null);
    }
  }, [isOpen]);

  // Handle address validation change
  const handleAddressValidationChange = useCallback(
    (isValid: boolean | null) => {
      setIsValidRecipient(isValid);
    },
    []
  );

  const getFeeAmount = useCallback(() => {
    if (feeConfig.type === 'preset') {
      const presetAmounts = {
        low: 0.01,
        standard: 0.03,
        high: 0.1,
      };
      return presetAmounts[feeConfig.preset || 'standard'];
    } else {
      return parseFloat(feeConfig.customFee || '0.03');
    }
  }, [feeConfig]);

  const handleMaxAmount = useCallback(() => {
    if (selectedToken) {
      const feeAmount = getFeeAmount();
      const feeInAtomic = BigInt(
        Math.floor(feeAmount * 10 ** selectedToken.decimals)
      );
      const maxAmount = formatBalance(
        availableBalance - feeInAtomic,
        selectedToken.decimals
      );
      setAmount(maxAmount);
    }
  }, [selectedToken, availableBalance, getFeeAmount]);

  const validateForm = useCallback(() => {
    if (!recipient.trim()) {
      setError('Recipient address is required');
      return false;
    }

    if (isValidRecipient === false) {
      setError('Invalid recipient address format');
      return false;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Amount must be greater than 0');
      return false;
    }

    if (!selectedToken) {
      setError('Please select a token');
      return false;
    }

    // Check if user has enough balance for amount + fees
    const feeAmount = getFeeAmount();
    const feeInAtomic = BigInt(
      Math.floor(feeAmount * 10 ** selectedToken.decimals)
    );
    const totalRequired = amountBigInt + feeInAtomic;

    if (totalRequired > availableBalance) {
      setError(
        `Insufficient balance. Need ${formatBalance(totalRequired, selectedToken.decimals)} ${selectedToken.ticker} (including ${feeAmount} ${selectedToken.ticker} fee)`
      );
      return false;
    }

    setError(null);
    return true;
  }, [
    recipient,
    amount,
    selectedToken,
    amountBigInt,
    availableBalance,
    getFeeAmount,
    isValidRecipient,
  ]);

  const handleSend = useCallback(() => {
    if (!validateForm()) return;
    setShowConfirmation(true);
  }, [validateForm]);

  const handleConfirmTransaction = useCallback(async () => {
    setIsConfirming(true);
    setError(null);

    try {
      if (!selectedToken) {
        throw new Error('No token selected');
      }

      // Convert amount to bigint
      const amountBigInt = BigInt(
        Math.floor(parseFloat(amount) * 10 ** selectedToken.decimals)
      );

      // Create asset object for ui-kit
      const asset = {
        decimals: selectedToken.decimals,
        balance: selectedToken.balance || 0n,
        symbol: selectedToken.ticker,
        address: selectedToken.isNative ? undefined : selectedToken.address,
        isNative: selectedToken.isNative,
      };

      // Use ui-kit sendAsset function (handles validation and error handling)
      await sendAsset({
        recipient: recipient.trim(),
        amount: amountBigInt,
        asset,
      });

      // Refresh balances after successful transaction
      await refreshBalances();

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Transaction failed:', err);
      setError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setIsConfirming(false);
    }
  }, [
    recipient,
    amount,
    selectedToken,
    sendAsset,
    onSuccess,
    onClose,
    refreshBalances,
  ]);

  const handleCancelConfirmation = useCallback(() => {
    setShowConfirmation(false);
  }, []);

  const handleFeeConfigChange = useCallback(
    (config: FeeConfig) => {
      setFeeConfig(config);
      setShowFeeConfig(false);
    },
    [setFeeConfig]
  );

  const getFeeDisplayText = useCallback(() => {
    if (feeConfig.type === 'preset') {
      const presetLabels = {
        low: 'Low (0.01 MAS)',
        standard: 'Standard (0.03 MAS)',
        high: 'High (0.1 MAS)',
      };
      return presetLabels[feeConfig.preset || 'standard'];
    } else {
      return `Custom (${feeConfig.customFee || '0.03'} MAS)`;
    }
  }, [feeConfig]);

  if (!isOpen) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Send">
      {/* Token Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Select Token
        </label>
        <TokenSelect
          tokens={tokens}
          selectedToken={selectedToken}
          onSelect={token => {
            const index = tokens.findIndex(t => t.address === token.address);
            setSelectedTokenIndex(index);
          }}
        />
      </div>

      {/* Recipient Address */}
      <AddressInput
        value={recipient}
        onChange={value => {
          setRecipient(value);
          setError(null);
        }}
        placeholder="Enter recipient address"
        label="Recipient Address"
        onValidationChange={handleAddressValidationChange}
      />

      {/* Fee Configuration */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Network Fee
        </label>
        <button
          onClick={() => setShowFeeConfig(true)}
          className="w-full flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <span className="text-sm text-gray-900 dark:text-white">
            {getFeeDisplayText()}
          </span>
          <svg
            className="w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Amount
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={e => {
              setAmount(e.target.value);
              setError(null);
            }}
            placeholder="0.00"
            step="any"
            min="0"
            className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
          />
          <button
            onClick={handleMaxAmount}
            className="px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors"
          >
            MAX
          </button>
        </div>
        <div className="mt-2 flex justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            Available:{' '}
            {formatBalance(availableBalance, selectedToken?.decimals || 9)}{' '}
            {selectedToken?.ticker}
          </span>
          {selectedToken?.valueUsd && amount && !isNaN(parseFloat(amount)) && (
            <span>
              ≈ $
              {(
                (parseFloat(amount) * selectedToken.valueUsd) /
                parseFloat(
                  formatBalance(availableBalance, selectedToken.decimals)
                )
              ).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button onClick={onClose} variant="secondary" fullWidth>
          Cancel
        </Button>
        <Button
          onClick={handleSend}
          disabled={
            !recipient ||
            !amount ||
            isValidRecipient === false ||
            isConfirming ||
            isProcessing
          }
          loading={isConfirming || isProcessing}
          variant="primary"
          fullWidth
        >
          {isProcessing ? 'Sending...' : 'Send'}
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmTransactionDialog
        isOpen={showConfirmation}
        onClose={handleCancelConfirmation}
        onConfirm={handleConfirmTransaction}
        recipient={recipient}
        amount={amount}
        tokenName={selectedToken?.name || ''}
        tokenTicker={selectedToken?.ticker || ''}
        estimatedFee={`${getFeeAmount()} ${selectedToken?.ticker || 'MAS'}`}
        totalCost={
          (
            parseFloat(
              formatBalance(amountBigInt, selectedToken?.decimals || 9)
            ) + getFeeAmount()
          ).toFixed(6) +
          ' ' +
          (selectedToken?.ticker || 'MAS')
        }
        isLoading={isConfirming}
      />

      {/* Fee Configuration Modal */}
      <FeeConfigModal
        isOpen={showFeeConfig}
        onClose={() => setShowFeeConfig(false)}
        onConfirm={handleFeeConfigChange}
        currentConfig={feeConfig}
      />
    </BaseModal>
  );
};

export default SendModal;
