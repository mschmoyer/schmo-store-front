-- Migration 005: ShipStation Integration Tables
-- Creates tables for order processing & integration tracking
-- Version: 1.0.0
-- Date: 2025-07-07

BEGIN;

-- Job Queue table for background processing
CREATE TABLE IF NOT EXISTS public.job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL, -- 'order_notification', 'inventory_update', 'shipment_processing', 'webhook_processing'
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'retrying'
    priority VARCHAR(10) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shipment Notifications table
CREATE TABLE IF NOT EXISTS public.shipment_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL, -- 'shipped', 'delivered', 'exception', 'in_transit', 'out_for_delivery'
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email_sent BOOLEAN DEFAULT false,
    email_error TEXT,
    tracking_number VARCHAR(100),
    carrier VARCHAR(50),
    tracking_url VARCHAR(500),
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification Templates table
CREATE TABLE IF NOT EXISTS public.notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    template_type VARCHAR(50) NOT NULL, -- 'order_confirmation', 'shipment_notification', 'delivery_notification', 'exception_notification'
    subject VARCHAR(255) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    variables JSONB, -- Template variables reference
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(store_id, template_type)
);

-- Integration Logs table (enhanced version)
CREATE TABLE IF NOT EXISTS public.integration_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id VARCHAR(255) NOT NULL, -- Can be UUID or 'system' for system-wide logs
    integration_type VARCHAR(50) NOT NULL, -- 'shipstation', 'shipengine', 'stripe', 'other'
    operation VARCHAR(50) NOT NULL, -- 'order_export', 'shipment_import', 'inventory_sync', 'webhook_processing'
    status VARCHAR(20) NOT NULL, -- 'success', 'failure', 'warning'
    request_data JSONB,
    response_data JSONB,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Integration Alerts table
