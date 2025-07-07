// Repository exports - centralized access to all database repositories

export { BaseRepository } from './base';
export { UserRepository } from './user';
export { StoreRepository } from './store'; 
export { ProductRepository } from './product';

import { UserRepository } from './user';
import { StoreRepository } from './store';
import { ProductRepository } from './product';

// Repository instances
export const userRepository = new UserRepository();
export const storeRepository = new StoreRepository();
export const productRepository = new ProductRepository();

// Repository registry for dynamic access
export const repositories = {
  user: userRepository,
  store: storeRepository,
  product: productRepository,
} as const;

export type RepositoryName = keyof typeof repositories;