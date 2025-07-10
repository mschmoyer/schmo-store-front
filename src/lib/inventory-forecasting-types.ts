/**
 * Forecast periods for inventory demand prediction
 */
export const FORECAST_PERIODS = [
  { value: 7, label: '7 Days' },
  { value: 14, label: '14 Days' },
  { value: 30, label: '30 Days' },
  { value: 60, label: '60 Days' },
  { value: 90, label: '90 Days' },
  { value: 180, label: '6 Months' },
  { value: 365, label: '1 Year' }
] as const

export type ForecastPeriod = typeof FORECAST_PERIODS[number]['value']

/**
 * Sales data for forecasting calculations
 */
export interface SalesData {
  avg_monthly_sales: number
  sales_last_30_days: number
  sales_last_60_days: number
  sales_last_90_days: number
  sales_last_180_days: number
  sales_last_365_days: number
}

/**
 * Forecast result with confidence level
 */
export interface ForecastResult {
  forecastValue: number
  confidence: 'high' | 'medium' | 'low'
  trend: 'increasing' | 'stable' | 'decreasing'
  algorithm: string
}

/**
 * Sales velocity data structure for frontend calculations
 */
export interface SalesVelocityData {
  sales_last_7_days: number
  sales_last_14_days: number
  sales_last_30_days: number
  sales_last_60_days: number
  sales_last_90_days: number
  sales_last_180_days: number
  sales_last_365_days: number
  avg_monthly_sales: number
  total_sales: number
  total_orders: number
}

/**
 * Calculate inventory demand forecast for a given period using sales velocity data
 * This is a pure function that runs on the frontend without database access
 */
export function calculateClientSideForecast(
  salesData: SalesVelocityData,
  periodDays: ForecastPeriod
): ForecastResult {
  const algorithms = [
    () => movingAverageForecast(salesData, periodDays),
    () => trendAnalysisForecast(salesData, periodDays),
    () => seasonalForecast(salesData, periodDays),
    () => linearRegressionForecast(salesData, periodDays)
  ]

  // Calculate forecasts using all algorithms
  const forecasts = algorithms.map(algorithm => algorithm())
  
  // Choose the best forecast based on confidence and data availability
  const bestForecast = forecasts.reduce((best, current) => {
    const confidenceScore = getConfidenceScore(current.confidence)
    const bestConfidenceScore = getConfidenceScore(best.confidence)
    
    return confidenceScore > bestConfidenceScore ? current : best
  })

  return bestForecast
}

/**
 * Moving average forecast based on recent sales trends
 */
function movingAverageForecast(salesData: SalesVelocityData, periodDays: ForecastPeriod): ForecastResult {
  const dailyAvg30 = salesData.sales_last_30_days / 30
  const dailyAvg60 = salesData.sales_last_60_days / 60
  const dailyAvg90 = salesData.sales_last_90_days / 90
  
  // Weight recent data more heavily
  const weightedDailyAvg = (dailyAvg30 * 0.5) + (dailyAvg60 * 0.3) + (dailyAvg90 * 0.2)
  const forecastValue = Math.round(weightedDailyAvg * periodDays)
  
  // Determine confidence based on data consistency
  const variance = Math.abs(dailyAvg30 - dailyAvg60) + Math.abs(dailyAvg60 - dailyAvg90)
  const confidence = variance < 1 ? 'high' : variance < 3 ? 'medium' : 'low'
  
  // Determine trend
  const trend = dailyAvg30 > dailyAvg90 ? 'increasing' : 
                dailyAvg30 < dailyAvg90 ? 'decreasing' : 'stable'
  
  return {
    forecastValue,
    confidence,
    trend,
    algorithm: 'Moving Average'
  }
}

/**
 * Trend analysis forecast using linear progression
 */
function trendAnalysisForecast(salesData: SalesVelocityData, periodDays: ForecastPeriod): ForecastResult {
  const periods = [30, 60, 90, 180, 365]
  const sales = [
    salesData.sales_last_30_days,
    salesData.sales_last_60_days,
    salesData.sales_last_90_days,
    salesData.sales_last_180_days,
    salesData.sales_last_365_days
  ]
  
  // Calculate trend slope
  const validPeriods = periods.filter((_, i) => sales[i] > 0)
  const validSales = sales.filter(s => s > 0)
  
  if (validPeriods.length < 2) {
    return {
      forecastValue: 0,
      confidence: 'low' as const,
      trend: 'stable' as const,
      algorithm: 'Trend Analysis'
    }
  }
  
  const slope = calculateSlope(validPeriods, validSales)
  const baseRate = validSales[0] / validPeriods[0] // Daily rate from most recent period
  const projectedDailyRate = baseRate + (slope * periodDays / 365)
  const forecastValue = Math.max(0, Math.round(projectedDailyRate * periodDays))
  
  const confidence = validPeriods.length >= 4 ? 'high' : validPeriods.length >= 3 ? 'medium' : 'low'
  const trend = slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable'
  
  return {
    forecastValue,
    confidence,
    trend,
    algorithm: 'Trend Analysis'
  }
}

