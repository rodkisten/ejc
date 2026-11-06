import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Pause, Play, RotateCcw, Check, Trash2 } from 'lucide-react';
import VoicePlayer from './VoicePlayer';
import { track } from '../lib/api';
const formatTime = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
export default function Recorder({ onAdd }) {
  const [state, setState] = useState('idle'),
    [seconds, setSeconds] = useState(0),
    [preview, setPreview] = useState(null),
    [error, setError] = useState('');
  const rec = useRef(null),
    stream = useRef(null),
    chunks = useRef([]),
    url = useRef(null);
  useEffect(
    () => () => {
      if (rec.current?.state === 'recording') rec.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  useEffect(() => {
    if (state !== 'recording') return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);
  async function start() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Este navegador não oferece gravação de áudio.');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const format = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const recorder = new MediaRecorder(media, format ? { mimeType: format } : {});
      rec.current = recorder;
      chunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.current.push(e.data);
      };
      recorder.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        const mime = recorder.mimeType.split(';')[0] || 'audio/mp4',
          ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'm4a';
        const file = new File(chunks.current, `cartinha-${Date.now()}.${ext}`, { type: mime });
        if (file.size) {
          if (url.current) URL.revokeObjectURL(url.current);
          url.current = URL.createObjectURL(file);
          setPreview({ file, url: url.current });
          setState('review');
          track('audio_recorded');
        } else {
          setState('idle');
          setError('O áudio ficou vazio. Tente novamente.');
        }
      };
      recorder.onerror = () => {
        setState('idle');
        setError('A gravação falhou. Tente novamente.');
      };
      recorder.start(1000);
      setSeconds(0);
      setState('recording');
      track('audio_start');
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError('Permita o acesso ao microfone nas configurações do navegador.');
    }
  }
  const pause = () => {
    if (rec.current?.state === 'recording') {
      rec.current.pause();
      setState('paused');
    } else if (rec.current?.state === 'paused') {
      rec.current.resume();
      setState('recording');
    }
  };
  const stop = () => {
    if (['recording', 'paused'].includes(rec.current?.state)) {
      setState('processing');
      rec.current.stop();
    }
  };
  const reset = () => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPreview(null);
    setState('idle');
    setSeconds(0);
  };
  const save = () => {
    if (preview) onAdd(preview.file);
    reset();
  };
  return (
    <div className="record-studio">
      {state === 'idle' && (
        <button type="button" className="record-start" onClick={start}>
          <span>
            <Mic size={24} />
          </span>
          Gravar áudio <small>Sem limite de duração definido</small>
        </button>
      )}
      {['recording', 'paused', 'processing'].includes(state) && (
        <div className="record-live">
          <div className="row between">
            <span className="record-indicator">
              <span className="blink" /> {state === 'paused' ? 'PAUSADO' : 'GRAVANDO'}
            </span>
            <span className="mono">{formatTime(seconds)}</span>
          </div>
          <div className="record-motion">
            {Array.from({ length: 32 }, (_, i) => (
              <span key={i} style={{ height: `${8 + 28 * Math.abs(Math.sin(i * 2.8 + seconds))}px` }} />
            ))}
          </div>
          <div className="inline-actions">
            <button type="button" className="btn ghost" disabled={state === 'processing'} onClick={pause}>
              {state === 'paused' ? <Play size={16} /> : <Pause size={16} />}{' '}
              {state === 'paused' ? 'Continuar' : 'Pausar'}
            </button>
            <button type="button" className="btn" disabled={state === 'processing'} onClick={stop}>
              <Square size={16} /> Finalizar gravação
            </button>
          </div>
        </div>
      )}
      {preview && (
        <div className="record-review">
          <strong>Ouça antes de guardar</strong>
          <VoicePlayer src={preview.url} />
          <div className="inline-actions">
            <button type="button" className="btn ghost" onClick={reset}>
              <RotateCcw size={16} /> Gravar novamente
            </button>
            <button type="button" className="btn" onClick={save}>
              <Check size={16} /> Guardar este áudio
            </button>
          </div>
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
    </div>
  );
}
