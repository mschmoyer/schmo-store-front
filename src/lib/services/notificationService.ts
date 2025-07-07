import { db } from '@/lib/database/connection';
import { v4 as uuidv4 } from 'uuid';
import {
  UUID,
  Order,
  OrderItem,
  Store,
  NotificationTemplate
} from '@/lib/types/database';

// Email template interfaces
interface EmailTemplateVariables {
  order_number: string;
  order_total: string;
  customer_name: string;
  store_name: string;
  store_url: string;
  shipping_address: string;
  contact_email: string;
}

interface ShipmentTemplateVariables extends EmailTemplateVariables {
  order_items: Array<{ name: string; quantity: number; price: string }>;
  tracking_number: string;
  carrier_name: string;
  tracking_url?: string;
  estimated_delivery?: string;
}

interface DeliveryTemplateVariables extends EmailTemplateVariables {
  delivered_date: string;
  delivery_location?: string;
}

interface ExceptionTemplateVariables extends EmailTemplateVariables {
  exception_type: string;
  exception_description: string;
  resolution_instructions?: string;
  estimated_resolution?: string;
}

/**
 * Customer Notification Service
 * 
 * Handles sending email notifications to customers for:
 * - Order confirmations
 * - Shipment notifications with tracking info
 * - Delivery confirmations
 * - Exception notifications
 * 
 * @example
 * ```typescript
 * const notificationService = new NotificationService();
 * await notificationService.sendShipmentNotificationEmail(orderId, trackingData);
 * ```
 */
export class NotificationService {
  private readonly DEFAULT_FROM_EMAIL = 'noreply@rebelcart.com';
  private readonly DEFAULT_FROM_NAME = 'RebelCart';

  /**
   * Send shipment notification email to customer
   * @param orderId - Order UUID
   * @param trackingData - Tracking information
   * @returns Promise<boolean> - Success status
   */
  async sendShipmentNotificationEmail(
    orderId: UUID,
    trackingData: {
      tracking_number?: string;
      carrier?: string;
      tracking_url?: string;
      estimated_delivery?: string;
      shipment_cost?: number;
      service_code?: string;
    }
  ): Promise<boolean> {
    try {
      // Get order details
      const order = await this.getOrderWithDetails(orderId);
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Get store details
      const store = await this.getStoreDetails(order.store_id);
      if (!store) {
        throw new Error(`Store not found: ${order.store_id}`);
      }

      // Get order items
      const orderItems = await this.getOrderItems(orderId);

      // Get or create notification template
      const template = await this.getNotificationTemplate(
        order.store_id,
        'shipment_notification'
      );

      // Generate email content
      const emailContent = await this.generateShipmentEmailContent(
        order,
        store,
        orderItems,
        trackingData,
        template
      );

      // Send email
      const success = await this.sendEmail({
        to: order.customer_email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        from: store.contact_email || this.DEFAULT_FROM_EMAIL,
        fromName: store.store_name || this.DEFAULT_FROM_NAME
      });

      // Log notification
      await this.logNotification(orderId, 'shipment_notification', success);

      return success;
    } catch (error) {
      console.error('Error sending shipment notification:', error);
      await this.logNotification(orderId, 'shipment_notification', false, error);
      return false;
    }
  }

