import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { z } from 'zod';

const TestIntegrationSchema = z.object({
  integrationType: z.enum(['shipengine', 'shipstation', 'stripe']),
  apiKey: z.string().min(1, 'API key is required'),
  apiSecret: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    
    // Validate request body
    const { integrationType, apiKey, apiSecret } = TestIntegrationSchema.parse(body);
    
    let testResult;
    
    if (integrationType === 'shipengine') {
      testResult = await testShipEngineConnection(apiKey);
    } else if (integrationType === 'shipstation') {
      if (!apiSecret) {
        return NextResponse.json({
          success: false,
          error: 'API Secret is required for ShipStation Legacy API'
        }, { status: 400 });
      }
      testResult = await testShipStationConnection(apiKey, apiSecret);
    } else if (integrationType === 'stripe') {
      testResult = await testStripeConnection(apiKey);
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid integration type'
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: testResult.success,
      data: testResult.data,
      error: testResult.error
    });
    
  } catch (error) {
    console.error('Test integration error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

async function testShipEngineConnection(apiKey: string) {
  try {
    // Log API key details for debugging (mask most of the key for security)
    const maskedKey = apiKey.length > 8 ? 
      apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4) : 
      '****';
    console.log(`Testing ShipEngine with API key: ${maskedKey} (length: ${apiKey.length})`);
    
    // Validate API key format
    if (!apiKey || apiKey.length < 20) {
      return {
        success: false,
        error: 'Invalid API key format. ShipEngine API keys should be longer.',
        data: {
          apiKeyLength: apiKey.length,
          expectedMinLength: 20
        }
      };
    }
    
    // Test ShipEngine v2 API with warehouses endpoint
    console.log('Testing ShipEngine API with /v2/warehouses endpoint...');
    const warehousesResponse = await fetch('https://api.shipengine.com/v2/warehouses', {
      method: 'GET',
      headers: {
        'API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`ShipEngine warehouses API response: ${warehousesResponse.status} ${warehousesResponse.statusText}`);
    
    if (warehousesResponse.ok) {
      const warehousesData = await warehousesResponse.json();
      console.log('ShipEngine warehouses API success:', warehousesData);
      return {
        success: true,
        data: {
          message: 'ShipEngine connection successful',
          details: 'API key verified and working',
          apiKeyUsed: maskedKey,
          endpointTested: 'https://api.shipengine.com/v2/warehouses',
          warehousesFound: warehousesData.warehouses?.length || 0,
          note: 'Connected successfully to ShipEngine API v2'
        }
      };
    }
    
    // Check if this is a billing/plan issue (which means API key is valid)
    let errorData;
    try {
      errorData = await warehousesResponse.json();
      console.log('ShipEngine warehouses error response:', errorData);
      
      const billingError = errorData?.errors?.some((err: { message?: string }) => 
        err.message?.includes('billing') || err.message?.includes('upgrade') || err.message?.includes('plan')
      );
      
      if (warehousesResponse.status === 401 && billingError) {
        return {
          success: true,
          data: {
            message: 'ShipEngine API key is valid',
            details: 'API key authenticated successfully but requires paid plan for full access',
            apiKeyUsed: maskedKey,
            endpointTested: 'https://api.shipengine.com/v2/warehouses',
            note: 'Authentication successful - upgrade plan for full API access',
            planStatus: 'free/limited'
          }
        };
      }
    } catch {
      console.log('Could not parse ShipEngine error response as JSON');
      try {
        const errorText = await warehousesResponse.text();
        console.log('ShipEngine error response text:', errorText);
        errorData = { rawError: errorText };
      } catch {
        errorData = {};
      }
    }
    
    // Return error details from warehouses endpoint
    let errorMessage = 'ShipEngine API connection failed';
    let suggestion = 'Check ShipEngine API documentation for required permissions.';
    
    if (warehousesResponse.status === 401) {
      errorMessage = 'Invalid API key or authentication failed.';
      suggestion = 'Verify your API key is correct and has not expired. Check ShipEngine dashboard for key status.';
    } else if (warehousesResponse.status === 403) {
      errorMessage = 'API key does not have permission to access this resource.';
    } else if (warehousesResponse.status === 429) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
    } else if (warehousesResponse.status === 404) {
      errorMessage = 'ShipEngine API endpoint not found. This may indicate an API version issue.';
      suggestion = 'Verify you are using the correct ShipEngine API version and endpoint.';
    }
    
    return {
      success: false,
      error: errorData?.message || errorData?.error?.message || errorMessage,
      data: {
        status: warehousesResponse.status,
        statusText: warehousesResponse.statusText,
        apiKeyUsed: maskedKey,
        endpointTested: 'https://api.shipengine.com/v2/warehouses',
        errorDetails: errorData,
        suggestion: suggestion
      }
    };
  } catch (error) {
    console.error('ShipEngine test error:', error);
    return {
      success: false,
      error: 'Failed to connect to ShipEngine API',
      data: {
        details: error instanceof Error ? error.message : 'Unknown error',
        type: 'network_error'
      }
    };
  }
}

async function testShipStationConnection(apiKey: string, apiSecret: string) {
  try {
    // Log masked credentials for debugging
    const maskedKey = apiKey.length > 8 ? 
      apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4) : 
      '****';
    const maskedSecret = apiSecret.length > 8 ? 
      apiSecret.substring(0, 4) + '...' + apiSecret.substring(apiSecret.length - 4) : 
      '****';
    console.log(`Testing ShipStation Legacy API with key: ${maskedKey}, secret: ${maskedSecret}`);
    
    // Validate API credentials format
    if (!apiKey || apiKey.length < 8) {
      return {
        success: false,
        error: 'Invalid API Key format. ShipStation API Keys should be at least 8 characters.',
        data: {
          apiKeyLength: apiKey.length,
          expectedMinLength: 8
        }
      };
    }
    
    if (!apiSecret || apiSecret.length < 8) {
      return {
        success: false,
        error: 'Invalid API Secret format. ShipStation API Secrets should be at least 8 characters.',
        data: {
          apiSecretLength: apiSecret.length,
          expectedMinLength: 8
        }
      };
    }
    
    // Create Basic Auth header as documented
    const credentials = `${apiKey}:${apiSecret}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    const authHeader = `Basic ${encodedCredentials}`;
    
    console.log('Testing ShipStation API with /accounts/listtags endpoint...');
    
    // Test ShipStation Legacy API with List Account Tags endpoint
    const response = await fetch('https://ssapi.shipstation.com/accounts/listtags', {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`ShipStation Legacy API response: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('ShipStation Legacy API success:', data);
      return {
        success: true,
        data: {
          message: 'ShipStation Legacy API connection successful',
          details: 'API Key and Secret verified and working with Basic HTTP Authentication',
          apiKeyUsed: maskedKey,
          apiSecretUsed: maskedSecret,
          endpointTested: 'https://ssapi.shipstation.com/accounts/listtags',
          tagsFound: Array.isArray(data) ? data.length : 'Unknown',
          note: 'Connected successfully to ShipStation Legacy API v1'
        }
      };
    }
    
    // Handle different error cases
    let errorData;
    try {
      errorData = await response.json();
      console.log('ShipStation Legacy API error response:', errorData);
    } catch {
      console.log('Could not parse ShipStation error response as JSON');
      try {
        const errorText = await response.text();
        console.log('ShipStation error response text:', errorText);
        errorData = { rawError: errorText };
      } catch {
        errorData = {};
      }
    }
    
    // Return specific error messages
    let errorMessage = 'ShipStation Legacy API connection failed';
    let suggestion = 'Check your API Key and Secret at https://ss.shipstation.com/#/settings/api';
    
    if (response.status === 401) {
      errorMessage = 'Invalid API Key or Secret. Authentication failed.';
      suggestion = 'Verify your API Key and Secret are correct. Find them at https://ss.shipstation.com/#/settings/api';
    } else if (response.status === 403) {
      errorMessage = 'API credentials do not have permission to access this resource.';
      suggestion = 'Ensure your ShipStation account has the necessary permissions.';
    } else if (response.status === 429) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
      suggestion = 'Wait a few minutes before testing again.';
    } else if (response.status === 404) {
      errorMessage = 'ShipStation API endpoint not found.';
      suggestion = 'This may indicate a service issue. Contact ShipStation support.';
    }
    
    return {
      success: false,
      error: errorData?.message || errorMessage,
      data: {
        status: response.status,
        statusText: response.statusText,
        apiKeyUsed: maskedKey,
        apiSecretUsed: maskedSecret,
        endpointTested: 'https://ssapi.shipstation.com/accounts/listtags',
        errorDetails: errorData,
        suggestion: suggestion
      }
    };
  } catch (error) {
    console.error('ShipStation Legacy API test error:', error);
    return {
      success: false,
      error: 'Failed to connect to ShipStation Legacy API',
      data: {
        details: error instanceof Error ? error.message : 'Unknown error',
        type: 'network_error'
      }
    };
  }
}

async function testStripeConnection(apiKey: string) {
  try {
    // Test Stripe API connection by fetching account info
    const response = await fetch('https://api.stripe.com/v1/account', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        data: {
          message: 'Stripe connection successful',
          accountId: data.id,
          details: `Connected to account: ${data.business_profile?.name || data.id}`
        }
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error?.message || 'Stripe API connection failed',
        data: {
          status: response.status,
          statusText: response.statusText
        }
      };
    }
  } catch (error) {
    console.error('Stripe test error:', error);
    return {
      success: false,
      error: 'Failed to connect to Stripe API',
      data: {
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}