import React, { useState, useEffect } from 'react';
import { UserProfile, db } from '../../db';
import { biometricService } from '../../crypto/biometricService';
import { validateMnemonic } from '../../crypto/bip39';
import { encryptMnemonicWithBiometricCredentials } from '../../crypto/encryption';
import { decodeUserId } from '../../utils/userId';
import Button from '../ui/Button';

interface SetupBiometricsProps {
  account: UserProfile;
  onComplete: () => void;
  onBack: () => void;
}

const SetupBiometrics: React.FC<SetupBiometricsProps> = ({
  account,
  onComplete,
  onBack,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string>('');
  const [showMnemonicInput, setShowMnemonicInput] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    try {
      const availability = await biometricService.checkAvailability();
      setBiometricAvailable(availability.available);
    } catch (error) {
      console.error('Error checking biometric availability:', error);
      setBiometricAvailable(false);
    }
  };

  const handleSetupBiometrics = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // First, authenticate with current password to get mnemonic
      if (!mnemonic) {
        // Need to get mnemonic from user - they'll need to authenticate with password first
        setShowMnemonicInput(true);
        setIsLoading(false);
        return;
      }

      const currentMnemonic = mnemonic;

      if (!validateMnemonic(currentMnemonic)) {
        throw new Error('Invalid mnemonic phrase');
      }

      // Create new biometric credentials
      const userIdBytes = decodeUserId(account.userId);
      const credentialResult = await biometricService.createCredential(
        `Gossip:${account.username}`,
        userIdBytes,
        'Enable biometric authentication for your account'
      );

      if (
        !credentialResult.success ||
        !credentialResult.credentialId ||
        !credentialResult.publicKey
      ) {
        throw new Error(
          credentialResult.error || 'Failed to create biometric credentials'
        );
      }

      // Re-encrypt mnemonic with new biometric-derived key
      const {
        encryptedMnemonic,
        nonce: nonceForBackup,
        salt,
      } = await encryptMnemonicWithBiometricCredentials(
        credentialResult.credentialId,
        credentialResult.publicKey,
        currentMnemonic
      );

      // Update account security with biometric credentials
      const updatedSecurity = {
        ...account.security,
        webauthn: {
          credentialId: credentialResult.credentialId,
          publicKey: credentialResult.publicKey,
        },
        encKeySalt: salt,
        mnemonicBackup: {
          encryptedMnemonic,
          nonce: nonceForBackup,
          createdAt: new Date(),
          backedUp: account.security.mnemonicBackup?.backedUp || false,
        },
      };

      // Update account in database
      await db.userProfile.update(account.userId, {
        ...account,
        security: updatedSecurity,
        updatedAt: new Date(),
      });

      console.log('✅ Biometric authentication enabled successfully');
      onComplete();
    } catch (error) {
      console.error('Error setting up biometrics:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to setup biometrics'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!biometricAvailable) {
    return (
      <div className="min-h-screen-mobile bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm mx-auto text-center">
          <h2 className="text-2xl font-semibold mb-4">
            Biometrics Not Available
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Biometric authentication is not available on this device.
          </p>
          <Button onClick={onBack} variant="outline" fullWidth>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  if (showMnemonicInput) {
    return (
      <div className="min-h-screen-mobile bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm mx-auto">
          <h2 className="text-2xl font-semibold mb-4">
            Enter Your Recovery Phrase
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            To enable biometrics, we need to verify your recovery phrase.
          </p>

          <textarea
            value={mnemonic}
            onChange={e => setMnemonic(e.target.value)}
            placeholder="Enter your 12 or 24 word recovery phrase"
            className="w-full h-32 p-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="mt-6 space-y-3">
            <Button
              onClick={handleSetupBiometrics}
              disabled={isLoading || !mnemonic.trim()}
              loading={isLoading}
              variant="primary"
              fullWidth
            >
              Enable Biometrics
            </Button>
            <Button
              onClick={() => {
                setShowMnemonicInput(false);
                setError(null);
                setMnemonic('');
              }}
              variant="outline"
              fullWidth
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen-mobile bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm mx-auto text-center">
        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-blue-600 dark:text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-semibold mb-4">
          Enable Biometric Sign-In
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Enable fingerprint or face recognition to sign in instantly and
          securely.
          <br />
          <span className="text-sm">
            Your account will be converted to use biometric authentication.
          </span>
        </p>

        {error && (
          <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <Button
            onClick={handleSetupBiometrics}
            disabled={isLoading}
            loading={isLoading}
            variant="primary"
            fullWidth
          >
            Enable Biometrics
          </Button>
          <Button
            onClick={onBack}
            variant="outline"
            fullWidth
            disabled={isLoading}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SetupBiometrics;
