'use client';

import * as React from 'react';

/**
 * Storefront cart state.
 *
 * Persistence is `localStorage`, which is a hint and never a source of truth.
 * The rule this module enforces is simple and absolute: **the browser decides
 * what is in the cart, the server decides what it costs.** Ids and quantities
 * round-trip through storage; names, prices, images and stock are re-fetched
 * from `/api/stores/{id}/cart/validate` on every load and after every change.
 * A shopper who edits `price` in devtools sees their edit overwritten on the
 * next paint, and checkout re-quotes independently anyway.
 *
 * The storage key and line shape are fixed by what the rest of the app already
 * reads — the checkout route owned by another track parses
 * `{ product_id, name, price, quantity, thumbnail_url }` out of `cart` — so
 * those five fields are a compatibility contract. Extra fields are additive and
 * ignored by older readers.
 */

/** The `localStorage` key the whole app shares. */
const STORAGE_KEY = 'cart';

/** Fired on the window so a non-React listener (the nav badge) can follow along. */
const CART_EVENT = 'cartUpdated';

/** A line as persisted. Only `product_id`, `quantity` and `store_id` are trusted. */
export interface StoredCartLine {
  product_id: string;
  quantity: number;
  store_id: string;
  /** Cached for older readers and for first paint; re-derived from the server. */
  name: string;
  price: number;
  thumbnail_url: string;
}

/** A line after the server has re-priced it. This is what the UI renders. */
export interface CartLine {
  productId: string;
  sku: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  thumbnailUrl: string;
  stockState: string;
  maxQuantity: number;
}

export interface CartState {
  lines: CartLine[];
  /** Sum of quantities, for the header badge. */
  count: number;
  /** Server-priced subtotal. Never computed from stored prices. */
  subtotal: number;
  /** True until the first validation round-trip resolves. */
  loading: boolean;
  /** Lines dropped because the product went away or sold out. */
  removedNotice: string | null;
  addItem: (productId: string, quantity?: number) => Promise<void>;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  /** Restore the most recently removed line. Powers undo. */
  undoRemove: () => void;
  /** The line waiting to be undone, if any. */
  pendingUndo: { name: string; productId: string } | null;
  clearUndo: () => void;
  clear: () => void;
}

const CartContext = React.createContext<CartState | null>(null);

/**
 * Read and sanitise the stored cart.
 * @returns Well-formed lines only; anything malformed is dropped silently
 */
