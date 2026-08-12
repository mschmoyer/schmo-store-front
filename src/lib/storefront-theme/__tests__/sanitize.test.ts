/**
 * Adversarial tests for the custom-CSS sanitizer.
 *
 * This is an XSS boundary. Every test here is an attack someone will eventually
 * try: tag breakout, unicode escapes, comment-split keywords, `@charset` tricks,
 * remote `url()`, prototype-ish selectors and scope escape.
 */

import { MAX_CUSTOM_CSS_RULES, sanitizeCustomCss } from '../sanitize';
import { MAX_CUSTOM_CSS_LENGTH } from '../types';

const SCOPE = '.storefront[data-store-id="abc"]';

/**
 * Sanitize with the standard scope.
 * @param css - Input CSS
 * @returns The sanitized CSS string
 */
function clean(css: string): string {
  return sanitizeCustomCss(css, SCOPE).css;
}

describe('tag breakout', () => {
  it('strips a literal </style><script> payload', () => {
    const out = clean('.a { color: red } </style><script>alert(1)</script>');
    expect(out).not.toContain('</style');
    expect(out).not.toContain('<');
    expect(out.toLowerCase()).not.toContain('script>');
  });

  it('strips a breakout hidden inside a content string', () => {
    const out = clean('.a { content: "</style><script>alert(1)</script>"; }');
    expect(out).not.toContain('<');
  });

  it('strips a breakout hidden inside a selector', () => {
    const out = clean('a</style><script>x</script> { color: red }');
    expect(out).not.toContain('<');
  });

  it('strips HTML comment markers', () => {
    const out = clean('<!-- .a { color: red } -->');
    expect(out).not.toContain('<!--');
    expect(out).not.toContain('-->');
  });
});

describe('unicode and CSS escapes', () => {
  it('decodes and then removes an escaped less-than', () => {
    const out = clean('.a { content: "\\3c /style\\3e "; }');
    expect(out).not.toContain('<');
    expect(out).not.toContain('</style');
  });

  it('catches an escaped expression() keyword', () => {
    const out = clean('.a { width: \\65 xpression(alert(1)); }');
    expect(out.toLowerCase()).not.toContain('expression');
    expect(out).not.toContain('width');
  });

  it('catches an escaped javascript: url', () => {
    const out = clean('.a { background: url(\\6a avascript:alert(1)); }');
    expect(out.toLowerCase()).not.toContain('javascript');
    expect(out).not.toContain('background');
  });

  it('catches a zero-padded hex escape', () => {
    const out = clean('.a { width: \\000065 xpression(alert(1)); }');
    expect(out.toLowerCase()).not.toContain('expression');
  });

  it('drops declarations that still contain a backslash after decoding', () => {
    const out = clean('.a { content: "\\\\"; }');
    expect(out).not.toContain('\\');
  });
});

describe('comment tricks', () => {
  it('does not let a comment rejoin a split keyword', () => {
    const out = clean('.a { width: ex/*x*/pression(alert(1)); }');
    expect(out.toLowerCase()).not.toContain('expression');
    expect(out).not.toContain('width');
  });

  it('does not let a comment split @import', () => {
    const out = clean('@im/*x*/port url(https://evil.test/x.css);');
    expect(out.toLowerCase()).not.toContain('import');
    expect(out).not.toContain('evil.test');
  });

  it('treats an unterminated comment as swallowing the rest of the sheet', () => {
    const out = clean('.a { color: red } /* .b { color: blue }');
    expect(out).toContain('color: red');
    expect(out).not.toContain('blue');
  });

  it('keeps comment markers inside strings intact but still safe', () => {
    const out = clean('.a { content: "/* not a comment */"; }');
    expect(out).not.toContain('<');
  });
});

