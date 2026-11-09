// Safe operational copy for personalised draft previews.
// A name is never taken from an untrusted query parameter.
export function draftOgNames(names=[]){
  const unique=[...new Set((Array.isArray(names)?names:[])
    .map(name=>String(name||'').replace(/\s+/g,' ').trim())
    .filter(Boolean))];
  return unique.slice(0,20);
}
export function draftOgCaption(names=[]){
  const people=draftOgNames(names);
  if(!people.length)return 'Vamos finalizar e fazer alguém feliz?';
  const first=people.map(name=>name.split(' ')[0]);
  if(first.length===1)return 'Vamos deixar '+first[0]+' feliz?';
  if(first.length===2)return 'Vamos deixar '+first[0]+' e '+first[1]+' felizes?';
  return 'Vamos deixar '+first[0]+', '+first[1]+' e mais '+(first.length-2)+' encontristas felizes?';
}
export function draftOgTitle(names=[]){
  return 'Termine sua cartinha 💌 | '+draftOgCaption(names);
}
export function draftOgIds(ids=[]){
  return [...new Set((Array.isArray(ids)?ids:[])
    .filter(id=>/^EJC-[A-F0-9]{12}$/.test(id)))].sort().slice(0,20);
}
