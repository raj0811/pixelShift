"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Item = {
  id: string;
  file: File;
  preview: string;
  output?: Blob;
  outputFormat?: Format;
  status: "ready" | "converting" | "done" | "error";
  error?: string;
};
type Format = "webp" | "png" | "jpeg" | "avif" | "gif" | "bmp" | "tiff" | "ico" | "svg" | "pdf";
const formatOptions: { id: Format; label: string; mime: string; extension: string }[] = [
  { id: "png", label: "PNG", mime: "image/png", extension: "png" },
  { id: "jpeg", label: "JPG", mime: "image/jpeg", extension: "jpg" },
  { id: "webp", label: "WEBP", mime: "image/webp", extension: "webp" },
  { id: "avif", label: "AVIF", mime: "image/avif", extension: "avif" },
  { id: "gif", label: "GIF", mime: "image/gif", extension: "gif" },
  { id: "bmp", label: "BMP", mime: "image/bmp", extension: "bmp" },
  { id: "tiff", label: "TIFF", mime: "image/tiff", extension: "tiff" },
  { id: "ico", label: "ICO", mime: "image/x-icon", extension: "ico" },
  { id: "svg", label: "SVG", mime: "image/svg+xml", extension: "svg" },
  { id: "pdf", label: "PDF", mime: "application/pdf", extension: "pdf" },
];

const accepted = new Set(["image/png", "image/jpeg", "image/gif", "image/bmp", "image/x-ms-bmp", "image/tiff", "image/avif", "image/webp"]);
const acceptedExtensions = /\.(png|jpe?g|gif|bmp|tiff?|avif|webp)$/i;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

function outputName(name: string, format: Format) {
  const extension = formatOptions.find(option => option.id === format)?.extension ?? "webp";
  return `${name.replace(/\.[^.]+$/, "") || name}.${extension}`;
}

function decodeImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This image couldn’t be opened. It may be damaged or unsupported by your browser.")); };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image encoding failed. Try another image.")), mime, quality));
}

async function encodeBmp(canvas: HTMLCanvasElement) {
  const { width, height } = canvas;
  const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  const bytes = new Uint8Array(54 + width * height * 4); const view = new DataView(bytes.buffer);
  view.setUint8(0, 0x42); view.setUint8(1, 0x4d); view.setUint32(2, bytes.length, true); view.setUint32(10, 54, true);
  view.setUint32(14, 40, true); view.setInt32(18, width, true); view.setInt32(22, -height, true); view.setUint16(26, 1, true); view.setUint16(28, 32, true); view.setUint32(34, width * height * 4, true);
  for (let i = 0; i < width * height; i++) { const at = 54 + i * 4; bytes[at] = pixels[i * 4 + 2]; bytes[at + 1] = pixels[i * 4 + 1]; bytes[at + 2] = pixels[i * 4]; bytes[at + 3] = pixels[i * 4 + 3]; }
  return new Blob([bytes], { type: "image/bmp" });
}

async function encodeTiff(canvas: HTMLCanvasElement) {
  const { width, height } = canvas;
  const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  const tags = 11; const ifdOffset = 8; const bitsOffset = ifdOffset + 2 + tags * 12 + 4; const pixelOffset = bitsOffset + 8;
  const bytes = new Uint8Array(pixelOffset + pixels.length); const view = new DataView(bytes.buffer);
  view.setUint8(0, 0x49); view.setUint8(1, 0x49); view.setUint16(2, 42, true); view.setUint32(4, ifdOffset, true); view.setUint16(ifdOffset, tags, true);
  const entries: [number, number, number, number][] = [[256,4,1,width],[257,4,1,height],[258,3,4,bitsOffset],[259,3,1,1],[262,3,1,2],[273,4,1,pixelOffset],[277,3,1,4],[278,4,1,height],[279,4,1,pixels.length],[284,3,1,1],[338,3,1,2]];
  entries.forEach(([tag,type,count,value],index)=>{const at=ifdOffset+2+index*12;view.setUint16(at,tag,true);view.setUint16(at+2,type,true);view.setUint32(at+4,count,true);if(type===3&&count===1)view.setUint16(at+8,value,true);else view.setUint32(at+8,value,true);});
  view.setUint32(ifdOffset + 2 + tags * 12, 0, true); [8,8,8,8].forEach((n,i)=>view.setUint16(bitsOffset+i*2,n,true)); bytes.set(pixels,pixelOffset);
  return new Blob([bytes], { type: "image/tiff" });
}

