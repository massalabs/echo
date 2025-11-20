import React, { useEffect, useRef } from 'react';
import QRCodeStyling, { Options } from 'qr-code-styling';
import { useTheme } from '../../hooks/useTheme';
import {
  getForegroundColor,
  getBackgroundColor,
} from '../../utils/qrCodeColors';

export interface QRCodeProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  type?: 'svg' | 'canvas';
  className?: string;
  // Styling options matching qrcode-styling API
  dotsOptions?: {
    type?:
      | 'dots'
      | 'rounded'
      | 'classy'
      | 'classy-rounded'
      | 'square'
      | 'extra-rounded';
    color?: string;
    gradient?: {
      type: 'linear' | 'radial';
      rotation?: number;
      colorStops: { offset: number; color: string }[];
    };
  };
  cornersSquareOptions?: {
    type?:
      | 'dot'
      | 'square'
      | 'extra-rounded'
      | 'dots'
      | 'rounded'
      | 'classy'
      | 'classy-rounded';
    color?: string;
    gradient?: {
      type: 'linear' | 'radial';
      rotation?: number;
      colorStops: { offset: number; color: string }[];
    };
  };
  cornersDotOptions?: {
    type?: 'dot' | 'square' | 'dots' | 'rounded' | 'classy' | 'classy-rounded';
    color?: string;
    gradient?: {
      type: 'linear' | 'radial';
      rotation?: number;
      colorStops: { offset: number; color: string }[];
    };
  };
  backgroundOptions?: {
    color?: string;
    gradient?: {
      type: 'linear' | 'radial';
      rotation?: number;
      colorStops: { offset: number; color: string }[];
    };
  };
  image?: string;
  imageOptions?: {
    saveAsBlob?: boolean;
    crossOrigin?: string;
    margin?: number;
    imageSize?: number;
  };
}

const QRCode: React.FC<QRCodeProps> = ({
  value,
  size = 300,
  level = 'H',
  type = 'svg',
  className = '',
  dotsOptions,
  cornersSquareOptions,
  cornersDotOptions,
  backgroundOptions,
  image,
  imageOptions,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Get colors based on theme or use provided colors
    const foregroundColor = getForegroundColor(
      resolvedTheme,
      dotsOptions?.color
    );
    const backgroundColor = getBackgroundColor(
      resolvedTheme,
      backgroundOptions?.color
    );

    // Create QR code instance with custom options
    const qrCodeOptions: Options = {
      type: type === 'svg' ? 'svg' : 'canvas',
      width: size,
      height: size,
      data: value,
      margin: 0,
      qrOptions: {
        errorCorrectionLevel: level,
      },
      dotsOptions: {
        type: dotsOptions?.type || 'rounded',
        color: foregroundColor,
        gradient: dotsOptions?.gradient,
      },
      cornersSquareOptions: {
        type: cornersSquareOptions?.type || 'extra-rounded',
        color: foregroundColor,
        gradient: cornersSquareOptions?.gradient,
      },
      cornersDotOptions: {
        type: cornersDotOptions?.type || 'dot',
        color: foregroundColor,
        gradient: cornersDotOptions?.gradient,
      },
      backgroundOptions: {
        color: backgroundColor,
        round: 0,
        gradient: backgroundOptions?.gradient,
      },
    };

    // Only include image and imageOptions if image is provided
    if (image) {
      qrCodeOptions.image = image;
      if (imageOptions) {
        qrCodeOptions.imageOptions = imageOptions;
      }
    }

    const qrCode = new QRCodeStyling(qrCodeOptions);

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
  }, [
    value,
    size,
    level,
    type,
    resolvedTheme,
    dotsOptions?.type,
    dotsOptions?.color,
    dotsOptions?.gradient,
    cornersSquareOptions?.type,
    cornersSquareOptions?.color,
    cornersSquareOptions?.gradient,
    cornersDotOptions?.type,
    cornersDotOptions?.color,
    cornersDotOptions?.gradient,
    backgroundOptions?.color,
    backgroundOptions?.gradient,
    image,
    imageOptions,
  ]);

  return (
    <div
      ref={containerRef}
      className={`flex justify-center items-center ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default QRCode;
