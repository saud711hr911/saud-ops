export async function encrypt(text: string): Promise<string> {
  const enc = new TextEncoder();
  const secret = (import.meta as any).env.VITE_ENCRYPTION_KEY || "fallback-secret-key-for-development";
  const keyData = enc.encode(secret);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData.slice(0, 32),
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedFile = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(text)
  );

  const combined = new Uint8Array(iv.length + encryptedFile.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedFile), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encryptedText: string): Promise<string> {
  const combined = new Uint8Array(atob(encryptedText).split("").map(c => c.charCodeAt(0)));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const enc = new TextEncoder();
  const secret = (import.meta as any).env.VITE_ENCRYPTION_KEY || "fallback-secret-key-for-development";
  const keyData = enc.encode(secret);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData.slice(0, 32),
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    data
  );

  return new TextDecoder().decode(decrypted);
}
