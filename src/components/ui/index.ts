/**
 * RebelShops primitive kit.
 *
 * Import everything from here:
 *   import { Button, Card, Price } from '@/components/ui';
 *
 * These components are the only sanctioned way to render buttons, cards,
 * badges, form controls, prices and product imagery. They consume the semantic
 * tokens in `src/app/globals.css`; see `/docs/design-system.md` for the rules
 * they implement.
 */

/* -- Actions ------------------------------------------------------------- */
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';

/* -- Surfaces ------------------------------------------------------------ */
export {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  type CardBodyProps,
  type CardFooterProps,
  type CardHeaderProps,
  type CardPadding,
  type CardProps,
  type CardTone,
} from './Card';

/* -- Status -------------------------------------------------------------- */
export { Badge, type BadgeProps, type BadgeSize, type BadgeTone } from './Badge';

/* -- Forms --------------------------------------------------------------- */
export { Input, type InputProps, type InputSize } from './Input';
export { Textarea, type TextareaProps } from './Textarea';
export { Select, type SelectOption, type SelectProps } from './Select';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { Switch, type SwitchProps } from './Switch';
export { FieldShell, describedBy, type FieldOwnProps } from './Field';

/* -- Feedback ------------------------------------------------------------ */
export { Spinner, type SpinnerProps, type SpinnerSize } from './Spinner';
export {
  Skeleton,
  SkeletonCard,
  SkeletonText,
  type SkeletonCardProps,
  type SkeletonProps,
  type SkeletonShape,
  type SkeletonTextProps,
} from './Skeleton';
export { EmptyState, type EmptyStateProps } from './EmptyState';

/* -- Overlays ------------------------------------------------------------ */
export { Tooltip, type TooltipProps } from './Tooltip';
export { Modal, type ModalProps, type ModalSize } from './Modal';
export { Drawer, type DrawerProps, type DrawerSize } from './Drawer';

/* -- Commerce ------------------------------------------------------------ */
export { Price, type PriceProps, type PriceSize } from './Price';
export {
  ProductImage,
  getProductMark,
  type ProductImageFit,
  type ProductImageProps,
  type ProductImageRadius,
  type ProductMark,
} from './ProductImage';

/* -- Layout -------------------------------------------------------------- */
export {
  Container,
  Divider,
  Eyebrow,
  Section,
  Stack,
  type ContainerProps,
  type ContainerWidth,
  type DividerProps,
  type EyebrowProps,
  type SectionProps,
  type SectionTone,
  type StackProps,
} from './Layout';

/* -- App shell ----------------------------------------------------------- */
export { AppProviders, type AppProvidersProps } from './AppProviders';

/* -- Pre-existing components, re-exported for a single import surface ---- */
export { RebelShopLogo } from './RebelShopLogo';
export { StarRating } from './StarRating';
export { ImageZoom } from './ImageZoom';
