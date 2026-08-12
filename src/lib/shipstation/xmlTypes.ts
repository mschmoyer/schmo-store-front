/**
 * Shared types and narrowing helpers for XML documents parsed by `xml2js`.
 *
 * `xml2js` produces an untyped tree of nested objects. These types describe the
 * shape it actually emits when parsed with `{ explicitArray: false }` so the
 * ShipStation parsers can walk the tree without resorting to casts.
 */

/**
 * Any value that can appear inside an xml2js document.
 *
 * A node is either text content, a nested element, or a list of repeated
 * elements. `undefined` covers absent elements.
 */
export type XmlValue = string | XmlNode | XmlValue[] | undefined;

/**
 * A parsed XML element.
 *
 * Text content of a mixed element is exposed by xml2js under `_` and attributes
 * under `$`; both are plain string-valued members so they fit the index
 * signature.
 */
export interface XmlNode {
  [key: string]: XmlValue;
}

/**
 * Narrow an XML value to a single element node.
 *
 * @param value - Value read from a parsed XML tree
 * @returns The value as an element node, or undefined if it is text/a list/absent
 */
export function asXmlNode(value: XmlValue): XmlNode | undefined {
  if (value === undefined || typeof value === 'string' || Array.isArray(value)) {
    return undefined;
  }
  return value;
}

/**
 * Read a child element from an XML node.
 *
 * @param node - Parent node, may be undefined
 * @param key - Child element name
 * @returns The child element, or undefined if missing or not an element
 */
export function getXmlChild(node: XmlNode | undefined, key: string): XmlNode | undefined {
  return node === undefined ? undefined : asXmlNode(node[key]);
}

/**
 * Normalize a repeated element into an array.
 *
 * With `explicitArray: false`, xml2js emits a single object when an element
 * occurs once and an array when it occurs more than once.
 *
 * @param value - Value read from a parsed XML tree
 * @returns Array of element nodes (empty when the value is absent or text-only)
 */
export function toXmlNodeArray(value: XmlValue): XmlNode[] {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(asXmlNode).filter((node): node is XmlNode => node !== undefined);
  }
  const node = asXmlNode(value);
  return node === undefined ? [] : [node];
}

/**
 * Safely read the text value of an XML node.
 *
 * @param node - XML node, text value, or undefined
 * @returns Trimmed string value, or an empty string when there is no content
 */
export function safeGetString(node: XmlValue): string {
  if (node === null || node === undefined) {
    return '';
  }

  if (typeof node === 'string') {
    return node.trim();
  }

  if (!Array.isArray(node) && node._ !== undefined && node._ !== '') {
    return String(node._).trim();
  }

  return String(node).trim();
}

/**
 * Safely read a boolean value from an XML node.
 *
 * @param node - XML node, text value, or undefined
 * @returns True when the text is one of `true`, `1` or `yes` (case-insensitive)
 */
export function safeGetBoolean(node: XmlValue): boolean {
  const value = safeGetString(node).toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}
