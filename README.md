# Schmo Store Front

A modern e-commerce storefront built with Next.js 15, TypeScript, and Mantine UI, integrated with ShipStation APIs for real-time product and inventory management.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Mantine UI v8
- **Styling**: TailwindCSS v4, CSS-in-JS animations
- **APIs**: ShipStation v2 API, ShipEngine API
- **State Management**: React hooks, localStorage
- **Deployment**: Vercel-ready

## Getting Started

### Prerequisites
- Node.js 20+ (use nvm: `nvm use`)
- ShipStation API account and API key

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Configure your `.env` file:
   ```env
   # ShipStation API Configuration
   SHIPSTATION_API_KEY=your_shipstation_api_key_here

   # ShipEngine Configuration (uses same API key as ShipStation)
   SHIPENGINE_SELLER_ID=your_seller_id_here
   SHIPENGINE_WAREHOUSE_ID=your_warehouse_id_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## API Routes

- `/api/products` - Fetch products from ShipStation with pagination
- `/api/inventory` - Get real-time inventory levels
- `/api/warehouses` - List configured warehouses
- `/api/orders` - Create orders via ShipEngine API

## Pages

- `/store` - Main product catalog with cart functionality
- `/cart` - Shopping cart management
- `/checkout` - Complete checkout flow
- `/account` - User account management (placeholder)
- `/warehouses` - Warehouse information display

See `docs/decision-log.md` for detailed development history and architectural decisions.