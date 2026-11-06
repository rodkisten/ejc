import React, { useEffect, useRef } from 'react';
import { drawQR } from '../lib/qr.js';
export default function QrCode({value,size=210}) {
  const ref=useRef(null);
  useEffect(()=>{if(ref.current && value){ref.current.replaceChildren();drawQR(value,ref.current,size);}},[value,size]);
  return <div className="qr-code" ref={ref} aria-label="Código QR para escanear"/>;
}
