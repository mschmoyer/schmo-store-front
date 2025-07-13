/**
 * AI Business Advisor
 * Analyzes store performance data and provides intelligent business insights
 */

interface BusinessMetrics {
  totalSearches: number;
  uniqueVisitors: number;
  searchTrend: number;
  visitorTrend: number;
  topSearchTerm: string;
  topSearchCount: number;
  bounceRate: number;
  avgSessionDuration: number;
  period: string;
  zeroResultsCount?: number;
  hasSearchTracking: boolean;
  hasVisitorTracking: boolean;
}

interface BusinessInsight {
  type: 'insight' | 'alert' | 'recommendation';
  category: 'performance' | 'growth' | 'optimization' | 'strategy';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionItems?: string[];
}

interface BusinessAnalysis {
  keyInsights: BusinessInsight[];
  alerts: BusinessInsight[];
  recommendations: BusinessInsight[];
  overallScore: number;
  focusAreas: string[];
}

/**
 * Analyze store performance metrics
 */
function analyzeStorePerformance(metrics: BusinessMetrics): BusinessAnalysis {
  console.log('🔍 AI Business Advisor - Starting analysis for:', metrics.period);
  
  const insights: BusinessInsight[] = [];
  const alerts: BusinessInsight[] = [];
  const recommendations: BusinessInsight[] = [];

  // Calculate overall business health score (0-100)
  let overallScore = 50; // Base score
  const focusAreas: string[] = [];
  
  console.log('📊 AI Business Advisor - Base metrics:', {
    totalSearches: metrics.totalSearches,
    uniqueVisitors: metrics.uniqueVisitors,
    searchTrend: metrics.searchTrend,
    visitorTrend: metrics.visitorTrend,
    bounceRate: metrics.bounceRate,
    avgSessionDuration: metrics.avgSessionDuration
  });

  // Search Performance Analysis
  if (metrics.totalSearches > 0) {
    analyzeSearchPerformance(metrics, insights, alerts, recommendations);
    overallScore += Math.min(20, metrics.totalSearches / 100); // Up to 20 points for search activity
  } else {
    alerts.push({
      type: 'alert',
      category: 'growth',
      priority: 'high',
      title: 'No Search Activity',
      description: 'Your store has no search activity yet, which limits customer discovery.',
      actionItems: [
        'Implement search functionality if not available',
        'Promote your store to drive traffic',
        'Add more products to increase searchable content'
      ]
    });
    focusAreas.push('Customer Acquisition');
  }

  // Visitor Traffic Analysis
  if (metrics.uniqueVisitors > 0) {
    analyzeVisitorPerformance(metrics, insights, alerts, recommendations);
    overallScore += Math.min(20, metrics.uniqueVisitors / 50); // Up to 20 points for visitor activity
  } else {
    alerts.push({
      type: 'alert',
      category: 'growth',
      priority: 'high',
      title: 'No Visitor Traffic',
      description: 'Your store needs visitors to generate sales and grow your business.',
      actionItems: [
        'Launch marketing campaigns to drive traffic',
        'Optimize SEO to improve search visibility',
        'Share your store on social media platforms'
      ]
    });
    focusAreas.push('Traffic Generation');
  }

  // User Experience Analysis
  if (metrics.uniqueVisitors > 0) {
    analyzeUserExperience(metrics, insights, alerts, recommendations);
    
    // Bounce rate scoring
    if (metrics.bounceRate < 40) {
      overallScore += 10; // Excellent bounce rate
    } else if (metrics.bounceRate > 70) {
      overallScore -= 10; // Poor bounce rate
      focusAreas.push('User Experience');
    }
  }

  // Growth Trend Analysis
  analyzeGrowthTrends(metrics, insights, alerts, recommendations);

  // Strategic Recommendations
  generateStrategicRecommendations(metrics, recommendations, focusAreas);

  console.log('✅ AI Business Advisor - Analysis complete:', {
    insightsGenerated: insights.length,
    alertsGenerated: alerts.length,
    recommendationsGenerated: recommendations.length,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    focusAreas
  });

  return {
    keyInsights: insights,
    alerts,
    recommendations,
    overallScore: Math.max(0, Math.min(100, overallScore)),
    focusAreas
  };
}

/**
 * Analyze search performance and generate insights
 */
