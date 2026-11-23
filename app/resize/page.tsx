"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { Moon, Sun, Upload, Download, Trash2, Image as ImageIcon, Check, LockKeyhole } from "lucide-react";

type ResizeItem = { id: string; file: File; preview: string; output?: Blob; outputName?: string; dimensions?: string; status: "ready" | "resizing" | "done" | "error"; error?: string };
const presets = [
  { name: "Square", width: 1080, height: 1080, detail: "Social posts" },
  { name: "Landscape", width: 1200, height: 630, detail: "Social preview" },
  { name: "HD", width: 1920, height: 1080, detail: "Video & screens" },
  { name: "Thumbnail", width: 400, height: 400, detail: "Small & fast" },
];
const outputExtensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

function prettyBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"]; let value = bytes / 1024; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

function zipFiles(files: { name: string; blob: Blob }[]) {
  const encoder = new TextEncoder(); const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[i] = c >>> 0; }
  const crc = (data: Uint8Array) => { let value = 0xffffffff; for (const byte of data) value = table[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; };
  return Promise.all(files.map(async file => ({ name: encoder.encode(file.name), data: new Uint8Array(await file.blob.arrayBuffer()) }))).then(entries => {
    const locals: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
    const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true); const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true);
    for (const entry of entries) {
      const checksum = crc(entry.data); const local = new Uint8Array(30 + entry.name.length); const lv = new DataView(local.buffer);
      u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u32(lv, 14, checksum); u32(lv, 18, entry.data.length); u32(lv, 22, entry.data.length); u16(lv, 26, entry.name.length); local.set(entry.name, 30); locals.push(local, entry.data);
      const dir = new Uint8Array(46 + entry.name.length); const dv = new DataView(dir.buffer); u32(dv, 0, 0x02014b50); u16(dv, 4, 20); u16(dv, 6, 20); u16(dv, 8, 0x0800); u32(dv, 16, checksum); u32(dv, 20, entry.data.length); u32(dv, 24, entry.data.length); u16(dv, 28, entry.name.length); u32(dv, 42, offset); dir.set(entry.name, 46); central.push(dir); offset += local.length + entry.data.length;
    }
    const size = central.reduce((total, part) => total + part.length, 0); const end = new Uint8Array(22); const ev = new DataView(end.buffer); u32(ev, 0, 0x06054b50); u16(ev, 8, entries.length); u16(ev, 10, entries.length); u32(ev, 12, size); u32(ev, 16, offset);
    return new Blob([...locals, ...central, end], { type: "application/zip" });
  });
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file); const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This image could not be opened. It may be damaged or unsupported.")); };
    image.src = url;
  });
}

