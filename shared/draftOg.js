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
  if(people.length===1)return 'Vamos finalizar e deixar '+people[0]+' feliz?';
  if(people.length===2)return 'Vamos finalizar e deixar '+people[0]+' e '+people[1]+' felizes?';
  const plural=people.length-2;
  return 'Vamos finalizar e deixar '+people[0]+', '+people[1]+
    ' e mais '+plural+' '+(plural===1?'encontrista':'encontristas')+' felizes?';
}
export function draftOgTitle(names=[]){
  return 'Finalize sua cartinha 💌 | '+draftOgCaption(names);
}
export function draftOgIds(ids=[]){
  return [...new Set((Array.isArray(ids)?ids:[])
    .filter(id=>/^EJC-[A-F0-9]{12}$/.test(id)))].sort().slice(0,20);
}