function analyzeSearchPerformance(
  metrics: BusinessMetrics,
  insights: BusinessInsight[],
  alerts: BusinessInsight[],
  recommendations: BusinessInsight[]
): void {
  // Search trend analysis
  if (metrics.searchTrend > 25) {
    insights.push({
      type: 'insight',
      category: 'growth',
      priority: 'high',
      title: 'Excellent Search Growth',
      description: `Search activity surged by ${metrics.searchTrend.toFixed(1)}%, indicating strong customer interest and effective marketing.`,
      actionItems: [
        'Capitalize on this momentum with targeted promotions',
        'Ensure inventory levels match increased demand',
        'Analyze successful marketing channels for scaling'
      ]
    });
  } else if (metrics.searchTrend < -15) {
    alerts.push({
      type: 'alert',
      category: 'performance',
      priority: 'high',
      title: 'Search Activity Decline',
      description: `Search activity dropped by ${Math.abs(metrics.searchTrend).toFixed(1)}%, which could impact sales.`,
      actionItems: [
        'Review recent changes to search functionality',
        'Audit marketing campaigns for effectiveness',
        'Consider promotional campaigns to re-engage customers'
      ]
    });
  }

  // Top search term analysis
  if (metrics.topSearchCount > 10) {
    insights.push({
      type: 'insight',
      category: 'strategy',
      priority: 'medium',
      title: 'Popular Search Trend Identified',
      description: `"${metrics.topSearchTerm}" is your most searched term with ${metrics.topSearchCount} searches.`,
      actionItems: [
        'Expand product selection in this category',
        'Create targeted landing pages for popular searches',
        'Consider running ads for related keywords'
      ]
    });
  }

  // Add search-related recommendations
  if (metrics.totalSearches > 0) {
    recommendations.push({
      type: 'recommendation',
      category: 'optimization',
      priority: 'medium',
      title: 'Optimize Search Experience',
      description: 'Improve search functionality to increase conversions.'
    });
  }

  // Zero results handling
  if (metrics.zeroResultsCount && metrics.zeroResultsCount > 0) {
    const zeroResultsPercentage = (metrics.zeroResultsCount / metrics.totalSearches) * 100;
    if (zeroResultsPercentage > 10) {
      alerts.push({
        type: 'alert',
        category: 'optimization',
        priority: 'medium',
        title: 'High Zero Results Rate',
        description: `${zeroResultsPercentage.toFixed(1)}% of searches return no results, potentially losing customers.`,
        actionItems: [
          'Add products for popular zero-result searches',
          'Improve search algorithm and synonyms',
          'Create "suggested products" for failed searches'
        ]
      });
    }
  }
}

/**
 * Analyze visitor performance and generate insights
 */
function analyzeVisitorPerformance(
  metrics: BusinessMetrics,
  insights: BusinessInsight[],
  alerts: BusinessInsight[],
  recommendations: BusinessInsight[]
): void {
  // Visitor trend analysis
  if (metrics.visitorTrend > 20) {
    insights.push({
      type: 'insight',
      category: 'growth',
      priority: 'high',
      title: 'Strong Visitor Growth',
      description: `Visitor traffic increased by ${metrics.visitorTrend.toFixed(1)}%, showing excellent market traction.`,
      actionItems: [
        'Scale successful acquisition channels',
        'Optimize conversion funnel for increased traffic',
        'Implement retargeting to maximize visitor value'
      ]
    });
  } else if (metrics.visitorTrend < -10) {
    alerts.push({
      type: 'alert',
      category: 'growth',
      priority: 'high',
      title: 'Visitor Traffic Decline',
      description: `Visitor traffic decreased by ${Math.abs(metrics.visitorTrend).toFixed(1)}%, requiring immediate attention.`,
      actionItems: [
        'Audit marketing channels for performance drops',
        'Check for technical issues affecting site accessibility',
        'Launch customer win-back campaigns'
      ]
    });
  }

  // Traffic volume insights
  if (metrics.uniqueVisitors < 50) {
    recommendations.push({
      type: 'recommendation',
      category: 'growth',
      priority: 'high',
      title: 'Scale Traffic Generation',
      description: 'Your store needs more visitors to reach its full potential.',
      actionItems: [
        'Invest in paid advertising (Google Ads, Facebook Ads)',
        'Create valuable content to attract organic traffic',
        'Partner with influencers in your niche'
      ]
    });
  }

  // Add visitor-related recommendations
  if (metrics.uniqueVisitors > 0) {
    recommendations.push({
      type: 'recommendation',
      category: 'optimization',
      priority: 'medium',
      title: 'Optimize Visitor Experience',
      description: 'Improve user experience to increase engagement.'
    });
  }
}

/**
 * Analyze user experience metrics
 */
function analyzeUserExperience(
  metrics: BusinessMetrics,
  insights: BusinessInsight[],
  alerts: BusinessInsight[],
  recommendations: BusinessInsight[]
): void {
  // Bounce rate analysis
  if (metrics.bounceRate < 30) {
    insights.push({
      type: 'insight',
      category: 'performance',
      priority: 'medium',
      title: 'Excellent User Engagement',
      description: `Your bounce rate of ${metrics.bounceRate.toFixed(1)}% is excellent, indicating high-quality traffic and engaging content.`
    });
  } else if (metrics.bounceRate > 70) {
    alerts.push({
      type: 'alert',
      category: 'optimization',
      priority: 'high',
      title: 'High Bounce Rate',
      description: `A bounce rate of ${metrics.bounceRate.toFixed(1)}% suggests users aren't finding what they're looking for.`,
      actionItems: [
        'Improve page load speed',
        'Enhance product descriptions and images',
        'Simplify navigation and user interface'
      ]
    });
  }

  // Session duration analysis
  if (metrics.avgSessionDuration > 300) {
    insights.push({
      type: 'insight',
      category: 'performance',
      priority: 'medium',
      title: 'High User Engagement',
      description: `Average session duration of ${Math.floor(metrics.avgSessionDuration / 60)}+ minutes shows users are highly engaged.`
    });
  } else if (metrics.avgSessionDuration < 90) {
    recommendations.push({
      type: 'recommendation',
      category: 'optimization',
      priority: 'medium',
      title: 'Improve Session Duration',
      description: 'Users are leaving quickly, which may indicate content or usability issues.',
      actionItems: [
        'Add related product suggestions',
        'Improve content quality and relevance',
        'Implement better internal linking'
      ]
    });
  }
}

