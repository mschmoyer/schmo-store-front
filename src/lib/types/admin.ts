// Admin-related TypeScript types
export interface AdminUser {
  id: string;
  storeId: string;
  email: string;
  store: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    theme_id: string;
  };
}

export interface AdminSession {
  id: string;
  storeId: string;
  sessionToken: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AdminAuthResponse {
  success: boolean;
  user?: AdminUser;
  session?: AdminSession;
  error?: string;
}

export interface AdminLoginRequest {
  storeSlug: string;
  password: string;
}

export interface AdminVerifyRequest {
  sessionToken: string;
}

export interface AdminContext {
  user: AdminUser | null;
  session: AdminSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: AdminLoginRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  verify: () => Promise<boolean>;
  forceLogout: () => void;
}

export interface AdminDashboardStats {
  totalProducts: number;
  visibleProducts: number;
  hiddenProducts: number;
  productsWithDiscounts: number;
  totalBlogPosts: number;
  publishedBlogPosts: number;
  draftBlogPosts: number;
  totalCategories: number;
  visibleCategories: number;
  integrations: {
    shipengine: boolean;
    stripe: boolean;
  };
}

export interface AdminNavigationItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
  children?: AdminNavigationItem[];
}

export interface AdminBreadcrumb {
  label: string;
  href?: string;
}

export interface AdminPageProps {
  title: string;
  breadcrumbs?: AdminBreadcrumb[];
  children: React.ReactNode;
}

export interface AdminFormState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
}

export interface AdminTableColumn<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
}

export interface AdminTableProps<T> {
  data: T[];
  columns: AdminTableColumn<T>[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface AdminNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  actions?: Array<{
    label: string;
    onClick: () => void;
  }>;
}