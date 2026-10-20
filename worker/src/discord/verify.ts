function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Verifies the Ed25519 signature Discord puts on every interaction request. */
export async function verifyInteraction(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  body: string,
): Promise<boolean> {
  if (!signatureHex || !timestamp || !/^[0-9a-f]+$/i.test(signatureHex)) return false;
  const key = await crypto.subtle.importKey('raw', hexToBytes(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, hexToBytes(signatureHex), new TextEncoder().encode(timestamp + body));
}