  /**
   * Send delivery confirmation email to customer
   * @param orderId - Order UUID
   * @param deliveryData - Delivery information
   * @returns Promise<boolean> - Success status
   */
  async sendDeliveryNotificationEmail(
    orderId: UUID,
    deliveryData: {
      delivered_date?: string;
      tracking_number?: string;
      carrier?: string;
      delivery_confirmation?: string;
      signature_required?: boolean;
    }
  ): Promise<boolean> {
    try {
      const order = await this.getOrderWithDetails(orderId);
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      const store = await this.getStoreDetails(order.store_id);
      if (!store) {
        throw new Error(`Store not found: ${order.store_id}`);
      }

      const orderItems = await this.getOrderItems(orderId);
      const template = await this.getNotificationTemplate(
        order.store_id,
        'delivery_notification'
      );

      const emailContent = await this.generateDeliveryEmailContent(
        order,
        store,
        orderItems,
        deliveryData,
        template
      );

      const success = await this.sendEmail({
        to: order.customer_email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        from: store.contact_email || this.DEFAULT_FROM_EMAIL,
        fromName: store.store_name || this.DEFAULT_FROM_NAME
      });

      await this.logNotification(orderId, 'delivery_notification', success);
      return success;
    } catch (error) {
      console.error('Error sending delivery notification:', error);
      await this.logNotification(orderId, 'delivery_notification', false, error);
      return false;
    }
  }

  /**
   * Send exception notification email to customer
   * @param orderId - Order UUID
   * @param exceptionData - Exception information
   * @returns Promise<boolean> - Success status
   */
  async sendExceptionNotificationEmail(
    orderId: UUID,
    exceptionData: {
      exception_description?: string;
      tracking_number?: string;
      carrier?: string;
      exception_date?: string;
      next_steps?: string;
    }
  ): Promise<boolean> {
    try {
      const order = await this.getOrderWithDetails(orderId);
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      const store = await this.getStoreDetails(order.store_id);
      if (!store) {
        throw new Error(`Store not found: ${order.store_id}`);
      }

      const orderItems = await this.getOrderItems(orderId);
      const template = await this.getNotificationTemplate(
        order.store_id,
        'exception_notification'
      );

      const emailContent = await this.generateExceptionEmailContent(
        order,
        store,
        orderItems,
        exceptionData,
        template
      );

      const success = await this.sendEmail({
        to: order.customer_email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        from: store.contact_email || this.DEFAULT_FROM_EMAIL,
        fromName: store.store_name || this.DEFAULT_FROM_NAME
      });

      await this.logNotification(orderId, 'exception_notification', success);
      return success;
    } catch (error) {
      console.error('Error sending exception notification:', error);
      await this.logNotification(orderId, 'exception_notification', false, error);
      return false;
    }
  }

  /**
   * Generate shipment email content
   * @param order - Order details
   * @param store - Store details
   * @param orderItems - Order items
   * @param trackingData - Tracking information
   * @param template - Email template
   * @returns Promise<EmailContent>
   */
  private async generateShipmentEmailContent(
    order: Order,
    store: Store,
    orderItems: OrderItem[],
    trackingData: {
      tracking_number: string;
      carrier_name: string;
      tracking_url?: string;
      estimated_delivery?: Date;
      service_code?: string;
    },
    template?: NotificationTemplate
  ): Promise<{ subject: string; html: string; text: string }> {
    const variables = {
      customer_name: `${order.customer_first_name} ${order.customer_last_name}`,
      order_number: order.order_number,
      store_name: store.store_name,
      tracking_number: trackingData.tracking_number || 'N/A',
      carrier: trackingData.carrier || 'N/A',
      tracking_url: trackingData.tracking_url || '#',
      estimated_delivery: trackingData.estimated_delivery || 'N/A',
      order_total: `$${order.total_amount.toFixed(2)}`,
      order_items: orderItems.map(item => ({
        name: item.product_name,
        quantity: item.quantity,
        price: `$${item.unit_price.toFixed(2)}`
      })),
      shipping_address: `${order.shipping_address_line1}, ${order.shipping_city}, ${order.shipping_state} ${order.shipping_postal_code}`,
      contact_email: store.contact_email || this.DEFAULT_FROM_EMAIL,
      store_url: store.domain || `https://${store.store_slug}.rebelcart.com`
    };

    if (template) {
      return {
        subject: this.replaceVariables(template.subject, variables),
        html: this.replaceVariables(template.html_content, variables),
        text: template.text_content ? this.replaceVariables(template.text_content, variables) : ''
      };
    }

    // Default template
    return this.getDefaultShipmentTemplate(variables);
  }

