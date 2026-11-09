// Avoid redundant navigation when the recipient is already accessing their mural.
export function shouldShowOpenMuralButton(pathname = '') {
  return !/^\/(?:abrir|mural)(?:\/|$)/.test(pathname);
}
