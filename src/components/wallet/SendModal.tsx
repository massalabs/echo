import React, { useState, useCallback, useEffect } from 'react';
import { useWalletStore } from '../../stores/walletStore';
import AddressInput from '../AddressInput';
import Button from '../ui/Button';
import BaseModal from '../ui/BaseModal';
import ConfirmTransactionDialog from './ConfirmTransactionDialog';
import FeeConfigModal, { FeeConfig } from './FeeConfigModal';
import { useAccountStore } from '../../stores/accountStore';
import TokenSelect from './TokenSelect';
import { useSend } from '../../hooks/temp/useSend';
import { formatAmount } from '../../hooks/temp/parseAmount';
import toast from 'react-hot-toast';

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
  const {
    sendAsset,
    isPending,
    error: _sendError,
    operation: _operation,
  } = useSend({ provider });

  // Calculate amount in bigint for validation
  const amountBigInt = amount
    ? BigInt(
        Math.floor(parseFloat(amount) * 10 ** (selectedToken?.decimals || 9))
      )
    : 0n;

  const resetModalState = useCallback(() => {
    setShowConfirmation(false);
    setShowFeeConfig(false);
    setRecipient('');
    setAmount('');
    setError(null);
    setIsConfirming(false);
    setIsValidRecipient(null);
  }, []);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      resetModalState();
    }
  }, [isOpen, resetModalState]);

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
      const maxAmount = availableBalance - feeInAtomic;

      setAmount(formatAmount(maxAmount, selectedToken.decimals).preview);
    }
  }, [selectedToken, availableBalance, getFeeAmount]);

  const validateForm = useCallback(() => {
    if (!recipient.trim()) {
      const errorMsg = 'Recipient address is required';
      setError(errorMsg);
      toast.error(errorMsg);
      return false;
    }

    if (isValidRecipient === false) {
      const errorMsg = 'Invalid recipient address format';
      setError(errorMsg);
      toast.error(errorMsg);
      return false;
    }

    if (!amount || parseFloat(amount) <= 0) {
      const errorMsg = 'Amount must be greater than 0';
      setError(errorMsg);
      toast.error(errorMsg);
      return false;
    }

    if (!selectedToken) {
      const errorMsg = 'Please select a token';
      setError(errorMsg);
      toast.error(errorMsg);
      return false;
    }

    // Check if user has enough balance for amount + fees
    const feeAmount = getFeeAmount();
    const feeInAtomic = BigInt(
      Math.floor(feeAmount * 10 ** selectedToken.decimals)
    );
    const totalRequired = amountBigInt + feeInAtomic;

    if (totalRequired > availableBalance) {
      const errorMsg = `Insufficient balance. Need ${formatAmount(totalRequired, selectedToken.decimals).preview} ${selectedToken.ticker} (including ${feeAmount} ${selectedToken.ticker} fee)`;
      setError(errorMsg);
      toast.error(errorMsg);
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

    // Close all modals immediately - don't wait for transaction
    resetModalState();
    onSuccess();
    onClose();

    let loadingToast: string | null = null;

    try {
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

      loadingToast = toast.loading('Processing transaction...', {
        duration: Infinity,
      });

      await sendAsset({
        recipient: recipient.trim(),
        amount: amountBigInt,
        asset,
        final: false,
      });

      await refreshBalances();

      // Dismiss loading toast and show success
      if (loadingToast) {
        toast.dismiss(loadingToast);
      }

      toast.success(
        `Successfully sent ${formatAmount(amountBigInt, selectedToken.decimals).preview} ${selectedToken.ticker} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`
      );
    } catch (err) {
      if (loadingToast) {
        toast.dismiss(loadingToast);
      }
      const errorMessage =
        err instanceof Error ? err.message : 'Transaction failed';
      toast.error(`Transaction failed: ${errorMessage}`);
    }
  }, [
    resetModalState,
    onSuccess,
    onClose,
    selectedToken,
    amount,
    sendAsset,
    recipient,
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
            {
              formatAmount(availableBalance, selectedToken?.decimals || 9)
                .preview
            }{' '}
            {selectedToken?.ticker}
          </span>
          {selectedToken?.priceUsd && amount && !isNaN(parseFloat(amount)) && (
            <span>
              ≈ $
              {(
                parseFloat(amount) * (selectedToken.priceUsd ?? 0) +
                getFeeAmount()
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
            isPending
          }
          loading={isConfirming || isPending}
          variant="primary"
          fullWidth
        >
          {isPending ? 'Sending...' : 'Send'}
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
        totalCost={`${
          formatAmount(
            amountBigInt +
              BigInt(getFeeAmount() * 10 ** selectedToken.decimals),
            selectedToken.decimals
          ).preview
        } ${selectedToken.ticker}`}
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
