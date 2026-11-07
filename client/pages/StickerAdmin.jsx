import React, { useCallback, useEffect, useState } from 'react';
import { unzipSync } from 'fflate';
import { ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { STICKERS, STICKER_CATEGORIES } from '../../shared/letter.js';
import { api } from '../lib/api.js';


const ORIGINAL_PACK = Object.freeze({
  '01_nossa_senhora.png':'nossa-senhora',
  '02_jesus.png':'jesus-ama',
  '03_cruz.png':'firme-na-fe',
  '04_sao_carlo_acutis.png':'carlo-acutis',
  '05_todos_juntos_azul_amarelo.png':'ejc-parabens',
  '06_todos_juntos_colagem_rosa.png':'encontro-abencoado',
});
const STICKER_IDS = new Set(STICKERS.map(sticker => sticker.id));
function stickerIdFromFilename(filename) {
  const basename = filename.split('/').pop();
  if (!basename || !/\.png$/i.test(basename)) return null;
  const id = basename.replace(/\.png$/i, '');
  return STICKER_IDS.has(id) ? id : ORIGINAL_PACK[basename] || null;
}
export default function StickerAdmin() {
  const [assets,setAssets]=useState({});
  const [selected,setSelected]=useState(STICKERS[0]?.id||'');
  const [file,setFile]=useState(null);
  const [packageFiles,setPackageFiles]=useState([]);
  const [packageProgress,setPackageProgress]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [version,setVersion]=useState(0);
  const reload=useCallback(async()=>{
    try{
      const result=await api('/api/admin/stickers');
      setAssets(Object.fromEntries(result.stickers.map((s)=>[s.id,s.exists])));
      setError('');
      setVersion(Date.now());
    }catch(cause){setError(cause.message);}
  },[]);
  useEffect(()=>{reload();},[reload]);

  async function upload(event) {
    event.preventDefault();
    if(!file)return setError('Selecione o arquivo PNG original.');
    if(file.type!=='image/png')return setError('Escolha uma imagem PNG, não um SVG ou WebP.');
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/admin/stickers/'+encodeURIComponent(selected)+'.png',{
        method:'POST',headers:{'Content-Type':'image/png'},credentials:'same-origin',body:file
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Erro no envio do adesivo.');
      setFile(null);
      setNotice('Arte PNG original de "'+STICKERS.find(s=>s.id===selected)?.text+'" enviada.');
      await reload();
    }catch(cause){setError(cause.message);}
    finally{setBusy(false);}
  }

  async function uploadPackage(event){
    event.preventDefault();
    if(!packageFiles.length)return setError('Escolha um ZIP ou as imagens PNG originais.');
    setBusy(true);setError('');setNotice('');setPackageProgress('Lendo artes originais...');
    try{
      const toImport=[];
      for(const picked of packageFiles){
        if(/\.zip$/i.test(picked.name)){
          const archive=unzipSync(new Uint8Array(await picked.arrayBuffer()));
          for(const [name,bytes] of Object.entries(archive)){
            const base=name.split('/').pop();
            const id=stickerIdFromFilename(base);
            if(id)toImport.push({id,name:base,blob:new Blob([bytes],{type:'image/png'})});
          }
        }else if(/\.png$/i.test(picked.name)){
          const base=picked.name;
          const id=stickerIdFromFilename(base);
          if(id)toImport.push({id,name:base,blob:picked});
        }
      }
      const unique=[...new Map(toImport.map(item=>[item.id,item])).values()];
      if(!unique.length)throw new Error('Nenhum PNG válido foi encontrado. Use arquivos nomeados pelos 20 IDs dos adesivos ou o pacote de seis artes antigas.');
      for(let index=0;index<unique.length;index++){
        const item=unique[index];
        setPackageProgress('Instalando '+(index+1)+' de '+unique.length+' · '+item.name);
        const response=await fetch('/api/admin/stickers/'+encodeURIComponent(item.id)+'.png',{
          method:'POST',headers:{'Content-Type':'image/png'},credentials:'same-origin',body:item.blob
        });
        const result=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(item.name+': '+(result.error||'Falha no envio.'));
      }
      setPackageFiles([]);
      setPackageProgress('');
      await reload();
      setNotice(unique.length+' adesivos PNG instalados no editor.');
    }catch(cause){setError(cause.message);}
    finally{setBusy(false);setPackageProgress('');}
  }
  async function remove(id){
    if(!window.confirm('Remover a arte PNG de "'+STICKERS.find(s=>s.id===id)?.text+'"?'))return;
    setBusy(true);setError('');
    try{
      await api('/api/admin/stickers/'+id+'.png',{method:'DELETE'});
      await reload();
      setNotice('Adesivo removido.');
    }catch(cause){setError(cause.message);}
    finally{setBusy(false);}
  }
  return <div className="sticker-admin">
    <div className="section-head"><div><span className="eyebrow">DIREÇÃO DE ARTE / CARTINHAS</span>
      <h1>Adesivos PNG originais</h1>
      <p>Instale aqui o conjunto de 20 adesivos PNG do XX EJC. O editor, a prévia e a exportação usarão exatamente a mesma arte. Não há conversão automática em sticker genérico.</p>
    </div></div>
    <section className="form-card">
      <h2>Importar 20 adesivos PNG de uma vez</h2>
      <p className="muted">Selecione XX_EJC_20_Adesivos_PNG_Importacao.zip (20 adesivos) ou o pacote antigo de seis artes. Os PNGs serão preservados com suas bordas e transparência, sem conversão.</p>
      <form className="sticker-upload-form" onSubmit={uploadPackage}>
        <label htmlFor="ejc-original-package">Pacote ZIP ou arquivos PNG</label>
        <input id="ejc-original-package" type="file" accept=".zip,application/zip,image/png,.png"
          multiple onChange={event=>setPackageFiles([...event.target.files])}/>
        <button type="submit" className="btn" disabled={busy||!packageFiles.length}>
          <ImagePlus size={18}/> {busy?'Instalando...':'Importar artes PNG originais'}
        </button>
      </form>
      {packageProgress&&<p className="notice" role="status">{packageProgress}</p>}
    </section>
    <section className="form-card">
      <h2>Substituir um adesivo</h2>
      <form onSubmit={upload} className="sticker-upload-form">
        <label htmlFor="sticker-id">Adesivo</label>
        <select id="sticker-id" value={selected} onChange={e=>setSelected(e.target.value)}>
          {STICKER_CATEGORIES.map(group=><optgroup label={group.label} key={group.id}>
            {STICKERS.filter(s=>s.category===group.id).map(s=><option key={s.id} value={s.id}>
              {s.text}</option>)}
          </optgroup>)}
        </select>
        <label htmlFor="sticker-file">Arquivo original .png (até 16 MB)</label>
        <input id="sticker-file" type="file" accept="image/png,.png"
          onChange={e=>setFile(e.target.files?.[0]||null)}/>
        <button className="btn" type="submit" disabled={busy||!file}>
          <ImagePlus size={17}/> {busy?'Enviando arte...':'Salvar PNG original'}
        </button>
      </form>
    </section>
    {error&&<p className="notice error" role="alert">{error}</p>}
    {notice&&<p className="notice" role="status">{notice}</p>}
    <section className="form-card">
      <div className="row between"><div><h2>Biblioteca de adesivos</h2>
        <p className="muted small">{Object.values(assets).filter(Boolean).length} / {STICKERS.length} PNGs instalados</p></div>
        <button type="button" className="btn ghost" onClick={reload}><RefreshCw size={16}/> Atualizar</button>
      </div>
      <div className="sticker-admin-grid">
        {STICKERS.map(s=><div className="sticker-admin-card" key={s.id}>
          <div className="sticker-admin-image">
            {assets[s.id]?<img src={'/api/stickers/'+s.id+'.png?v='+version} alt={s.text}/>:
              <span className="muted small">PNG pendente</span>}
          </div>
          <strong>{s.text}</strong>
          {assets[s.id]&&<button type="button" className="text-button" disabled={busy} onClick={()=>remove(s.id)}>
            <Trash2 size={15}/> Remover arte</button>}
        </div>)}
      </div>
    </section>
  </div>;
}
