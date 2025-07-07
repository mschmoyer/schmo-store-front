import { User, UserRow, SessionRow } from '@/types/auth';
import { Store, StoreRow } from '@/types/store';

// Mock database for development
// In production, this would be replaced with actual database operations

// Mock data storage
let mockUsers: UserRow[] = [];
let mockStores: StoreRow[] = [];
let mockSessions: SessionRow[] = [];

// Helper function to generate UUID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Helper function to convert UserRow to User
function userRowToUser(userRow: UserRow): User {
  return {
    id: userRow.id,
    email: userRow.email,
    createdAt: userRow.created_at,
    updatedAt: userRow.updated_at,
    isActive: userRow.is_active,
    emailVerified: userRow.email_verified,
  };
}

// Helper function to convert StoreRow to Store
function storeRowToStore(storeRow: StoreRow): Store {
  return {
    id: storeRow.id,
    userId: storeRow.user_id,
    title: storeRow.title,
    description: storeRow.description,
    storeSlug: storeRow.store_slug,
    theme: storeRow.theme,
    domain: storeRow.domain,
    isActive: storeRow.is_active,
    isPublic: storeRow.is_public,
    createdAt: storeRow.created_at,
    updatedAt: storeRow.updated_at,
  };
}

// User database operations
export class UserDB {
  static async create(userData: {
    email: string;
    passwordHash: string;
    emailVerified?: boolean;
  }): Promise<User> {
    const now = new Date();
    const userRow: UserRow = {
      id: generateId(),
      email: userData.email,
      password_hash: userData.passwordHash,
      created_at: now,
      updated_at: now,
      is_active: true,
      email_verified: userData.emailVerified || false,
      verification_token: null,
      reset_token: null,
      reset_token_expires: null,
    };

    mockUsers.push(userRow);
    return userRowToUser(userRow);
  }

  static async findByEmail(email: string): Promise<User | null> {
    const userRow = mockUsers.find(u => u.email === email);
    return userRow ? userRowToUser(userRow) : null;
  }

  static async findById(id: string): Promise<User | null> {
    const userRow = mockUsers.find(u => u.id === id);
    return userRow ? userRowToUser(userRow) : null;
  }

  static async findByIdWithPassword(id: string): Promise<UserRow | null> {
    return mockUsers.find(u => u.id === id) || null;
  }

  static async findByEmailWithPassword(email: string): Promise<UserRow | null> {
    return mockUsers.find(u => u.email === email) || null;
  }

  static async update(id: string, updates: Partial<UserRow>): Promise<User | null> {
    const userIndex = mockUsers.findIndex(u => u.id === id);
    if (userIndex === -1) return null;

    mockUsers[userIndex] = {
      ...mockUsers[userIndex],
      ...updates,
      updated_at: new Date(),
    };

    return userRowToUser(mockUsers[userIndex]);
  }

  static async delete(id: string): Promise<boolean> {
    const userIndex = mockUsers.findIndex(u => u.id === id);
    if (userIndex === -1) return false;

    mockUsers.splice(userIndex, 1);
    return true;
  }

  static async setVerificationToken(userId: string, token: string): Promise<boolean> {
    const userIndex = mockUsers.findIndex(u => u.id === userId);
    if (userIndex === -1) return false;

    mockUsers[userIndex].verification_token = token;
    mockUsers[userIndex].updated_at = new Date();
    return true;
  }

  static async setResetToken(userId: string, token: string, expiresAt: Date): Promise<boolean> {
    const userIndex = mockUsers.findIndex(u => u.id === userId);
    if (userIndex === -1) return false;

    mockUsers[userIndex].reset_token = token;
    mockUsers[userIndex].reset_token_expires = expiresAt;
    mockUsers[userIndex].updated_at = new Date();
    return true;
  }

  static async verifyEmail(userId: string): Promise<boolean> {
    const userIndex = mockUsers.findIndex(u => u.id === userId);
    if (userIndex === -1) return false;

    mockUsers[userIndex].email_verified = true;
    mockUsers[userIndex].verification_token = null;
    mockUsers[userIndex].updated_at = new Date();
    return true;
  }
}

// Store database operations
export class StoreDB {
  static async create(storeData: {
    userId: string;
    title: string;
    description: string;
    storeSlug: string;
    theme: string;
    domain?: string;
  }): Promise<Store> {
    const now = new Date();
    const storeRow: StoreRow = {
      id: generateId(),
      user_id: storeData.userId,
      title: storeData.title,
      description: storeData.description,
      store_slug: storeData.storeSlug,
      theme: storeData.theme,
      domain: storeData.domain || null,
      is_active: true,
      is_public: false,
      created_at: now,
      updated_at: now,
    };

    mockStores.push(storeRow);
    return storeRowToStore(storeRow);
  }

  static async findById(id: string): Promise<Store | null> {
    const storeRow = mockStores.find(s => s.id === id);
    return storeRow ? storeRowToStore(storeRow) : null;
  }

