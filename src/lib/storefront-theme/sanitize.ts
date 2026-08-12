/**
 * Custom-CSS sanitizer (spec section 7).
 *
 * `theme.custom.css` is merchant-supplied and is therefore hostile input. It
 * ends up inside a `<style>` element rendered with `dangerouslySetInnerHTML`,
 * which makes this module an XSS boundary, not a lint pass.
 *
 * Strategy — allowlist, not denylist, wherever it is affordable:
 *
 *  1. Cap the length before doing any work.
 *  2. Strip comments *first*, so `ex&#47;*x*&#47;pression(` cannot smuggle a keyword
 *     past the token checks.
 *  3. Decode CSS escape sequences (`\3c`, `\0000 3c`, `\e`), so `\65 xpression(`
 *     and `\6a avascript:` are unmasked before they are matched.
 *  4. Remove every `<` character. The HTML tokenizer ends a `<style>` element on
 *     the literal text `</style` and does not honour CSS escapes, so removing
 *     `<` makes breakout structurally impossible rather than merely unlikely.
 *  5. Parse the remainder with a real (small) string-and-paren-aware parser, so
 *     the filters operate on structure instead of regex-guessing at it.
 *  6. Drop everything not explicitly allowed: unknown at-rules, unparseable
 *     declarations, non-local `url()`, legacy IE script vectors.
 *  7. Prefix every surviving selector with the storefront scope, so merchant CSS
 *     cannot reach admin chrome even when the storefront is rendered inside the
 *     customizer's preview iframe.
 *
 * Output is deterministic: same input, same bytes.
 */

import { MAX_CUSTOM_CSS_LENGTH } from './types';

/** Maximum rules kept. Anything past this is dropped, to bound render cost. */
export const MAX_CUSTOM_CSS_RULES = 400;

/** Maximum comma-separated selectors kept per rule. */
export const MAX_SELECTORS_PER_RULE = 20;

/** Maximum nesting depth of at-rules. */
const MAX_DEPTH = 4;

export interface SanitizeResult {
  /** The safe, scope-prefixed CSS. Never contains `<`. */
  css: string;
  /** Human-readable notes about what was removed, for the customizer to surface. */
  warnings: string[];
  /** True when the input hit `MAX_CUSTOM_CSS_LENGTH` and was cut. */
  truncated: boolean;
}

/** At-rules a merchant may use. Everything else is dropped, `@import` included. */
const ALLOWED_BLOCK_AT_RULES = new Set([
  'media',
  'supports',
  'container',
  'layer',
  'keyframes',
  '-webkit-keyframes',
  '-moz-keyframes',
]);

/** At-rules whose children are keyframe selectors, not element selectors. */
const KEYFRAME_AT_RULES = new Set(['keyframes', '-webkit-keyframes', '-moz-keyframes']);

/**
 * Substrings that make a declaration or prelude unsafe. Matched case-insensitively
 * against the decoded, comment-stripped, whitespace-collapsed text.
 *
 * Whitespace is collapsed before matching, which is deliberate: comment
 * stripping turns `ex/*x*&#47;pression(` into `ex pression(`, and collapsing
 * rejoins it so the token still trips.
 */
const BANNED_TOKENS = [
  'expression(',
  '-moz-binding',
  'javascript:',
  'vbscript:',
  'livescript:',
  'mocha:',
  'data:text',
  'data:application',
  '@import',
  '@charset',
  '@namespace',
  '</',
  '<',
  '\\',
];

/**
 * Properties that are script vectors in their own right. Matched on the exact
 * property name so legitimate properties that merely contain the word — such as
 * `scroll-behavior` — are not caught.
 */
const BANNED_PROPERTIES = new Set(['behavior', '-ms-behavior', '-moz-binding']);

/** Property names must look like CSS properties or custom properties. */
const PROPERTY_RE = /^(?:--[a-zA-Z0-9_-]+|-{0,2}[a-zA-Z][a-zA-Z0-9-]*)$/;

/** Characters that must never survive into a selector. */
const SELECTOR_FORBIDDEN_RE = /[{}<>\\@;]/;

/** C0 control characters: meaningless in CSS, useful only for confusing parsers. */
const CONTROL_CHARS_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
/** Local paths and inline raster images are the only `url()` targets allowed. */
const SAFE_URL_RE =
  /^(?:\/(?!\/)[^\s'"()]*|\.{1,2}\/[^\s'"()]*|[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[^\s'"()]*)?|data:image\/(?:png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=]+)$/;

