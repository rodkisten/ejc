import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
function time(t) {
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}
export default function VoicePlayer({ src, title = 'Mensagem de voz', compact = false }) {
  const audio = useRef(null),
    [playing, setPlaying] = useState(false),
    [duration, setDuration] = useState(0),
    [position, setPosition] = useState(0),
    [speed, setSpeed] = useState(1);
  const bars = useMemo(
    () =>
      Array.from(
        { length: compact ? 32 : 52 },
        (_, i) => 8 + Math.floor(25 * Math.abs(Math.sin((i + 1) * 3.8) * Math.cos(i * 1.37))),
      ),
    [compact],
  );
  useEffect(() => {
    setPlaying(false);
    setPosition(0);
  }, [src]);
  const toggle = async () => {
    if (!audio.current) return;
    if (audio.current.paused) {
      try {
        await audio.current.play();
      } catch {
        setPlaying(false);
      }
    } else audio.current.pause();
  };
  return (
    <div className={`voice-player ${compact ? 'compact' : ''}`}>
      <audio
        ref={audio}
        preload="metadata"
        src={src}
        onTimeUpdate={(e) => setPosition(e.target.currentTime)}
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.target.duration) ? e.target.duration : 0)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button
        type="button"
        className="voice-play"
        onClick={toggle}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {playing ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} />}
      </button>
      <div className="voice-track">
        <div className="voice-title">
          <Volume2 size={13} />
          <span>{title}</span>
        </div>
        <div
          className="waveform"
          role="slider"
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          tabIndex={0}
          onClick={(e) => {
            if (!audio.current || !duration) return;
            const x =
              (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth;
            audio.current.currentTime = Math.max(0, Math.min(duration, x * duration));
          }}
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight'].includes(e.key) && audio.current) {
              audio.current.currentTime = Math.max(
                0,
                Math.min(duration, audio.current.currentTime + (e.key === 'ArrowRight' ? 5 : -5)),
              );
            }
          }}
        >
          {bars.map((height, i) => (
            <span
              key={i}
              style={{ height: `${height}px` }}
              className={i / bars.length <= position / (duration || 1) ? 'played' : ''}
            />
          ))}
        </div>
        <div className="voice-meta">
          <span>
            {time(position)} / {duration ? time(duration) : '--:--'}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
              setSpeed(next);
              audio.current.playbackRate = next;
            }}
          >
            {speed}×
          </button>
        </div>
      </div>
    </div>
  );
}
