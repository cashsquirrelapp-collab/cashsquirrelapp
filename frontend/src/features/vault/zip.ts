// Minimal ZIP writer (stored, no compression) for bundling vault files in the browser. PDFs and
// photos are already compressed, so storing them as-is keeps the ZIP small enough and simple.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Bundle files into one ZIP. Names are made unique so nothing overwrites another file. */
export function buildZip(entries: { name: string; data: Uint8Array; date?: Date }[]): Blob {
  const encoder = new TextEncoder();
  const used = new Set<string>();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    let name = entry.name.replace(/[\\/:*?"<>|]/g, '_') || 'file';
    for (let n = 2; used.has(name.toLowerCase()); n++) name = entry.name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
    used.add(name.toLowerCase());
    const nameBytes = encoder.encode(name);
    const crc = crc32(entry.data);
    const { time, date } = dosDateTime(entry.date || new Date());
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); local.setUint16(10, time, true); local.setUint16(12, date, true);
    local.setUint32(14, crc, true); local.setUint32(18, entry.data.length, true); local.setUint32(22, entry.data.length, true);
    local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
    parts.push(local.buffer, nameBytes, entry.data);
    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true); record.setUint16(4, 20, true); record.setUint16(6, 20, true); record.setUint16(8, 0x0800, true);
    record.setUint16(10, 0, true); record.setUint16(12, time, true); record.setUint16(14, date, true);
    record.setUint32(16, crc, true); record.setUint32(20, entry.data.length, true); record.setUint32(24, entry.data.length, true);
    record.setUint16(28, nameBytes.length, true); record.setUint32(42, offset, true);
    const header = new Uint8Array(46 + nameBytes.length);
    header.set(new Uint8Array(record.buffer), 0); header.set(nameBytes, 46);
    central.push(header);
    offset += 30 + nameBytes.length + entry.data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

/** Fetch vault files (through the API, so access is checked) and save them as one ZIP. */
export async function downloadVaultZip(files: { id: string; fileName: string; createdAt: string; client?: string | null; jobName?: string | null }[], zipName: string): Promise<void> {
  const { vaultFileUrl } = await import('../../services/vault');
  const entries = [];
  for (const file of files) {
    const response = await fetch(vaultFileUrl(file.id), { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`ดาวน์โหลด ${file.fileName} ไม่สำเร็จ`);
    const owner = file.client || file.jobName;
    entries.push({ name: owner ? `${owner} - ${file.fileName}` : file.fileName, data: new Uint8Array(await response.arrayBuffer()), date: new Date(file.createdAt) });
  }
  const url = URL.createObjectURL(buildZip(entries));
  const a = document.createElement('a');
  a.href = url; a.download = zipName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
