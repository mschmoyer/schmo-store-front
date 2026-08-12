/**
 * The storefront customizer.
 *
 * `/admin/design` mounts {@link Customizer}; everything else in this folder is
 * internal to it. The engine it edits lives in `src/lib/storefront-theme` and
 * the preview protocol it speaks is `docs/storefront-theme-spec.md` section 10.
 */

export { Customizer, type CustomizerProps } from './Customizer';
