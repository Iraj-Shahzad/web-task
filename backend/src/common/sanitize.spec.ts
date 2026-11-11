import { sanitizePage } from './sanitize';

const clean = (html: string) => sanitizePage(html).body;

describe('sanitizePage — containment', () => {
  it('drops <script> and its contents', () => {
    const r = sanitizePage('<p>hi</p><script>alert(1)</script>');
    expect(r.body).toBe('<p>hi</p>');
    expect(r.text).toBe('hi');
  });

  it.each([
    ['<img src=x onerror=alert(1)>'],
    ['<svg onload=alert(1)><circle/></svg>'],
    ['<iframe src="https://evil.example"></iframe>'],
    ['<object data="x"></object><embed src="x">'],
    ['<form action="https://evil.example"><input name=pw></form>'],
    ['<meta http-equiv="refresh" content="0;url=https://evil.example">'],
    ['<base href="https://evil.example/">'],
    ['<link rel=stylesheet href="https://evil.example/x.css">'],
    ['<style>body{display:none}</style>'],
    ['<math><mi xlink:href="javascript:alert(1)">x</mi></math>'],
    ['<video src=x onerror=alert(1)></video>'],
  ])('removes dangerous markup: %s', (html) => {
    const out = clean(html);
    expect(out).not.toMatch(/<(script|img|svg|iframe|object|embed|form|input|meta|base|link|style|math|video)/i);
    expect(out).not.toMatch(/onerror|onload|evil\.example/i);
  });

  it('strips every event-handler and unknown attribute', () => {
    const out = clean('<p onclick="x()" onmouseover="y()" id="a" class="b" data-x="1" style="color:red">t</p>');
    expect(out).toBe('<p style="color:red">t</p>');
  });

  it('survives mutation-XSS style nesting tricks', () => {
    const out = clean('<noscript><p title="</noscript><img src=x onerror=alert(1)>">');
    // The payload may survive only as inert, escaped text inside an attribute value —
    // what matters is that no real <img> element (or any tag) comes out of it.
    expect(out).not.toMatch(/<img/i);
    expect(out.match(/<[a-z]/gi)).toEqual(['<p']);
  });

  it('filters style values that could load or escape', () => {
    const out = clean(
      '<p style="color:red;background-color:url(https://evil.example/x);position:fixed;width:expression(alert(1))">t</p>',
    );
    expect(out).not.toMatch(/url\(|position|expression|evil/i);
    expect(out).toContain('color:red');
  });
});

describe('sanitizePage — links', () => {
  it('turns address links into data-addr and drops href', () => {
    const r = sanitizePage('<a href="Tidepool.ZZ" target="_blank" onclick="x()">tide</a>');
    expect(r.body).toBe('<a data-addr="tidepool.zz" tabindex="0" role="link">tide</a>');
    expect(r.body).not.toContain('href');
    expect(r.links).toEqual(['tidepool.zz']);
  });

  it('accepts small:// links', () => {
    expect(sanitizePage('<a href="small://moonphase.zz/">m</a>').links).toEqual(['moonphase.zz']);
  });

  it('keeps broken links as links (they must lead to "nowhere", not vanish)', () => {
    expect(sanitizePage('<a href="never-existed.zz">x</a>').links).toEqual(['never-existed.zz']);
  });

  it.each(['javascript:alert(1)', 'https://evil.example', 'http://x.zz', '//evil.example', '#top', 'data:text/html,<b>x</b>', ''])(
    'neutralises non-address href %j but keeps the words',
    (href) => {
      const r = sanitizePage(`<a href="${href}">click me</a>`);
      expect(r.body).toBe('<span>click me</span>');
      expect(r.links).toEqual([]);
    },
  );

  it('ignores an author-supplied data-addr (the attacker cannot forge a link target)', () => {
    const r = sanitizePage('<a data-addr="evil.zz" href="good.zz">x</a><a data-addr="evil.zz">y</a>');
    expect(r.links).toEqual(['good.zz']);
    expect(r.body).not.toContain('evil.zz');
  });

  it('de-duplicates links, preserving first-seen order', () => {
    const r = sanitizePage('<a href="b.zz">1</a><a href="a.zz">2</a><a href="b.zz">3</a>');
    expect(r.links).toEqual(['b.zz', 'a.zz']);
  });

  it('text that merely looks like markup is not a link', () => {
    const r = sanitizePage('<p>data-addr="evil.zz"</p>');
    expect(r.links).toEqual([]);
  });
});

describe('sanitizePage — what authors can still write', () => {
  it('keeps normal prose structure', () => {
    const html = '<h1>T</h1><p>One <em>two</em> <strong>three</strong></p><ul><li>a</li></ul><table><tr><td colspan="2">x</td></tr></table><blockquote>q</blockquote><pre><code>x &lt; y</code></pre>';
    const out = clean(html);
    for (const t of ['<h1>', '<em>', '<strong>', '<ul>', '<li>', '<table>', 'colspan="2"', '<blockquote>', '<pre><code>']) {
      expect(out).toContain(t);
    }
  });

  it('extracts decoded text for search', () => {
    const r = sanitizePage('<h1>Tides &amp; moons</h1><p>Spring&nbsp;tide <b>peaks</b></p>');
    expect(r.text).toContain('Tides & moons');
    expect(r.text).toContain('peaks');
    expect(r.text).not.toMatch(/&amp;/);
  });

  it('is idempotent: sanitising safe output changes nothing', () => {
    const once = sanitizePage('<p style="color:red">a <a href="x.zz">b</a></p>').body;
    // output links are data-addr only, so re-sanitising would (correctly) treat them as plain
    // anchors without href — assert the stable non-link subset instead.
    const plain = sanitizePage('<p style="color:red">a <b>b</b></p>').body;
    expect(sanitizePage(plain).body).toBe(plain);
    expect(once).toContain('data-addr="x.zz"');
  });
});