async function encodeGif(canvas: HTMLCanvasElement) {
  const { width, height } = canvas; const rgba = canvas.getContext("2d")!.getImageData(0,0,width,height).data;
  const header = new Uint8Array(13 + 768 + 11); const h = new DataView(header.buffer);
  header.set(new TextEncoder().encode("GIF89a"),0); h.setUint16(6,width,true); h.setUint16(8,height,true); header[10]=0xf7; header[11]=0; header[12]=0;
  for(let i=0;i<256;i++){header[13+i*3]=Math.round(((i>>5)&7)*255/7);header[14+i*3]=Math.round(((i>>2)&7)*255/7);header[15+i*3]=Math.round((i&3)*255/3);}
  const at=781;header[at]=0x2c;header[at+9]=0;header[at+10]=8;
  const codes:number[]=[];let codeSize=9,nextCode=258,prefix=-1;const dict=new Map<number,number>();
  const emit=(code:number)=>{codes.push(code);};emit(256);
  for(let i=0;i<width*height;i++){const p=i*4;const color=((rgba[p]>>5)<<5)|((rgba[p+1]>>5)<<2)|(rgba[p+2]>>6);if(prefix<0){prefix=color;continue;}const key=(prefix<<8)|color;const found=dict.get(key);if(found!==undefined){prefix=found;continue;}emit(prefix);if(nextCode<4096){dict.set(key,nextCode++);if(nextCode===(1<<codeSize)&&codeSize<12)codeSize++;}else{emit(256);dict.clear();codeSize=9;nextCode=258;}prefix=color;}
  if(prefix>=0)emit(prefix);emit(257);
  const packed:number[]=[];let bits=0,bitCount=0;codeSize=9;nextCode=258;const pack=(code:number)=>{bits|=code<<bitCount;bitCount+=codeSize;while(bitCount>=8){packed.push(bits&255);bits>>>=8;bitCount-=8;}};
  let prev=-1;for(const code of codes){pack(code);if(code===256){codeSize=9;nextCode=258;prev=-1;continue;}if(prev>=0&&nextCode<4096){nextCode++;if(nextCode===(1<<codeSize)&&codeSize<12)codeSize++;}prev=code;}if(bitCount)packed.push(bits&255);
  const blocks:number[]=[];for(let i=0;i<packed.length;i+=255){const part=packed.slice(i,i+255);blocks.push(part.length,...part);}blocks.push(0,0x3b);
  return new Blob([header.slice(0,at+11),new Uint8Array(blocks)],{type:"image/gif"});
}

