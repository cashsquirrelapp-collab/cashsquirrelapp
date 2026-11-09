// iPhone photos (HEIC/HEIF) for the chat and the document vault (owner, 2026-11-04: "ฝากทำให้มันรับนามสกุลภาพนี้ด้วย").
// Chrome cannot read HEIC, so a picked HEIC is turned into a JPEG on the device first; everything after (the chat's
// redraw, the vault's upload and its server checks) then sees an ordinary JPEG. The converter (heic-to, libheif, LGPL,
// its build without eval or WebAssembly, so the site's script policy is unchanged) is about 3 MB and loads only when
// a HEIC is picked.

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
// The ISO box brands of HEIC and HEIF still images and sequences.
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

/** By its type or its name: what most pickers give (Chrome on a Mac often gives no type, only the .heic name). */
export function isHeicFile(file: Pick<File, 'type' | 'name'>): boolean {
  return HEIC_TYPES.has(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name);
}

/** By its first bytes, for a picture with neither a type nor a telling name: "ftyp" then a HEIC/HEIF brand. */
export async function hasHeicBytes(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length < 12 || String.fromCharCode(...head.subarray(4, 8)) !== 'ftyp') return false;
  return HEIC_BRANDS.has(String.fromCharCode(...head.subarray(8, 12)));
}

export class HeicError extends Error { constructor() { super('heic'); this.name = 'HeicError'; } }

/** The HEIC as a JPEG file with the same name ending .jpg. Throws HeicError when the picture cannot be read. */
export async function heicToJpeg(file: File): Promise<File> {
  try {
    const { heicTo } = await import('heic-to');
    const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
    const name = `${(file.name || 'photo').replace(/\.(heic|heif)$/i, '')}.jpg`;
    return new File([jpeg], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch { throw new HeicError(); }
}

/** The file ready for the app: a HEIC becomes a JPEG, anything else is returned as it is. */
export async function readableFile(file: File): Promise<File> {
  if (isHeicFile(file) || (!file.type && await hasHeicBytes(file).catch(() => false))) return heicToJpeg(file);
  return file;
}
