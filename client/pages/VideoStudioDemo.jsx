import React, { useEffect, useRef, useState } from 'react';
import { createVideoPipeline } from '../lib/videoPipeline.js';
import { Camera, CircleStop, RotateCcw, Trash2, Video, Settings2, Check } from 'lucide-react';

const FILTERS = [
  { id: 'natural', name: 'Natural', css: 'none' },
  { id: 'golden', name: 'Golden', css: 'sepia(.3) saturate(1.3) contrast(1.08)' },
  { id: 'dreamy', name: 'Dreamy', css: 'brightness(1.12) saturate(.82)' },
  { id: 'mono', name: 'Mono', css: 'grayscale(1) contrast(1.15)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(.65) contrast(.9)' },
  { id: 'cinema', name: 'Cinema', css: 'contrast(1.25) saturate(.85)' },
];
const DEMO_USER = { id: 'ejc-video-demo', name: 'Pessoa de demonstração', demo: true };
const DB_NAME = 'ejc-video-studio-demo';
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('videos', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact(mode, action) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('videos', mode);
      const request = action(tx.objectStore('videos'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
const list = () => transact('readonly', store => store.getAll());
const save = item => transact('readwrite', store => store.put(item));
const remove = id => transact('readwrite', store => store.delete(id));
const examples = [
  ['Boas-vindas ao encontro', 'golden', '🌹'],
  ['Uma mensagem de carinho', 'dreamy', '💙'],
  ['Recordação especial', 'vintage', '✨'],
  ['Agradecimento', 'cinema', '🙏'],
  ['Para guardar no coração', 'mono', '💌'],
];
export default function VideoStudioDemo() {
  const camera = useRef(null);
  const outputCanvas = useRef(null);
  const pipeline = useRef(null);
  const [sticker, setSticker] = useState('none');
  const [softSkin, setSoftSkin] = useState(0.35);
  const [renderMode, setRenderMode] = useState('raw');
  const stream = useRef(null);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('idle');
  const [filter, setFilter] = useState(FILTERS[0]);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [url, setUrl] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [config, setConfig] = useState({ maxDurationSeconds: 30, aspectRatio: '9:16' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const startedAt = useRef(0);
  const recordingTimer = useRef(null);
  const limit = useRef(30);
  const stopRef = useRef(null);
  const ratio = config.aspectRatio.replace(':', '/');
  useEffect(() => { limit.current = config.maxDurationSeconds; }, [config.maxDurationSeconds]);
  useEffect(() => { pipeline.current?.setFilter(filter.id); }, [filter]);
  useEffect(() => { pipeline.current?.setSticker(sticker); }, [sticker]);
  useEffect(() => { pipeline.current?.setSoftSkin(softSkin); }, [softSkin]);
  useEffect(() => {
    fetch('/api/admin/video-studio/config', { credentials: 'same-origin' })
      .then(response => { if (!response.ok) throw new Error('Falha ao carregar configuração.'); return response.json(); })
      .then(data => setConfig(data.config)).catch(cause => setError(cause.message));
  }, []);
  async function persistConfig() {
    setSavingConfig(true);
    try {
      const response = await fetch('/api/admin/video-studio/config', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error('Não foi possível salvar a configuração.');
      setConfig((await response.json()).config);
      setSettingsOpen(false);
    } catch (cause) { setError(cause.message); }
    finally { setSavingConfig(false); }
  }
  const [remote, setRemote] = useState([]);
  const [uploading, setUploading] = useState('');
  const refreshRemote = async () => {
    const response = await fetch('/api/admin/video-demo', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Não foi possível consultar os vídeos no R2.');
    setRemote((await response.json()).items);
  };
  useEffect(() => { refreshRemote().catch(e => setError(e.message)); }, []);
  async function uploadItem(item) {
    if (!item.blob) return;
    setUploading(item.id);
    setError('');
    try {
      const response = await fetch('/api/admin/video-demo/' + item.id, {
        method: 'PUT', credentials: 'same-origin', headers: {
          'Content-Type': item.blob.type.split(';')[0] || 'video/mp4',
        }, body: item.blob,
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Upload falhou.');
      await refreshRemote();
    } catch (cause) { setError(cause.message); }
    finally { setUploading(''); }
  }
  async function openRemote(item) {
    try {
      const response = await fetch('/api/admin/video-demo/' + item.id, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Não foi possível abrir o vídeo remoto.');
      setSelected({ ...item, blob: await response.blob(), filterId: 'natural' });
      setStatus('review');
    } catch (cause) { setError(cause.message); }
  }
  const refresh = async () => setItems((await list()).sort((a, b) => b.createdAt - a.createdAt));
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (!['preview', 'recording'].includes(status) || !camera.current || !stream.current) return;
    camera.current.srcObject = stream.current;
    camera.current.play().then(() => {
      if (!pipeline.current && outputCanvas.current) {
        try {
          pipeline.current = createVideoPipeline({
            video: camera.current, canvas: outputCanvas.current,
            aspectRatio: config.aspectRatio, onError: setError,
          });
          pipeline.current.setFilter(filter.id);
          pipeline.current.setSticker(sticker);
          pipeline.current.setSoftSkin(softSkin);
          setRenderMode('gpu');
        } catch (cause) { setError(cause.message); setRenderMode('raw'); }
      }
    }).catch(() => {});
  }, [status]);
  useEffect(() => () => clearInterval(recordingTimer.current), []);
  useEffect(() => () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    pipeline.current?.stop();
  }, []);
  useEffect(() => {
    if (!selected?.blob) { setUrl(''); return; }
    const next = URL.createObjectURL(selected.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [selected]);
  async function openCamera() {
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error('Este navegador não oferece gravação de vídeo.');
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      pipeline.current?.stop();
      pipeline.current = null;
      stream.current = media;
      setStatus('preview');
    } catch (cause) { setError(cause.message); }
  }
  function start() {
    try {
      const mimeType = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find(type => MediaRecorder.isTypeSupported(type));
      chunks.current = [];
      const rendered = pipeline.current?.captureStream(24);
      const source = rendered || stream.current;
      const audioTracks = stream.current.getAudioTracks();
      if (rendered) for (const track of audioTracks) source.addTrack(track);
      setRenderMode(rendered ? 'gpu' : 'raw');
      const media = new MediaRecorder(source, mimeType ? { mimeType } : {});
      recorder.current = media;
      media.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      media.onerror = () => setError('Falha na gravação. Tente novamente.');
      media.onstop = async () => {
        try {
          const blob = new Blob(chunks.current, { type: media.mimeType || 'video/mp4' });
          if (!blob.size) throw new Error('O vídeo ficou vazio.');
          const item = {
            id: crypto.randomUUID(), userId: DEMO_USER.id,
            title: caption.trim() || 'Meu vídeo', filterId: rendered ? 'natural' : filter.id,
            originalFilterId: filter.id, sticker, softSkin, aspectRatio: config.aspectRatio,
            rendered: Boolean(rendered),
            createdAt: Date.now(), status: 'local-demo', blob,
          };
          await save(item);
          await refresh();
          setSelected(item);
          setStatus('review');
        } catch (cause) { setError(cause.message); setStatus('preview'); }
      };
      media.start(1000);
      startedAt.current = Date.now();
      setSeconds(0);
      clearInterval(recordingTimer.current);
      recordingTimer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
        setSeconds(elapsed);
        if (elapsed >= limit.current) stopRef.current?.();
      }, 200);
      setStatus('recording');
    } catch (cause) { setError(cause.message); }
  }
  function stop() {
    clearInterval(recordingTimer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    pipeline.current?.stop();
    pipeline.current = null;
    setStatus('saving');
  }
  stopRef.current = stop;
  async function seed() {
    try {
      for (const [title, filterId, emoji] of examples) {
        await save({ id: 'sample-' + filterId, userId: DEMO_USER.id, title, filterId,
          emoji, createdAt: Date.now() - examples.findIndex(row => row[1] === filterId) * 1000,
          status: 'example', blob: null });
      }
      await refresh();
    } catch (cause) { setError(cause.message); }
  }
  async function deleteItem(id) {
    await remove(id);
    if (selected?.id === id) setSelected(null);
    await refresh();
  }
  return <section className="form-card" style={{ maxWidth: 860 }}>
    <span className="eyebrow">EXCLUSIVO DA ADMINISTRAÇÃO · LABORATÓRIO</span>
    <div className="row between" style={{ alignItems: 'center', gap: 12 }}>
      <h1>🎬 Video Studio</h1>
      <button type="button" className="btn ghost" onClick={() => setSettingsOpen(value => !value)}
        aria-label="Configurações do Video Studio"><Settings2 size={18}/> Config</button>
    </div>
    {settingsOpen && <div className="form-card" style={{ marginBottom: 20 }}>
      <h2>Configurações do Admin Studio</h2>
      <label htmlFor="video-duration">Tempo máximo de gravação</label>
      <select id="video-duration" value={config.maxDurationSeconds}
        onChange={event => setConfig(value => ({ ...value, maxDurationSeconds: Number(event.target.value) }))}>
        {[10, 15, 30, 45, 60, 90, 120, 180].map(value =>
          <option key={value} value={value}>{value} segundos</option>)}
      </select>
      <label htmlFor="video-ratio">Formato de vídeo</label>
      <select id="video-ratio" value={config.aspectRatio}
        onChange={event => setConfig(value => ({ ...value, aspectRatio: event.target.value }))}>
        <option value="9:16">Vertical 9:16 (Stories e Reels)</option>
        <option value="4:5">Retrato 4:5 (Feed)</option>
        <option value="1:1">Quadrado 1:1</option>
      </select>
      <button type="button" className="btn" disabled={savingConfig} onClick={persistConfig}>
        <Check size={17}/> {savingConfig ? 'Salvando...' : 'Salvar configurações'}
      </button>
    </div>}
    <p>Usuário fictício: <strong>{DEMO_USER.name}</strong>. Gravações ficam no navegador até você enviá-las ao R2. Não há envio para destinatários, Pix ou publicação. Exemplos são ilustrativos, não gravações reais.</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    <div style={{ width: '100%', maxWidth: 400, margin: 'auto' }}>
      <div style={{ position: 'relative', aspectRatio: ratio, overflow: 'hidden', borderRadius: 22,
        background: '#111', width: '100%', isolation: 'isolate' }}>
        <video ref={camera} muted playsInline autoPlay
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0,
            pointerEvents: 'none' }} />
        <canvas ref={outputCanvas} aria-label="Prévia da câmera com efeitos"
          style={{ display: ['preview', 'recording', 'saving'].includes(status) ? 'block' : 'none',
            width: '100%', height: '100%', position: 'absolute', inset: 0,
            objectFit: 'cover' }} />
        {selected && url && <video key={url} src={url} controls playsInline
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0,
            objectFit: 'cover', objectPosition: 'center',
            filter: FILTERS.find(f => f.id === selected.filterId)?.css || 'none' }} />}
        {selected && !url && <div style={{ position: 'absolute', inset: 0, display: 'grid',
          placeItems: 'center', background: '#f5e8ef', fontSize: 60 }}>{selected.emoji || '💌'}</div>}
        {['preview', 'recording'].includes(status) && <div style={{ position: 'absolute', top: 14,
          left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: '#fff', pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ padding: '6px 12px', background: 'rgba(0,0,0,.55)', borderRadius: 20 }}>
            {status === 'recording' ? '🔴 ' : '● '}
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')} / {String(Math.floor(config.maxDurationSeconds / 60)).padStart(2, '0')}:
            {String(config.maxDurationSeconds % 60).padStart(2, '0')}
          </span>
          <span style={{ padding: '6px 10px', background: 'rgba(0,0,0,.55)', borderRadius: 20 }}>
            {config.aspectRatio}
          </span>
        </div>}
        {status === 'recording' && <div style={{ position: 'absolute', bottom: 0, left: 0,
          height: 5, width: `${Math.min(100, seconds / config.maxDurationSeconds * 100)}%`,
          background: '#ff375f', transition: 'width .2s linear' }}/>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 94 }}>
        {['idle', 'review'].includes(status) && <button type="button" className="btn"
          onClick={() => { setSelected(null); setSeconds(0); openCamera(); }}>
          <Camera size={18}/> Abrir câmera
        </button>}
        {['preview', 'recording'].includes(status) && <button type="button"
          onClick={status === 'preview' ? start : stop}
          aria-label={status === 'preview' ? 'Começar gravação' : 'Parar gravação'}
          style={{ width: 76, height: 76, borderRadius: '50%', background: '#fff',
            border: '5px solid #e8e2e9', boxShadow: '0 0 0 2px #a32952',
            display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <span style={{ display: 'block', width: status === 'preview' ? 55 : 27,
            height: status === 'preview' ? 55 : 27,
            borderRadius: status === 'preview' ? '50%' : 6, background: '#e3224e',
            transition: 'all .2s' }}/>
        </button>}
        {status === 'saving' && <span>Salvando gravação...</span>}
      </div>
      {status === 'preview' && <button type="button" className="btn ghost"
        onClick={() => { stream.current?.getTracks().forEach(track => track.stop());
          stream.current = null; pipeline.current?.stop(); pipeline.current = null; setStatus('idle'); }}>Fechar câmera</button>}
    </div>
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '12px 2px',
      scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
      {FILTERS.map(preset => <button key={preset.id} type="button"
        onClick={() => setFilter(preset)}
        style={{ flex: '0 0 78px', border: 'none', background: 'transparent',
          color: 'inherit', cursor: 'pointer', scrollSnapAlign: 'center', padding: 0 }}>
        <div style={{ width: 66, height: 66, margin: 'auto', borderRadius: 15,
          background: 'linear-gradient(135deg,#f7b7ac,#8a78bd)', filter: preset.css,
          outline: filter.id === preset.id ? '3px solid #a32952' : '1px solid #ddd',
          outlineOffset: 2, display: 'grid', placeItems: 'center', fontSize: 24 }}>🌹</div>
        <small style={{ display: 'block', marginTop: 7, fontWeight: filter.id === preset.id ? 700 : 400 }}>
          {preset.name}</small>
      </button>)}
    </div>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center',
      flexWrap: 'wrap', paddingBottom: 12 }}>
      <span className="muted small">Stickers no vídeo:</span>
      {['none', '💙', '🌹', '✨', '💌', '🙏'].map(value =>
        <button key={value} type="button" onClick={() => setSticker(value)}
          aria-label={value === 'none' ? 'Sem sticker' : 'Sticker ' + value}
          aria-pressed={sticker === value}
          style={{ fontSize: 22, borderRadius: 12, padding: '6px 9px', cursor: 'pointer',
            background: sticker === value ? '#f2d8e6' : 'transparent',
            border: sticker === value ? '2px solid #a32952' : '2px solid transparent' }}>
          {value === 'none' ? '✕' : value}
        </button>)}
    </div>
    <p className="muted small" style={{ textAlign: 'center' }}>
      {renderMode === 'gpu' ? 'Efeitos e stickers incorporados ao vídeo gravado' :
        'Canvas não disponível: gravação original sem efeitos'}
    </p>
    <div style={{ margin: '12px 0 18px' }}>
      <label htmlFor="video-soft-skin" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>✨ Soft Skin</span><strong>{Math.round(softSkin * 100)}%</strong>
      </label>
      <input id="video-soft-skin" type="range" min="0" max="100" step="5"
        value={Math.round(softSkin * 100)}
        onChange={event => setSoftSkin(Number(event.target.value) / 100)}
        style={{ width: '100%', accentColor: '#a32952' }}/>
      <p className="muted small">Suavização seletiva por cor e contraste. Não altera o formato do rosto.
        Disponível com WebGL; 0% desativa o efeito.</p>
    </div>
    <label htmlFor="video-demo-caption">Título da gravação</label>
    <input id="video-demo-caption" maxLength={120} value={caption}
      onChange={event => setCaption(event.target.value)} placeholder="Uma lembrança especial 💙"/>

    <div className="row between" style={{ marginTop: 24 }}>
      <h2>Itens da pessoa demo ({items.length})</h2>
      <button className="btn ghost" onClick={seed}><RotateCcw size={16}/> Criar 5 exemplos</button>
    </div>
    <div className="admin-order-list">
      {items.map(item => <div className="admin-order" key={item.id}>
        <button type="button" onClick={() => { setSelected(item); setStatus('review'); }}
          style={{ flex: 1, textAlign: 'left' }}>
          <strong>{item.emoji || '🎥'} {item.title}</strong>
          <small>{item.blob ? 'Gravação local' : 'Exemplo ilustrativo'} · {item.filterId}</small>
        </button>
        {item.blob && <button type="button" className="btn ghost" disabled={uploading === item.id}
          onClick={() => uploadItem(item)}>{uploading === item.id ? 'Enviando...' : 'Upload R2'}</button>}
        <button type="button" className="btn ghost" aria-label={'Excluir ' + item.title}
          onClick={() => deleteItem(item.id)}><Trash2 size={16}/></button>
      </div>)}
    </div>
    <h2>Vídeos enviados ao R2 ({remote.length})</h2>
    <div className="admin-order-list">
      {remote.map(item => <div key={item.id} className="admin-order">
        <button type="button" onClick={() => openRemote(item)}>
          <strong>▶ Vídeo {item.id.slice(0, 8)}</strong>
          <small>{Math.round(item.bytes / 1024)} KB · {item.createdAt || ''}</small>
        </button>
        <button type="button" className="btn ghost" onClick={async () => {
          if (!confirm('Excluir vídeo demo do R2?')) return;
          await fetch('/api/admin/video-demo/' + item.id, { method: 'DELETE', credentials: 'same-origin' });
          await refreshRemote();
        }}><Trash2 size={16}/></button>
      </div>)}
    </div>
    <p className="muted small">Upload limitado a 20 MB por vídeo; vídeos remotos exigem login admin.
      Para arquivos maiores será necessário upload multipart. Filtros e stickers são gravados no vídeo quando Canvas Capture está disponível. O arquivo é preservado
      no IndexedDB; renderização FFmpeg ainda não está conectada.</p>
  </section>;
}