async function buildPdf(pages: { blob: Blob; width: number; height: number }[]) {
  const encoder = new TextEncoder();
  const ascii = (value: string) => encoder.encode(value);
  const bodies = new Map<number, Uint8Array>();
  const kids: string[] = [];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    kids.push(`${pageId} 0 R`);
    bodies.set(pageId, ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    const imageBytes = new Uint8Array(await page.blob.arrayBuffer());
    const imageHead = ascii(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
    const imageBody = new Uint8Array(imageHead.length + imageBytes.length + 10);
    imageBody.set(imageHead); imageBody.set(imageBytes, imageHead.length); imageBody.set(ascii("\nendstream"), imageHead.length + imageBytes.length);
    bodies.set(imageId, imageBody);
    const stream = ascii(`q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im0 Do\nQ`);
    bodies.set(contentId, ascii(`<< /Length ${stream.length} >>\nstream\n${new TextDecoder().decode(stream)}\nendstream`));
  }
  bodies.set(1, ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  bodies.set(2, ascii(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`));
  const objectCount = 3 + pages.length * 3;
  const parts: Uint8Array[] = [];
  const offsets = new Array<number>(objectCount).fill(0);
  let length = 0;
  const add = (bytes: Uint8Array) => { parts.push(bytes); length += bytes.length; };
  add(ascii("%PDF-1.4\n%PS\n"));
  for (let id = 1; id < objectCount; id++) {
    offsets[id] = length;
    add(ascii(`${id} 0 obj\n`)); add(bodies.get(id)!); add(ascii("\nendobj\n"));
  }
  const xrefOffset = length;
  add(ascii(`xref\n0 ${objectCount}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return new Blob(parts.map(part => part.slice().buffer as ArrayBuffer), { type: "application/pdf" });
}

async function encodeExtra(canvas: HTMLCanvasElement, format: Format, quality: number): Promise<Blob> {
  if(format==="bmp")return encodeBmp(canvas);
  if(format==="tiff")return encodeTiff(canvas);
  if(format==="gif")return encodeGif(canvas);
  if(format==="ico") {const png=await canvasBlob(canvas,"image/png",quality);const data=new Uint8Array(await png.arrayBuffer());const out=new Uint8Array(22+data.length);const view=new DataView(out.buffer);view.setUint16(2,1,true);view.setUint16(4,1,true);out[6]=canvas.width>=256?0:canvas.width;out[7]=canvas.height>=256?0:canvas.height;view.setUint16(10,1,true);view.setUint16(12,32,true);view.setUint32(14,data.length,true);view.setUint32(18,22,true);out.set(data,22);return new Blob([out],{type:"image/x-icon"});}
  if(format==="svg") {const png=await canvasBlob(canvas,"image/png",quality);const bytes=new Uint8Array(await png.arrayBuffer());let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));const base64=btoa(binary);return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image width="100%" height="100%" href="data:image/png;base64,${base64}"/></svg>`],{type:"image/svg+xml"});}
  if(format==="pdf") {const jpg=await canvasBlob(canvas,"image/jpeg",quality);return buildPdf([{blob:jpg,width:canvas.width,height:canvas.height}]);}
  const mime=formatOptions.find(option=>option.id===format)!.mime;const blob=await canvasBlob(canvas,mime,quality);if(blob.type!==mime)throw new Error(`Your browser does not support ${format.toUpperCase()} encoding.`);return blob;
}

function makeZip(files: { name: string; blob: Blob }[]) {
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc32 = (data: Uint8Array) => { let crc = 0xffffffff; for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const put16 = (v: DataView, i: number, n: number) => v.setUint16(i, n, true);
  const put32 = (v: DataView, i: number, n: number) => v.setUint32(i, n, true);
  return Promise.all(files.map(async ({ name, blob }) => ({ name, nameBytes: encoder.encode(name), data: new Uint8Array(await blob.arrayBuffer()) }))).then(entries => {
    for (const entry of entries) {
      const crc = crc32(entry.data);
      const local = new Uint8Array(30 + entry.nameBytes.length); const lv = new DataView(local.buffer);
      put32(lv, 0, 0x04034b50); put16(lv, 4, 20); put16(lv, 6, 0x0800); put16(lv, 8, 0); put32(lv, 14, crc); put32(lv, 18, entry.data.length); put32(lv, 22, entry.data.length); put16(lv, 26, entry.nameBytes.length); local.set(entry.nameBytes, 30);
      chunks.push(local, entry.data);
      const dir = new Uint8Array(46 + entry.nameBytes.length); const dv = new DataView(dir.buffer);
      put32(dv, 0, 0x02014b50); put16(dv, 4, 20); put16(dv, 6, 20); put16(dv, 8, 0x0800); put16(dv, 10, 0); put32(dv, 16, crc); put32(dv, 20, entry.data.length); put32(dv, 24, entry.data.length); put16(dv, 28, entry.nameBytes.length); put32(dv, 42, offset); dir.set(entry.nameBytes, 46); central.push(dir);
      offset += local.length + entry.data.length;
    }
    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    const end = new Uint8Array(22); const ev = new DataView(end.buffer); put32(ev, 0, 0x06054b50); put16(ev, 8, entries.length); put16(ev, 10, entries.length); put32(ev, 12, centralSize); put32(ev, 16, offset);
    return new Blob([...chunks, ...central, end].map(part => part.slice().buffer as ArrayBuffer), { type: "application/zip" });
  });
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [quality, setQuality] = useState(82);
  const [format, setFormat] = useState<Format>("webp");
  const [moreFormats, setMoreFormats] = useState(false);
  const [buildingPdf, setBuildingPdf] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  useEffect(() => () => { itemsRef.current.forEach(item => { if (item.preview) URL.revokeObjectURL(item.preview); }); }, []);
  useEffect(() => {
    const stored = window.localStorage.getItem("pixelshift-theme");
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const selected = Array.from(files);
    const available = Math.max(0, 50 - itemsRef.current.length);
    if (selected.length > available) setNotice(available ? `You can add ${available} more ${available === 1 ? "image" : "images"}.` : "This batch is full. Remove an image before adding more.");
    else setNotice("");
    const next: Item[] = selected.slice(0, available).map(file => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!accepted.has(file.type.toLowerCase()) && !acceptedExtensions.test(file.name)) return { id, file, preview: "", status: "error", error: "Unsupported format. Choose PNG, JPEG, GIF, BMP, TIFF, AVIF, or WebP." };
      return { id, file, preview: URL.createObjectURL(file), status: "ready" };
    });
    setItems(current => [...current, ...next]);
  }, []);

  const convertOne = useCallback(async (item: Item, q: number, target: Format) => {
    setItems(current => current.map(row => row.id === item.id ? { ...row, status: "converting", error: undefined } : row));
    try {
      const image = await decodeImage(item.file);
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser couldn’t prepare this image for conversion.");
      context.drawImage(image, 0, 0);
      const blob = await encodeExtra(canvas, target, q / 100);
      setItems(current => current.map(row => row.id === item.id ? { ...row, status: "done", output: blob, outputFormat: target } : row));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Conversion failed. Please try again.";
      setItems(current => current.map(row => row.id === item.id ? { ...row, status: "error", error: message } : row));
    }
  }, []);

  const convertAll = () => { for (const item of items) if (item.status === "ready") void convertOne(item, quality, format); };
  const handleInput = (event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; };
  const handleDrop = (event: DragEvent<HTMLElement>) => { event.preventDefault(); event.stopPropagation(); setDragging(false); addFiles(event.dataTransfer.files); };
  const completed = items.filter(item => item.status === "done");
  const totalSaved = completed.reduce((sum, item) => sum + Math.max(0, item.file.size - (item.output?.size ?? 0)), 0);
  const progress = items.length ? Math.round(items.filter(item => item.status === "done" || item.status === "error").length / items.length * 100) : 0;
  const clear = () => { items.forEach(item => { if (item.preview) URL.revokeObjectURL(item.preview); }); setItems([]); setNotice(""); };
  const remove = (id: string) => { const item = items.find(row => row.id === id); if (item?.preview) URL.revokeObjectURL(item.preview); setItems(rows => rows.filter(row => row.id !== id)); };
  const downloadAll = async () => { const zip = await makeZip(completed.map(item => ({ name: outputName(item.file.name, item.outputFormat ?? format), blob: item.output! }))); download(zip, "pixelshift-images.zip"); };
  const downloadCombinedPdf = async () => {
    setBuildingPdf(true); setNotice("");
    try {
      const pages: { blob: Blob; width: number; height: number }[] = [];
      for (const item of items) {
        try {
          const image = await decodeImage(item.file);
          const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d"); if (!context) throw new Error("Could not prepare image.");
          context.drawImage(image, 0, 0);
          pages.push({ blob: await canvasBlob(canvas, "image/jpeg", quality / 100), width: canvas.width, height: canvas.height });
        } catch { /* Skip unreadable files and include the rest. */ }
      }
      if (!pages.length) throw new Error("No readable images could be added to the PDF.");
      download(await buildPdf(pages), "pixelshift-images.pdf");
      const skipped = items.length - pages.length;
      if (skipped) setNotice(`${skipped} unreadable or unsupported ${skipped === 1 ? "image was" : "images were"} left out of the combined PDF.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create the combined PDF.");
    } finally { setBuildingPdf(false); }
  };
  const changeTheme = () => { const next = theme === "light" ? "dark" : "light"; setTheme(next); window.localStorage.setItem("pixelshift-theme", next); };

  return (
    <main className={`app-shell theme-${theme}`} onDragOver={event => event.preventDefault()} onDrop={handleDrop}>
      <header className="topbar"><a className="brand" href="#top" aria-label="PixelShift home"><span className="brand-mark"><span /></span><span>PixelShift</span></a><nav className="top-nav" aria-label="Main navigation"><a href="#convert">Convert</a><a href="/resize">Resize</a><a href="#formats">Formats</a><a href="#privacy">Privacy</a></nav><div className="top-actions"><div className="privacy-pill"><span className="privacy-dot" /> Files stay on your device</div><button className="theme-toggle" type="button" onClick={changeTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} aria-pressed={theme === "dark"} title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? <Moon size={17} strokeWidth={1.8} aria-hidden="true" /> : <Sun size={17} strokeWidth={1.8} aria-hidden="true" />}</button></div></header>
      <section className="hero" id="top"><div className="eyebrow"><span className="sparkle">✳</span> THE IMAGE CONVERTER THAT GETS IT</div><h1>Convert any image format,<br /><span>instantly.</span></h1><p className="hero-copy">Drop your files, choose an output format, and download. Fast, free, and private by design.</p></section>
      <section className="workspace" id="convert" aria-label="Image conversion workspace">
        {notice && <p className="notice" role="status">{notice}</p>}
        <div className="converter-grid">
          <div className="file-column">
            <div className={`dropzone ${dragging ? "dropzone-active" : ""}`} onDragEnter={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={handleDrop}>
              <input ref={inputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/gif,image/bmp,image/tiff,image/avif,image/webp" multiple onChange={handleInput} aria-label="Choose images to convert" />
              <div className="upload-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg></div>
              <div className="drop-copy"><h2>Drag &amp; drop images here</h2><p>or <button className="text-button" type="button" onClick={() => inputRef.current?.click()}>choose files</button> from your device</p><small>PNG · JPG · GIF · BMP · TIFF · AVIF · Up to 50 files</small></div>
            </div>
            <section className="file-section" aria-label="Selected images"><div className="file-heading"><div><h2>Files <span className="count-badge">{items.length}</span></h2><p>{completed.length} of {items.length} converted</p></div>{items.length > 0 && <button className="clear-button" type="button" onClick={clear}>Clear all <span>×</span></button>}</div>{items.length > 0 && <><div className="progress-track" role="progressbar" aria-label="Conversion progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div style={{ width: `${progress}%` }} /></div><div className="file-list">{items.map(item => { const saved = item.output ? Math.round((1 - item.output.size / item.file.size) * 100) : 0; const itemFormat = item.outputFormat ?? format; const name = outputName(item.file.name, itemFormat); return <article className="file-card" key={item.id}><div className="file-thumb">{item.preview ? <img src={item.preview} alt="" /> : <span className="file-placeholder">IMG</span>}</div><div className="file-info"><strong title={item.file.name}>{name}</strong><span>{formatBytes(item.file.size)}{item.status === "done" && <> → {formatBytes(item.output!.size)}</>}</span>{item.status === "error" && <span className="error-text" role="alert">{item.error}</span>}</div><div className="file-result">{item.status === "done" ? <><span className={`saved-pill ${saved < 0 ? "saved-negative" : ""}`}>{saved >= 0 ? `${saved}% smaller` : `${Math.abs(saved)}% larger`}</span><button className="download-icon" type="button" aria-label={`Download ${name}`} onClick={() => download(item.output!, name)}>Download</button></> : item.status === "converting" ? <span className="converting-label"><i /> Converting</span> : item.status === "error" ? <span className="status-error">Failed</span> : <span className="ready-label">Waiting</span>}</div><button className="remove-button" type="button" aria-label={`Remove ${item.file.name}`} onClick={() => remove(item.id)}>×</button></article>; })}</div></>}</section>
          </div>
          <aside className="settings-panel" id="formats"><h2>Convert to</h2><div className="format-grid" role="group" aria-label="Output format">{formatOptions.map(option => <button key={option.id} type="button" className={`format-option ${format === option.id ? "selected" : ""}`} aria-pressed={format === option.id} onClick={() => setFormat(option.id)}>{option.label}</button>)}<button className="format-option unavailable" type="button" disabled title="HEIC encoding is not available in the browser">HEIC</button><button className={`format-option ${moreFormats ? "selected" : ""}`} type="button" aria-expanded={moreFormats} onClick={() => setMoreFormats(value => !value)}>More...</button></div>{moreFormats && <p className="more-format-note">ICO embeds a PNG icon. SVG wraps the raster image. PDF creates a one-page image document. HEIC output is unavailable in this browser.</p>}<div className="quality-panel"><div className="quality-label"><label htmlFor="quality">Quality</label><span><strong>{quality}%</strong></span></div><input id="quality" type="range" min="1" max="100" value={quality} onChange={event => setQuality(Number(event.target.value))} style={{ "--range-progress": `${quality}%` } as React.CSSProperties} /><div className="range-labels"><span>Smaller file</span><span>Best quality</span></div></div><div className="format-note">{["png","gif","bmp","tiff","ico"].includes(format) ? `${format.toUpperCase()} output is lossless; the quality setting does not affect it.` : format === "svg" ? "SVG output contains your image as an embedded raster." : format === "pdf" ? "PDF output places your image on a single page." : `${format.toUpperCase()} keeps the original filename with a .${formatOptions.find(option => option.id === format)?.extension} extension.`}</div><div className="panel-actions"><button className="convert-button" type="button" onClick={convertAll} disabled={!items.some(item => item.status === "ready")}>Convert {items.length ? `${items.length} file${items.length === 1 ? "" : "s"}` : "images"} to {format.toUpperCase()} <b>→</b></button>{format === "pdf" && <button className="zip-button combined-pdf-button" type="button" onClick={() => void downloadCombinedPdf()} disabled={!items.some(item => item.preview) || buildingPdf}>{buildingPdf ? "Preparing combined PDF..." : `Download all as one PDF (${items.length} images)`}</button>}{completed.length > 0 && <button className="zip-button" type="button" onClick={() => void downloadAll()}>Download all as ZIP <span>({completed.length})</span></button>}</div></aside>
        </div>
        <div className="privacy-footer" id="privacy"><span className="privacy-lock">*</span><p><strong>Your images stay yours.</strong> PixelShift processes everything locally in your browser. No uploads, no accounts, no compromises.</p><span className="saved-summary">{completed.length ? `${formatBytes(totalSaved)} saved` : "Private by design"}</span></div>
      </section>
      <div className="page-bottom"><span>PIXELSHIFT © 2025</span><span>MADE FOR THE OPEN WEB</span><span>LIGHTER FILES, FASTER DAYS</span></div>
    </main>
  );
}