  static async findBySlug(slug: string): Promise<Store | null> {
    const storeRow = mockStores.find(s => s.store_slug === slug);
    return storeRow ? storeRowToStore(storeRow) : null;
  }

  static async findByUserId(userId: string): Promise<Store[]> {
    const storeRows = mockStores.filter(s => s.user_id === userId);
    return storeRows.map(storeRowToStore);
  }

  static async findByUserIdActive(userId: string): Promise<Store[]> {
    const storeRows = mockStores.filter(s => s.user_id === userId && s.is_active);
    return storeRows.map(storeRowToStore);
  }

  static async update(id: string, updates: Partial<StoreRow>): Promise<Store | null> {
    const storeIndex = mockStores.findIndex(s => s.id === id);
    if (storeIndex === -1) return null;

    mockStores[storeIndex] = {
      ...mockStores[storeIndex],
      ...updates,
      updated_at: new Date(),
    };

    return storeRowToStore(mockStores[storeIndex]);
  }

  static async delete(id: string): Promise<boolean> {
    const storeIndex = mockStores.findIndex(s => s.id === id);
    if (storeIndex === -1) return false;

    mockStores.splice(storeIndex, 1);
    return true;
  }

  static async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    const existingStore = mockStores.find(s => 
      s.store_slug === slug && (!excludeId || s.id !== excludeId)
    );
    return !existingStore;
  }

  static async getPublicStores(limit: number = 10, offset: number = 0): Promise<Store[]> {
    const publicStores = mockStores
      .filter(s => s.is_public && s.is_active)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(offset, offset + limit);
    
    return publicStores.map(storeRowToStore);
  }

  static async getStoreCount(): Promise<number> {
    return mockStores.length;
  }

  static async getActiveStoreCount(): Promise<number> {
    return mockStores.filter(s => s.is_active).length;
  }

  static async getPublicStoreCount(): Promise<number> {
    return mockStores.filter(s => s.is_public && s.is_active).length;
  }
}

// Session database operations
export class SessionDB {
  static async create(sessionData: {
    userId: string;
    token: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<SessionRow> {
    const sessionRow: SessionRow = {
      id: generateId(),
      user_id: sessionData.userId,
      token: sessionData.token,
      expires_at: sessionData.expiresAt,
      created_at: new Date(),
      user_agent: sessionData.userAgent || null,
      ip_address: sessionData.ipAddress || null,
    };

    mockSessions.push(sessionRow);
    return sessionRow;
  }

  static async findByToken(token: string): Promise<SessionRow | null> {
    return mockSessions.find(s => s.token === token) || null;
  }

  static async findByUserId(userId: string): Promise<SessionRow[]> {
    return mockSessions.filter(s => s.user_id === userId);
  }

  static async deleteByToken(token: string): Promise<boolean> {
    const sessionIndex = mockSessions.findIndex(s => s.token === token);
    if (sessionIndex === -1) return false;

    mockSessions.splice(sessionIndex, 1);
    return true;
  }

  static async deleteByUserId(userId: string): Promise<number> {
    const initialLength = mockSessions.length;
    mockSessions = mockSessions.filter(s => s.user_id !== userId);
    return initialLength - mockSessions.length;
  }

  static async deleteExpired(): Promise<number> {
    const now = new Date();
    const initialLength = mockSessions.length;
    mockSessions = mockSessions.filter(s => s.expires_at > now);
    return initialLength - mockSessions.length;
  }

  static async cleanup(): Promise<void> {
    await this.deleteExpired();
  }
}

// Database initialization and cleanup
export class Database {
  static async init(): Promise<void> {
    // Initialize database connections
    console.log('Database initialized (mock implementation)');
  }

  static async cleanup(): Promise<void> {
    // Clean up expired sessions
    await SessionDB.cleanup();
    console.log('Database cleanup completed');
  }

  static async reset(): Promise<void> {
    // Reset all mock data (useful for testing)
    mockUsers = [];
    mockStores = [];
    mockSessions = [];
    console.log('Database reset completed');
  }

  static async seed(): Promise<void> {
    // Seed database with initial data
    console.log('Database seeding completed');
  }
}

// Utility functions for database operations
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

export async function transaction<T>(operations: (() => Promise<T>)[]): Promise<T[]> {
  // Mock transaction implementation
  const results: T[] = [];
  
  try {
    for (const operation of operations) {
      const result = await operation();
      results.push(result);
    }
    return results;
  } catch (error) {
    // In a real implementation, this would rollback the transaction
    console.error('Transaction failed:', error);
    throw error;
  }
}

// Export database instances
export const db = {
  users: UserDB,
  stores: StoreDB,
  sessions: SessionDB,
  init: Database.init,
  cleanup: Database.cleanup,
  reset: Database.reset,
  seed: Database.seed,
};

export default db;