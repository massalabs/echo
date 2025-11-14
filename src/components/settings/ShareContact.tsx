import React, { useState } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { useFileShareContact } from '../../hooks/useFileShareContact';
import TabSwitcher from '../ui/TabSwitcher';
import PageHeader from '../ui/PageHeader';
import Button from '../ui/Button';
import QrCodePlaceholder from '../ui/QrCodePlaceholder';

interface ShareContactProps {
  onBack: () => void;
}

type ShareTab = 'files' | 'qr';

const ShareContact: React.FC<ShareContactProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<ShareTab>('files');
  const { ourPk, userProfile } = useAccountStore();
  const { exportFileContact, isLoading, error } = useFileShareContact();

  return (
    <div className="bg-background">
      <div className="max-w-sm mx-auto">
        <PageHeader title="Share Contact" onBack={onBack} />

        <div className="px-4 pb-20 space-y-6">
          {/* Tabs */}
          <div className="bg-card rounded-lg p-6">
            <TabSwitcher
              options={[
                {
                  value: 'files',
                  label: 'Files',
                },
                {
                  value: 'qr',
                  label: 'QR code',
                },
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />
          </div>

          {/* Content */}
          {activeTab === 'files' && (
            <div className="bg-card rounded-lg p-6">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-black dark:text-white mb-2">
                  Share with file
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Download your profile file and share it with people you want
                  to talk to.
                </p>
              </div>
              <Button
                onClick={() => {
                  if (!ourPk) return;
                  exportFileContact({
                    userPubKeys: ourPk.to_bytes(),
                    userName: userProfile?.username,
                  });
                }}
                disabled={!ourPk || isLoading}
                loading={isLoading}
                variant="primary"
                size="custom"
                fullWidth
                className="h-11 rounded-xl text-sm font-medium"
              >
                {!isLoading && (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    <span>Download</span>
                  </>
                )}
              </Button>
              {error && (
                <div className="mt-4 text-sm text-red-600 dark:text-red-400 text-center">
                  {error}
                </div>
              )}
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="bg-card rounded-lg p-6">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg
                    className="w-6 h-6 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2.01M19 8h2.01M12 19h.01M12 4h.01"
                    />
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-black dark:text-white mb-2">
                  Scan QR code
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Share your contact information via QR code
                </p>
              </div>
              <QrCodePlaceholder />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareContact;
