// Base repository class with common database operations
// Provides CRUD operations and query building utilities

import { PoolClient, QueryResult } from 'pg';
import { query, transaction, validateUUID } from '../connection';
import { UUID, PaginatedResponse } from '@/types/database';

export abstract class BaseRepository<T = Record<string, unknown>, CreateInput = Record<string, unknown>, UpdateInput = Record<string, unknown>> {
  protected tableName: string;
  protected primaryKey: string = 'id';
  protected requiresStore: boolean = false;

  constructor(tableName: string, requiresStore: boolean = false) {
    this.tableName = tableName;
    this.requiresStore = requiresStore;
  }

  /**
   * Find entity by ID
   */
  async findById(id: UUID, storeId?: UUID): Promise<T | null> {
    try {
      if (!validateUUID(id)) {
        throw new Error('Invalid ID format');
      }

      let queryText = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
      const params = [id];

      if (this.requiresStore && storeId) {
        if (!validateUUID(storeId)) {
          throw new Error('Invalid store ID format');
        }
        queryText += ' AND store_id = $2';
        params.push(storeId);
      }

      const result = await query<T>(queryText, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Error finding ${this.tableName} by ID:`, error);
      throw error;
    }
  }

  /**
   * Find all entities with optional filtering
   */
  async findAll(
    storeId?: UUID,
    filters?: Record<string, unknown>,
    orderBy?: string,
    limit?: number,
    offset?: number
  ): Promise<T[]> {
    try {
      let queryText = `SELECT * FROM ${this.tableName}`;
      const params: unknown[] = [];
      let paramCount = 0;

      // Add store filter if required
      if (this.requiresStore && storeId) {
        if (!validateUUID(storeId)) {
          throw new Error('Invalid store ID format');
        }
        queryText += ` WHERE store_id = $${++paramCount}`;
        params.push(storeId);
      }

      // Add additional filters
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined) {
            const connector = params.length > 0 ? ' AND ' : ' WHERE ';
            queryText += `${connector}${key} = $${++paramCount}`;
            params.push(value);
          }
        }
      }

      // Add ordering
      if (orderBy) {
        queryText += ` ORDER BY ${orderBy}`;
      }

      // Add pagination
      if (limit) {
        queryText += ` LIMIT $${++paramCount}`;
        params.push(limit);
      }
      if (offset) {
        queryText += ` OFFSET $${++paramCount}`;
        params.push(offset);
      }

      const result = await query<T>(queryText, params);
      return result.rows;
    } catch (error) {
      console.error(`Error finding ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Create new entity
   */
  async create(data: CreateInput): Promise<T> {
    try {
      const fields = Object.keys(data as Record<string, unknown>);
      const values = Object.values(data as Record<string, unknown>);
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

      const queryText = `
        INSERT INTO ${this.tableName} (${fields.join(', ')})
        VALUES (${placeholders})
        RETURNING *
      `;

      const result = await query<T>(queryText, values);
      return result.rows[0];
    } catch (error) {
      console.error(`Error creating ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update entity by ID
   */
  async update(id: UUID, data: UpdateInput, storeId?: UUID): Promise<T | null> {
    try {
      if (!validateUUID(id)) {
        throw new Error('Invalid ID format');
      }

      const fields = Object.keys(data as Record<string, unknown>);
      const values = Object.values(data as Record<string, unknown>);
      
      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
      let queryText = `UPDATE ${this.tableName} SET ${setClause} WHERE ${this.primaryKey} = $${fields.length + 1}`;
      const params = [...values, id];

      if (this.requiresStore && storeId) {
        if (!validateUUID(storeId)) {
          throw new Error('Invalid store ID format');
        }
        queryText += ` AND store_id = $${fields.length + 2}`;
        params.push(storeId);
      }

      queryText += ' RETURNING *';

      const result = await query<T>(queryText, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Error updating ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Delete entity by ID
   */
  async delete(id: UUID, storeId?: UUID): Promise<boolean> {
    try {
      if (!validateUUID(id)) {
        throw new Error('Invalid ID format');
      }

      let queryText = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
      const params = [id];

      if (this.requiresStore && storeId) {
        if (!validateUUID(storeId)) {
          throw new Error('Invalid store ID format');
        }
        queryText += ' AND store_id = $2';
        params.push(storeId);
      }

      const result = await query(queryText, params);
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Error deleting ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Count entities with optional filtering
   */
  async count(storeId?: UUID, filters?: Record<string, unknown>): Promise<number> {
    try {
      let queryText = `SELECT COUNT(*) as count FROM ${this.tableName}`;
      const params: unknown[] = [];
      let paramCount = 0;

      // Add store filter if required
      if (this.requiresStore && storeId) {
        if (!validateUUID(storeId)) {
          throw new Error('Invalid store ID format');
        }
        queryText += ` WHERE store_id = $${++paramCount}`;
        params.push(storeId);
      }

      // Add additional filters
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined) {
            const connector = params.length > 0 ? ' AND ' : ' WHERE ';
            queryText += `${connector}${key} = $${++paramCount}`;
            params.push(value);
          }
        }
      }

      const result = await query<{ count: string }>(queryText, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      console.error(`Error counting ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Check if entity exists
   */
  async exists(id: UUID, storeId?: UUID): Promise<boolean> {
    try {
      if (!validateUUID(id)) {
        throw new Error('Invalid ID format');
      }

      let queryText = `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = $1)`;
      const params = [id];

      if (this.requiresStore && storeId) {
        if (!validateUUID(storeId)) {
          throw new Error('Invalid store ID format');
        }
        queryText = `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = $1 AND store_id = $2)`;
        params.push(storeId);
      }

      const result = await query<{ exists: boolean }>(queryText, params);
      return result.rows[0].exists;
    } catch (error) {
      console.error(`Error checking if ${this.tableName} exists:`, error);
      throw error;
    }
  }

  /**
   * Find entities with pagination
   */
  async findPaginated(
    page: number = 1,
    limit: number = 20,
    storeId?: UUID,
    filters?: Record<string, unknown>,
    orderBy?: string
  ): Promise<PaginatedResponse<T>> {
    try {
      const offset = (page - 1) * limit;
      
      // Get total count
      const totalCount = await this.count(storeId, filters);
      
      // Get paginated results
      const items = await this.findAll(storeId, filters, orderBy, limit, offset);
      
      const totalPages = Math.ceil(totalCount / limit);
      
      return {
        data: items,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error(`Error finding paginated ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Execute raw query
   */
  async rawQuery<R = unknown>(queryText: string, params?: unknown[]): Promise<QueryResult<R>> {
    try {
      return await query<R>(queryText, params);
    } catch (error) {
      console.error('Error executing raw query:', error);
      throw error;
    }
  }

  /**
   * Execute transaction
   */
  async executeTransaction<R>(
    callback: (client: PoolClient) => Promise<R>
  ): Promise<R> {
    try {
      return await transaction(callback);
    } catch (error) {
      console.error('Error executing transaction:', error);
      throw error;
    }
  }

  /**
   * Batch insert
   */
  async batchInsert(items: CreateInput[]): Promise<T[]> {
    try {
      if (items.length === 0) {
        return [];
      }

      const results: T[] = [];
      
      await transaction(async (client) => {
        for (const item of items) {
          const fields = Object.keys(item as Record<string, unknown>);
          const values = Object.values(item as Record<string, unknown>);
          const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

          const queryText = `
            INSERT INTO ${this.tableName} (${fields.join(', ')})
            VALUES (${placeholders})
            RETURNING *
          `;

          const result = await client.query<T>(queryText, values);
          results.push(result.rows[0]);
        }
      });

      return results;
    } catch (error) {
      console.error(`Error batch inserting ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Find by field
   */
  async findByField(
    field: string,
    value: unknown,
    storeId?: UUID
  ): Promise<T | null> {
    try {
      let queryText = `SELECT * FROM ${this.tableName} WHERE ${field} = $1`;
      const params = [value];

      if (this.requiresStore && storeId) {
        if (!validateUUID(storeId)) {
          throw new Error('Invalid store ID format');
        }
        queryText += ' AND store_id = $2';
        params.push(storeId);
      }

      const result = await query<T>(queryText, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Error finding ${this.tableName} by ${field}:`, error);
      throw error;
    }
  }

  /**
   * Find multiple by field
   */
  async findByFields(
    fields: Record<string, unknown>,
    storeId?: UUID
  ): Promise<T[]> {
    try {
      let queryText = `SELECT * FROM ${this.tableName}`;
      const params: unknown[] = [];
      let paramCount = 0;

      // Add store filter if required
      if (this.requiresStore && storeId) {
        if (!validateUUID(storeId)) {
          throw new Error('Invalid store ID format');
        }
        queryText += ` WHERE store_id = $${++paramCount}`;
        params.push(storeId);
      }

      // Add field filters
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          const connector = params.length > 0 ? ' AND ' : ' WHERE ';
          queryText += `${connector}${key} = $${++paramCount}`;
          params.push(value);
        }
      }

      const result = await query<T>(queryText, params);
      return result.rows;
    } catch (error) {
      console.error(`Error finding ${this.tableName} by fields:`, error);
      throw error;
    }
  }

  /**
   * Soft delete (if supported)
   */
  async softDelete(id: UUID, storeId?: UUID): Promise<boolean> {
    try {
      return await this.update(id, { is_active: false } as UpdateInput, storeId) !== null;
    } catch (error) {
      console.error(`Error soft deleting ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Restore soft deleted entity
   */
  async restore(id: UUID, storeId?: UUID): Promise<boolean> {
    try {
      return await this.update(id, { is_active: true } as UpdateInput, storeId) !== null;
    } catch (error) {
      console.error(`Error restoring ${this.tableName}:`, error);
      throw error;
    }
  }
}