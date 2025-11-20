import React, { useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';
import { useTheme } from '../../hooks/useTheme';
import {
  getForegroundColor,
  getBackgroundColor,
} from '../../utils/qrCodeColors';

interface QRCodeProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  type?: 'svg' | 'canvas';
  className?: string;
}

const QRCode: React.FC<QRCodeProps> = ({
  value,
  size = 300,
  level = 'H',
  type = 'svg',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Get colors based on theme
    const foregroundColor = getForegroundColor(resolvedTheme);
    const backgroundColor = getBackgroundColor(resolvedTheme);

    // Create QR code instance
    const qrCode = new QRCodeStyling({
      type: type === 'svg' ? 'svg' : 'canvas',
      width: size,
      height: size,
      data: value,
      margin: 0,
      qrOptions: {
        errorCorrectionLevel: level,
      },
      dotsOptions: {
        type: 'rounded',
        color: foregroundColor,
      },
      cornersSquareOptions: {
        type: 'extra-rounded',
        color: foregroundColor,
      },
      cornersDotOptions: {
        type: 'dot',
        color: foregroundColor,
      },
      backgroundOptions: {
        color: backgroundColor,
        round: 0,
      },
    });

    qrCodeRef.current = qrCode;

    // Clear container and append QR code
    container.innerHTML = '';
    qrCode.append(container);

    // Cleanup
    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [value, size, level, type, resolvedTheme]);

  return (
    <div
      ref={containerRef}
      className={`flex justify-center items-center ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default QRCode;
