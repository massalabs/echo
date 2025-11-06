import React, { useState } from 'react';
import appLogo from '../assets/echo_face.svg';
import { PrivacyGraphic } from './ui/PrivacyGraphic';
import Button from './ui/Button';

interface OnboardingFlowProps {
  onComplete: () => void;
  onImportMnemonic?: () => void;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  onComplete,
  onImportMnemonic,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to Gossip!',
      description:
        'Your private messenger designed for secure, end-to-end encrypted conversations. Connect with confidence.',
      image: appLogo,
    },
    {
      title: 'Privacy by Design 🔒',
      description:
        'All your messages are encrypted and stored locally on your device. Your conversations stay private, always.',
      image: appLogo,
    },
    {
      title: "Let's Get Started! 🚀",
      description:
        'Create your account in seconds and start connecting with people securely.',
      image: appLogo,
    },
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="min-h-screen-mobile bg-background flex flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-md mx-auto">
        {/* Progress indicator */}
        <div className="flex justify-center mb-10">
          <div className="flex space-x-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`transition-all duration-300 ${
                  index === currentStep
                    ? 'w-8 h-2 bg-blue-600 rounded-full shadow-sm'
                    : 'w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="text-center mb-10">
          <div className="relative mb-8">
            <PrivacyGraphic size={200} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4 leading-tight">
            {currentStep === 0 ? (
              <>
                Welcome to{' '}
                <span className="text-blue-700 dark:text-blue-400 text-4xl">
                  Gossip!
                </span>
              </>
            ) : (
              steps[currentStep].title
            )}
          </h1>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-300 leading-relaxed max-w-sm mx-auto px-2">
            {steps[currentStep].description}
          </p>
        </div>

        {/* Create Your Account CTAs */}
        {steps[currentStep].title === "Let's Get Started! 🚀" && (
          <div className="space-y-4 mb-6">
            <Button
              onClick={onComplete}
              variant="primary"
              size="custom"
              fullWidth
              className="h-14 text-base font-semibold rounded-2xl flex items-center justify-center gap-2"
            >
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Create New Account
            </Button>
            {onImportMnemonic && (
              <Button
                onClick={onImportMnemonic}
                variant="outline"
                size="custom"
                fullWidth
                className="h-14 border-2 border-gray-300 dark:border-gray-600 text-base font-medium rounded-2xl"
              >
                Import from Mnemonic
              </Button>
            )}
          </div>
        )}

        {/* Navigation */}
        {steps[currentStep].title !== "Let's Get Started! 🚀" && (
          <div className="flex justify-between items-center">
            <Button
              onClick={prevStep}
              variant="ghost"
              size="sm"
              disabled={currentStep === 0}
              className={`${currentStep === 0 ? 'opacity-50' : ''}`}
            >
              Back
            </Button>

            <Button
              onClick={nextStep}
              variant="primary"
              size="sm"
              className="px-8 flex items-center gap-2"
            >
              {currentStep === steps.length - 2 ? 'Get Started' : 'Next'}
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
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingFlow;
