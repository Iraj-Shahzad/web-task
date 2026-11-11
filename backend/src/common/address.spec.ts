import { normalizeAddress, parseAddress } from './address';

describe('address', () => {
  it.each([
    ['tidepool.zz', 'tidepool.zz'],
    ['  TidePool.ZZ  ', 'tidepool.zz'],
    ['small://tidepool.zz/', 'tidepool.zz'],
    ['SMALL://Tidepool.zz//', 'tidepool.zz'],
    ['spice-route.zz', 'spice-route.zz'],
    ['a.b.c.zz', 'a.b.c.zz'],
  ])('accepts %j as %j', (raw, canon) => {
    expect(normalizeAddress(raw)).toBe(canon);
  });

  it.each([
    '',
    '   ',
    'tidepool',
    'tidepool.',
    '.zz',
    'tide pool.zz',
    '-tide.zz',
    'tide-.zz',
    'tide..zz',
    'tidepool.z',
    'tidepool.zz/page',
    'https://tidepool.zz',
    'http://tidepool.zz',
    'javascript:alert(1)',
    'tidepool.zz?x=1',
    'tidepool.zz#top',
    'ti\u0000de.zz',
    'x'.repeat(64) + '.zz',
    'a.'.repeat(60) + 'zz',
  ])('rejects %j', (raw) => {
    expect(parseAddress(raw).ok).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(parseAddress(undefined).ok).toBe(false);
    expect(parseAddress(42).ok).toBe(false);
    expect(parseAddress({ toString: () => 'tidepool.zz' }).ok).toBe(false);
  });
});
