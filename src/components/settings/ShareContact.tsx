import React, { useMemo, useState } from 'react';
import { useAccountStore } from '../../stores/accountStore';
import { useFileShareContact } from '../../hooks/useFileShareContact';
import PageHeader from '../ui/PageHeader';
import Button from '../ui/Button';
import QRCode from '../ui/QRCode';
import TabSwitcher from '../ui/TabSwitcher';
// import { generateQRCodeUrl } from '../../utils/qrCodeUrl';

interface ShareContactProps {
  onBack: () => void;
}

type ShareTab = 'qr' | 'files';

const ShareContact: React.FC<ShareContactProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<ShareTab>('qr');
  const { ourPk, userProfile } = useAccountStore();
  const { exportFileContact, fileState } = useFileShareContact();

  // Memoize QR code options to prevent unnecessary re-renders
  const qrCodeOptions = useMemo(
    () => ({
      dotsOptions: {
        type: 'extra-rounded' as const,
      },
      cornersSquareOptions: {
        type: 'extra-rounded' as const,
      },
      cornersDotOptions: {
        type: 'dot' as const,
      },
      image: '/favicon/web-app-manifest-192x192.png',
      imageOptions: {
        saveAsBlob: false,
        crossOrigin: 'anonymous',
        margin: 15,
        imageSize: 0.25, // Logo size ratio (25% of QR code)
      },
    }),
    []
  );

  return (
    <div className="bg-background">
      <div className="max-w-md mx-auto">
        <PageHeader title="Share Contact" onBack={onBack} />

        <div className="px-4 pb-20 space-y-6">
          {/* Tabs */}
          <div className="bg-card rounded-lg p-6">
            <TabSwitcher
              options={[
                {
                  value: 'qr',
                  label: 'Scan QR code',
                },
                {
                  value: 'files',
                  label: 'File',
                },
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />
          </div>

          {activeTab === 'qr' && (
            <div className="space-y-3">
              <div className="bg-card rounded-lg p-6">
                <div className="text-center mb-6">
                  <h4 className="text-lg font-semibold text-foreground mb-2">
                    Scan QR code
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Share your contact information via QR code
                  </p>
                </div>
                {userProfile?.userId ? (
                  <div className="flex justify-center">
                    <QRCode
                      value={
                        // For now we use only userId
                        userProfile.userId
                        //   generateQRCodeUrl(
                        //   userProfile.userId,
                        //   userProfile.username
                        // )
                      }
                      size={300}
                      level="H"
                      type="svg"
                      dotsOptions={qrCodeOptions.dotsOptions}
                      cornersSquareOptions={qrCodeOptions.cornersSquareOptions}
                      cornersDotOptions={qrCodeOptions.cornersDotOptions}
                      image={qrCodeOptions.image}
                      imageOptions={qrCodeOptions.imageOptions}
                    />
                  </div>
                ) : (
                  <div className="flex justify-center items-center h-64">
                    <p className="text-sm text-muted-foreground">
                      No user ID available
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
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
                <h4 className="text-lg font-semibold text-foreground mb-2">
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
                disabled={!ourPk || fileState.isLoading}
                loading={fileState.isLoading}
                variant="primary"
                size="custom"
                fullWidth
                className="h-11 rounded-xl text-sm font-medium"
              >
                {!fileState.isLoading && (
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
              {fileState.error && (
                <div className="mt-4 text-sm text-destructive text-center">
                  {fileState.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareContact;
