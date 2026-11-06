import React, { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Heading2, Quote, Undo2 } from 'lucide-react';
import DOMPurify from 'dompurify';
const tools=[
  ['Negrito',Bold,'bold'],['Itálico',Italic,'italic'],['Sublinhado',Underline,'underline'],
  ['Título',Heading2,'formatBlock','h2'],['Lista',List,'insertUnorderedList'],['Lista numerada',ListOrdered,'insertOrderedList'],
  ['Citação',Quote,'formatBlock','blockquote'],['Desfazer',Undo2,'undo']
];
export function cleanHtml(html){return DOMPurify.sanitize(html||'',{ALLOWED_TAGS:['p','br','b','strong','em','i','u','s','h2','h3','blockquote','ul','ol','li','div'],ALLOWED_ATTR:[]});}
export default function RichEditor({value,onChange,disabled=false}) {
  const ref=useRef(null);
  useEffect(()=>{if(ref.current && cleanHtml(ref.current.innerHTML)!==cleanHtml(value)){ref.current.innerHTML=cleanHtml(value);}},[value]);
  return <div className={`rich-editor ${disabled?'disabled':''}`}>
    {!disabled && <div className="editor-toolbar" role="toolbar" aria-label="Formatar cartinha">{tools.map(([label,Icon,cmd,param])=><button key={label} type="button" aria-label={label} title={label} onMouseDown={e=>e.preventDefault()} onClick={()=>{ref.current?.focus();document.execCommand(cmd,false,param);onChange(cleanHtml(ref.current?.innerHTML));}}><Icon size={17}/></button>)}</div>}
    <div ref={ref} className="editor-body" role="textbox" aria-label="Texto da cartinha" aria-multiline="true" contentEditable={!disabled} suppressContentEditableWarning
      data-placeholder="Escreva aqui a sua cartinha..." onInput={e=>onChange(cleanHtml(e.currentTarget.innerHTML))} onBlur={e=>onChange(cleanHtml(e.currentTarget.innerHTML))}/>
  </div>;
}
