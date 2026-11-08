import React, { useId } from 'react';
import { QRCode } from 'react-qrcode-logo';

// Provisional lettering; the official mark is uploaded in Administration > Settings.
// Always render the actual banking payload, never a URL or altered Pix string.
const fallbackLogo = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect x="1" y="1" width="98" height="98" rx="24" fill="#fffaf7"/>' +
    '<text x="50" y="48" fill="#552c80" font-size="31" font-family="Arial" font-weight="800" text-anchor="middle">XX</text>' +
    '<text x="50" y="75" fill="#552c80" font-size="25" font-family="Arial" font-weight="800" text-anchor="middle">EJC</text>' +
    '</svg>',
)}`;

const variants = {
  pix: { fgColor: '#221a34', qrStyle: 'squares', ecLevel: 'H', eyeRadius: 4 },
  standard: { fgColor: '#352051', qrStyle: 'squares', ecLevel: 'H', eyeRadius: 5 },
  decorated: { fgColor: '#552c80', qrStyle: 'dots', ecLevel: 'H', eyeRadius: 6 },
  print: { fgColor: '#111111', qrStyle: 'squares', ecLevel: 'H', eyeRadius: 0 },
};

export default function QrCode({ value, size = 210, variant = 'standard', logoUrl }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!value) return null;
  const settings = variants[variant] ?? variants.standard;
  // Pix payloads are dense. Keep the mark intentionally small and preserve
  // the light quiet zone to maximise compatibility with banking scanners.
  const isPrint = variant === 'print';
  const logoWidth = Math.round(size * (variant === 'pix' ? 0.12 : 0.15));

  return (
    <div className="qr-code" role="img" aria-label="QR Code para escanear">
      <QRCode
        id={`ejc-qr-${id}`}
        value={value}
        size={size}
        bgColor="#ffffff"
        quietZone={isPrint ? 28 : 18}
        pixelRatio={3}
        {...settings}
        logoImage={isPrint ? undefined : logoUrl || fallbackLogo}
        logoWidth={isPrint ? 0 : logoWidth}
        logoHeight={isPrint ? 0 : logoWidth}
        logoPadding={2}
        logoPaddingStyle="circle"
        removeQrCodeBehindLogo={!isPrint}
        enableCORS={false}
      />
    </div>
  );
}
