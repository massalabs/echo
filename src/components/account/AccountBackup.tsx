import React, { useState } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { Bip39BackupDisplay } from '../../crypto/bip39';

interface AccountBackupProps {
  onBack: () => void;
}

const AccountBackup: React.FC<AccountBackupProps> = ({ onBack }) => {
  const { userProfile, showMnemonicBackup, showPrivateKey } = useAccountStore();
  const [method, setMethod] = useState<'mnemonic' | 'privateKey'>('mnemonic');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [mnemonicInfo, setMnemonicInfo] = useState<Bip39BackupDisplay | null>(
    null
  );
  const [privateKeyString, setPrivateKeyString] = useState<string | null>(null);

  const requiresPassword = !userProfile?.security?.webauthn?.credentialId;

  const handleShow = async () => {
    try {
      setIsLoading(true);
      setError('');
      setPasswordError('');

      if (requiresPassword && !password.trim()) {
        setPasswordError('Password is required');
        return;
      }

      if (method === 'mnemonic') {
        const data = await showMnemonicBackup(
          requiresPassword ? password : undefined
        );
        setMnemonicInfo(data);
      } else {
        const pk = await showPrivateKey(
          requiresPassword ? password : undefined
        );
        setPrivateKeyString(pk);
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Failed to show backup information';
      setError(message);
      setPasswordError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyText = async (text?: string | null) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_e) {
      // ignore
    }
  };

  return (
    <div className="min-h-screen-mobile bg-[#efefef] dark:bg-gray-900">
      <div className="max-w-sm mx-auto">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h1 className="text-2xl font-semibold text-black dark:text-white">
              Account Backup
            </h1>
          </div>
        </div>

        <div className="px-4 pb-20 space-y-6">
          {/* Toggle */}
          <div className="w-full p-1 bg-gray-100 dark:bg-gray-800 rounded-lg relative h-10 flex items-center">
            <div
              className={`absolute top-1 bottom-1 w-1/2 rounded-md bg-white dark:bg-gray-700 shadow transition-transform duration-200 ease-out ${
                method === 'mnemonic' ? 'translate-x-0' : 'translate-x-full'
              }`}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => setMethod('mnemonic')}
              className={`relative z-10 flex-1 h-8 inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors ${
                method === 'mnemonic'
                  ? 'text-black dark:text-white'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
              aria-pressed={method === 'mnemonic'}
              disabled={!userProfile?.security?.mnemonicBackup}
            >
              Mnemonic
            </button>
            <button
              type="button"
              onClick={() => setMethod('privateKey')}
              className={`relative z-10 flex-1 h-8 inline-flex items-center justify-center gap-2 text-xs font-medium rounded-md transition-colors ${
                method === 'privateKey'
                  ? 'text-black dark:text-white'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
              aria-pressed={method === 'privateKey'}
            >
              Private Key
            </button>
          </div>

          {/* Input/auth */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            {requiresPassword ? (
              <>
                <label className="block text-base font-semibold text-black dark:text-white mb-2">
                  Enter your password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-[15px] font-medium mb-4 text-black dark:text-white bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Enter your password"
                />
                {(error || passwordError) && (
                  <div className="text-[15px] font-medium text-red-600 dark:text-red-400 mb-2">
                    {error || passwordError}
                  </div>
                )}
                <button
                  onClick={handleShow}
                  disabled={isLoading || !password.trim()}
                  className="w-full h-[54px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-base font-semibold text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Authenticating...' : 'Show Backup'}
                </button>
              </>
            ) : (
              <button
                onClick={handleShow}
                disabled={isLoading}
                className="w-full h-[54px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-base font-semibold text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Authenticating...' : 'Show Backup'}
              </button>
            )}
          </div>

          {/* Display */}
          {method === 'mnemonic' && mnemonicInfo && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-base font-semibold text-black dark:text-white">
                  24-Word Mnemonic
                </h4>
                <button
                  onClick={() => copyText(mnemonicInfo?.mnemonic)}
                  className="text-[15px] font-medium text-[#b2b2b2] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-[15px] font-mono text-black dark:text-white break-all leading-relaxed">
                  {mnemonicInfo?.mnemonic}
                </p>
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-2">
                Never share this information. Anyone with it can access your
                account.
              </p>
            </div>
          )}

          {method === 'privateKey' && privateKeyString && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-base font-semibold text-black dark:text-white">
                  Private Key
                </h4>
                <button
                  onClick={() => copyText(privateKeyString)}
                  className="text-[15px] font-medium text-[#b2b2b2] dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-[15px] font-mono text-black dark:text-white break-all leading-relaxed">
                  {privateKeyString}
                </p>
              </div>
              <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-xs text-yellow-800 dark:text-yellow-300 leading-relaxed">
                  <strong>⚠️ Warning:</strong> This Massa private key cannot be
                  used to restore your Echo account. Use this only for external
                  wallet compatibility. To restore your Echo account, you must
                  use the 24-word mnemonic phrase.
                </p>
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-2">
                Never share this information. Anyone with it can access your
                account.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountBackup;
