// File dialogs. Chrome and Edge offer real Save As and Open windows (and writing back to the same file); other browsers get a download and a file chooser.
export interface FileType { description: string; accept: Record<string, string[]> }
export interface Handle { name: string; createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>; getFile(): Promise<File> }

type Pickers = { showSaveFilePicker?: (o: unknown) => Promise<Handle>; showOpenFilePicker?: (o: unknown) => Promise<Handle[]> };
const w = () => globalThis as unknown as Pickers; // looked up when used, so the helpers also load without a browser
export const canPick = () => typeof w().showSaveFilePicker === 'function' && typeof w().showOpenFilePicker === 'function';

export const MODEL_TYPE: FileType = { description: 'STEP or IGES model', accept: { 'model/step': ['.step', '.stp'], 'model/iges': ['.iges', '.igs'] } };
export const FORGE_TYPE: FileType = { description: 'DemonX Forge design', accept: { 'application/zip': ['.forge'] } };
const TYPES: Record<string, FileType> = {
  step: { description: 'STEP model', accept: { 'model/step': ['.step', '.stp'] } },
  stl: { description: 'STL mesh', accept: { 'model/stl': ['.stl'] } },
  '3mf': { description: '3MF package', accept: { 'model/3mf': ['.3mf'] } },
  obj: { description: 'OBJ mesh', accept: { 'model/obj': ['.obj'] } },
  dxf: { description: 'DXF drawing', accept: { 'image/vnd.dxf': ['.dxf'] } },
};
export const typeForExt = (ext: string): FileType => TYPES[ext] ?? { description: ext.toUpperCase(), accept: { 'application/octet-stream': [`.${ext}`] } };

export const stripExt = (name: string) => name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
export const extOf = (name: string) => /\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1]?.toLowerCase() ?? '';

const cancelled = (e: unknown) => (e as { name?: string })?.name === 'AbortError';

/** The native Save As window; null when the person cancelled it. */
export async function pickSaveHandle(suggestedName: string, types: FileType[]): Promise<Handle | null> {
  try { return await w().showSaveFilePicker!({ suggestedName, types }); } catch (e) { if (cancelled(e)) return null; throw e; }
}

export async function writeHandle(h: Handle, data: Blob): Promise<void> {
  const f = await h.createWritable();
  await f.write(data);
  await f.close();
}

export function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** The native Open window (with a handle to write back to), or a file chooser; null when cancelled. */
export async function pickOpenFile(types: FileType[]): Promise<{ file: File; handle: Handle | null } | null> {
  if (canPick()) {
    try { const [h] = await w().showOpenFilePicker!({ types, multiple: false }); return h ? { file: await h.getFile(), handle: h } : null; } catch (e) { if (cancelled(e)) return null; throw e; }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = types.flatMap((t) => Object.values(t.accept).flat()).join(',');
    input.onchange = () => resolve(input.files?.[0] ? { file: input.files[0], handle: null } : null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
