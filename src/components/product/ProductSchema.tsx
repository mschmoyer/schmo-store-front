import { EnhancedProduct } from '@/types/product';
import { ReviewSummary } from '@/types/review';
import { generateCompleteProductStructuredData } from '@/lib/structured-data';

interface ProductSchemaProps {
  product: EnhancedProduct;
  reviews?: ReviewSummary;
  baseUrl?: string;
}

export function ProductSchema({ product, reviews, baseUrl = '' }: ProductSchemaProps) {
  const structuredDataArray = generateCompleteProductStructuredData(product, reviews, baseUrl);
  
  return (
    <>
      {structuredDataArray.map((structuredData, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData, null, 2)
          }}
        />
      ))}
    </>
  );
}