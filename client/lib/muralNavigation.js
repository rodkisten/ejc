// Keep the mural unlocking/reading experience free of redundant header actions.
export function isMuralRoute(pathname = '') {
  return /^\/(?:abrir|mural)(?:\/|$)/.test(pathname);
}

export function shouldShowOpenMuralButton(pathname = '') {
  return !isMuralRoute(pathname);
}

export function shouldShowCartButton(pathname = '') {
  return !isMuralRoute(pathname);
}

export function shouldShowBackButton(pathname = '') {
  return pathname !== '/' && !isMuralRoute(pathname);
}
