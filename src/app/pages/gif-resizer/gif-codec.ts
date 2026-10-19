// Small, dependency-free GIF89a decoder + encoder used by the GIF tools.
// Decoder: parses header, GCE delays, disposal methods, interlacing, transparency,
// NETSCAPE loop count. Encoder: median-cut quantization, LZW compression.

export interface GifFrameInput {
  data: Uint8ClampedArray; // RGBA, width*height*4
  delayMs: number;
}

export interface DecodedGifFrame extends GifFrameInput {
  width: number;
  height: number;
}

export interface DecodedGif {
  width: number;
  height: number;
  frames: DecodedGifFrame[];
  loop: number; // 0 = infinite
}

export function decodeGif(bytes: Uint8Array): DecodedGif {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  if (magic !== 'GIF89a' && magic !== 'GIF87a') throw new Error('not-gif');
  const width = dv.getUint16(6, true);
  const height = dv.getUint16(8, true);
  if (width < 1 || height < 1 || width > 4096 || height > 4096) throw new Error('bad-size');
  const packed = bytes[10];
  let pos = 13;
  let gct: Uint8Array | null = null;
  if (packed & 0x80) {
    const n = 3 * (2 << (packed & 7));
    gct = bytes.slice(pos, pos + n);
    pos += n;
  }

  let loop = 0;
  let disposal = 0;
  let delayCs = 0;
  let transIdx = -1;
  const frames: DecodedGifFrame[] = [];
  const canvas = new Uint8ClampedArray(width * height * 4);
  let prev: Uint8ClampedArray | null = null;

  const skipSubBlocks = () => {
    let n = bytes[pos++];
    while (n > 0) {
      pos += n;
      n = bytes[pos++];
    }
  };
  const readSubBlocks = (): Uint8Array => {
    const parts: number[] = [];
    let n = bytes[pos++];
    while (n > 0) {
      for (let i = 0; i < n; i++) parts.push(bytes[pos + i]);
      pos += n;
      n = bytes[pos++];
    }
    return new Uint8Array(parts);
  };

  while (pos < bytes.length) {
    const sep = bytes[pos++];
    if (sep === 0x3b) break;
    if (sep === 0x21) {
      const label = bytes[pos++];
      if (label === 0xf9) {
        pos++; // block size (4)
        const p = bytes[pos++];
        delayCs = dv.getUint16(pos, true);
        pos += 2;
        const ti = bytes[pos++];
        pos++; // terminator
        disposal = (p >> 2) & 7;
        transIdx = p & 1 ? ti : -1;
      } else if (label === 0xff) {
        pos++; // 11
        const appId = String.fromCharCode(...bytes.slice(pos, pos + 8));
        pos += 11;
        const data = readSubBlocks();
        if (appId.startsWith('NETSCAPE') && data.length >= 3) {
          loop = data[1] | (data[2] << 8);
        }
      } else {
        skipSubBlocks();
      }
    } else if (sep === 0x2c) {
      const left = dv.getUint16(pos, true);
      const top = dv.getUint16(pos + 2, true);
      const w = dv.getUint16(pos + 4, true);
      const h = dv.getUint16(pos + 6, true);
      const ip = bytes[pos + 8];
      pos += 9;
      let ct = gct;
      if (ip & 0x80) {
        const n = 3 * (2 << (ip & 7));
        ct = bytes.slice(pos, pos + n);
        pos += n;
      }
      if (!ct) throw new Error('no-palette');
      const minCode = bytes[pos++];
      const data = readSubBlocks();
      const indices = lzwDecode(data, minCode, w * h);
      const interlaced = (ip & 0x40) !== 0;
      const rowMap = new Array<number>(h);
      if (interlaced) {
        const ps = [0, 4, 2, 1];
        const st = [8, 8, 4, 2];
        let k = 0;
        for (let p = 0; p < 4; p++) for (let r = ps[p]; r < h; r += st[p]) rowMap[k++] = r;
      } else {
        for (let r = 0; r < h; r++) rowMap[r] = r;
      }
      if (disposal === 3) prev = canvas.slice();
      for (let sy = 0; sy < h; sy++) {
        const dy = top + rowMap[sy];
        if (dy < 0 || dy >= height) continue;
        for (let x = 0; x < w; x++) {
          const dx = left + x;
          if (dx < 0 || dx >= width) continue;
          const idx = indices[sy * w + x];
          if (idx === transIdx) continue;
          const o = (dy * width + dx) * 4;
          canvas[o] = ct[idx * 3];
          canvas[o + 1] = ct[idx * 3 + 1];
          canvas[o + 2] = ct[idx * 3 + 2];
          canvas[o + 3] = 255;
        }
      }
      frames.push({ width, height, data: canvas.slice(), delayMs: Math.max(0, delayCs * 10) });
      if (disposal === 2) {
        for (let y = top; y < Math.min(height, top + h); y++) {
          for (let x = left; x < Math.min(width, left + w); x++) {
            canvas[(y * width + x) * 4 + 3] = 0;
          }
        }
      } else if (disposal === 3 && prev) {
        canvas.set(prev);
      }
      disposal = 0;
      delayCs = 0;
      transIdx = -1;
      prev = null;
    } else {
      break;
    }
  }
  if (frames.length === 0) throw new Error('no-frames');
  return { width, height, frames, loop };
}

