import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { StoreThemeProvider } from '@/components/store/StoreThemeProvider';
import { TopNav } from '@/components';
import { ThemeStyleElement } from '@/lib/themeSSR';
import StorePageClient from './StorePageClient';


interface Store {
  id: string;
  store_name: string;
  store_slug: string;
  store_description: string;
  hero_title: string;
  hero_description: string;
  theme_name: string;
  currency: string;
  is_active: boolean;
  is_public: boolean;
  meta_title: string;
  meta_description: string;
}

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
}

async function getStoreData(storeSlug: string): Promise<Store | null> {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    const response = await fetch(`${baseUrl}/api/stores/public?slug=${storeSlug}`, {
      next: { revalidate: 300 }, // 5 minutes
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        return data.data;
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching store:', error);
    return null;
  }
}

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const data = await getStoreData(resolvedParams.storeSlug);
  
  if (!data) {
    return {
      title: 'Store Not Found',
      description: 'The requested store could not be found.'
    };
  }
  
  return {
    title: `${data.hero_title || data.store_name} | Store`,
    description: data.hero_description || data.store_description || `Shop at ${data.store_name}`,
    openGraph: {
      title: data.hero_title || data.store_name,
      description: data.hero_description || data.store_description,
      type: 'website',
    },
  };
}

export default async function StoreProductsPage({ params }: StorePageProps) {
  const resolvedParams = await params;
  const store = await getStoreData(resolvedParams.storeSlug);
  
  if (!store) {
    notFound();
  }
  
  console.log('Store data:', store);
  console.log('Store theme_name:', store.theme_name);
  
  return (
    <>
      <ThemeStyleElement themeId={store.theme_name || 'default'} />
      <StoreThemeProvider themeId={store.theme_name || 'default'}>
        <div>
          <TopNav />
          <StorePageClient store={store} storeSlug={resolvedParams.storeSlug} />
        </div>
      </StoreThemeProvider>
    </>
  );
}




