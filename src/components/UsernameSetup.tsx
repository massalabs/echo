import React, { useState } from 'react';
import appLogo from '../assets/echo_face.svg';

interface UsernameSetupProps {
  onComplete: (username: string, password: string) => void;
}

const UsernameSetup: React.FC<UsernameSetupProps> = ({ onComplete }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);

  const validateUsername = (value: string) => {
    const valid =
      value.length >= 3 && value.length <= 20 && /^[a-zA-Z0-9_]+$/.test(value);
    setIsValid(valid);
    return valid;
  };

  const validatePassword = (value: string) => {
    const valid = value.length >= 8;
    setIsPasswordValid(valid);
    return valid;
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    validateUsername(value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    validatePassword(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && isPasswordValid) {
      onComplete(username, password);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={appLogo}
            className="w-32 h-32 mx-auto mb-6 rounded-full object-cover"
            alt="Echo logo"
          />
          <h1 className="text-2xl font-semibold text-black mb-2">
            Create Your Account
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            Choose a username and password for your Echo account
          </p>
        </div>

        {/* Account Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Enter username"
              className={`w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-colors ${
                username && !isValid
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-gray-200 focus:border-gray-400'
              }`}
              maxLength={20}
            />
            {username && !isValid && (
              <p className="text-red-500 text-xs mt-1">
                Username must be 3-20 characters, letters, numbers, and
                underscores only
              </p>
            )}
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={handlePasswordChange}
              placeholder="Enter password"
              className={`w-full h-12 px-4 rounded-lg border-2 text-sm focus:outline-none transition-colors ${
                password && !isPasswordValid
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-gray-200 focus:border-gray-400'
              }`}
            />
            {password && !isPasswordValid && (
              <p className="text-red-500 text-xs mt-1">
                Password must be at least 8 characters long
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!isValid || !isPasswordValid}
            className={`w-full h-12 rounded-lg text-sm font-medium transition-colors duration-200 ${
              isValid && isPasswordValid
                ? 'bg-black text-white hover:bg-gray-800'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Create Account
          </button>
        </form>
      </div>
    </div>
  );
};

export default UsernameSetup;
