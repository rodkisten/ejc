import React, { useEffect, useRef, useState } from 'react';
import { Camera, CircleStop, Play, RotateCcw, Trash2, Video } from 'lucide-react';

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
  const refresh = async () => setItems((await list()).sort((a, b) => b.createdAt - a.createdAt));
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (status !== 'recording') return;
    const timer = setInterval(() => setSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
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
      stream.current = media;
      if (camera.current) { camera.current.srcObject = media; await camera.current.play(); }
      setStatus('preview');
    } catch (cause) { setError(cause.message); }
  }
  function start() {
    try {
      const mimeType = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find(type => MediaRecorder.isTypeSupported(type));
      chunks.current = [];
      const media = new MediaRecorder(stream.current, mimeType ? { mimeType } : {});
      recorder.current = media;
      media.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      media.onerror = () => setError('Falha na gravação. Tente novamente.');
      media.onstop = async () => {
        try {
          const blob = new Blob(chunks.current, { type: media.mimeType || 'video/mp4' });
          if (!blob.size) throw new Error('O vídeo ficou vazio.');
          const item = {
            id: crypto.randomUUID(), userId: DEMO_USER.id,
            title: caption.trim() || 'Meu vídeo', filterId: filter.id,
            createdAt: Date.now(), status: 'local-demo', blob,
          };
          await save(item);
          await refresh();
          setSelected(item);
          setStatus('review');
        } catch (cause) { setError(cause.message); setStatus('preview'); }
      };
      media.start(1000);
      setSeconds(0);
      setStatus('recording');
    } catch (cause) { setError(cause.message); }
  }
  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    setStatus('saving');
  }
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
    <h1>🎬 Video Studio</h1>
    <p>Usuário fictício: <strong>{DEMO_USER.name}</strong>. Vídeos ficam apenas neste navegador,
      sem envio para destinatários, Pix ou publicação. Exemplos são ilustrativos, não gravações reais.</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    <div style={{ maxWidth: 360, margin: 'auto', position: 'relative' }}>
      <video ref={camera} muted playsInline autoPlay
        style={{ display: ['preview', 'recording', 'saving'].includes(status) ? 'block' : 'none',
          width: '100%', aspectRatio: '9/16', objectFit: 'cover', borderRadius: 20,
          transform: 'scaleX(-1)', filter: filter.css, background: '#111' }} />
      {selected && url && <video key={url} src={url} controls playsInline
        style={{ width: '100%', aspectRatio: '9/16', objectFit: 'contain', borderRadius: 20,
          filter: FILTERS.find(f => f.id === selected.filterId)?.css || 'none', background: '#111' }} />}
      {selected && !url && <div style={{ aspectRatio: '9/16', display: 'grid',
        placeItems: 'center', background: '#f5e8ef', borderRadius: 20, fontSize: 60 }}>
        {selected.emoji || '💌'}
      </div>}
    </div>
    <div className="inline-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
      {status === 'idle' || status === 'review'
        ? <button type="button" className="btn" onClick={() => { setSelected(null); openCamera(); }}>
            <Camera size={17}/> Abrir câmera
          </button>
        : null}
      {status === 'preview' && <button type="button" className="btn" onClick={start}>
        <Video size={17}/> Gravar
      </button>}
      {status === 'recording' && <button type="button" className="btn" onClick={stop}>
        <CircleStop size={17}/> Finalizar · {seconds}s
      </button>}
      {status === 'saving' && <span>Salvando gravação...</span>}
      {status === 'preview' && <button type="button" className="btn ghost" onClick={() => {
        stream.current?.getTracks().forEach(track => track.stop());
        stream.current = null;
        setStatus('idle');
      }}>Fechar câmera</button>}
    </div>
    <label htmlFor="video-demo-caption">Título da gravação</label>
    <input id="video-demo-caption" maxLength={120} value={caption}
      onChange={event => setCaption(event.target.value)} placeholder="Uma lembrança especial 💙"/>
    <div className="row filters" style={{ flexWrap: 'wrap' }}>
      {FILTERS.map(preset => <button key={preset.id} type="button"
        className={filter.id === preset.id ? 'btn' : 'btn ghost'}
        onClick={() => setFilter(preset)}>{preset.name}</button>)}
    </div>
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
        <button type="button" className="btn ghost" aria-label={'Excluir ' + item.title}
          onClick={() => deleteItem(item.id)}><Trash2 size={16}/></button>
      </div>)}
    </div>
    <p className="muted small">Nesta fase, filtros são prévias CSS. A gravação original é preservada
      no IndexedDB; renderização FFmpeg e upload R2 ainda não estão conectados.</p>
  </section>;
}
