import React, { useCallback, useEffect, useState } from 'react';
import { unzipSync } from 'fflate';
import { ImagePlus, UploadCloud, CheckCircle2, RefreshCw } from 'lucide-react';
import { STICKERS, STICKERS_BY_ID } from '../../shared/letter.js';
import { Sticker } from '../components/letter/Sticker';

const MAX_ZIP = 12 * 1024 * 1024;
const MAX_FILE = 600 * 1024;
const isWebP = (bytes) =>
  bytes.length > 12 &&
  [82,73,70,70].every((byte, index) => bytes[index] === byte) &&
  [87,69,66,80].every((byte, index) => bytes[index + 8] === byte);

export default function StickerAdmin() {
  const [installed, setInstalled] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/stickers', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Não foi possível consultar os adesivos.');
    const info = await response.json();
    setInstalled(Object.fromEntries(info.stickers.map((entry) => [entry.id, entry.installed])));
  }, []);

  useEffect(() => { refresh().catch((cause) => setError(cause.message)); }, [refresh]);

  async function importPack(file) {
    if (!file) return;
    setBusy(true);
    setProgress('');
    setDone('');
    setError('');
    try {
      if (file.size > MAX_ZIP) throw new Error('O ZIP deve ter no máximo 12 MB.');
      const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
      if (Object.keys(archive).length > 80) throw new Error('Este ZIP tem arquivos demais.');
      const assets = [];
      for (const [path, bytes] of Object.entries(archive)) {
        const name = path.split('/').pop();
        if (!name?.endsWith('.webp')) continue;
        const id = name.slice(0, -5);
        if (!STICKERS_BY_ID[id]) continue;
        if (bytes.length > MAX_FILE || !isWebP(bytes))
          throw new Error('Imagem WebP inválida ou muito grande: ' + name);
        assets.push({ id, bytes });
      }
      if (assets.length !== STICKERS.length ||
          new Set(assets.map((item) => item.id)).size !== STICKERS.length) {
        throw new Error('O ZIP precisa conter exatamente os 20 adesivos da coleção.');
      }
      for (const [index, asset] of assets.entries()) {
        setProgress(`Publicando ${index + 1} de ${assets.length}: ${asset.id}`);
        const response = await fetch('/api/admin/stickers/' + encodeURIComponent(asset.id) + '.webp', {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'Content-Type': 'image/webp' },
          body: asset.bytes,
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Falha ao publicar ' + asset.id);
        }
      }
      await refresh();
      setDone('Os 20 adesivos foram instalados. Já aparecem nas cartinhas e nas imagens exportadas.');
    } catch (cause) {
      setError(cause.message || 'Não foi possível instalar o pacote.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const count = STICKERS.filter((item) => installed[item.id]).length;
  return (
    <div className="sticker-admin-page">
      <div className="section-head">
        <div>
          <span className="eyebrow">XX EJC · PAPELARIA DIGITAL</span>
          <h1>Adesivos da cartinha</h1>
          <p>Artes ilustradas, recortadas e com fundo transparente para decorar com um toque.</p>
        </div>
      </div>
      <section className="form-card" style={{ display:'grid', gap:14 }}>
        <h2>Instalar coleção de imagens</h2>
        <p className="muted">
          Selecione o ZIP com os 20 arquivos WebP. O site instala tudo no R2,
          sem publicar textos ou fotos privadas das cartinhas.
        </p>
        <div className="row between">
          <strong>{count} de {STICKERS.length} adesivos instalados</strong>
          <button type="button" className="btn ghost" disabled={busy}
            onClick={() => refresh().catch((cause) => setError(cause.message))}>
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
        <label className="upload-label" style={{ display:'flex', gap:9, alignItems:'center' }}>
          <UploadCloud size={19} /> {busy ? 'Instalando...' : 'Selecionar pacote ZIP'}
          <input type="file" accept=".zip,application/zip" disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              importPack(file);
            }} />
        </label>
        {progress && <p className="notice" role="status">{progress}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {done && <p className="notice success" role="status"><CheckCircle2 size={18} /> {done}</p>}
      </section>
      <section className="form-card">
        <h2><ImagePlus size={19} /> Prévia da coleção</h2>
        <div className="sticker-picker-grid" style={{ maxHeight:'none', overflow:'visible' }}>
          {STICKERS.map((sticker) => (
            <div key={sticker.id} className="ejc-sticker-preview" style={{ cursor:'default' }}>
              <Sticker presetId={sticker.id} />
              <small>{installed[sticker.id] ? 'Instalado' : 'Imagem padrão'}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
