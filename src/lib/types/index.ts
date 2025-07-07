// Export all types from the types directory
export * from './admin';
export * from './store';
export * from './blog';
export * from './product';

// Common API response types
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T = unknown> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: string;
  code?: string;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

// Form types
export interface FormFieldError {
  field: string;
  message: string;
}

export interface FormState {
  isSubmitting: boolean;
  errors: FormFieldError[];
  isDirty: boolean;
  isValid: boolean;
}

// File upload types
export interface FileUpload {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  url?: string;
  error?: string;
}