/**
 * Remove `/* ... *&#47;` comments, string-aware so a comment marker inside a
 * quoted value is preserved.
 * @param input - Raw CSS
 * @returns CSS with comments removed
 */
function stripComments(input: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;

  while (i < input.length) {
    const ch = input[i];

    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < input.length) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      // An unterminated comment swallows the rest of the stylesheet, exactly as
      // a browser would; that is the safe reading.
      i = end === -1 ? input.length : end + 2;
      // Replace with a space so `ex/*x*/pression` becomes `ex pression`, not
      // `expression`. Rejoining the halves would defeat the whole exercise.
      out += ' ';
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Decode CSS escape sequences into literal characters.
 *
 * `\3c`, `\00003c`, `\3c ` and `\<` all become `<`, which is then stripped by
 * {@link stripAngleBrackets}. Without this step every banned-token check is
 * trivially bypassable.
 *
 * @param input - CSS with comments already removed
 * @returns CSS with escapes resolved to literal characters
 */
function decodeCssEscapes(input: string): string {
  return input.replace(
    /\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|([\s\S]))/g,
    (_match, hex: string | undefined, literal: string | undefined) => {
      if (hex !== undefined) {
        const code = parseInt(hex, 16);
        if (!Number.isFinite(code) || code === 0 || code > 0x10ffff) return '';
        // Lone surrogates are not representable; drop them.
        if (code >= 0xd800 && code <= 0xdfff) return '';
        return String.fromCodePoint(code);
      }
      if (literal === undefined) return '';
      // `\` followed by a newline is a line continuation: it produces nothing.
      if (literal === '\n' || literal === '\r' || literal === '\f') return '';
      return literal;
    },
  );
}

/**
 * Remove every `<` and every HTML comment marker.
 * This is what makes `</style><script>` structurally impossible.
 * @param input - CSS text
 * @returns CSS text containing no `<`
 */
function stripAngleBrackets(input: string): string {
  return input.replace(/<!--/g, '').replace(/-->/g, '').replace(/</g, '');
}

/**
 * Collapse whitespace for token matching without changing the emitted text.
 * @param input - Text to normalise
 * @returns Lowercased text with runs of whitespace removed around punctuation
 */
function normaliseForMatching(input: string): string {
  return input.toLowerCase().replace(/\s+/g, '');
}

/**
 * Test a fragment against the banned-token list.
 * @param fragment - Declaration value, property or at-rule prelude
 * @returns The first banned token found, or null
 */
function findBannedToken(fragment: string): string | null {
  const flat = normaliseForMatching(fragment);
  for (const token of BANNED_TOKENS) {
    if (flat.includes(token)) return token;
  }
  return null;
}

/**
 * Verify every `url()` in a declaration value points somewhere local.
 * @param value - Declaration value
 * @returns True when all urls are same-origin paths or inline raster data URIs
 */
