import React, { useState } from 'react';
import appLogo from '../assets/echo_face.svg';

interface OnboardingFlowProps {
  onComplete: () => void;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to Echo',
      description: 'Your private messenger for secure communication',
      image: appLogo,
    },
    {
      title: 'Privacy First',
      description:
        'All your messages are encrypted and stored locally on your device',
      image: appLogo,
    },
    {
      title: 'Create Your Account',
      description: 'Set up your username to get started',
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
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto">
        {/* Progress indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex space-x-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full ${
                  index === currentStep ? 'bg-black' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="text-center mb-8">
          <img
            src={steps[currentStep].image}
            className="w-32 h-32 mx-auto mb-6 rounded-full object-cover"
            alt="Echo logo"
          />
          <h1 className="text-2xl font-semibold text-black mb-4">
            {steps[currentStep].title}
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            {steps[currentStep].description}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={prevStep}
            className={`px-6 py-2 text-sm font-medium rounded-lg ${
              currentStep === 0
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-600 hover:text-gray-800'
            }`}
            disabled={currentStep === 0}
          >
            Back
          </button>

          <button
            onClick={nextStep}
            className="px-6 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors duration-200"
          >
            {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;
