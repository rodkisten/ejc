import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { draftGet, draftSet, draftRemove } from './drafts';

const CART_INDEX = 'ejc-cart-index-v2';
const CHECKOUT_HISTORY = 'ejc-cart-checkouts';
export function localCheckouts() {
  try {
    const sessions = JSON.parse(localStorage.getItem(CHECKOUT_HISTORY) || '[]');
    return Array.isArray(sessions) ? sessions.filter(s => s && typeof s.token === 'string') : [];
  } catch { return []; }
}
export function rememberCheckout(checkout) {
  const previous = localCheckouts().filter(item => item.id !== checkout.id);
  localStorage.setItem(CHECKOUT_HISTORY, JSON.stringify([checkout, ...previous].slice(0, 50)));
}
export function checkoutForDraft(id) {
  return localCheckouts().find(checkout => checkout.itemIds?.includes(id)) || null;
}
export const cartDraftKey = (id) => 'ejc-cart-letter-' + id;
const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  const current = useRef([]);

  useEffect(() => {
    let active = true;
    draftGet(CART_INDEX).then((stored) => {
      if (!active) return;
      const list = Array.isArray(stored) ? stored.slice(0, 30) : [];
      current.current = list;
      setItems(list);
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  async function replace(list) {
    current.current = list;
    setItems(list);
    await draftSet(CART_INDEX, list);
  }

  async function save({ id, recipient_slug, sender_name, ...draft }) {
    if (!ready) throw new Error('O carrinho ainda está carregando.');
    const itemId = id || crypto.randomUUID();
    const existingCheckout = checkoutForDraft(itemId);
    if (existingCheckout) throw new Error(
      'Esta cartinha já está vinculada ao Pix ' + existingCheckout.id +
      '. Use o botão Editar cartinha no link privado do pagamento.'
    );
    const saved = { ...draft, sender: sender_name || '', recipient_slug };
    await draftSet(cartDraftKey(itemId), saved);
    const entry = {
      id: itemId, recipient_slug, sender_name: sender_name || '',
      updated_at: new Date().toISOString(),
    };
    await replace([...current.current.filter((item) => item.id !== itemId), entry]);
    return itemId;
  }

  async function duplicate(id, recipient_slug) {
    const original = current.current.find((item) => item.id === id);
    if (!original) throw new Error('Cartinha não encontrada.');
    const draft = await draftGet(cartDraftKey(id));
    if (!draft) throw new Error('O rascunho não está disponível neste aparelho.');
    const nextId = crypto.randomUUID();
    await draftSet(cartDraftKey(nextId), { ...draft, recipient_slug });
    await replace([...current.current, {
      ...original, id: nextId, recipient_slug, updated_at: new Date().toISOString(),
    }]);
    return nextId;
  }

  async function remove(id) {
    await replace(current.current.filter((item) => item.id !== id));
    await draftRemove(cartDraftKey(id));
  }

  async function clear() {
    // Keep source drafts: a confirmed Pix may still need photos/audio from this browser.
    await replace([]);
  }

  return (
    <CartContext.Provider value={{ items, ready, save, duplicate, remove, clear, checkoutForDraft }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('CartProvider não configurado.');
  return value;
}
