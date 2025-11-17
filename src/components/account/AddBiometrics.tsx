import React, { useState, useEffect } from 'react';
import { UserProfile, db } from '../../db';
import { biometricService } from '../../crypto/biometricService';
import { validateMnemonic } from '../../crypto/bip39';
import { encryptMnemonicWithBiometricCredentials } from '../../crypto/encryption';
import { decodeUserId } from '../../utils/userId';
import Button from '../ui/Button';

interface AddBiometricsProps {
  account: UserProfile;
  onComplete: () => void;
  onBack: () => void;
}

const AddBiometrics: React.FC<AddBiometricsProps> = ({
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

  const handleAddBiometrics = async () => {
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
        'Add biometric authentication to your account'
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

      onComplete();
    } catch (error) {
      console.error('Error adding biometrics:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to add biometrics'
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
          <p className="text-muted-foreground mb-6">
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
          <p className="text-muted-foreground mb-6">
            To add biometrics, we need to verify your recovery phrase.
          </p>

          <textarea
            value={mnemonic}
            onChange={e => setMnemonic(e.target.value)}
            placeholder="Enter your 12 or 24 word recovery phrase"
            className="w-full h-32 p-4 border border-border rounded-xl bg-card text-card-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isLoading}
          />

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-xl">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          <div className="mt-6 space-y-3">
            <Button
              onClick={handleAddBiometrics}
              disabled={isLoading || !mnemonic.trim()}
              loading={isLoading}
              variant="primary"
              fullWidth
            >
              Add Biometrics
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
        <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-primary"
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
          Add Biometric Authentication
        </h2>
        <p className="text-muted-foreground mb-8">
          Enable fingerprint or face recognition to sign in quickly and
          securely.
        </p>

        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive rounded-xl">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <Button
            onClick={handleAddBiometrics}
            disabled={isLoading}
            loading={isLoading}
            variant="primary"
            fullWidth
          >
            Add Biometrics
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

export default AddBiometrics;
