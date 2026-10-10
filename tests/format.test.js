import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bands, tierLabel, scalar, money, gbp, vmName } from '../site/js/format.js';

test('bands splits usage across price tiers', () => {
  const tiers = [[0, 0], [100, 0.06], [10100, 0.05]];
  assert.deepEqual(bands(50, tiers).map((b) => [b.q, b.p]), [[50, 0]]);
  assert.deepEqual(bands(500, tiers).map((b) => [b.q, b.p]), [[100, 0], [400, 0.06]]);
  assert.deepEqual(bands(20000, tiers).map((b) => [b.q, b.p]), [[100, 0], [10000, 0.06], [9900, 0.05]]);
});

test('bands treats a single number as one flat tier', () => {
  assert.deepEqual(bands(42, 0.5).map((b) => [b.q, b.p]), [[42, 0.5]]);
  assert.equal(bands(0, [[0, 1], [10, 2]]).length, 0);
});

test('tier labels read naturally', () => {
  assert.equal(tierLabel({ lo: 0, hi: 100 }, 'GB'), 'first 100 GB');
  assert.equal(tierLabel({ lo: 100, hi: 10100 }, 'GB'), '100–10,100 GB');
  assert.equal(tierLabel({ lo: 10100, hi: Infinity }, 'GB'), 'above 10,100 GB');
});

test('scalar reads the first paid rate of a tiered price', () => {
  assert.equal(scalar(0.25), 0.25);
  assert.equal(scalar([[0, 0.3], [25, 0.07]]), 0.3);
  assert.equal(scalar(undefined), 0);
});

test('money keeps enough decimals for small hourly rates', () => {
  assert.equal(money(0.003774), '£0.003774');
  assert.equal(money(0.1585), '£0.1585');
  assert.equal(money(1.2884), '£1.2884');
  assert.equal(money(2566.134571), '£2,566.13');
  assert.equal(gbp(1234.5), '£1,234.50');
  assert.equal(gbp(-5), '−£5.00');
});

test('VM names drop the Standard_ prefix', () => {
  assert.equal(vmName('Standard_D4s_v5'), 'D4s v5');
});
