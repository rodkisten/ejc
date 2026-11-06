const DB_NAME = 'ejc-cartinhas-offline';
const STORE = 'drafts';
const open = () => new Promise((resolve,reject) => {
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
export async function draftGet(key) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const t=db.transaction(STORE,'readonly'),req=t.objectStore(STORE).get(key);
    req.onsuccess=()=>resolve(req.result || null);req.onerror=()=>reject(req.error);
    t.oncomplete=()=>db.close();
  });
}
export async function draftSet(key,value) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(value,key);
    t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);
  });
}
export async function draftRemove(key) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).delete(key);
    t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);
  });
}
export const draftKey = slug => `ejc-draft-${slug}`;