/**
 * Seasonal forecast accounting for cyclical patterns
 */
function seasonalForecast(salesData: SalesVelocityData, periodDays: ForecastPeriod): ForecastResult {
  const currentMonth = new Date().getMonth()
  const seasonalMultipliers = getSeasonalMultipliers(currentMonth)
  
  const baseDailyRate = salesData.sales_last_30_days / 30
  const seasonalRate = baseDailyRate * seasonalMultipliers.current
  const forecastValue = Math.round(seasonalRate * periodDays)
  
  const confidence = salesData.sales_last_365_days > 0 ? 'medium' : 'low'
  const trend = 'stable' as const // Seasonal patterns are generally stable
  
  return {
    forecastValue,
    confidence,
    trend,
    algorithm: 'Seasonal Forecast'
  }
}

/**
 * Linear regression forecast for more sophisticated prediction
 */
function linearRegressionForecast(salesData: SalesVelocityData, periodDays: ForecastPeriod): ForecastResult {
  const dataPoints = [
    { x: 30, y: salesData.sales_last_30_days },
    { x: 60, y: salesData.sales_last_60_days },
    { x: 90, y: salesData.sales_last_90_days },
    { x: 180, y: salesData.sales_last_180_days },
    { x: 365, y: salesData.sales_last_365_days }
  ].filter(point => point.y > 0)
  
  if (dataPoints.length < 3) {
    return {
      forecastValue: Math.round(salesData.sales_last_30_days * (periodDays / 30)),
      confidence: 'low' as const,
      trend: 'stable' as const,
      algorithm: 'Linear Regression'
    }
  }
  
  const regression = calculateLinearRegression(dataPoints)
  const dailyRate = regression.slope + regression.intercept / periodDays
  const forecastValue = Math.max(0, Math.round(dailyRate * periodDays))
  
  const confidence = regression.correlation > 0.8 ? 'high' : 
                    regression.correlation > 0.5 ? 'medium' : 'low'
  
  const trend = regression.slope > 0.1 ? 'increasing' : 
               regression.slope < -0.1 ? 'decreasing' : 'stable'
  
  return {
    forecastValue,
    confidence,
    trend,
    algorithm: 'Linear Regression'
  }
}

/**
 * Helper function to calculate slope for trend analysis
 */
function calculateSlope(x: number[], y: number[]): number {
  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
  const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0)
  
  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
}

/**
 * Helper function for linear regression calculation
 */
function calculateLinearRegression(points: { x: number, y: number }[]): {
  slope: number
  intercept: number
  correlation: number
} {
  const n = points.length
  const sumX = points.reduce((sum, p) => sum + p.x, 0)
  const sumY = points.reduce((sum, p) => sum + p.y, 0)
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0)
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0)
  const sumYY = points.reduce((sum, p) => sum + p.y * p.y, 0)
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  
  const correlation = Math.abs(
    (n * sumXY - sumX * sumY) / 
    Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY))
  )
  
  return { slope, intercept, correlation }
}

/**
 * Get seasonal multipliers based on current month
 */
function getSeasonalMultipliers(month: number): { current: number } {
  // Basic seasonal patterns (can be customized per business)
  const seasonalFactors = [
    1.1, // January - New Year boost
    0.9, // February - Post-holiday dip
    1.0, // March - Normal
    1.0, // April - Normal
    1.1, // May - Spring increase
    1.0, // June - Normal
    0.9, // July - Summer slowdown
    0.9, // August - Summer slowdown
    1.0, // September - Back to school
    1.0, // October - Normal
    1.2, // November - Pre-holiday
    1.3  // December - Holiday season
  ]
  
  return { current: seasonalFactors[month] }
}

/**
 * Convert confidence level to numeric score for comparison
 */
function getConfidenceScore(confidence: 'high' | 'medium' | 'low'): number {
  return confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1
}