export async function encodeGif(
  width: number,
  height: number,
  frames: GifFrameInput[],
  opts: { loop?: number; maxColors?: number; onProgress?: (p: number) => void } = {}
): Promise<Uint8Array> {
  const maxColors = opts.maxColors === 128 ? 128 : 256;
  const loop = opts.loop ?? 0;
  const onProgress = opts.onProgress;
  const palette = medianCut(samplePixels(frames), maxColors);
  const out: number[] = [];
  const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
  out.push(...ascii('GIF89a'));
  const gctSize = maxColors === 128 ? 0xf6 : 0xf7;
  out.push(width & 0xff, (width >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff, 0x80 | gctSize, 0, 0);
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || palette[palette.length - 1];
    out.push(c[0], c[1], c[2]);
  }
  out.push(0x21, 0xff, 0x0b, ...ascii('NETSCAPE2.0'), 0x03, 0x01, loop & 0xff, (loop >> 8) & 0xff, 0x00);
  const minCode = maxColors === 128 ? 7 : 8;
  for (let f = 0; f < frames.length; f++) {
    const indices = mapToPalette(frames[f].data, palette);
    const delay = Math.max(2, Math.min(65535, Math.round(frames[f].delayMs / 10)));
    out.push(0x21, 0xf9, 0x04, 0x00, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00);
    out.push(0x2c, 0, 0, 0, 0, width & 0xff, (width >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff, 0x00);
    const lzw = lzwEncode(indices, minCode);
    out.push(minCode, ...subBlocks(lzw));
    if (onProgress && f % 4 === 0) {
      onProgress(f / frames.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  out.push(0x3b);
  if (onProgress) onProgress(1);
  return new Uint8Array(out);
}

function samplePixels(frames: GifFrameInput[]): Uint8Array {
  const target = 30000;
  let total = 0;
  for (const f of frames) total += f.data.length / 4;
  const stride = Math.max(1, Math.floor(total / target));
  const triples: number[] = [];
  let count = 0;
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < d.length && count < target; i += 4 * stride) {
      triples.push(d[i], d[i + 1], d[i + 2]);
      count++;
    }
    if (count >= target) break;
  }
  return new Uint8Array(triples);
}

function medianCut(pixels: Uint8Array, maxColors: number): [number, number, number][] {
  let boxes: number[][] = [Array.from({ length: pixels.length / 3 }, (_, i) => i)];
  const ranges = (box: number[]) => {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (const idx of box) {
      const r = pixels[idx * 3], g = pixels[idx * 3 + 1], b = pixels[idx * 3 + 2];
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      if (g < gMin) gMin = g; if (g > gMax) gMax = g;
      if (b < bMin) bMin = b; if (b > bMax) bMax = b;
    }
    return { rMin, rMax, gMin, gMax, bMin, bMax };
  };
  while (boxes.length < maxColors) {
    let best = -1;
    let bestScore = 0;
    for (let bi = 0; bi < boxes.length; bi++) {
      const b = boxes[bi];
      if (b.length < 2) continue;
      const rg = ranges(b);
      const range = Math.max(rg.rMax - rg.rMin, rg.gMax - rg.gMin, rg.bMax - rg.bMin);
      const score = range * Math.log(b.length + 1);
      if (score > bestScore) {
        bestScore = score;
        best = bi;
      }
    }
    if (best < 0) break;
    const box = boxes[best];
    const rg = ranges(box);
    const ch = rg.rMax - rg.rMin >= rg.gMax - rg.gMin && rg.rMax - rg.rMin >= rg.bMax - rg.bMin
      ? 0 : rg.gMax - rg.gMin >= rg.bMax - rg.bMin ? 1 : 2;
    box.sort((a, b) => pixels[a * 3 + ch] - pixels[b * 3 + ch]);
    const mid = Math.floor(box.length / 2);
    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }
  const palette: [number, number, number][] = boxes.map((b) => {
    let r = 0, g = 0, bl = 0;
    for (const idx of b) {
      r += pixels[idx * 3];
      g += pixels[idx * 3 + 1];
      bl += pixels[idx * 3 + 2];
    }
    const n = Math.max(1, b.length);
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  });
  while (palette.length < maxColors) palette.push(palette[palette.length - 1]);
  return palette;
}

function mapToPalette(data: Uint8ClampedArray, palette: [number, number, number][]): number[] {
  const cache = new Map<number, number>();
  const n = palette.length;
  const out = new Array<number>(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r << 16) | (g << 8) | b;
    let idx = cache.get(key);
    if (idx === undefined) {
      let best = 0;
      let bestD = Infinity;
      for (let p = 0; p < n; p++) {
        const c = palette[p];
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        const dd = dr * dr + dg * dg + db * db;
        if (dd < bestD) {
          bestD = dd;
          best = p;
        }
      }
      idx = best;
      cache.set(key, idx);
    }
    out[j] = idx;
  }
  return out;
}

function lzwEncode(indices: number[], minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const dict = new Map<string, number>();
  const reset = () => {
    dict.clear();
    for (let i = 0; i < clearCode; i++) dict.set(String.fromCharCode(i), i);
  };
  reset();
  let nextCode = eoiCode + 1;
  let codeSize = minCodeSize + 1;
  let maxCode = 1 << codeSize;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  const emit = (code: number) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(buffer & 0xff);
      buffer >>= 8;
      bits -= 8;
    }
  };
  emit(clearCode);
  let w = String.fromCharCode(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const k = String.fromCharCode(indices[i]);
    const wk = w + k;
    if (dict.has(wk)) {
      w = wk;
    } else {
      emit(dict.get(w) as number);
      if (nextCode < 4096) {
        dict.set(wk, nextCode++);
        if (nextCode > maxCode && codeSize < 12) {
          codeSize++;
          maxCode <<= 1;
        }
      } else {
        emit(clearCode);
        reset();
        nextCode = eoiCode + 1;
        codeSize = minCodeSize + 1;
        maxCode = 1 << codeSize;
      }
      w = k;
    }
  }
  emit(dict.get(w) as number);
  emit(eoiCode);
  if (bits > 0) bytes.push(buffer & 0xff);
  return bytes;
}

