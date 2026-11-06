import React, { useId } from 'react';
import { QRCode } from 'react-qrcode-logo';

const styles = {
  pix: { fgColor: '#111111', qrStyle: 'squares', ecLevel: 'M', eyeRadius: 0 },
  standard: { fgColor: '#2d2130', qrStyle: 'squares', ecLevel: 'Q', eyeRadius: 4 },
  decorated: { fgColor: '#43283c', qrStyle: 'dots', ecLevel: 'H', eyeRadius: 6 },
};

export default function QrCode({ value, size = 210, variant = 'standard' }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!value) return null;

  return (
    <div className="qr-code" role="img" aria-label="Código QR para escanear">
      <QRCode
        id={`ejc-qr-${id}`}
        value={value}
        size={size}
        quietZone={16}
        bgColor="#ffffff"
        pixelRatio={3}
        {...(styles[variant] ?? styles.standard)}
      />
    </div>
  );
}
