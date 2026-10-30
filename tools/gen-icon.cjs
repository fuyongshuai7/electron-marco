// 依據 App.vue 的 .brand-logo 生成應用程式圖示（無外部依賴，僅用 Node 內建 zlib）。
// 圓角矩形 + 135° 漸變(#6d8cff -> #46e0c8) + 白色 M。
// 輸出多尺寸 ICO（BMP 條目，相容 rcedit / electron-winstaller）。
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const SS = 4 // 超取樣倍率，用於抗鋸齒

const cA = [0x6d, 0x8c, 0xff] // --accent
const cB = [0x46, 0xe0, 0xc8] // --accent-2

function renderHiRes(size) {
  const S = size * SS
  const r = S / 3 // 對應 24px 設計下的 8px 圓角
  const m = S * 0.26
  const left = m
  const right = S - m
  const midX = S / 2
  const top = S * 0.28
  const bottom = S * 0.74
  const halfStroke = S * 0.075
  const poly = [
    [left, bottom],
    [left, top],
    [midX, bottom],
    [right, top],
    [right, bottom],
  ]

  const buf = new Float32Array(S * S * 4)
  const bx = S / 2 - r
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const dx = Math.abs(x + 0.5 - S / 2) - bx
      const dy = Math.abs(y + 0.5 - S / 2) - bx
      const ox = Math.max(dx, 0)
      const oy = Math.max(dy, 0)
      if (Math.sqrt(ox * ox + oy * oy) - r > 0) continue // 圓角外透明

      const t = Math.max(0, Math.min(1, (x + y) / (2 * (S - 1))))
      let cr = cA[0] + (cB[0] - cA[0]) * t
      let cg = cA[1] + (cB[1] - cA[1]) * t
      let cb = cA[2] + (cB[2] - cA[2]) * t

      let dm = Infinity
      for (let k = 0; k < poly.length - 1; k++) {
        const [x1, y1] = poly[k]
        const [x2, y2] = poly[k + 1]
        const vx = x2 - x1
        const vy = y2 - y1
        const len2 = vx * vx + vy * vy
        let tt = len2 ? ((x - x1) * vx + (y - y1) * vy) / len2 : 0
        tt = Math.max(0, Math.min(1, tt))
        const px = x1 + tt * vx
        const py = y1 + tt * vy
        const d = Math.hypot(x - px, y - py)
        if (d < dm) dm = d
      }
      if (dm <= halfStroke) {
        cr = 255
        cg = 255
        cb = 255
      }

      buf[i] = cr
      buf[i + 1] = cg
      buf[i + 2] = cb
      buf[i + 3] = 1
    }
  }
  return { buf, S }
}

// 以預乘 alpha 方式降採樣到輸出尺寸
function render(size) {
  const { buf, S } = renderHiRes(size)
  const out = Buffer.alloc(size * size * 4)
  const n = SS * SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sa = 0
      let sr = 0
      let sg = 0
      let sb = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4
          const a = buf[i + 3]
          sa += a
          sr += buf[i] * a
          sg += buf[i + 1] * a
          sb += buf[i + 2] * a
        }
      }
      const o = (y * size + x) * 4
      if (sa > 0) {
        out[o] = Math.round(sr / sa)
        out[o + 1] = Math.round(sg / sa)
        out[o + 2] = Math.round(sb / sa)
        out[o + 3] = Math.round((sa / n) * 255)
      }
    }
  }
  return out
}

// ---- PNG 編碼（用於 icon.png） ----
function crc32(bufIn) {
  const table = crc32.table || (crc32.table = (() => {
    const t = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < bufIn.length; i++) crc = table[(crc ^ bufIn[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, y * size * 4 + size * 4)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- ICO 的 DIB(BMP) 條目 ----
function encodeDIB(size, rgba) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0) // biSize
  header.writeInt32LE(size, 4) // biWidth
  header.writeInt32LE(size * 2, 8) // biHeight（含 AND mask）
  header.writeUInt16LE(1, 12) // biPlanes
  header.writeUInt16LE(32, 14) // biBitCount
  header.writeUInt32LE(0, 16) // BI_RGB
  header.writeUInt32LE(size * size * 4, 20)

  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    const srcRow = size - 1 - y // BMP 由下往上
    for (let x = 0; x < size; x++) {
      const s = (srcRow * size + x) * 4
      const d = (y * size + x) * 4
      pixels[d] = rgba[s + 2] // B
      pixels[d + 1] = rgba[s + 1] // G
      pixels[d + 2] = rgba[s] // R
      pixels[d + 3] = rgba[s + 3] // A
    }
  }

  const maskRow = Math.ceil(size / 32) * 4
  const mask = Buffer.alloc(maskRow * size) // 全 0 = 不透明，交由 alpha 控制

  return Buffer.concat([header, pixels, mask])
}

function encodeICO() {
  const entries = SIZES.map((size) => ({ size, data: encodeDIB(size, render(size)) }))

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  entries.forEach((entry, i) => {
    const p = i * 16
    dir[p] = entry.size >= 256 ? 0 : entry.size
    dir[p + 1] = entry.size >= 256 ? 0 : entry.size
    dir[p + 2] = 0
    dir[p + 3] = 0
    dir.writeUInt16LE(1, p + 4)
    dir.writeUInt16LE(32, p + 6)
    dir.writeUInt32LE(entry.data.length, p + 8)
    dir.writeUInt32LE(offset, p + 12)
    offset += entry.data.length
  })

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)])
}

const outDir = path.resolve(__dirname, '..', 'build')
fs.mkdirSync(outDir, { recursive: true })
const ico = encodeICO()
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
fs.writeFileSync(path.join(outDir, 'icon.png'), encodePNG(256, render(256)))
console.log(
  `generated build/icon.ico (${SIZES.join('/')}, ${(ico.length / 1024).toFixed(1)} KB) and build/icon.png`
)
