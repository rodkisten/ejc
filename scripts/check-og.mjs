import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const META_TAG = /<meta\b[^>]*>/gi;
function attr(tag, name) {
  const pattern = new RegExp('\\b' + name + '\\s*=\\s*(["\\\'])(.*?)\\1', 'i');
  return tag.match(pattern)?.[2] ?? null;
}

export function extractOg(html) {
  const entries = [];
  for (const match of String(html).matchAll(META_TAG)) {
    const tag = match[0];
    const key = attr(tag, 'property') || attr(tag, 'name');
    const content = attr(tag, 'content');
    if (key && content !== null) entries.push([key.toLowerCase(), content]);
  }
  const values = (key) => entries.filter(([name]) => name === key).map(([, value]) => value);
  return {
    title: values('og:title')[0] || '',
    description: values('og:description')[0] || '',
    image: values('og:image')[0] || '',
    url: values('og:url')[0] || '',
    imageWidth: Number(values('og:image:width')[0] || 0),
    imageHeight: Number(values('og:image:height')[0] || 0),
    twitterCard: values('twitter:card')[0] || '',
    duplicates: values('og:image').length,
  };
}

export function readPngDimensions(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('A imagem não é um PNG válido.');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export async function checkOg(urlInput, fetcher = fetch) {
  const url = new URL(urlInput);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Informe uma URL HTTP(S).');
  const response = await fetcher(url.toString(), {
    headers: { 'User-Agent': 'facebookexternalhit/1.1', Accept: 'text/html' },
  });
  if (!response.ok || response.url.includes('/cdn-cgi/access/')) {
    throw new Error(`A página retornou HTTP ${response.status}. Verifique Cloudflare Access/WAF e redirecionamentos.`);
  }
  if (!(response.headers.get('content-type') || '').includes('text/html')) {
    throw new Error('A página não retornou HTML para o robô de prévia.');
  }
  const html = await response.text();
  const og = extractOg(html);
  if (og.duplicates !== 1) throw new Error(`Esperado exatamente um og:image, encontrado: ${og.duplicates}.`);
  if (!og.title || !og.description || !og.url) throw new Error('Faltam og:title, og:description ou og:url.');
  const imageUrl = new URL(og.image);
  if (imageUrl.protocol !== 'https:') throw new Error('A imagem OG precisa de HTTPS.');
  const image = await fetcher(imageUrl, { headers: { Accept: 'image/png,image/*' } });
  if (!image.ok) throw new Error(`Imagem OG retornou HTTP ${image.status}.`);
  if (!(image.headers.get('content-type') || '').includes('image/png')) {
    throw new Error('O link da imagem não retornou image/png (talvez login ou HTML).');
  }
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('Imagem OG excede 5 MB.');
  const dimensions = readPngDimensions(bytes);
  if (og.imageWidth !== dimensions.width || og.imageHeight !== dimensions.height) {
    throw new Error('Dimensões do PNG não correspondem às metatags.');
  }
  if (dimensions.width < 300 || dimensions.height < 157) {
    throw new Error('Imagem OG pequena demais para uma prévia grande.');
  }
  return { url: url.toString(), og, dimensions, imageBytes: bytes.byteLength };
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Uso: node scripts/check-og.mjs https://ejc.migos.club/enviar/slug');
    process.exitCode = 2;
    return;
  }
  try {
    const checked = await checkOg(target);
    console.log('✓ OG HTML e imagem PNG acessíveis ao robô social');
    console.log('Título:', checked.og.title);
    console.log('Imagem:', checked.og.image);
    console.log('Tamanho:', `${checked.dimensions.width} × ${checked.dimensions.height}`);
    console.log('Peso:', Math.round(checked.imageBytes / 1024), 'KB');
    console.log('Link versionado:', checked.og.url);
  } catch (error) {
    console.error('✗ Falha na prévia do WhatsApp:', error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