function subBlocks(data: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

function lzwDecode(data: Uint8Array, minCode: number, expected: number): Uint8Array {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  for (let i = 0; i < clear; i++) suffix[i] = i;
  const out = new Uint8Array(expected);
  let outPos = 0;
  let codeSize = minCode + 1;
  let next = eoi + 1;
  let datum = 0;
  let bits = 0;
  let dataPos = 0;
  const readCode = (): number => {
    while (bits < codeSize) {
      datum |= (dataPos < data.length ? data[dataPos++] : 0) << bits;
      bits += 8;
    }
    const c = datum & ((1 << codeSize) - 1);
    datum >>= codeSize;
    bits -= codeSize;
    return c;
  };
  let oldCode = -1;
  let firstChar = 0;
  let code = readCode();
  let guard = 0;
  while (guard++ < expected * 4 + 4096) {
    if (code === clear) {
      codeSize = minCode + 1;
      next = eoi + 1;
      oldCode = -1;
      code = readCode();
      if (code === eoi) break;
    }
    if (code === eoi) break;
    const inCode = code;
    let stackPtr = 0;
    if (code >= next) {
      stack[stackPtr++] = firstChar;
      code = oldCode;
    }
    while (code >= clear) {
      stack[stackPtr++] = suffix[code];
      code = prefix[code];
    }
    firstChar = suffix[code];
    stack[stackPtr++] = firstChar;
    while (stackPtr > 0 && outPos < expected) {
      out[outPos++] = stack[--stackPtr];
    }
    if (next < 4096 && oldCode !== -1) {
      prefix[next] = oldCode;
      suffix[next] = firstChar;
      next++;
      if (next >= 1 << codeSize && codeSize < 12) codeSize++;
    }
    oldCode = inCode;
    if (outPos >= expected) break;
    code = readCode();
  }
  return out;
}