export default function ResizePage() {
  const [items, setItems] = useState<ResizeItem[]>([]);
  const [width, setWidth] = useState("1080");
  const [height, setHeight] = useState("1080");
  const [preserveRatio, setPreserveRatio] = useState(true);
  const [preset, setPreset] = useState("Square");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<ResizeItem[]>([]); itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach(item => URL.revokeObjectURL(item.preview)), []);
  useEffect(() => { const saved = localStorage.getItem("pixelshift-theme"); if (saved === "dark" || saved === "light") setTheme(saved); }, []);

  const addFiles = (files: FileList | File[]) => {
    const selected = Array.from(files); const room = Math.max(0, 50 - itemsRef.current.length);
    if (selected.length > room) setNotice(`You can add ${room} more ${room === 1 ? "image" : "images"}.`); else setNotice("");
    const added = selected.slice(0, room).map(file => ({ id: `${Date.now()}-${Math.random()}`, file, preview: URL.createObjectURL(file), status: "ready" as const }));
    setItems(current => [...current, ...added]);
  };
  const handleDrop = (event: DragEvent<HTMLElement>) => { event.preventDefault(); event.stopPropagation(); setDragging(false); addFiles(event.dataTransfer.files); };
  const choosePreset = (selected: typeof presets[number]) => { setPreset(selected.name); setWidth(String(selected.width)); setHeight(String(selected.height)); };
  const changeSize = (field: "width" | "height", value: string) => { setPreset("Custom"); field === "width" ? setWidth(value) : setHeight(value); };
  const clear = () => { items.forEach(item => URL.revokeObjectURL(item.preview)); setItems([]); setNotice(""); };
  const remove = (id: string) => { const item = items.find(row => row.id === id); if (item) URL.revokeObjectURL(item.preview); setItems(current => current.filter(row => row.id !== id)); };
  const resizeAll = async () => {
    const targetWidth = Number(width); const targetHeight = Number(height);
    if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight) || targetWidth < 1 || targetHeight < 1 || targetWidth > 12000 || targetHeight > 12000) { setNotice("Enter a width and height between 1 and 12,000 pixels."); return; }
    setNotice("");
    for (const item of items) {
      if (item.status === "resizing") continue;
      setItems(current => current.map(row => row.id === item.id ? { ...row, status: "resizing", error: undefined } : row));
      try {
        const image = await loadImage(item.file); let outputWidth = targetWidth; let outputHeight = targetHeight;
        if (preserveRatio) { const scale = Math.min(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight); outputWidth = Math.max(1, Math.round(image.naturalWidth * scale)); outputHeight = Math.max(1, Math.round(image.naturalHeight * scale)); }
        const canvas = document.createElement("canvas"); canvas.width = outputWidth; canvas.height = outputHeight;
        const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser could not prepare this image.");
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high"; context.drawImage(image, 0, 0, outputWidth, outputHeight);
        const wanted = ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(item.file.type) ? item.file.type : "image/png";
        let blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("Image resizing failed.")), wanted, 0.9));
        if (blob.type !== wanted) blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("Image resizing failed.")), "image/png"));
        const extension = outputExtensions[blob.type] ?? "png"; const baseName = item.file.name.replace(/\.[^.]+$/, "") || "image";
        setItems(current => current.map(row => row.id === item.id ? { ...row, status: "done", output: blob, outputName: `${baseName}-resized.${extension}`, dimensions: `${outputWidth} × ${outputHeight}` } : row));
      } catch (error) { setItems(current => current.map(row => row.id === item.id ? { ...row, status: "error", error: error instanceof Error ? error.message : "Could not resize this image." } : row)); }
    }
  };
  const done = items.filter(item => item.output);
  const progress = items.length ? Math.round(items.filter(item => item.status === "done" || item.status === "error").length / items.length * 100) : 0;
  const downloadZip = async () => { const blob = await zipFiles(done.map(item => ({ name: item.outputName!, blob: item.output! }))); triggerDownload(blob, "pixelshift-resized-images.zip"); };
  const switchTheme = () => { const next = theme === "light" ? "dark" : "light"; setTheme(next); localStorage.setItem("pixelshift-theme", next); };
  const handleInput = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; };

  return <main className={`app-shell theme-${theme}`} onDragOver={event => event.preventDefault()} onDrop={handleDrop}>
    <header className="topbar"><a className="brand" href="/" aria-label="PixelShift home"><span className="brand-mark"><span /></span><span>PixelShift</span></a><nav className="top-nav" aria-label="Main navigation"><a href="/">Convert</a><a href="/resize" aria-current="page">Resize</a><a href="/#formats">Formats</a><a href="/#privacy">Privacy</a></nav><div className="top-actions"><div className="privacy-pill"><span className="privacy-dot" /> Files stay on your device</div><button className="theme-toggle" type="button" onClick={switchTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} aria-pressed={theme === "dark"}>{theme === "light" ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}</button></div></header>
    <section className="hero resize-hero"><div className="eyebrow"><span className="sparkle">✳</span> PIXELSHIFT RESIZE</div><h1>Right size.<br /><span>Right away.</span></h1><p className="hero-copy">Resize a whole batch in one go. Pick your dimensions, keep every image in proportion, and download locally.</p></section>
    {notice && <p className="notice resize-notice" role="status">{notice}</p>}
    <section className="resize-workspace" aria-label="Batch image resize">
      <div className="resize-grid">
        <div className="resize-files-column">
          <div className={`dropzone resize-dropzone ${dragging ? "dropzone-active" : ""}`} onDragEnter={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={handleDrop}>
            <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={handleInput} aria-label="Choose images to resize" />
            <div className="upload-icon"><Upload size={27} aria-hidden="true" /></div><div className="drop-copy"><h2>Drop images to resize</h2><p>or <button className="text-button" type="button" onClick={() => inputRef.current?.click()}>choose files</button> from your device</p><small>Up to 50 images · Files stay on this device</small></div>
          </div>
          <section className="resize-list-card" aria-label="Images to resize"><div className="file-heading"><div><h2>Images <span className="count-badge">{items.length}</span></h2><p>{done.length} of {items.length} resized</p></div>{items.length > 0 && <button className="clear-button" type="button" onClick={clear}>Clear all <span>×</span></button>}</div>{items.length > 0 && <><div className="progress-track" role="progressbar" aria-label="Resize progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div style={{ width: `${progress}%` }} /></div><div className="resize-file-list">{items.map(item => <article className="resize-file-row" key={item.id}><div className="file-thumb">{item.preview ? <img src={item.preview} alt="" /> : <ImageIcon size={17} aria-hidden="true" />}</div><div className="file-info"><strong title={item.file.name}>{item.outputName ?? item.file.name}</strong><span>{item.dimensions ? `${item.dimensions} · ` : ""}{prettyBytes(item.file.size)}{item.output ? ` → ${prettyBytes(item.output.size)}` : ""}</span>{item.error && <span className="error-text" role="alert">{item.error}</span>}</div><div className="file-result">{item.status === "done" ? <button className="download-icon" type="button" onClick={() => triggerDownload(item.output!, item.outputName!)} aria-label={`Download ${item.outputName}`}><Download size={14} /> Save</button> : item.status === "resizing" ? <span className="converting-label"><i /> Resizing</span> : item.status === "error" ? <span className="status-error">Failed</span> : <span className="ready-label">Ready</span>}</div><button className="remove-button" type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.file.name}`}><Trash2 size={14} /></button></article>)}</div></>}</section>
        </div>
        <aside className="resize-settings">
          <div className="resize-settings-heading"><span className="resize-heading-icon"><ImageIcon size={17} /></span><div><h2>Resize settings</h2><p>One size for your whole batch</p></div></div>
          <div className="dimension-fields"><label>Width <span>px</span><input type="number" min="1" max="12000" value={width} onChange={event => changeSize("width", event.target.value)} aria-label="Output width in pixels" /></label><span className="dimension-x">×</span><label>Height <span>px</span><input type="number" min="1" max="12000" value={height} onChange={event => changeSize("height", event.target.value)} aria-label="Output height in pixels" /></label></div>
          <label className="ratio-toggle"><input type="checkbox" checked={preserveRatio} onChange={event => setPreserveRatio(event.target.checked)} /><span className="ratio-check"><Check size={13} /></span><span><strong>Preserve aspect ratio</strong><small>Fit each image inside the selected dimensions</small></span></label>
          <div className="preset-heading"><span>Preset sizes</span><small>Choose a starting point</small></div><div className="preset-grid">{presets.map(option => <button key={option.name} type="button" className={`preset-card ${preset === option.name ? "preset-selected" : ""}`} onClick={() => choosePreset(option)} aria-pressed={preset === option.name}><strong>{option.name}</strong><span>{option.width} × {option.height}</span><small>{option.detail}</small></button>)}</div>
          <div className="resize-output-note"><LockKeyhole size={14} /><span>Images are resized in your browser and never uploaded.</span></div>
          <div className="panel-actions"><button className="convert-button" type="button" onClick={() => void resizeAll()} disabled={!items.length || items.some(item => item.status === "resizing")}>Resize {items.length ? `${items.length} image${items.length === 1 ? "" : "s"}` : "images"} <span aria-hidden="true">→</span></button>{done.length > 0 && <button className="zip-button" type="button" onClick={() => void downloadZip()}>Download all as ZIP <span>({done.length})</span></button>}</div>
        </aside>
      </div>
      <div className="privacy-footer"><span className="privacy-lock"><LockKeyhole size={13} /></span><p><strong>Private by design.</strong> Every image stays on your device from selection to download.</p><span className="saved-summary">{done.length ? `${done.length} resized` : "No uploads"}</span></div>
    </section>
    <div className="page-bottom"><span>PIXELSHIFT © 2025</span><span>MADE FOR THE OPEN WEB</span><span>RESIZE A WHOLE BATCH AT ONCE</span></div>
  </main>;
}
