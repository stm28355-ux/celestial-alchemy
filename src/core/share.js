// 共有URL：ステージの生の形（JSON）を圧縮して、URL の # の後ろに載せられる文字にする。
// ブラウザ標準の圧縮（deflate-raw）と、URL で使える base64（- と _）を使う。サーバーは要らない。

export async function encodeStage(raw) {
  const bytes = new TextEncoder().encode(JSON.stringify(raw));
  const packed = await pipe(bytes, new CompressionStream('deflate-raw'));
  return toBase64Url(packed);
}

export async function decodeStage(text) {
  const bytes = fromBase64Url(text);
  const unpacked = await pipe(bytes, new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(unpacked));
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