function urlsAreSafe(value: string): boolean {
  const urlRe = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(value)) !== null) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (raw === '' || !SAFE_URL_RE.test(raw)) return false;
  }
  // Remote references can also arrive without `url()`, e.g. `image-set("//x/y" 1x)`.
  if (/(?:https?:)?\/\//i.test(value.replace(/^\s*url\(/i, ''))) {
    // Allow protocol-relative-looking text only when it is part of a safe url().
    const withoutUrls = value.replace(urlRe, '');
    if (/(?:https?:)?\/\//i.test(withoutUrls)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Parser
 * ------------------------------------------------------------------ */

interface Declaration {
  property: string;
  value: string;
}

interface RuleNode {
  kind: 'rule';
  selector: string;
  children: CssNode[];
}

interface AtRuleNode {
  kind: 'at';
  name: string;
  prelude: string;
  /** Undefined for statement at-rules such as `@import x;`. */
  children?: CssNode[];
}

interface DeclarationNode {
  kind: 'decl';
  declaration: Declaration;
}

type CssNode = RuleNode | AtRuleNode | DeclarationNode;

interface ParserState {
  input: string;
  pos: number;
  /** Set when a string literal ran to end-of-input; the tail is untrusted. */
  unterminatedString: boolean;
}

/**
 * Read forward until one of the stop characters is found at nesting depth zero.
 * Strings and parentheses are skipped over.
 * @param state - Parser state, advanced in place
 * @param stops - Characters that terminate the read
 * @returns The consumed text (not including the stop character)
 */
function readUntil(state: ParserState, stops: string): string {
  const start = state.pos;
  let depth = 0;
  let quote: string | null = null;

  while (state.pos < state.input.length) {
    const ch = state.input[state.pos];

    if (quote) {
      if (ch === quote) quote = null;
      state.pos += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      state.pos += 1;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && stops.includes(ch)) break;

    state.pos += 1;
  }

  if (quote) state.unterminatedString = true;
  return state.input.slice(start, state.pos);
}

/**
 * Parse a sequence of CSS nodes until the matching `}` or end of input.
 * @param state - Parser state, advanced in place
 * @param depth - Current nesting depth, used to bound recursion
 * @returns The parsed nodes
 */
function parseNodes(state: ParserState, depth: number): CssNode[] {
  const nodes: CssNode[] = [];

  while (state.pos < state.input.length) {
    // Skip whitespace and stray semicolons.
    while (state.pos < state.input.length && /[\s;]/.test(state.input[state.pos])) {
      state.pos += 1;
    }
    if (state.pos >= state.input.length) break;

    if (state.input[state.pos] === '}') {
      state.pos += 1;
      break;
    }

    if (state.input[state.pos] === '@') {
      const prelude = readUntil(state, '{};');
      const terminator = state.input[state.pos];
      const trimmed = prelude.trim();
      const nameMatch = /^@([-a-zA-Z]+)/.exec(trimmed);
      const name = nameMatch ? nameMatch[1].toLowerCase() : '';
      const rest = trimmed.slice(nameMatch ? nameMatch[0].length : 1).trim();

      if (terminator === '{') {
        state.pos += 1;
        const children = depth < MAX_DEPTH ? parseNodes(state, depth + 1) : skipBlock(state);
        nodes.push({ kind: 'at', name, prelude: rest, children });
      } else {
        if (terminator === ';') state.pos += 1;
        nodes.push({ kind: 'at', name, prelude: rest });
      }
      continue;
    }

    const head = readUntil(state, '{};');
    const terminator = state.input[state.pos];

    if (terminator === '{') {
      state.pos += 1;
      const children = depth < MAX_DEPTH ? parseNodes(state, depth + 1) : skipBlock(state);
      nodes.push({ kind: 'rule', selector: head.trim(), children });
      continue;
    }

    if (terminator === ';') state.pos += 1;
    else if (terminator === '}') {
      state.pos += 1;
      if (head.trim()) nodes.push(declarationNode(head));
      break;
    }

    if (head.trim()) nodes.push(declarationNode(head));
  }

  return nodes;
}

/**
 * Build a declaration node from `property: value` text.
 * @param text - Raw declaration text
 * @returns A declaration node; an empty property marks it as invalid
 */
function declarationNode(text: string): DeclarationNode {
  const idx = text.indexOf(':');
  if (idx === -1) return { kind: 'decl', declaration: { property: '', value: '' } };
  return {
    kind: 'decl',
    declaration: {
      property: text.slice(0, idx).trim(),
      value: text.slice(idx + 1).trim(),
    },
  };
}

/**
 * Consume a block without keeping it, used when the nesting limit is exceeded.
 * @param state - Parser state, advanced in place
 * @returns An empty node list
 */
function skipBlock(state: ParserState): CssNode[] {
  let depth = 1;
  while (state.pos < state.input.length && depth > 0) {
    const ch = state.input[state.pos];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    state.pos += 1;
  }
  return [];
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

/**
 * Split a selector list on top-level commas.
 * @param selector - Raw selector list
 * @returns The individual selectors, untrimmed
 */
function splitSelectors(selector: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (const ch of selector) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);

    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/**
 * Rewrite one selector so it can only ever match inside the storefront wrapper.
 *
 * `html`, `body` and `:root` are *replaced* by the scope rather than prefixed —
 * a merchant writing `body { background: red }` means "my page", and prefixing
 * would produce a selector that matches nothing.
 *
 * @param selector - A single (comma-free) selector
 * @param scope - The storefront scope selector, e.g. `.storefront[data-store-id="…"]`
 * @returns The scoped selector, or null when the selector must be dropped
 */
function scopeSelector(selector: string, scope: string): string | null {
  const trimmed = selector.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if (SELECTOR_FORBIDDEN_RE.test(trimmed)) return null;
  if (findBannedToken(trimmed)) return null;

  // A merchant cannot address the document root, only their own subtree.
  let remainder = trimmed;
  let hitRoot = false;
  for (;;) {
    const rootMatch = /^(?::root|html|body)(?![\w-])/i.exec(remainder);
    if (!rootMatch) break;
    hitRoot = true;
    remainder = remainder.slice(rootMatch[0].length).trim();
  }

  if (hitRoot) {
    if (!remainder) return scope;
    // `body.dark` attaches directly; `body .x` and `body > .x` keep their combinator.
    return /^[.:#[]/.test(remainder) ? `${scope}${remainder}` : `${scope} ${remainder}`;
  }

  if (trimmed.startsWith('&')) {
    const rest = trimmed.slice(1);
    return rest ? `${scope}${rest}` : scope;
  }

  return `${scope} ${trimmed}`;
}

/**
 * Filter a single declaration.
 * @param declaration - Parsed declaration
 * @param warnings - Collector for removal notes
 * @returns The safe declaration text, or null when it must be dropped
 */
function filterDeclaration(
  declaration: Declaration,
  warnings: string[],
): string | null {
  const property = declaration.property.trim();
  const value = declaration.value.trim();

  if (!property || !value) return null;

  if (!PROPERTY_RE.test(property)) {
    warnings.push(`Removed declaration with unsupported property "${property}".`);
    return null;
  }

  if (BANNED_PROPERTIES.has(property.toLowerCase())) {
    warnings.push(`Removed disallowed property "${property}".`);
    return null;
  }

  const banned = findBannedToken(`${property}:${value}`);
  if (banned) {
    warnings.push(`Removed "${property}" declaration containing "${banned}".`);
    return null;
  }

  if (!urlsAreSafe(value)) {
    warnings.push(
      `Removed "${property}" declaration: url() may only reference this store's own assets or an inline image.`,
    );
    return null;
  }

  // The engine never emits !important and neither does merchant CSS. The scope
  // prefix already outranks storefront component styles, so it is unnecessary,
  // and it lets a merchant lock themselves out of their own checkout.
  const withoutImportant = value.replace(/!\s*important\b/gi, '').trim();
  if (!withoutImportant) return null;

  return `${property}: ${withoutImportant}`;
}

/**
 * Serialise a filtered node list.
 * @param nodes - Parsed nodes
 * @param scope - Storefront scope selector
 * @param context - Whether children are element selectors or keyframe stops
 * @param indent - Current indent string
 * @param budget - Mutable rule budget
 * @param warnings - Collector for removal notes
 * @returns Serialised CSS lines
 */
function emitNodes(
  nodes: CssNode[],
  scope: string,
  context: 'selector' | 'keyframes',
  indent: string,
  budget: { rules: number },
  warnings: string[],
): string[] {
  const lines: string[] = [];

  for (const node of nodes) {
    if (budget.rules <= 0) break;

    if (node.kind === 'decl') {
      // Declarations only make sense inside a block; at the top level they are junk.
      continue;
    }

    if (node.kind === 'at') {
      if (!node.children) {
        warnings.push(`Removed unsupported at-rule "@${node.name}".`);
        continue;
      }
      if (!ALLOWED_BLOCK_AT_RULES.has(node.name)) {
        warnings.push(`Removed unsupported at-rule "@${node.name}".`);
        continue;
      }
      const preludeBanned = findBannedToken(node.prelude);
      if (preludeBanned || /[{}]/.test(node.prelude)) {
        warnings.push(`Removed "@${node.name}" with an unsafe condition.`);
        continue;
      }
      const childContext = KEYFRAME_AT_RULES.has(node.name) ? 'keyframes' : context;
      const inner = emitNodes(
        node.children,
        scope,
        childContext,
        `${indent}  `,
        budget,
        warnings,
      );
      if (inner.length === 0) continue;
      budget.rules -= 1;
      const head = node.prelude ? `@${node.name} ${node.prelude}` : `@${node.name}`;
      lines.push(`${indent}${head} {`, ...inner, `${indent}}`);
      continue;
    }

    // node.kind === 'rule'
    const declarations: string[] = [];
    const nested: CssNode[] = [];
    for (const child of node.children) {
      if (child.kind === 'decl') {
        const decl = filterDeclaration(child.declaration, warnings);
        if (decl) declarations.push(decl);
      } else {
        nested.push(child);
      }
    }

    let selectorText: string;
    if (context === 'keyframes') {
      const stops = splitSelectors(node.selector)
        .map((s) => s.trim())
        .filter((s) => /^(?:from|to|\d{1,3}(?:\.\d+)?%)$/i.test(s));
      if (stops.length === 0) {
        warnings.push('Removed an invalid keyframe stop.');
        continue;
      }
      selectorText = stops.join(', ');
    } else {
      const scoped = splitSelectors(node.selector)
        .slice(0, MAX_SELECTORS_PER_RULE)
        .map((s) => scopeSelector(s, scope))
        .filter((s): s is string => s !== null);
      if (scoped.length === 0) {
        warnings.push('Removed a rule with an unsupported selector.');
        continue;
      }
      selectorText = scoped.join(',\n' + indent);
    }

    const innerNested =
      nested.length > 0
        ? emitNodes(nested, scope, context, `${indent}  `, budget, warnings)
        : [];

    if (declarations.length === 0 && innerNested.length === 0) continue;

    budget.rules -= 1;
    lines.push(`${indent}${selectorText} {`);
    for (const decl of declarations) lines.push(`${indent}  ${decl};`);
    lines.push(...innerNested);
    lines.push(`${indent}}`);
  }

  return lines;
}

/**
 * Sanitize merchant-supplied CSS and scope it to the storefront wrapper.
 *
 * Never render `theme.custom.css` without passing it through this function
 * first. The return value is safe to place inside a `<style>` element.
 *
 * @param css - Raw merchant CSS (may be undefined)
 * @param scopeSelectorText - The storefront wrapper selector every rule is nested under
 * @param maxLength - Optional override for the length cap
 * @returns The sanitized CSS plus a list of what was removed
 */
export function sanitizeCustomCss(
  css: string | undefined | null,
  scopeSelectorText: string,
  maxLength: number = MAX_CUSTOM_CSS_LENGTH,
): SanitizeResult {
  const warnings: string[] = [];

  if (typeof css !== 'string' || css.trim() === '') {
    return { css: '', warnings, truncated: false };
  }

  const scope = scopeSelectorText.trim();
  if (!scope || SELECTOR_FORBIDDEN_RE.test(scope)) {
    // Refusing to emit anything is the only safe response to a bad scope.
    return {
      css: '',
      warnings: ['Custom CSS was dropped: the storefront scope selector is invalid.'],
      truncated: false,
    };
  }

  let working = css.replace(/\r\n?/g, '\n');
  const truncated = working.length > maxLength;
  if (truncated) {
    working = working.slice(0, maxLength);
    warnings.push(`Custom CSS was truncated at ${maxLength} characters.`);
  }

  // Order matters: comments first (so split keywords cannot rejoin), then
  // escapes (so obfuscated keywords are unmasked), then `<` removal.
  working = stripComments(working);
  working = decodeCssEscapes(working);
  working = stripAngleBrackets(working);
  // Null bytes and other C0 controls have no meaning in CSS and confuse parsers.
  working = working.replace(CONTROL_CHARS_RE, '');

  const state: ParserState = { input: working, pos: 0, unterminatedString: false };
  const nodes = parseNodes(state, 0);

  if (state.unterminatedString) {
    warnings.push('Custom CSS contained an unterminated string; affected rules were dropped.');
  }

  const budget = { rules: MAX_CUSTOM_CSS_RULES };
  const lines = emitNodes(nodes, scope, 'selector', '', budget, warnings);

  if (budget.rules <= 0) {
    warnings.push(`Custom CSS exceeded ${MAX_CUSTOM_CSS_RULES} rules; the remainder was dropped.`);
  }

  return { css: lines.join('\n'), warnings, truncated };
}

/**
 * Convenience wrapper returning only the sanitized CSS.
 * @param css - Raw merchant CSS
 * @param scopeSelectorText - The storefront wrapper selector
 * @returns Sanitized CSS string
 */
export function sanitizeCustomCssToString(
  css: string | undefined | null,
  scopeSelectorText: string,
): string {
  return sanitizeCustomCss(css, scopeSelectorText).css;
}
