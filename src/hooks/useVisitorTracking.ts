import { useEffect } from 'react';

interface UseVisitorTrackingProps {
  storeId?: string;
  pagePath?: string;
  enabled?: boolean;
}

export function useVisitorTracking({ 
  storeId, 
  pagePath = '', 
  enabled = true 
}: UseVisitorTrackingProps) {
  useEffect(() => {
    if (!enabled || !storeId) return;
    
    // Track visitor on component mount
    const trackVisitor = async () => {
      try {
        await fetch('/api/visitors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storeId,
            pagePath: pagePath || window.location.pathname,
          }),
        });
      } catch (error) {
        // Silently fail - visitor tracking shouldn't break the app
        console.debug('Visitor tracking failed:', error);
      }
    };
    
    trackVisitor();
  }, [storeId, pagePath, enabled]);
}