describe('at-rules', () => {
  it('removes @import in every form', () => {
    for (const css of [
      '@import url("https://evil.test/x.css");',
      '@import "evil.css";',
      '@IMPORT url(evil.css);',
      '@import\n  url(evil.css);',
    ]) {
      const out = clean(css);
      expect(out.toLowerCase()).not.toContain('import');
    }
  });

  it('removes @charset tricks', () => {
    const out = clean('@charset "UTF-7"; .a { color: red }');
    expect(out.toLowerCase()).not.toContain('charset');
    expect(out).toContain('color: red');
  });

  it('removes @namespace', () => {
    expect(clean('@namespace svg url(http://www.w3.org/2000/svg);').toLowerCase()).not.toContain(
      'namespace',
    );
  });

  it('removes @font-face, which can pull remote resources', () => {
    const out = clean('@font-face { font-family: x; src: url(https://evil.test/f.woff2); }');
    expect(out.toLowerCase()).not.toContain('font-face');
    expect(out).not.toContain('evil.test');
  });

  it('keeps @media and scopes the rules inside it', () => {
    const out = clean('@media (max-width: 600px) { .a { color: red } }');
    expect(out).toContain('@media (max-width: 600px) {');
    expect(out).toContain(`${SCOPE} .a {`);
  });

  it('keeps @keyframes without scoping the keyframe stops', () => {
    const out = clean('@keyframes fade { from { opacity: 0 } to { opacity: 1 } }');
    expect(out).toContain('@keyframes fade {');
    expect(out).toContain('from {');
    expect(out).toContain('to {');
    expect(out).not.toContain(`${SCOPE} from`);
  });

  it('drops invalid keyframe stops', () => {
    const out = clean('@keyframes fade { body { opacity: 0 } }');
    expect(out).not.toContain('opacity');
  });
});

describe('script vectors', () => {
  it('removes expression()', () => {
    expect(clean('.a { width: expression(alert(1)); }')).not.toContain('width');
  });

  it('removes behavior but keeps scroll-behavior', () => {
    expect(clean('.a { behavior: url(x.htc); }')).not.toContain('behavior');
    expect(clean('.a { scroll-behavior: smooth; }')).toContain('scroll-behavior: smooth');
  });

  it('removes -moz-binding', () => {
    expect(clean('.a { -moz-binding: url(x.xml#y); }')).not.toContain('binding');
  });

  it('removes javascript: and vbscript: urls', () => {
    expect(clean('.a { background: url("javascript:alert(1)"); }')).not.toContain('background');
    expect(clean('.a { background: url(vbscript:msgbox); }')).not.toContain('background');
  });
});

describe('url() policy', () => {
  it('allows same-origin absolute and relative paths', () => {
    expect(clean('.a { background-image: url(/uploads/hero.jpg); }')).toContain('/uploads/hero.jpg');
    expect(clean('.a { background-image: url("./hero.jpg"); }')).toContain('./hero.jpg');
    expect(clean('.a { background-image: url(hero.jpg); }')).toContain('hero.jpg');
  });

  it('allows inline raster data URIs', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(clean(`.a { background-image: url(${png}); }`)).toContain(png);
  });

  it('rejects remote and protocol-relative urls', () => {
    for (const url of [
      'https://evil.test/x.png',
      'http://evil.test/x.png',
      '//evil.test/x.png',
    ]) {
      expect(clean(`.a { background-image: url(${url}); }`)).not.toContain('evil.test');
    }
  });

  it('rejects svg and html data URIs, which can carry script', () => {
    expect(clean('.a { background: url(data:image/svg+xml;base64,PHN2Zz4=); }')).not.toContain(
      'svg+xml',
    );
    expect(clean('.a { background: url(data:text/html;base64,PHNjcmlwdD4=); }')).not.toContain(
      'data:text',
    );
  });

  it('rejects a remote reference smuggled outside url()', () => {
    expect(clean('.a { background-image: image-set("//evil.test/x.png" 1x); }')).not.toContain(
      'evil.test',
    );
  });
});

