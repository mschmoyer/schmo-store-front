# E2E Test Suite - Admin Products

This directory contains comprehensive end-to-end tests for the Admin Products functionality using Playwright.

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

## Running the Tests

```bash
# Run all admin products tests
npx playwright test tests/e2e/admin-products.spec.js

# Run specific test suite
npx playwright test tests/e2e/admin-products.spec.js --grep "Core Functionality"

# Run in headed mode to see browser
npx playwright test tests/e2e/admin-products.spec.js --headed

# Run with debug mode
npx playwright test tests/e2e/admin-products.spec.js --debug
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