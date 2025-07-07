'use client';

import { useState, useCallback, useEffect } from 'react';
import { SlugGenerationState } from '@/types/wizard';
import { SlugGenerationResponse, SlugAvailabilityResponse } from '@/types/store';
import { generateSlugFromTitle, validateStoreSlug } from '@/lib/validation';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Slug Generation Hook
export function useSlugGeneration() {
  const [state, setState] = useState<SlugGenerationState>({
    isGenerating: false,
    generatedSlug: '',
    suggestions: [],
    isAvailable: false,
    isChecking: false,
  });

  // Generate slug from title
  const generateSlug = useCallback(async (title: string): Promise<string> => {
    if (!title.trim()) {
      return '';
    }

    setState(prev => ({ ...prev, isGenerating: true, error: undefined }));

    try {
      // First, generate a basic slug
      const basicSlug = generateSlugFromTitle(title);

      // Call API to get a unique slug
      const response = await fetch('/api/stores/generate-slug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      });

      const data: SlugGenerationResponse = await response.json();

      if (data.success && data.slug) {
        setState(prev => ({
          ...prev,
          isGenerating: false,
          generatedSlug: data.slug as string,
          suggestions: data.suggestions || [],
        }));
        return data.slug;
      } else {
        setState(prev => ({
          ...prev,
          isGenerating: false,
          generatedSlug: basicSlug,
          error: data.error || 'Failed to generate slug',
        }));
        return basicSlug;
      }
    } catch (error) {
      console.error('Slug generation error:', error);
      const fallbackSlug = generateSlugFromTitle(title);
      setState(prev => ({
        ...prev,
        isGenerating: false,
        generatedSlug: fallbackSlug,
        error: 'Failed to generate slug',
      }));
      return fallbackSlug;
    }
  }, []);

  // Check slug availability
  const checkSlugAvailability = useCallback(async (slug: string): Promise<boolean> => {
    if (!slug.trim()) {
      setState(prev => ({ ...prev, isAvailable: false, isChecking: false }));
      return false;
    }

    // Validate slug format first
    if (!validateStoreSlug(slug)) {
      setState(prev => ({ 
        ...prev, 
        isAvailable: false, 
        isChecking: false,
        error: 'Invalid slug format'
      }));
      return false;
    }

    setState(prev => ({ ...prev, isChecking: true, error: undefined }));

    try {
      const response = await fetch('/api/stores/check-slug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slug }),
      });

      const data: SlugAvailabilityResponse = await response.json();

      if (data.success) {
        setState(prev => ({
          ...prev,
          isChecking: false,
          isAvailable: data.available,
          suggestions: data.suggestions || [],
        }));
        return data.available;
      } else {
        setState(prev => ({
          ...prev,
          isChecking: false,
          isAvailable: false,
          error: data.error || 'Failed to check slug availability',
        }));
        return false;
      }
    } catch (error) {
      console.error('Slug availability check error:', error);
      setState(prev => ({
        ...prev,
        isChecking: false,
        isAvailable: false,
        error: 'Failed to check slug availability',
      }));
      return false;
    }
  }, []);

  // Clear state
  const clearState = useCallback(() => {
    setState({
      isGenerating: false,
      generatedSlug: '',
      suggestions: [],
      isAvailable: false,
      isChecking: false,
    });
  }, []);

  return {
    ...state,
    generateSlug,
    checkSlugAvailability,
    clearState,
  };
}

// Auto Slug Generation Hook
export function useAutoSlugGeneration(title: string, delay: number = 500) {
  const debouncedTitle = useDebounce(title, delay);
  const { generateSlug, ...slugState } = useSlugGeneration();
  const [autoSlug, setAutoSlug] = useState('');

  // Auto-generate slug when title changes
  useEffect(() => {
    if (debouncedTitle.trim()) {
      generateSlug(debouncedTitle).then(setAutoSlug);
    } else {
      setAutoSlug('');
    }
  }, [debouncedTitle, generateSlug]);

  return {
    autoSlug,
    ...slugState,
    generateSlug,
  };
}

// Slug Validation Hook
export function useSlugValidation(slug: string, delay: number = 300) {
  const debouncedSlug = useDebounce(slug, delay);
  const { checkSlugAvailability, ...slugState } = useSlugGeneration();

  // Auto-check availability when slug changes
  useEffect(() => {
    if (debouncedSlug.trim()) {
      checkSlugAvailability(debouncedSlug);
    }
  }, [debouncedSlug, checkSlugAvailability]);

  return {
    slug: debouncedSlug,
    ...slugState,
    checkSlugAvailability,
  };
}

// Combined Slug Hook (for wizard)
export function useWizardSlug(title: string) {
  const [manualSlug, setManualSlug] = useState('');
  const [isManualEdit, setIsManualEdit] = useState(false);
  
  const { autoSlug, generateSlug, isGenerating } = useAutoSlugGeneration(title, 500);
  
  const currentSlug = isManualEdit ? manualSlug : autoSlug;
  const { 
    isAvailable, 
    isChecking, 
    suggestions, 
    error,
    checkSlugAvailability 
  } = useSlugValidation(currentSlug, 300);

  // Update manual slug
  const updateSlug = useCallback((newSlug: string) => {
    setManualSlug(newSlug);
    setIsManualEdit(true);
  }, []);

  // Reset to auto-generated slug
  const resetToAutoSlug = useCallback(() => {
    setIsManualEdit(false);
    setManualSlug('');
  }, []);

  // Force regenerate slug
  const regenerateSlug = useCallback(async () => {
    if (title.trim()) {
      const newSlug = await generateSlug(title);
      setManualSlug(newSlug);
      setIsManualEdit(true);
    }
  }, [title, generateSlug]);

  // Use a suggestion
  const useSuggestion = useCallback((suggestion: string) => {
    setManualSlug(suggestion);
    setIsManualEdit(true);
  }, []);

  return {
    slug: currentSlug,
    isManualEdit,
    isGenerating,
    isChecking,
    isAvailable,
    suggestions,
    error,
    updateSlug,
    resetToAutoSlug,
    regenerateSlug,
    useSuggestion,
    checkAvailability: checkSlugAvailability,
  };
}

// Slug Suggestions Hook
export function useSlugSuggestions(baseSlug: string) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const generateSuggestions = useCallback(async (slug: string) => {
    if (!slug.trim()) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    
    try {
      // Generate client-side suggestions
      const clientSuggestions = [
        `${slug}-store`,
        `${slug}-shop`,
        `${slug}-online`,
        `my-${slug}`,
        `${slug}-co`,
        `${slug}-${Date.now().toString().slice(-3)}`,
      ];

      // Check each suggestion for availability
      const availableSuggestions: string[] = [];
      
      for (const suggestion of clientSuggestions) {
        try {
          const response = await fetch('/api/stores/check-slug', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ slug: suggestion }),
          });

          const data: SlugAvailabilityResponse = await response.json();
          
          if (data.success && data.available) {
            availableSuggestions.push(suggestion);
          }
        } catch (error) {
          console.error(`Error checking suggestion ${suggestion}:`, error);
        }
      }

      setSuggestions(availableSuggestions.slice(0, 3)); // Limit to 3 suggestions
    } catch (error) {
      console.error('Error generating suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (baseSlug.trim()) {
      generateSuggestions(baseSlug);
    } else {
      setSuggestions([]);
    }
  }, [baseSlug, generateSuggestions]);

  return {
    suggestions,
    isLoading,
    regenerate: () => generateSuggestions(baseSlug),
  };
}

export default useSlugGeneration;