  /**
   * Generate delivery email content
   * @param order - Order details
   * @param store - Store details
   * @param orderItems - Order items
   * @param deliveryData - Delivery information
   * @param template - Email template
   * @returns Promise<EmailContent>
   */
  private async generateDeliveryEmailContent(
    order: Order,
    store: Store,
    orderItems: OrderItem[],
    deliveryData: {
      delivered_date: Date;
      delivery_location?: string;
      recipient_name?: string;
      signature_required?: boolean;
      proof_of_delivery_url?: string;
    },
    template?: NotificationTemplate
  ): Promise<{ subject: string; html: string; text: string }> {
    const variables = {
      customer_name: `${order.customer_first_name} ${order.customer_last_name}`,
      order_number: order.order_number,
      store_name: store.store_name,
      delivered_date: deliveryData.delivered_date || new Date().toLocaleDateString(),
      tracking_number: deliveryData.tracking_number || 'N/A',
      carrier: deliveryData.carrier || 'N/A',
      delivery_confirmation: deliveryData.delivery_confirmation || 'Standard',
      order_total: `$${order.total_amount.toFixed(2)}`,
      order_items: orderItems.map(item => ({
        name: item.product_name,
        quantity: item.quantity,
        price: `$${item.unit_price.toFixed(2)}`
      })),
      shipping_address: `${order.shipping_address_line1}, ${order.shipping_city}, ${order.shipping_state} ${order.shipping_postal_code}`,
      contact_email: store.contact_email || this.DEFAULT_FROM_EMAIL,
      store_url: store.domain || `https://${store.store_slug}.rebelcart.com`
    };

    if (template) {
      return {
        subject: this.replaceVariables(template.subject, variables),
        html: this.replaceVariables(template.html_content, variables),
        text: template.text_content ? this.replaceVariables(template.text_content, variables) : ''
      };
    }

    // Default template
    return this.getDefaultDeliveryTemplate(variables);
  }

  /**
   * Generate exception email content
   * @param order - Order details
   * @param store - Store details
   * @param orderItems - Order items
   * @param exceptionData - Exception information
   * @param template - Email template
   * @returns Promise<EmailContent>
   */
  private async generateExceptionEmailContent(
    order: Order,
    store: Store,
    orderItems: OrderItem[],
    exceptionData: {
      exception_type: string;
      exception_description: string;
      resolution_instructions?: string;
      contact_carrier_url?: string;
      estimated_resolution_date?: Date;
    },
    template?: NotificationTemplate
  ): Promise<{ subject: string; html: string; text: string }> {
    const variables = {
      customer_name: `${order.customer_first_name} ${order.customer_last_name}`,
      order_number: order.order_number,
      store_name: store.store_name,
      exception_description: exceptionData.exception_description || 'Delivery exception occurred',
      tracking_number: exceptionData.tracking_number || 'N/A',
      carrier: exceptionData.carrier || 'N/A',
      exception_date: exceptionData.exception_date || new Date().toLocaleDateString(),
      next_steps: exceptionData.next_steps || 'Please contact customer service for assistance',
      order_total: `$${order.total_amount.toFixed(2)}`,
      contact_email: store.contact_email || this.DEFAULT_FROM_EMAIL,
      store_url: store.domain || `https://${store.store_slug}.rebelcart.com`
    };

    if (template) {
      return {
        subject: this.replaceVariables(template.subject, variables),
        html: this.replaceVariables(template.html_content, variables),
        text: template.text_content ? this.replaceVariables(template.text_content, variables) : ''
      };
    }

    // Default template
    return this.getDefaultExceptionTemplate(variables);
  }

