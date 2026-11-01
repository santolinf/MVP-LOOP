// QR Code encoder (ISO/IEC 18004) with no dependency: byte mode, error correction level M, versions 1-40, automatic
// mask selection. Used to show the authenticator setup link as a scannable code on the admin sign-in page.

/** Error-correction codewords per block, level M, indexed by version (index 0 unused). */
const ECC_PER_BLOCK = [
  0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
/** Number of error-correction blocks, level M, indexed by version (index 0 unused). */
const NUM_BLOCKS = [
  0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37,
  38, 40, 43, 45, 47, 49,
];
/** Format-information bits for level M. */
const ECC_FORMAT_BITS_M = 0;

const at = (arr: readonly number[], i: number): number => {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`Index ${i} out of range`);
  return v;
};
const bit = (x: number, i: number): boolean => ((x >>> i) & 1) !== 0;

function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (ver: number): number => Math.floor(rawDataModules(ver) / 8) - at(ECC_PER_BLOCK, ver) * at(NUM_BLOCKS, ver);

// --- Reed-Solomon over GF(256), polynomial 0x11D ----------------------------------------------------------------------

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(at(result, j), root);
      if (j + 1 < result.length) result[j] = at(result, j) ^ at(result, j + 1);
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] = at(result, i) ^ gfMul(at(divisor, i), factor);
  }
  return result;
}

// --- Encoder -----------------------------------------------------------------------------------------------------------

/** Encodes text as a QR code. Returns the module grid, `true` = dark, indexed [row][column]. */
export function encodeQr(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));

  let ver = 1;
  for (; ; ver++) {
    if (ver > 40) throw new RangeError("Text too long for a QR code");
    const ccBits = ver < 10 ? 8 : 16;
    if (bytes.length < 1 << ccBits && 4 + ccBits + 8 * bytes.length <= dataCodewords(ver) * 8) break;
  }

  // Data bits: byte-mode indicator, character count, the bytes, terminator, padding.
  const bits: number[] = [];
  const push = (val: number, len: number): void => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCodewords(ver) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));

  // Split into blocks, add error correction, interleave.
  const numBlocks = at(NUM_BLOCKS, ver);
  const eccLen = at(ECC_PER_BLOCK, ver);
  const rawCodewords = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0); // placeholder so every block has the same length; skipped below
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  const blockLen = blocks[0]?.length ?? 0;
  for (let i = 0; i < blockLen; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) codewords.push(at(block, i));
    });
  }

  // Grid with function patterns.
  const size = ver * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const get = (x: number, y: number): boolean => modules[y]?.[x] ?? false;
  const fnAt = (x: number, y: number): boolean => isFn[y]?.[x] ?? false;
  const set = (x: number, y: number, dark: boolean): void => {
    const row = modules[y];
    if (row) row[x] = dark;
  };
  const setFn = (x: number, y: number, dark: boolean): void => {
    set(x, y, dark);
    const row = isFn[y];
    if (row) row[x] = true;
  };

  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number): void => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  if (ver > 1) {
    const numAlign = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < numAlign; p -= step) pos.splice(1, 0, p);
    const last = pos.length - 1;
    pos.forEach((ax, i) =>
      pos.forEach((ay, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
  }

  const drawFormat = (mask: number): void => {
    const d = (ECC_FORMAT_BITS_M << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(f, i));
    setFn(8, 7, bit(f, 6));
    setFn(8, 8, bit(f, 7));
    setFn(7, 8, bit(f, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(f, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(f, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(f, i));
    setFn(8, size - 8, true);
  };
  drawFormat(0); // reserve the area; redrawn with the chosen mask

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, bit(v, i));
      setFn(b, a, bit(v, i));
    }
  }

  // Codewords, in the zig-zag order.
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fnAt(x, y) && n < codewords.length * 8) {
          set(x, y, bit(at(codewords, n >>> 3), 7 - (n & 7)));
          n++;
        }
      }
  }

  const masked = (m: number, x: number, y: number): boolean => {
    switch (m) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  };
  const applyMask = (m: number): void => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fnAt(x, y) && masked(m, x, y)) set(x, y, !get(x, y));
  };

  const penalty = (): number => {
    let p = 0;
    // Rule 1: runs of 5+ same-colour modules in a row or column.
    for (let a = 0; a < size; a++)
      for (const horizontal of [true, false]) {
        let run = 1;
        for (let b = 1; b <= size; b++) {
          const same =
            b < size && (horizontal ? get(b, a) === get(b - 1, a) : get(a, b) === get(a, b - 1));
          if (same) run++;
          else {
            if (run >= 5) p += run - 2;
            run = 1;
          }
        }
      }
    // Rule 2: 2x2 blocks of one colour.
    for (let y = 0; y < size - 1; y++)
      for (let x = 0; x < size - 1; x++) {
        const c = get(x, y);
        if (c === get(x + 1, y) && c === get(x, y + 1) && c === get(x + 1, y + 1)) p += 3;
      }
    // Rule 3: finder-like 1:1:3:1:1 patterns with four light modules on one side.
    const pattern = [true, false, true, true, true, false, true];
    for (let a = 0; a < size; a++)
      for (let b = 0; b + 7 <= size; b++)
        for (const horizontal of [true, false]) {
          const m = (k: number): boolean => (horizontal ? get(k, a) : get(a, k));
          if (!pattern.every((v, k) => m(b + k) === v)) continue;
          const lightBefore = [1, 2, 3, 4].every((k) => b - k < 0 || !m(b - k));
          const lightAfter = [0, 1, 2, 3].every((k) => b + 7 + k >= size || !m(b + 7 + k));
          if (lightBefore || lightAfter) p += 40;
        }
    // Rule 4: balance of dark and light.
    let dark = 0;
    for (const row of modules) for (const c of row) if (c) dark++;
    const total = size * size;
    p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return p;
  };

  let best = 0;
  let bestPenalty = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const p = penalty();
    if (p < bestPenalty) {
      best = m;
      bestPenalty = p;
    }
    applyMask(m); // XOR again undoes it
  }
  applyMask(best);
  drawFormat(best);
  return modules;
}
