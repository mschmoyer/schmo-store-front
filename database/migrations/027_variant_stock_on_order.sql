-- 027 — decrement variant stock when a variant line is ordered
--
-- Product variants shipped with per-variant stock_quantity (migration 026), a
-- storefront that gates purchase on it, and an admin editor that writes it — but
-- nothing on the sale path ever moved it. The order_items insert trigger
-- (migration 003) called update_product_stock(NEW.product_id, ...), which only
-- ever touched products.stock_quantity. So a variant with one unit in stock sold
-- to an unlimited number of shoppers: the count never changed, in_stock stayed
-- true forever, and two buyers racing for the last size both won.
--
-- This migration teaches the inventory trigger about variants: when an order
-- item carries a variant_id, the variant's stock is what moves, and the
-- product-level decrement is skipped (product stock is meaningless for an
-- optioned product and is typically 0). A line with no variant_id behaves
-- exactly as before. Re-runnable: functions are CREATE OR REPLACE.

/**
 * Adjust one variant's stock and record the change, mirroring
 * update_product_stock but keyed on product_variants.
 */
CREATE OR REPLACE FUNCTION update_variant_stock(
    variant_id_param UUID,
    quantity_change INTEGER,
    change_type_param VARCHAR(50),
    reference_type_param VARCHAR(50) DEFAULT 'manual',
    reference_id_param UUID DEFAULT NULL,
    notes_param TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    current_stock INTEGER;
    new_stock INTEGER;
    store_id_param UUID;
    product_id_param UUID;
BEGIN
    -- Lock the variant row so concurrent sales serialise on it.
    SELECT stock_quantity, store_id, product_id
      INTO current_stock, store_id_param, product_id_param
      FROM public.product_variants
     WHERE id = variant_id_param
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    new_stock := current_stock + quantity_change;
    IF new_stock < 0 THEN
        new_stock := 0;
    END IF;

    UPDATE public.product_variants
       SET stock_quantity = new_stock, updated_at = CURRENT_TIMESTAMP
     WHERE id = variant_id_param;

    -- Log against the parent product so the existing inventory history keeps
    -- working; the note names the variant so the row is not mistaken for a
    -- product-level movement.
    INSERT INTO public.inventory_logs (
        store_id, product_id, change_type, quantity_change, quantity_after,
        reference_type, reference_id, notes
    )
    VALUES (
        store_id_param, product_id_param, change_type_param, quantity_change, new_stock,
        reference_type_param, reference_id_param,
        COALESCE(notes_param, '') || ' [variant ' || variant_id_param || ']'
    );
END;
$$ LANGUAGE plpgsql;

/**
 * On order-item insert/delete, move the variant's stock when the line names a
 * variant, and the product's stock otherwise.
 */
CREATE OR REPLACE FUNCTION trigger_update_inventory_on_order()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.variant_id IS NOT NULL THEN
            PERFORM update_variant_stock(
                NEW.variant_id, -NEW.quantity, 'sale', 'order', NEW.order_id,
                'Inventory reduced due to order'
            );
        ELSE
            PERFORM update_product_stock(
                NEW.product_id, -NEW.quantity, 'sale', 'order', NEW.order_id,
                'Inventory reduced due to order'
            );
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.variant_id IS NOT NULL THEN
            PERFORM update_variant_stock(
                OLD.variant_id, OLD.quantity, 'return', 'order', OLD.order_id,
                'Inventory restored due to order cancellation'
            );
        ELSE
            PERFORM update_product_stock(
                OLD.product_id, OLD.quantity, 'return', 'order', OLD.order_id,
                'Inventory restored due to order cancellation'
            );
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