  /**
   * Get default shipment email template
   * @param variables - Template variables
   * @returns EmailContent
   */
  private getDefaultShipmentTemplate(variables: ShipmentTemplateVariables): { subject: string; html: string; text: string } {
    const subject = `Your order #${variables.order_number} has shipped! 📦`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Shipped</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .order-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .tracking-info { background: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
          .item-list { margin: 10px 0; }
          .item { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .item:last-child { border-bottom: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Your Order Has Shipped!</h1>
          </div>
          
          <div class="content">
            <p>Hi ${variables.customer_name},</p>
            
            <p>Great news! Your order from <strong>${variables.store_name}</strong> has been shipped and is on its way to you.</p>
            
            <div class="tracking-info">
              <h3>📍 Tracking Information</h3>
              <p><strong>Tracking Number:</strong> ${variables.tracking_number}</p>
              <p><strong>Carrier:</strong> ${variables.carrier}</p>
              <p><strong>Estimated Delivery:</strong> ${variables.estimated_delivery}</p>
              
              ${variables.tracking_url !== '#' ? `<p><a href="${variables.tracking_url}" class="button">Track Your Package</a></p>` : ''}
            </div>
            
            <div class="order-info">
              <h3>📋 Order Details</h3>
              <p><strong>Order #:</strong> ${variables.order_number}</p>
              <p><strong>Total:</strong> ${variables.order_total}</p>
              
              <div class="item-list">
                <h4>Items Shipped:</h4>
                ${variables.order_items.map((item) => `
                  <div class="item">
                    <strong>${item.name}</strong> - Qty: ${item.quantity} - ${item.price}
                  </div>
                `).join('')}
              </div>
              
              <h4>Shipping Address:</h4>
              <p>${variables.shipping_address}</p>
            </div>
            
            <p>If you have any questions about your order, please don't hesitate to contact us at <a href="mailto:${variables.contact_email}">${variables.contact_email}</a>.</p>
            
            <p>Thank you for your business!</p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} ${variables.store_name}. All rights reserved.</p>
            <p><a href="${variables.store_url}">Visit our store</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Your Order Has Shipped!
      
      Hi ${variables.customer_name},
      
      Your order from ${variables.store_name} has been shipped and is on its way to you.
      
      Tracking Information:
      - Tracking Number: ${variables.tracking_number}
      - Carrier: ${variables.carrier}
      - Estimated Delivery: ${variables.estimated_delivery}
      
      Order Details:
      - Order #: ${variables.order_number}
      - Total: ${variables.order_total}
      
      Items Shipped:
      ${variables.order_items.map((item) => `- ${item.name} (Qty: ${item.quantity}) - ${item.price}`).join('\n')}
      
      Shipping Address: ${variables.shipping_address}
      
      If you have any questions, contact us at ${variables.contact_email}.
      
      Thank you for your business!
      
      ${variables.store_name}
      ${variables.store_url}
    `;

    return { subject, html, text };
  }

  /**
   * Get default delivery email template
   * @param variables - Template variables
   * @returns EmailContent
   */
  private getDefaultDeliveryTemplate(variables: DeliveryTemplateVariables): { subject: string; html: string; text: string } {
    const subject = `Your order #${variables.order_number} has been delivered! 🎉`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Delivered</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .order-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .delivery-info { background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Order Delivered!</h1>
          </div>
          
          <div class="content">
            <p>Hi ${variables.customer_name},</p>
            
            <p>Your order from <strong>${variables.store_name}</strong> has been successfully delivered!</p>
            
            <div class="delivery-info">
              <h3>📍 Delivery Information</h3>
              <p><strong>Delivered on:</strong> ${variables.delivered_date}</p>
              <p><strong>Tracking Number:</strong> ${variables.tracking_number}</p>
              <p><strong>Carrier:</strong> ${variables.carrier}</p>
              <p><strong>Delivery Type:</strong> ${variables.delivery_confirmation}</p>
            </div>
            
            <div class="order-info">
              <h3>📋 Order Summary</h3>
              <p><strong>Order #:</strong> ${variables.order_number}</p>
              <p><strong>Total:</strong> ${variables.order_total}</p>
              <p><strong>Delivered to:</strong> ${variables.shipping_address}</p>
            </div>
            
            <p>We hope you love your purchase! If you have any questions or concerns, please contact us at <a href="mailto:${variables.contact_email}">${variables.contact_email}</a>.</p>
            
            <p><a href="${variables.store_url}" class="button">Shop Again</a></p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} ${variables.store_name}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Order Delivered!
      
      Hi ${variables.customer_name},
      
      Your order from ${variables.store_name} has been successfully delivered!
      
      Delivery Information:
      - Delivered on: ${variables.delivered_date}
      - Tracking Number: ${variables.tracking_number}
      - Carrier: ${variables.carrier}
      - Delivery Type: ${variables.delivery_confirmation}
      
      Order Summary:
      - Order #: ${variables.order_number}
      - Total: ${variables.order_total}
      - Delivered to: ${variables.shipping_address}
      
      We hope you love your purchase! If you have any questions, contact us at ${variables.contact_email}.
      
      Thank you for choosing ${variables.store_name}!
      ${variables.store_url}
    `;

    return { subject, html, text };
  }

  /**
   * Get default exception email template
   * @param variables - Template variables
   * @returns EmailContent
   */
  private getDefaultExceptionTemplate(variables: ExceptionTemplateVariables): { subject: string; html: string; text: string } {
    const subject = `Update on your order #${variables.order_number}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Update</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f59e0b; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .exception-info { background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Order Update</h1>
          </div>
          
          <div class="content">
            <p>Hi ${variables.customer_name},</p>
            
            <p>We have an update regarding your order from <strong>${variables.store_name}</strong>.</p>
            
            <div class="exception-info">
              <h3>⚠️ Delivery Exception</h3>
              <p><strong>Issue:</strong> ${variables.exception_description}</p>
              <p><strong>Date:</strong> ${variables.exception_date}</p>
              <p><strong>Tracking Number:</strong> ${variables.tracking_number}</p>
              <p><strong>Carrier:</strong> ${variables.carrier}</p>
              
              <h4>Next Steps:</h4>
              <p>${variables.next_steps}</p>
            </div>
            
            <p>We're actively working to resolve this issue. If you have any questions or concerns, please don't hesitate to contact us at <a href="mailto:${variables.contact_email}">${variables.contact_email}</a>.</p>
            
            <p><a href="mailto:${variables.contact_email}" class="button">Contact Support</a></p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} ${variables.store_name}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Order Update
      
      Hi ${variables.customer_name},
      
      We have an update regarding your order from ${variables.store_name}.
      
      Delivery Exception:
      - Issue: ${variables.exception_description}
      - Date: ${variables.exception_date}
      - Tracking Number: ${variables.tracking_number}
      - Carrier: ${variables.carrier}
      
      Next Steps: ${variables.next_steps}
      
      We're actively working to resolve this issue. If you have questions, contact us at ${variables.contact_email}.
      
      ${variables.store_name}
      ${variables.store_url}
    `;

    return { subject, html, text };
  }

  /**
   * Replace variables in template string
   * @param template - Template string
   * @param variables - Variables to replace
   * @returns string
   */
  private replaceVariables(template: string, variables: EmailTemplateVariables | ShipmentTemplateVariables | DeliveryTemplateVariables | ExceptionTemplateVariables): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match;
    });
  }

  /**
   * Send email using configured email service
   * @param emailData - Email data
   * @returns Promise<boolean>
   */
  private async sendEmail(emailData: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    fromName?: string;
  }): Promise<boolean> {
    try {
      // In a real implementation, this would use a service like SendGrid, Mailgun, etc.
      // For now, we'll just log it and return true
      console.log('Email notification sent:', {
        to: emailData.to,
        subject: emailData.subject,
        from: emailData.from,
        fromName: emailData.fromName
      });

      // TODO: Implement actual email sending
      // const response = await emailProvider.send(emailData);
      // return response.success;

      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  /**
   * Get order with details
   * @param orderId - Order UUID
   * @returns Promise<Order | null>
   */
  private async getOrderWithDetails(orderId: UUID): Promise<Order | null> {
    try {
      const result = await db.query(`
        SELECT * FROM orders WHERE id = $1
      `, [orderId]);

      return result.rows.length > 0 ? result.rows[0] as Order : null;
    } catch (error) {
      console.error('Error getting order details:', error);
      return null;
    }
  }

  /**
   * Get store details
   * @param storeId - Store UUID
   * @returns Promise<Store | null>
   */
  private async getStoreDetails(storeId: UUID): Promise<Store | null> {
    try {
      const result = await db.query(`
        SELECT * FROM stores WHERE id = $1
      `, [storeId]);

      return result.rows.length > 0 ? result.rows[0] as Store : null;
    } catch (error) {
      console.error('Error getting store details:', error);
      return null;
    }
  }

  /**
   * Get order items
   * @param orderId - Order UUID
   * @returns Promise<OrderItem[]>
   */
  private async getOrderItems(orderId: UUID): Promise<OrderItem[]> {
    try {
      const result = await db.query(`
        SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at
      `, [orderId]);

      return result.rows as OrderItem[];
    } catch (error) {
      console.error('Error getting order items:', error);
      return [];
    }
  }

  /**
   * Get notification template
   * @param storeId - Store UUID
   * @param templateType - Template type
   * @returns Promise<NotificationTemplate | null>
   */
  private async getNotificationTemplate(
    storeId: UUID,
    templateType: 'order_confirmation' | 'shipment_notification' | 'delivery_notification' | 'exception_notification'
  ): Promise<NotificationTemplate | null> {
    try {
      const result = await db.query(`
        SELECT * FROM notification_templates 
        WHERE store_id = $1 AND template_type = $2 AND is_active = true
      `, [storeId, templateType]);

      return result.rows.length > 0 ? result.rows[0] as NotificationTemplate : null;
    } catch (error) {
      console.error('Error getting notification template:', error);
      return null;
    }
  }

  /**
   * Log notification attempt
   * @param orderId - Order UUID
   * @param notificationType - Notification type
   * @param success - Success status
   * @param error - Error object
   * @returns Promise<void>
   */
  private async logNotification(
    orderId: UUID,
    notificationType: string,
    success: boolean,
    error?: Error | string
  ): Promise<void> {
    try {
      await db.query(`
        INSERT INTO shipment_notifications (
          id, order_id, notification_type, sent_at, email_sent, email_error, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        uuidv4(),
        orderId,
        notificationType,
        new Date(),
        success,
        error ? (error.message || error.toString()) : null,
        new Date()
      ]);
    } catch (dbError) {
      console.error('Error logging notification:', dbError);
    }
  }

  /**
   * Create or update notification template
   * @param storeId - Store UUID
   * @param templateType - Template type
   * @param subject - Email subject
   * @param htmlContent - HTML content
   * @param textContent - Text content
   * @returns Promise<UUID>
   */
  async createNotificationTemplate(
    storeId: UUID,
    templateType: 'order_confirmation' | 'shipment_notification' | 'delivery_notification' | 'exception_notification',
    subject: string,
    htmlContent: string,
    textContent?: string
  ): Promise<UUID> {
    const templateId = uuidv4();
    
    await db.query(`
      INSERT INTO notification_templates (
        id, store_id, template_type, subject, html_content, text_content, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (store_id, template_type) 
      DO UPDATE SET 
        subject = EXCLUDED.subject,
        html_content = EXCLUDED.html_content,
        text_content = EXCLUDED.text_content,
        updated_at = EXCLUDED.updated_at
    `, [
      templateId,
      storeId,
      templateType,
      subject,
      htmlContent,
      textContent,
      true,
      new Date(),
      new Date()
    ]);

    return templateId;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();