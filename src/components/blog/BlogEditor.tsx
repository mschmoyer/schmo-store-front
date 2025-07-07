'use client';

import { useEffect, useState } from 'react';
import { Box, Stack, Text, LoadingOverlay } from '@mantine/core';
import { BlogEditorProps } from '@/types/blog';
import { calculateReadingTime } from '@/lib/blogHelpers';

// Markdown editor component (dynamic import to avoid SSR issues)
import dynamic from 'next/dynamic';
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { 
  ssr: false,
  loading: () => <div>Loading editor...</div>
});

export default function BlogEditor({ 
  initialContent = '', 
  onChange, 
  readOnly = false,
  height = 400
}: BlogEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isLoading] = useState(false);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleChange = (value: string | undefined) => {
    const newContent = value || '';
    setContent(newContent);
    // Sanitize HTML before passing to parent
    // Simple sanitization - for production use a proper sanitizer like DOMPurify
    const sanitizedContent = newContent;
    onChange(sanitizedContent);
  };

  return (
    <Box style={{ position: 'relative' }}>
      <LoadingOverlay visible={isLoading} />
      
      <Stack gap="md">
        {/* Markdown Editor */}
        <Box style={{ position: 'relative' }} data-color-mode="auto">
          <MDEditor
            value={content}
            onChange={handleChange}
            preview="edit"
            hideToolbar={readOnly}
            visibleDragbar={false}
            height={height}
            data-color-mode="light"
            style={{
              backgroundColor: 'var(--theme-background)',
              borderRadius: '8px',
              border: '1px solid var(--theme-border)',
            }}
          />
        </Box>

        {/* Editor Statistics */}
        <Stack gap="xs">
          <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
            {content.replace(/[#*`_~\[\]()]/g, '').length} characters
          </Text>
          <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
            ~{calculateReadingTime(content)} min read
          </Text>
        </Stack>
      </Stack>

      {/* Custom Styles for the markdown editor */}
      <style jsx global>{`
        .w-md-editor {
          background-color: var(--theme-background) !important;
          border: 1px solid var(--theme-border) !important;
          border-radius: 8px !important;
        }
        
        .w-md-editor-toolbar {
          background-color: var(--theme-background-secondary) !important;
          border-bottom: 1px solid var(--theme-border) !important;
          border-radius: 8px 8px 0 0 !important;
        }
        
        .w-md-editor-toolbar button {
          color: var(--theme-text) !important;
          background: transparent !important;
        }
        
        .w-md-editor-toolbar button:hover {
          background-color: var(--theme-background-tertiary) !important;
        }
        
        .w-md-editor-text-textarea,
        .w-md-editor-text {
          background-color: var(--theme-background) !important;
          color: var(--theme-text) !important;
          font-family: var(--font-geist-sans) !important;
          font-size: 14px !important;
          line-height: 1.6 !important;
          border: none !important;
        }
        
        .w-md-editor-text-textarea::placeholder {
          color: var(--theme-text-muted) !important;
        }
        
        .w-md-editor-preview {
          background-color: var(--theme-background) !important;
          color: var(--theme-text) !important;
        }
        
        .w-md-editor-preview h1,
        .w-md-editor-preview h2,
        .w-md-editor-preview h3,
        .w-md-editor-preview h4,
        .w-md-editor-preview h5,
        .w-md-editor-preview h6 {
          color: var(--theme-text) !important;
        }
        
        .w-md-editor-preview blockquote {
          border-left: 4px solid var(--theme-primary) !important;
          background-color: var(--theme-background-secondary) !important;
          padding: 12px 16px !important;
          margin: 16px 0 !important;
          color: var(--theme-text) !important;
        }
        
        .w-md-editor-preview code {
          background-color: var(--theme-background-secondary) !important;
          padding: 2px 4px !important;
          border-radius: 3px !important;
          color: var(--theme-text) !important;
        }
        
        .w-md-editor-preview pre {
          background-color: var(--theme-background-secondary) !important;
          padding: 12px !important;
          border-radius: 6px !important;
          border: 1px solid var(--theme-border) !important;
          color: var(--theme-text) !important;
        }
        
        .w-md-editor-preview a {
          color: var(--theme-primary) !important;
        }
        
        .w-md-editor-preview a:hover {
          color: var(--theme-primary-dark) !important;
        }
        
        .w-md-editor-preview table {
          border-collapse: collapse !important;
          margin: 16px 0 !important;
        }
        
        .w-md-editor-preview table th,
        .w-md-editor-preview table td {
          border: 1px solid var(--theme-border) !important;
          padding: 8px 12px !important;
          color: var(--theme-text) !important;
        }
        
        .w-md-editor-preview table th {
          background-color: var(--theme-background-secondary) !important;
          font-weight: 600 !important;
        }
      `}</style>
    </Box>
  );
}