describe('scoping', () => {
  it('prefixes ordinary selectors', () => {
    expect(clean('.card { color: red }')).toContain(`${SCOPE} .card {`);
  });

  it('replaces html, body and :root with the scope rather than prefixing them', () => {
    expect(clean('body { background: red }')).toContain(`${SCOPE} {`);
    expect(clean(':root { --x: 1px }')).toContain(`${SCOPE} {`);
    expect(clean('html body { color: red }')).toContain(`${SCOPE} {`);
    expect(clean('body.dark { color: red }')).toContain(`${SCOPE}.dark {`);
    expect(clean('body > .x { color: red }')).toContain(`${SCOPE} > .x {`);
  });

  it('scopes every selector in a comma list', () => {
    const out = clean('.a, .b, .c { color: red }');
    expect(out).toContain(`${SCOPE} .a`);
    expect(out).toContain(`${SCOPE} .b`);
    expect(out).toContain(`${SCOPE} .c`);
  });

  it('cannot be escaped by a selector that reaches for admin chrome', () => {
    const out = clean('.admin-shell, #app-header { display: none }');
    expect(out).not.toMatch(/^\s*\.admin-shell/m);
    expect(out).not.toMatch(/^\s*#app-header/m);
    for (const line of out.split('\n')) {
      if (line.includes('{') && !line.trim().startsWith('@')) {
        expect(line).toContain(SCOPE);
      }
    }
  });

  it('does not let a stray brace close the scope early', () => {
    const out = clean('.a { color: red } } .admin { display: none }');
    for (const line of out.split('\n')) {
      if (line.includes('{') && !line.trim().startsWith('@')) {
        expect(line).toContain(SCOPE);
      }
    }
  });

  it('refuses to emit anything when the scope selector itself is hostile', () => {
    const result = sanitizeCustomCss('.a { color: red }', '.x { } body');
    expect(result.css).toBe('');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('limits', () => {
  it('truncates over-long input and says so', () => {
    const long = '.a { color: red }\n'.repeat(4000);
    const result = sanitizeCustomCss(long, SCOPE);
    expect(long.length).toBeGreaterThan(MAX_CUSTOM_CSS_LENGTH);
    expect(result.truncated).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/truncated/i);
  });

  it('caps the number of rules', () => {
    const many = Array.from({ length: MAX_CUSTOM_CSS_RULES + 50 }, (_, i) => `.r${i}{color:red}`).join(
      '',
    );
    const result = sanitizeCustomCss(many, SCOPE, 1_000_000);
    const ruleCount = (result.css.match(/\{/g) ?? []).length;
    expect(ruleCount).toBeLessThanOrEqual(MAX_CUSTOM_CSS_RULES);
  });

  it('survives deeply nested at-rules without blowing the stack', () => {
    const deep = '@media screen {'.repeat(50) + '.a{color:red}' + '}'.repeat(50);
    expect(() => sanitizeCustomCss(deep, SCOPE)).not.toThrow();
  });
});

describe('general behaviour', () => {
  it('returns an empty string for empty or non-string input', () => {
    expect(clean('')).toBe('');
    expect(clean('   ')).toBe('');
    expect(sanitizeCustomCss(undefined, SCOPE).css).toBe('');
    expect(sanitizeCustomCss(null, SCOPE).css).toBe('');
  });

  it('strips !important', () => {
    const out = clean('.a { color: red !important; }');
    expect(out).toContain('color: red');
    expect(out.toLowerCase()).not.toContain('important');
  });

  it('keeps legitimate CSS intact', () => {
    const out = clean(`
      .product-card { border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
      .product-card:hover { transform: translateY(-2px); }
      @media (min-width: 768px) { .product-card { padding: 24px } }
    `);
    expect(out).toContain('border-radius: 12px');
    expect(out).toContain('transform: translateY(-2px)');
    expect(out).toContain('padding: 24px');
  });

  it('is deterministic', () => {
    const css = '.a{color:red}@media screen{.b{color:blue}}';
    expect(clean(css)).toBe(clean(css));
  });

  it('never emits a < character, whatever the input', () => {
    const payloads = [
      '</style>',
      '\\3c/style\\3e',
      '.a{content:"\\00003c"}',
      '@charset "\\3c";',
      '.a{background:url("\\3c script\\3e")}',
    ];
    for (const payload of payloads) {
      expect(clean(payload)).not.toContain('<');
    }
  });
});