/**
 * Analyze growth trends and patterns
 */
function analyzeGrowthTrends(
  metrics: BusinessMetrics,
  insights: BusinessInsight[],
  alerts: BusinessInsight[],
  recommendations: BusinessInsight[]
): void {
  // Overall growth momentum
  const hasPositiveGrowth = metrics.searchTrend > 0 || metrics.visitorTrend > 0;
  const hasNegativeGrowth = metrics.searchTrend < -5 || metrics.visitorTrend < -5;

  if (hasPositiveGrowth && !hasNegativeGrowth) {
    insights.push({
      type: 'insight',
      category: 'growth',
      priority: 'high',
      title: 'Positive Growth Momentum',
      description: 'Your store is showing positive growth trends across key metrics.',
      actionItems: [
        'Double down on successful strategies',
        'Prepare for increased capacity needs',
        'Document what\'s working for future reference'
      ]
    });
  } else if (hasNegativeGrowth) {
    alerts.push({
      type: 'alert',
      category: 'growth',
      priority: 'high',
      title: 'Growth Concerns',
      description: 'Multiple metrics show declining trends that need attention.',
      actionItems: [
        'Conduct comprehensive business audit',
        'Survey customers for feedback',
        'Consider pivoting struggling strategies'
      ]
    });
  }

  // Add growth-related recommendations
  if (metrics.totalSearches > 0 || metrics.uniqueVisitors > 0) {
    recommendations.push({
      type: 'recommendation',
      category: 'growth',
      priority: 'medium',
      title: 'Monitor Growth Metrics',
      description: 'Continue tracking key performance indicators to maintain growth momentum.'
    });
  }
}

/**
 * Generate strategic business recommendations
 */
function generateStrategicRecommendations(
  metrics: BusinessMetrics,
  recommendations: BusinessInsight[],
  focusAreas: string[]
): void {
  // Seasonal and timing recommendations
  const currentMonth = new Date().getMonth();
  // const currentDay = new Date().getDate();

  if (currentMonth >= 10 || currentMonth <= 1) { // Q4/Q1 - Holiday season
    recommendations.push({
      type: 'recommendation',
      category: 'strategy',
      priority: 'high',
      title: 'Holiday Season Strategy',
      description: 'Peak shopping season presents major opportunities for growth.',
      actionItems: [
        'Launch holiday-themed promotions and bundles',
        'Optimize for gift-giving with gift guides',
        'Increase inventory for expected demand surge'
      ]
    });
  }

  // Business maturity recommendations
  if (metrics.totalSearches < 100 && metrics.uniqueVisitors < 100) {
    recommendations.push({
      type: 'recommendation',
      category: 'strategy',
      priority: 'high',
      title: 'Early Stage Growth Focus',
      description: 'Your store is in the early growth phase - focus on fundamentals.',
      actionItems: [
        'Establish consistent content creation schedule',
        'Build email list from day one',
        'Focus on one marketing channel until it works'
      ]
    });
    focusAreas.push('Foundation Building');
  } else if (metrics.totalSearches > 1000 && metrics.uniqueVisitors > 500) {
    recommendations.push({
      type: 'recommendation',
      category: 'strategy',
      priority: 'medium',
      title: 'Scale and Optimize',
      description: 'Your store has good traction - time to scale and optimize.',
      actionItems: [
        'Implement advanced analytics and conversion tracking',
        'Test and optimize conversion funnel',
        'Consider expanding to new markets or products'
      ]
    });
    focusAreas.push('Scaling');
  }

  // Data-driven recommendations
  if (!metrics.hasSearchTracking || !metrics.hasVisitorTracking) {
    recommendations.push({
      type: 'recommendation',
      category: 'optimization',
      priority: 'high',
      title: 'Improve Analytics Setup',
      description: 'Better data collection will enable more accurate business insights.',
      actionItems: [
        'Implement comprehensive search tracking',
        'Set up visitor behavior analytics',
        'Create regular reporting dashboard'
      ]
    });
  }
}

export { analyzeStorePerformance };
export type { BusinessMetrics, BusinessInsight, BusinessAnalysis };