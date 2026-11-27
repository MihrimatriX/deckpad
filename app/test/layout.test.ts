// Izgara yerleşimi: dikey telefonda tuşlar uzar, yatayda kare kalır.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitGrid, GAP, MAX_KEY_ASPECT } from '../src/deck/layout';

test('dikey telefonda boş yükseklik tuşları uzatır, sınırı aşmaz', () => {
  // 390×844 telefonda 4×4 sayfa: genişlik sınırlayıcı.
  const r = fitGrid(330, 640, 4, 4, 15);
  assert.equal(r.cols, 4);
  assert.equal(r.size, Math.floor((330 - 3 * GAP) / 4));
  assert.ok(r.height > r.size, 'tuş uzamalı');
  assert.ok(r.height <= Math.floor(r.size * MAX_KEY_ASPECT));
  assert.ok(4 * r.height + 3 * GAP <= 640, 'ızgara kutuya sığmalı');
});

test('yükseklik dar olduğunda tuş kare kalır', () => {
  const r = fitGrid(330, 330, 4, 4, 16);
  assert.equal(r.height, r.size);
});

test('yatayda kare tuşlar ve daha çok sütun', () => {
  const r = fitGrid(840, 430, 4, 4, 15);
  assert.equal(r.height, r.size);
  assert.ok(r.cols > 4);
});
