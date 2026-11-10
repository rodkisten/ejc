// Interpret old full-size invitations and short-link destinations identically.
// Never derive mural access from the encrypted support context (?c=...).
const GRANT_PATTERN=/^m2\.[A-Za-z0-9_-]{20,500}\.[A-Za-z0-9_-]{43}$/;
const ENCRYPTED_CONTEXT_PATTERN=/^ec1_[A-Za-z0-9_-]{35,16000}$/;

function hashToken(hash){
  const raw=String(hash||'').replace(/^#/,'');
  const direct=new URLSearchParams(raw).get('token');
  if(GRANT_PATTERN.test(direct||''))return direct;
  try{
    const decoded=new URLSearchParams(decodeURIComponent(raw)).get('token');
    if(GRANT_PATTERN.test(decoded||''))return decoded;
  }catch{/* Invalid percent escapes are not an access credential. */}
  return '';
}

function embeddedToken(context){
  const raw=String(context||'');
  const index=raw.indexOf('#token=');
  if(index<0||!ENCRYPTED_CONTEXT_PATTERN.test(raw.slice(0,index)))return '';
  const candidate=raw.slice(index+7);
  return GRANT_PATTERN.test(candidate)?candidate:'';
}

export function muralTokenFromUrl(href){
  try{
    const url=new URL(href);
    return hashToken(url.hash)||
      (GRANT_PATTERN.test(url.searchParams.get('token')||'')?url.searchParams.get('token'):'')||
      embeddedToken(url.searchParams.get('c'));
  }catch{return '';}
}

// Some messaging clients percent-encode #token into ?c or move it to ?token.
// Restore the original fragment and remove query-string credentials from the
// browser URL without a redirect or an extra server request.
export function normalizeMuralUrl(href){
  try{
    const url=new URL(href);
    const token=muralTokenFromUrl(url.toString());
    if(!token)return url.toString();
    url.searchParams.delete('token');
    const context=url.searchParams.get('c');
    const index=context?.indexOf('#token=')??-1;
    if(index>=0 && embeddedToken(context))
      url.searchParams.set('c',context.slice(0,index));
    url.hash='token='+encodeURIComponent(token);
    return url.toString();
  }catch{return href;}
}
