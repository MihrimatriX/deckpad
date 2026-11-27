// Izgara yerleşimi. React'tan bağımsız; test edilebilir.

/** Tuşlar arası boşluk. */
export const GAP = 12;

/** Dikeyde tuş, genişliğinin en çok bu katı kadar uzar; daha uzunu tuş hissini bozar. */
export const MAX_KEY_ASPECT = 1.4;

/**
 * Izgarayı kutuya sığdırır. `size` tuş genişliği, `height` tuş yüksekliğidir.
 * Dikeyde genişlik sınırlayıcıdır; artan yükseklik tuşlara verilir (en çok MAX_KEY_ASPECT kat), böylece
 * telefonda ızgaranın üstünde ve altında büyük boşluk kalmaz, basılacak yüzey büyür.
 */
export function fitGrid(w: number, h: number, pageCols: number, pageRows: number, count: number) {
  if (!w || !h) return { size: 0, height: 0, cols: pageCols };
  const across = (c: number) => (w - (c - 1) * GAP) / c;
  const down = (r: number) => (h - (r - 1) * GAP) / r;
  const sizeFor = (c: number, r: number) => Math.floor(Math.min(across(c), down(r)));
  const portraitSize = sizeFor(pageCols, pageRows);
  if (w <= h * 1.15 || count === 0) {
    const size = Math.max(40, portraitSize);
    const height = Math.max(size, Math.min(Math.floor(down(pageRows)), Math.floor(size * MAX_KEY_ASPECT)));
    return { size, height, cols: pageCols };
  }
  let best = { size: portraitSize, cols: pageCols };
  for (let c = pageCols; c <= Math.max(pageCols, count); c++) {
    const sz = sizeFor(c, Math.max(1, Math.ceil(count / c)));
    if (sz > best.size) best = { size: sz, cols: c };
  }
  const size = Math.max(40, best.size);
  return { size, height: size, cols: best.cols };
}