CREATE TABLE IF NOT EXISTS public.integration_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    integration_type VARCHAR(50) NOT NULL,
    operation VARCHAR(50) NOT NULL,
    level VARCHAR(20) NOT NULL, -- 'info', 'warning', 'critical'
    type VARCHAR(50) NOT NULL, -- 'high_error_rate', 'consecutive_failures', 'slow_response', etc.
    message TEXT NOT NULL,
    metadata JSONB,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add new columns to orders table for ShipStation integration
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS shipstation_order_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS shipstation_order_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS shipstation_order_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS tracking_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS carrier VARCHAR(50),
ADD COLUMN IF NOT EXISTS carrier_code VARCHAR(20),
ADD COLUMN IF NOT EXISTS service_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS package_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE,
ADD COLUMN IF NOT EXISTS actual_delivery_date DATE,
ADD COLUMN IF NOT EXISTS shipment_cost DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS shipment_weight DECIMAL(8,2),
ADD COLUMN IF NOT EXISTS shipment_dimensions JSONB,
ADD COLUMN IF NOT EXISTS label_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS form_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS insurance_cost DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS confirmation_delivery BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS signature_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS adult_signature BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS delivery_confirmation VARCHAR(50),
ADD COLUMN IF NOT EXISTS customs_items JSONB,
ADD COLUMN IF NOT EXISTS international_options JSONB,
ADD COLUMN IF NOT EXISTS advanced_options JSONB,
ADD COLUMN IF NOT EXISTS shipment_data JSONB,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add new columns to products table for better inventory tracking
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS weight_unit VARCHAR(10) DEFAULT 'lb',
ADD COLUMN IF NOT EXISTS dimension_unit VARCHAR(10) DEFAULT 'in',
ADD COLUMN IF NOT EXISTS barcode VARCHAR(255),
ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 10;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_queue_status_priority ON public.job_queue(status, priority, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_created_at ON public.job_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_job_type ON public.job_queue(job_type);

CREATE INDEX IF NOT EXISTS idx_shipment_notifications_order_id ON public.shipment_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_shipment_notifications_type ON public.shipment_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_shipment_notifications_created_at ON public.shipment_notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_notification_templates_store_type ON public.notification_templates(store_id, template_type);

CREATE INDEX IF NOT EXISTS idx_integration_logs_store_type ON public.integration_logs(store_id, integration_type);
CREATE INDEX IF NOT EXISTS idx_integration_logs_operation ON public.integration_logs(operation);
CREATE INDEX IF NOT EXISTS idx_integration_logs_status ON public.integration_logs(status);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created_at ON public.integration_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_integration_alerts_store_level ON public.integration_alerts(store_id, level);
CREATE INDEX IF NOT EXISTS idx_integration_alerts_created_at ON public.integration_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_integration_alerts_acknowledged ON public.integration_alerts(acknowledged);

CREATE INDEX IF NOT EXISTS idx_orders_shipstation_order_id ON public.orders(shipstation_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON public.orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_orders_status_fulfillment ON public.orders(status, fulfillment_status);

CREATE INDEX IF NOT EXISTS idx_products_sku_store ON public.products(sku, store_id);
CREATE INDEX IF NOT EXISTS idx_products_track_inventory ON public.products(track_inventory);
CREATE INDEX IF NOT EXISTS idx_products_stock_quantity ON public.products(stock_quantity);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_job_queue_updated_at 
    BEFORE UPDATE ON public.job_queue 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at 
    BEFORE UPDATE ON public.notification_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean up old jobs
CREATE OR REPLACE FUNCTION cleanup_old_jobs(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.job_queue 
    WHERE status IN ('completed', 'failed') 
      AND completed_at < NOW() - INTERVAL '1 day' * days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get job statistics
CREATE OR REPLACE FUNCTION get_job_stats(hours_back INTEGER DEFAULT 24)
RETURNS TABLE(
    total BIGINT,
    pending BIGINT,
    processing BIGINT,
    completed BIGINT,
    failed BIGINT,
    retrying BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'retrying' THEN 1 END) as retrying
    FROM public.job_queue 
    WHERE created_at >= NOW() - INTERVAL '1 hour' * hours_back;
END;
$$ LANGUAGE plpgsql;

-- Create function to get integration health metrics
CREATE OR REPLACE FUNCTION get_integration_health(
    p_integration_type VARCHAR(50),
    p_store_id VARCHAR(255) DEFAULT NULL,
    p_hours_back INTEGER DEFAULT 24
)
RETURNS TABLE(
    total_operations BIGINT,
    successful_operations BIGINT,
    failed_operations BIGINT,
    success_rate DECIMAL(5,4),
    avg_execution_time DECIMAL(10,2),
    last_successful_operation TIMESTAMP,
    last_failed_operation TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_operations,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_operations,
        COUNT(CASE WHEN status = 'failure' THEN 1 END) as failed_operations,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                COUNT(CASE WHEN status = 'success' THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL
            ELSE 0::DECIMAL
        END as success_rate,
        AVG(execution_time_ms)::DECIMAL(10,2) as avg_execution_time,
        MAX(CASE WHEN status = 'success' THEN created_at END) as last_successful_operation,
        MAX(CASE WHEN status = 'failure' THEN created_at END) as last_failed_operation
    FROM public.integration_logs 
    WHERE integration_type = p_integration_type
      AND created_at >= NOW() - INTERVAL '1 hour' * p_hours_back
      AND (p_store_id IS NULL OR store_id = p_store_id);
END;
$$ LANGUAGE plpgsql;

-- Insert default notification templates
INSERT INTO public.notification_templates (id, store_id, template_type, subject, html_content, text_content, is_active, created_at, updated_at)
SELECT 
    gen_random_uuid(),
    s.id,
    'shipment_notification',
    'Your order #{{order_number}} has shipped! 📦',
    '<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order Shipped</title>
</head>
<body>
    <h1>📦 Your Order Has Shipped!</h1>
    <p>Hi {{customer_name}},</p>
    <p>Your order from <strong>{{store_name}}</strong> has been shipped!</p>
    <p><strong>Tracking Number:</strong> {{tracking_number}}</p>
    <p><strong>Carrier:</strong> {{carrier}}</p>
    <p><strong>Estimated Delivery:</strong> {{estimated_delivery}}</p>
    <p>Thank you for your business!</p>
</body>
</html>',
    'Your order #{{order_number}} has shipped! Tracking: {{tracking_number}} via {{carrier}}. Estimated delivery: {{estimated_delivery}}',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM public.stores s
WHERE NOT EXISTS (
    SELECT 1 FROM public.notification_templates nt 
    WHERE nt.store_id = s.id AND nt.template_type = 'shipment_notification'
);

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('005', 'ShipStation Integration - Order Processing & Integration Tables')
ON CONFLICT (version) DO NOTHING;

COMMIT;