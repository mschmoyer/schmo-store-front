// User repository - handles user authentication and management

import { BaseRepository } from './base';
import { User, CreateUserInput, UpdateUserInput, UUID } from '@/types/database';
import { db } from '../connection';

export class UserRepository extends BaseRepository<User, CreateUserInput, UpdateUserInput> {
  constructor() {
    super('users', false);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Find user by verification token
   */
  async findByVerificationToken(token: string): Promise<User | null> {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE email_verification_token = $1',
        [token]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by verification token:', error);
      throw error;
    }
  }

  /**
   * Find user by password reset token
   */
  async findByPasswordResetToken(token: string): Promise<User | null> {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()',
        [token]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by password reset token:', error);
      throw error;
    }
  }

  /**
   * Create user with email verification token
   */
  async createWithVerificationToken(
    userData: CreateUserInput,
    verificationToken: string
  ): Promise<User> {
    try {
      const result = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, email_verification_token, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          userData.email,
          userData.password_hash,
          userData.first_name,
          userData.last_name,
          verificationToken,
          false
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating user with verification token:', error);
      throw error;
    }
  }

  /**
   * Verify user email
   */
  async verifyEmail(token: string): Promise<User | null> {
    try {
      const result = await db.query(
        `UPDATE users 
         SET email_verified = true, email_verification_token = NULL, updated_at = NOW()
         WHERE email_verification_token = $1
         RETURNING *`,
        [token]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error verifying user email:', error);
      throw error;
    }
  }

  /**
   * Set password reset token
   */
  async setPasswordResetToken(
    email: string,
    token: string,
    expiresAt: Date
  ): Promise<User | null> {
    try {
      const result = await db.query(
        `UPDATE users 
         SET password_reset_token = $1, password_reset_expires = $2, updated_at = NOW()
         WHERE email = $3
         RETURNING *`,
        [token, expiresAt, email]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error setting password reset token:', error);
      throw error;
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(token: string, newPasswordHash: string): Promise<User | null> {
    try {
      const result = await db.query(
        `UPDATE users 
         SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL, updated_at = NOW()
         WHERE password_reset_token = $2 AND password_reset_expires > NOW()
         RETURNING *`,
        [newPasswordHash, token]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error resetting password:', error);
      throw error;
    }
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId: UUID): Promise<void> {
    try {
      await db.query(
        'UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1',
        [userId]
      );
    } catch (error) {
      console.error('Error updating last login:', error);
      throw error;
    }
  }

  /**
   * Change password
   */
  async changePassword(userId: UUID, newPasswordHash: string): Promise<User | null> {
    try {
      const result = await db.query(
        `UPDATE users 
         SET password_hash = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [newPasswordHash, userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  }

  /**
   * Deactivate user account
   */
  async deactivateAccount(userId: UUID): Promise<User | null> {
    try {
      const result = await db.query(
        `UPDATE users 
         SET is_active = false, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error deactivating account:', error);
      throw error;
    }
  }

  /**
   * Reactivate user account
   */
  async reactivateAccount(userId: UUID): Promise<User | null> {
    try {
      const result = await db.query(
        `UPDATE users 
         SET is_active = true, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error reactivating account:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: UUID): Promise<{
    total_stores: number;
    active_stores: number;
    total_orders: number;
    total_revenue: number;
  }> {
    try {
      const result = await db.query(
        `SELECT 
           COUNT(s.id) as total_stores,
           COUNT(CASE WHEN s.is_active = true THEN 1 END) as active_stores,
           COALESCE(SUM(order_counts.total_orders), 0) as total_orders,
           COALESCE(SUM(order_counts.total_revenue), 0) as total_revenue
         FROM users u
         LEFT JOIN stores s ON u.id = s.owner_id
         LEFT JOIN (
           SELECT 
             store_id,
             COUNT(*) as total_orders,
             SUM(total_amount) as total_revenue
           FROM orders
           GROUP BY store_id
         ) order_counts ON s.id = order_counts.store_id
         WHERE u.id = $1
         GROUP BY u.id`,
        [userId]
      );

      const stats = result.rows[0];
      return {
        total_stores: parseInt(stats?.total_stores || '0', 10),
        active_stores: parseInt(stats?.active_stores || '0', 10),
        total_orders: parseInt(stats?.total_orders || '0', 10),
        total_revenue: parseFloat(stats?.total_revenue || '0'),
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }

  /**
   * Find users by creation date range
   */
  async findByDateRange(startDate: Date, endDate: Date): Promise<User[]> {
    try {
      const result = await db.query(
        `SELECT * FROM users 
         WHERE created_at >= $1 AND created_at <= $2
         ORDER BY created_at DESC`,
        [startDate, endDate]
      );
      return result.rows;
    } catch (error) {
      console.error('Error finding users by date range:', error);
      throw error;
    }
  }

  /**
   * Search users by name or email
   */
  async searchUsers(searchTerm: string, limit: number = 50): Promise<User[]> {
    try {
      const result = await db.query(
        `SELECT * FROM users 
         WHERE (first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1)
         AND is_active = true
         ORDER BY last_login DESC NULLS LAST
         LIMIT $2`,
        [`%${searchTerm}%`, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  }

  /**
   * Get recently active users
   */
  async getRecentlyActiveUsers(limit: number = 20): Promise<User[]> {
    try {
      const result = await db.query(
        `SELECT * FROM users 
         WHERE is_active = true AND last_login IS NOT NULL
         ORDER BY last_login DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting recently active users:', error);
      throw error;
    }
  }

  /**
   * Count active users
   */
  async countActiveUsers(): Promise<number> {
    try {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE is_active = true'
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      console.error('Error counting active users:', error);
      throw error;
    }
  }

  /**
   * Get user activity summary
   */
  async getUserActivity(userId: UUID, days: number = 30): Promise<{
    login_count: number;
    stores_created: number;
    orders_processed: number;
    last_activity: Date | null;
  }> {
    try {
      const result = await db.query(
        `SELECT 
           COUNT(DISTINCT DATE(u.last_login)) as login_count,
           COUNT(DISTINCT s.id) as stores_created,
           COUNT(DISTINCT o.id) as orders_processed,
           MAX(GREATEST(u.last_login, s.created_at, o.created_at)) as last_activity
         FROM users u
         LEFT JOIN stores s ON u.id = s.owner_id AND s.created_at >= NOW() - INTERVAL '${days} days'
         LEFT JOIN orders o ON s.id = o.store_id AND o.created_at >= NOW() - INTERVAL '${days} days'
         WHERE u.id = $1
         GROUP BY u.id`,
        [userId]
      );

      const activity = result.rows[0];
      return {
        login_count: parseInt(activity?.login_count || '0', 10),
        stores_created: parseInt(activity?.stores_created || '0', 10),
        orders_processed: parseInt(activity?.orders_processed || '0', 10),
        last_activity: activity?.last_activity || null,
      };
    } catch (error) {
      console.error('Error getting user activity:', error);
      throw error;
    }
  }
}