function readStorage(): StoredCartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((entry): StoredCartLine[] => {
      if (typeof entry !== 'object' || entry === null) return [];
      const item = entry as Partial<StoredCartLine>;
      const id = typeof item.product_id === 'string' ? item.product_id : String(item.product_id ?? '');
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) return [];
      const quantity = Math.min(Math.max(Math.floor(Number(item.quantity) || 1), 1), 99);
      return [
        {
          product_id: id,
          quantity,
          store_id: typeof item.store_id === 'string' ? item.store_id : '',
          name: typeof item.name === 'string' ? item.name : '',
          price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
          thumbnail_url: typeof item.thumbnail_url === 'string' ? item.thumbnail_url : '',
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * Persist the cart and tell the rest of the page.
 * @param lines - Lines to write
 */
function writeStorage(lines: StoredCartLine[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // A full or disabled storage must not break the shop; the cart simply
    // becomes session-scoped in memory.
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

interface CartProviderProps {
  storeId: string;
  children: React.ReactNode;
}

/**
 * Provide cart state to a storefront subtree.
 *
 * Scoped to one store: lines belonging to a different shop are dropped on load,
 * because a single global cart shared across merchants would let one shop's
 * checkout quote another shop's products.
 *
 * @param props.storeId - The store this cart belongs to
 * @param props.children - The storefront subtree
 * @returns A context provider
 */
export function CartProvider({ storeId, children }: CartProviderProps) {
  const [stored, setStored] = React.useState<StoredCartLine[]>([]);
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [removedNotice, setRemovedNotice] = React.useState<string | null>(null);
  const [pendingUndo, setPendingUndo] = React.useState<CartState['pendingUndo']>(null);
  const undoRef = React.useRef<StoredCartLine | null>(null);

  // Hydrate from storage once mounted. Reading storage during render would
  // produce a server/client mismatch on every cart-aware page.
  React.useEffect(() => {
    setStored(readStorage().filter((line) => !line.store_id || line.store_id === storeId));
  }, [storeId]);

  // Follow changes made in another tab, or by a non-React caller.
  React.useEffect(() => {
    const sync = (): void => {
      setStored(readStorage().filter((line) => !line.store_id || line.store_id === storeId));
    };
    window.addEventListener('storage', sync);
    window.addEventListener(CART_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CART_EVENT, sync);
    };
  }, [storeId]);

  // Re-price against the server whenever the set of ids or quantities changes.
  const signature = stored.map((line) => `${line.product_id}:${line.quantity}`).join(',');

  React.useEffect(() => {
    let cancelled = false;

    if (stored.length === 0) {
      setLines([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/stores/${storeId}/cart/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: stored.map((line) => ({
              product_id: line.product_id,
              quantity: line.quantity,
            })),
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (cancelled) return;

        const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
        const removed: string[] = Array.isArray(payload?.data?.removed)
          ? payload.data.removed
          : [];

        setLines(
          items.map(
            (item: Record<string, unknown>): CartLine => ({
              productId: String(item.product_id),
              sku: String(item.sku ?? ''),
              name: String(item.name ?? ''),
              slug: String(item.slug ?? ''),
              price: Number(item.price) || 0,
              compareAtPrice:
                item.compare_at_price === null || item.compare_at_price === undefined
                  ? null
                  : Number(item.compare_at_price),
              quantity: Number(item.quantity) || 1,
              thumbnailUrl: String(item.thumbnail_url ?? ''),
              stockState: String(item.stock_state ?? 'untracked'),
              maxQuantity: Number(item.max_quantity) || 99,
            }),
          ),
        );

        if (removed.length > 0) {
          setRemovedNotice(
            removed.length === 1
              ? 'An item was removed from your cart because it is no longer available.'
              : `${removed.length} items were removed from your cart because they are no longer available.`,
          );
          // Prune the dead ids so we stop asking about them.
          const dead = new Set(removed);
          const survivors = stored.filter((line) => !dead.has(line.product_id));
          if (survivors.length !== stored.length) writeStorage(survivors);
        } else {
          setRemovedNotice(null);
        }
      } catch {
        // Offline or a failing endpoint: show what we have rather than an empty
        // cart, but keep it clearly derived from stored hints only.
        if (!cancelled) {
          setLines(
            stored.map((line) => ({
              productId: line.product_id,
              sku: '',
              name: line.name || 'Item',
              slug: '',
              price: line.price,
              compareAtPrice: null,
              quantity: line.quantity,
              thumbnailUrl: line.thumbnail_url,
              stockState: 'untracked',
              maxQuantity: 99,
            })),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `signature` collapses the stored array into a primitive so this does not
    // re-run on every identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, storeId]);

  /**
   * Write a new stored-line set to storage and to state at once.
   * @param next - The lines to persist
   */
  const commit = React.useCallback((next: StoredCartLine[]) => {
    setStored(next);
    writeStorage(next);
  }, []);

  const addItem = React.useCallback(
    async (productId: string, quantity = 1) => {
      const all = readStorage();
      // Adding from a different shop replaces the cart: one checkout can only
      // ever quote one merchant's catalogue.
      const sameStore = all.filter((line) => !line.store_id || line.store_id === storeId);
      const foreign = all.length !== sameStore.length;
      const base = foreign ? [] : sameStore;

      const existing = base.find((line) => line.product_id === productId);
      const next = existing
        ? base.map((line) =>
            line.product_id === productId
              ? { ...line, quantity: Math.min(line.quantity + quantity, 99) }
              : line,
          )
        : [
            ...base,
            {
              product_id: productId,
              quantity: Math.min(Math.max(quantity, 1), 99),
              store_id: storeId,
              name: '',
              price: 0,
              thumbnail_url: '',
            },
          ];

      commit(next);
    },
    [commit, storeId],
  );

  const setQuantity = React.useCallback(
    (productId: string, quantity: number) => {
      const clamped = Math.min(Math.max(Math.floor(quantity) || 1, 1), 99);
      commit(
        stored.map((line) =>
          line.product_id === productId ? { ...line, quantity: clamped } : line,
        ),
      );
    },
    [commit, stored],
  );

  const removeItem = React.useCallback(
    (productId: string) => {
      const victim = stored.find((line) => line.product_id === productId);
      if (victim) {
        undoRef.current = victim;
        const display = lines.find((line) => line.productId === productId);
        setPendingUndo({ name: display?.name || 'Item', productId });
      }
      commit(stored.filter((line) => line.product_id !== productId));
    },
    [commit, stored, lines],
  );

  const undoRemove = React.useCallback(() => {
    const victim = undoRef.current;
    if (!victim) return;
    undoRef.current = null;
    setPendingUndo(null);
    commit([...readStorage().filter((l) => l.store_id === storeId || !l.store_id), victim]);
  }, [commit, storeId]);

  const clearUndo = React.useCallback(() => {
    undoRef.current = null;
    setPendingUndo(null);
  }, []);

  const clear = React.useCallback(() => {
    commit([]);
  }, [commit]);

  const value = React.useMemo<CartState>(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    // The badge counts stored quantities so it is correct before the first
    // validation returns; totals only ever use server prices.
    const count = stored.reduce((sum, line) => sum + line.quantity, 0);
    return {
      lines,
      count,
      subtotal,
      loading,
      removedNotice,
      addItem,
      setQuantity,
      removeItem,
      undoRemove,
      pendingUndo,
      clearUndo,
      clear,
    };
  }, [
    lines,
    stored,
    loading,
    removedNotice,
    addItem,
    setQuantity,
    removeItem,
    undoRemove,
    pendingUndo,
    clearUndo,
    clear,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * Read the storefront cart.
 * @returns The cart state
 * @throws When called outside a {@link CartProvider}
 */
export function useCart(): CartState {
  const context = React.useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside a CartProvider');
  return context;
}
