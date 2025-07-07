import { z } from 'zod';
import { 
  RESERVED_SLUGS, 
  SLUG_REGEX, 
  MAX_STORE_TITLE_LENGTH, 
  MAX_STORE_DESCRIPTION_LENGTH, 
  MAX_STORE_SLUG_LENGTH, 
  MIN_STORE_SLUG_LENGTH 
} from '@/types/store';

// Authentication validation schemas
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .toLowerCase(),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .toLowerCase(),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Store validation schemas
export const storeSlugSchema = z
  .string()
  .min(MIN_STORE_SLUG_LENGTH, `Slug must be at least ${MIN_STORE_SLUG_LENGTH} characters`)
  .max(MAX_STORE_SLUG_LENGTH, `Slug must be at most ${MAX_STORE_SLUG_LENGTH} characters`)
  .regex(SLUG_REGEX, 'Slug can only contain lowercase letters, numbers, and hyphens')
  .refine((slug) => !RESERVED_SLUGS.includes(slug), {
    message: 'This slug is reserved and cannot be used',
  });

export const storeConfigSchema = z.object({
  title: z
    .string()
    .min(1, 'Store title is required')
    .max(MAX_STORE_TITLE_LENGTH, `Title must be at most ${MAX_STORE_TITLE_LENGTH} characters`)
    .trim(),
  description: z
    .string()
    .min(1, 'Store description is required')
    .max(MAX_STORE_DESCRIPTION_LENGTH, `Description must be at most ${MAX_STORE_DESCRIPTION_LENGTH} characters`)
    .trim(),
  slug: storeSlugSchema,
  theme: z
    .string()
    .min(1, 'Theme is required')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Invalid theme format'),
});

export const storeCreationSchema = z.object({
  title: z
    .string()
    .min(1, 'Store title is required')
    .max(MAX_STORE_TITLE_LENGTH, `Title must be at most ${MAX_STORE_TITLE_LENGTH} characters`)
    .trim(),
  description: z
    .string()
    .min(1, 'Store description is required')
    .max(MAX_STORE_DESCRIPTION_LENGTH, `Description must be at most ${MAX_STORE_DESCRIPTION_LENGTH} characters`)
    .trim(),
  theme: z
    .string()
    .min(1, 'Theme is required')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Invalid theme format'),
  slug: storeSlugSchema.optional(),
});

export const storeUpdateSchema = z.object({
  title: z
    .string()
    .max(MAX_STORE_TITLE_LENGTH, `Title must be at most ${MAX_STORE_TITLE_LENGTH} characters`)
    .trim()
    .optional(),
  description: z
    .string()
    .max(MAX_STORE_DESCRIPTION_LENGTH, `Description must be at most ${MAX_STORE_DESCRIPTION_LENGTH} characters`)
    .trim()
    .optional(),
  theme: z
    .string()
    .regex(/^[a-zA-Z0-9-_]+$/, 'Invalid theme format')
    .optional(),
  domain: z
    .string()
    .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid domain format')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

// Wizard validation schemas
export const accountStepSchema = registerSchema;

export const storeStepSchema = storeConfigSchema;

export const wizardDataSchema = z.object({
  account: accountStepSchema,
  store: storeStepSchema,
});

// Slug generation validation
export const slugGenerationSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(MAX_STORE_TITLE_LENGTH, `Title must be at most ${MAX_STORE_TITLE_LENGTH} characters`)
    .trim(),
});

export const slugAvailabilitySchema = z.object({
  slug: storeSlugSchema,
});

// Contact form validation
export const contactFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters')
    .trim(),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .toLowerCase(),
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(200, 'Subject must be at most 200 characters')
    .trim(),
  message: z
    .string()
    .min(1, 'Message is required')
    .max(1000, 'Message must be at most 1000 characters')
    .trim(),
});

// Password reset validation
export const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .toLowerCase(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Email verification validation
export const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// Utility functions for validation
export function validateEmail(email: string): boolean {
  try {
    z.string().email().parse(email);
    return true;
  } catch {
    return false;
  }
}

export function validatePassword(password: string): boolean {
  try {
    z.string()
      .min(8)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .parse(password);
    return true;
  } catch {
    return false;
  }
}

export function validateStoreSlug(slug: string): boolean {
  try {
    storeSlugSchema.parse(slug);
    return true;
  } catch {
    return false;
  }
}

export function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

export function validateAndGenerateSlug(title: string): string {
  const baseSlug = generateSlugFromTitle(title);
  
  // Ensure the slug meets minimum length requirements
  if (baseSlug.length < MIN_STORE_SLUG_LENGTH) {
    return `${baseSlug}-store`;
  }
  
  // Ensure the slug doesn't exceed maximum length
  if (baseSlug.length > MAX_STORE_SLUG_LENGTH) {
    return baseSlug.substring(0, MAX_STORE_SLUG_LENGTH);
  }
  
  return baseSlug;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.toLowerCase());
}

export function getPasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('Use at least 8 characters');
  }

  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include lowercase letters');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include uppercase letters');
  }

  if (/\d/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include numbers');
  }

  if (/[^a-zA-Z0-9]/.test(password)) {
    score += 1;
    feedback.pop(); // Remove one negative feedback for special chars
  } else {
    feedback.push('Include special characters');
  }

  return { score, feedback };
}

export function sanitizeStoreTitle(title: string): string {
  return title
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/&/g, '&amp;') // Escape ampersands
    .substring(0, MAX_STORE_TITLE_LENGTH);
}

export function sanitizeStoreDescription(description: string): string {
  return description
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/&/g, '&amp;') // Escape ampersands
    .substring(0, MAX_STORE_DESCRIPTION_LENGTH);
}

export function normalizeEmail(email: string): string {
  const normalizedEmail = email.toLowerCase().trim();
  const [localPart, domain] = normalizedEmail.split('@');
  
  if (!localPart || !domain) {
    return normalizedEmail;
  }
  
  // For Gmail addresses, remove everything after the first '+' in the local part
  // This treats "user+alias@gmail.com" the same as "user@gmail.com"
  if (domain === 'gmail.com') {
    const basePart = localPart.split('+')[0];
    return `${basePart}@${domain}`;
  }
  
  // For other email providers, return the email as-is (lowercased)
  return normalizedEmail;
}

// Type exports for use in components
export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type StoreConfigFormData = z.infer<typeof storeConfigSchema>;
export type StoreCreationFormData = z.infer<typeof storeCreationSchema>;
export type StoreUpdateFormData = z.infer<typeof storeUpdateSchema>;
export type AccountStepFormData = z.infer<typeof accountStepSchema>;
export type StoreStepFormData = z.infer<typeof storeStepSchema>;
export type WizardFormData = z.infer<typeof wizardDataSchema>;
export type ContactFormData = z.infer<typeof contactFormSchema>;
export type PasswordResetRequestFormData = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmFormData = z.infer<typeof passwordResetConfirmSchema>;
export type EmailVerificationFormData = z.infer<typeof emailVerificationSchema>;
export type SlugGenerationFormData = z.infer<typeof slugGenerationSchema>;
export type SlugAvailabilityFormData = z.infer<typeof slugAvailabilitySchema>;