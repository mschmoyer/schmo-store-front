// Analytics tracking for landing page events
type AnalyticsEvent = {
  event_type: 'page_view' | 'cta_click' | 'demo_visit' | 'hero_cta_click' | 'feature_view' | 'section_view';
  page_path: string;
  event_data?: {
    button_text?: string;
    button_location?: string;
    demo_store_name?: string;
    section_name?: string;
    [key: string]: unknown;
  };
};

// Client-side analytics tracking
export const trackLandingPageEvent = async (event: AnalyticsEvent) => {
  try {
    // Only track in production or when explicitly enabled
    if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_ANALYTICS !== 'true') {
      console.log('Analytics event (dev mode):', event);
      return;
    }

    // Generate visitor ID if not exists
    let visitorId = localStorage.getItem('visitor_id');
    if (!visitorId) {
      visitorId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('visitor_id', visitorId);
    }

    // Generate session ID if not exists or expired
    let sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('session_id', sessionId);
    }

    const analyticsData = {
      visitor_id: visitorId,
      session_id: sessionId,
      ...event,
      user_agent: navigator.userAgent,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
    };

    // Send to analytics API
    await fetch('/api/analytics/landing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(analyticsData),
    });
  } catch (error) {
    console.error('Analytics tracking error:', error);
  }
};

// Track page view
export const trackPageView = (pagePath: string) => {
  trackLandingPageEvent({
    event_type: 'page_view',
    page_path: pagePath,
  });
};

// Track CTA clicks
export const trackCTAClick = (buttonText: string, buttonLocation: string, href: string) => {
  trackLandingPageEvent({
    event_type: 'cta_click',
    page_path: window.location.pathname,
    event_data: {
      button_text: buttonText,
      button_location: buttonLocation,
      destination: href,
    },
  });
};

// Track demo store visits
export const trackDemoStoreVisit = (storeName: string, storeSlug: string) => {
  trackLandingPageEvent({
    event_type: 'demo_visit',
    page_path: window.location.pathname,
    event_data: {
      demo_store_name: storeName,
      demo_store_slug: storeSlug,
    },
  });
};

// Track hero CTA clicks
export const trackHeroCTAClick = (buttonText: string, href: string) => {
  trackLandingPageEvent({
    event_type: 'hero_cta_click',
    page_path: window.location.pathname,
    event_data: {
      button_text: buttonText,
      destination: href,
    },
  });
};

// Track section views (using Intersection Observer)
export const trackSectionView = (sectionName: string) => {
  trackLandingPageEvent({
    event_type: 'section_view',
    page_path: window.location.pathname,
    event_data: {
      section_name: sectionName,
    },
  });
};

// Hook for tracking section visibility
export const useSectionTracking = (sectionName: string) => {
  const trackSection = () => {
    trackSectionView(sectionName);
  };

  return { trackSection };
};

// Initialize analytics on page load
export const initializeAnalytics = () => {
  if (typeof window !== 'undefined') {
    // Track initial page view
    trackPageView(window.location.pathname);
    
    // Track section views using Intersection Observer
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionName = entry.target.getAttribute('data-section');
          if (sectionName) {
            trackSectionView(sectionName);
          }
        }
      });
    }, {
      threshold: 0.5, // Trigger when 50% of section is visible
    });

    // Observe all sections with data-section attribute
    document.querySelectorAll('[data-section]').forEach((section) => {
      observer.observe(section);
    });

    return () => observer.disconnect();
  }
};