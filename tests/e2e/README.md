# E2E Test Suite

Playwright end-to-end tests. Specs live here; reusable Page Object Models live in `../pages/`,
and the shared admin login fixture in `../fixtures/admin-auth.js`.

All of these require a dev server on `localhost:3000` (`npm run dev`).

```bash
npm run test:e2e                          # everything, headless
npm run test:e2e -- --project=chromium    # one browser — note the `--`
npm run test:e2e -- tests/e2e/storefront.spec.js
npm run test:e2e:headed                   # visible browser
npm run test:e2e:debug                    # step through
npm run test:e2e:ui                       # interactive runner
```

## Specs

| Spec | Covers |
|---|---|
| `marketing.spec.js` | Marketing site, pricing, FAQ |
| `storefront.spec.js` | Customer storefront: catalogue, product, cart |
| `onboarding.spec.js` | Merchant store-creation wizard |
| `customizer.spec.js` | `/admin/design` theme customizer and live preview |
| `admin-navigation.spec.js` | Admin shell and navigation |
| `admin-products.spec.js` | Products listing and edit (documented in detail below) |
| `admin-inventory.spec.js` | Inventory management |
| `admin-orders.spec.js` | Order management |
| `admin-coupons.spec.js` | Coupon management |

The admin specs use `adminAuthFixture` from `../fixtures/admin-auth.js` rather than `test` directly.

---

The rest of this document details the **admin products** suite specifically; it predates the other
specs and has not been generalised to them.

## Test Files

### `admin-products.spec.js`
Comprehensive test suite covering all aspects of the Products admin page functionality:

- **Core Functionality Tests** - Basic page loading, search, filtering, sorting, and actions
- **Product Edit Workflow Tests** - Product editing, form interactions, and tab navigation
- **Edge Cases & Error Handling** - Responsive design, error states, keyboard navigation
- **Complete Workflows** - Full user journey testing including bulk operations and export/import

### Page Object Models

#### `../pages/admin/products-page.js`
Page Object Model for the main Products listing page with methods for:
- Navigation and page loading
- Search and filtering operations
- Sorting and pagination
- Product selection and bulk actions
- Export/import functionality
- Modal interactions

#### `../pages/admin/product-edit-page.js`
Page Object Model for individual product editing pages with methods for:
- Tab navigation (Details, Analytics, Advanced Settings)
- Form field interactions
- Product status management
- Preview and deletion workflows
- Form validation testing

## Test Structure

The tests are organized into 4 main describe blocks:

1. **Core Functionality** - Tests basic page operations and UI interactions
2. **Product Edit Workflow** - Tests product editing and management features
3. **Edge Cases and Error Handling** - Tests responsive design and error scenarios
4. **Complete Workflows** - Tests end-to-end user journeys

## Test Coverage

### Products Page Features Tested:
- ✅ Page loading with all key elements
- ✅ Search functionality with debounced input
- ✅ Status and stock filtering
- ✅ Advanced filters modal
- ✅ Sorting by different fields
- ✅ Actions menu (Export, Import, Bulk Actions)
- ✅ Product selection and bulk operations
- ✅ Pagination navigation
- ✅ Add product navigation
- ✅ Refresh functionality
- ✅ Product interactions (view, edit, status toggle)
- ✅ Interactive elements accessibility
- ✅ Responsive design across viewports
- ✅ Error handling for non-existent products
- ✅ Keyboard navigation support

### Product Edit Page Features Tested:
- ✅ Tab navigation (Details, Analytics, Advanced Settings)
- ✅ Form field interactions (name, description, price, SKU, etc.)
- ✅ Product status management
- ✅ Preview functionality
- ✅ Delete confirmation workflow
- ✅ Back navigation
- ✅ Attention alerts display
- ✅ Analytics content verification
- ✅ Advanced settings content verification

### Smart Test Design:
- Tests adapt to whether products exist or not (handles empty state)
- Tests check for element visibility before interacting
- Tests close modals properly to avoid interference
- Tests handle both single and multiple product scenarios
- Tests verify actual functionality rather than just clicking buttons

## Running the admin products tests

```bash
npm run test:e2e -- tests/e2e/admin-products.spec.js
npm run test:e2e -- tests/e2e/admin-products.spec.js --grep "Core Functionality"
npm run test:e2e -- tests/e2e/admin-products.spec.js --headed
npm run test:e2e -- tests/e2e/admin-products.spec.js --debug
```

## Test Requirements

- Uses the existing `adminAuthFixture` for authentication
- Requires the development server to be running on `localhost:3000`
- Tests are designed to work with or without existing products in the database
- Tests clean up after themselves and don't modify data permanently

## Key Testing Principles

1. **Page Object Model** - All page interactions are abstracted into reusable page objects
2. **Adaptive Testing** - Tests adapt to different data scenarios (empty state vs populated)
3. **Non-Destructive** - Tests don't permanently modify data (they test delete workflows but don't execute)
4. **Comprehensive Coverage** - Tests cover happy paths, edge cases, and error scenarios
5. **User-Centric** - Tests focus on real user workflows rather than just technical functionality

## Future Enhancements

- Add visual regression testing for UI components
- Add performance testing for large product lists
- Add accessibility testing with axe-core
- Add API response validation
- Add cross-browser compatibility testing
- Add mobile-specific interaction testing