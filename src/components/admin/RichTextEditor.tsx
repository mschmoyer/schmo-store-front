'use client';

import { useEffect, useState } from 'react';
import { Box, Stack, Text, LoadingOverlay } from '@mantine/core';

// Rich text editor component (dynamic import to avoid SSR issues)
import dynamic from 'next/dynamic';
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { 
  ssr: false,
  loading: () => <div>Loading editor...</div>
});

interface RichTextEditorProps {
  initialContent?: string;
  onChange: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  height?: number;
  label?: string;
  description?: string;
  error?: string;
  showStats?: boolean;
}

/**
 * Rich Text Editor Component
 * 
 * A reusable markdown editor component for product descriptions and content editing.
 * Based on the BlogEditor but adapted for product use cases.
 * 
 * @param props - RichTextEditorProps
 * @returns JSX.Element
 */
export default function RichTextEditor({ 
  initialContent = '', 
  onChange, 
  readOnly = false,
  height = 300,
  label,
  description,
  error,
  showStats = false
}: RichTextEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isLoading] = useState(false);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleChange = (value: string | undefined) => {
    const newContent = value || '';
    setContent(newContent);
    onChange(newContent);
  };

  const calculateReadingTime = (text: string) => {
    const wordsPerMinute = 200;
    const words = text.replace(/[#*`_~\[\]()]/g, '').split(/\s+/).filter(word => word.length > 0);
    return Math.ceil(words.length / wordsPerMinute);
  };

  return (
    <Box style={{ position: 'relative' }}>
      <LoadingOverlay visible={isLoading} />
      
      <Stack gap="sm">
        {/* Label and Description */}
        {label && (
          <Text size="sm" fw={500}>
            {label}
          </Text>
        )}
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}

        {/* Markdown Editor */}
        <Box style={{ position: 'relative' }} data-color-mode="auto">
          <MDEditor
            value={content}
            onChange={handleChange}
            preview="edit"
            hideToolbar={readOnly}
            visibleDragBar={false}
            height={height}
            data-color-mode="auto"
            style={{
              backgroundColor: 'var(--mantine-color-body)',
              borderRadius: '8px',
              border: error ? '1px solid var(--mantine-color-error-filled)' : '1px solid var(--mantine-color-default-border)',
            }}
          />
        </Box>

        {/* Error Message */}
        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}

        {/* Editor Statistics */}
        {showStats && (
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              {content.replace(/[#*`_~\[\]()]/g, '').length} characters
            </Text>
            <Text size="xs" c="dimmed">
              ~{calculateReadingTime(content)} min read
            </Text>
          </Stack>
        )}
      </Stack>

      {/* Custom Styles for the markdown editor */}
      <style jsx global>{`
        .w-md-editor {
          background-color: var(--mantine-color-body) !important;
          border: 1px solid var(--mantine-color-default-border) !important;
          border-radius: 8px !important;
        }
        
        .w-md-editor-toolbar {
          background-color: var(--mantine-color-gray-0) !important;
          border-bottom: 1px solid var(--mantine-color-default-border) !important;
          border-radius: 8px 8px 0 0 !important;
        }
        
        .w-md-editor-toolbar button {
          color: var(--mantine-color-text) !important;
          background: transparent !important;
        }
        
        .w-md-editor-toolbar button:hover {
          background-color: var(--mantine-color-gray-1) !important;
        }
        
        .w-md-editor-text-textarea,
        .w-md-editor-text {
          background-color: var(--mantine-color-body) !important;
          color: var(--mantine-color-text) !important;
          font-family: var(--font-geist-sans) !important;
          font-size: 14px !important;
          line-height: 1.6 !important;
          border: none !important;
        }
        
        .w-md-editor-text-textarea::placeholder {
          color: var(--mantine-color-placeholder) !important;
        }
        
        .w-md-editor-preview {
          background-color: var(--mantine-color-body) !important;
          color: var(--mantine-color-text) !important;
        }
        
        .w-md-editor-preview h1,
        .w-md-editor-preview h2,
        .w-md-editor-preview h3,
        .w-md-editor-preview h4,
        .w-md-editor-preview h5,
        .w-md-editor-preview h6 {
          color: var(--mantine-color-text) !important;
        }
        
        .w-md-editor-preview blockquote {
          border-left: 4px solid var(--mantine-color-blue-6) !important;
          background-color: var(--mantine-color-gray-0) !important;
          padding: 12px 16px !important;
          margin: 16px 0 !important;
          color: var(--mantine-color-text) !important;
        }
        
        .w-md-editor-preview code {
          background-color: var(--mantine-color-gray-0) !important;
          padding: 2px 4px !important;
          border-radius: 3px !important;
          color: var(--mantine-color-text) !important;
        }
        
        .w-md-editor-preview pre {
          background-color: var(--mantine-color-gray-0) !important;
          padding: 12px !important;
          border-radius: 6px !important;
          border: 1px solid var(--mantine-color-default-border) !important;
          color: var(--mantine-color-text) !important;
        }
        
        .w-md-editor-preview a {
          color: var(--mantine-color-blue-6) !important;
        }
        
        .w-md-editor-preview a:hover {
          color: var(--mantine-color-blue-8) !important;
        }
        
        .w-md-editor-preview table {
          border-collapse: collapse !important;
          margin: 16px 0 !important;
        }
        
        .w-md-editor-preview table th,
        .w-md-editor-preview table td {
          border: 1px solid var(--mantine-color-default-border) !important;
          padding: 8px 12px !important;
          color: var(--mantine-color-text) !important;
        }
        
        .w-md-editor-preview table th {
          background-color: var(--mantine-color-gray-0) !important;
          font-weight: 600 !important;
        }
        
        /* Dark mode styles */
        [data-mantine-color-scheme="dark"] .w-md-editor {
          background-color: var(--mantine-color-dark-7) !important;
          border: 1px solid var(--mantine-color-dark-4) !important;
        }
        
        [data-mantine-color-scheme="dark"] .w-md-editor-toolbar {
          background-color: var(--mantine-color-dark-6) !important;
          border-bottom: 1px solid var(--mantine-color-dark-4) !important;
        }
        
        [data-mantine-color-scheme="dark"] .w-md-editor-toolbar button:hover {
          background-color: var(--mantine-color-dark-5) !important;
        }
        
        [data-mantine-color-scheme="dark"] .w-md-editor-text-textarea,
        [data-mantine-color-scheme="dark"] .w-md-editor-text {
          background-color: var(--mantine-color-dark-7) !important;
          color: var(--mantine-color-dark-0) !important;
        }
        
        [data-mantine-color-scheme="dark"] .w-md-editor-preview {
          background-color: var(--mantine-color-dark-7) !important;
          color: var(--mantine-color-dark-0) !important;
        }
        
        [data-mantine-color-scheme="dark"] .w-md-editor-preview blockquote {
          background-color: var(--mantine-color-dark-6) !important;
        }
        
        [data-mantine-color-scheme="dark"] .w-md-editor-preview code {
          background-color: var(--mantine-color-dark-6) !important;
        }
        
        [data-mantine-color-scheme="dark"] .w-md-editor-preview pre {
          background-color: var(--mantine-color-dark-6) !important;
          border: 1px solid var(--mantine-color-dark-4) !important;
        }
        
        [data-mantine-color-scheme="dark"] .w-md-editor-preview table th,
        [data-mantine-color-scheme="dark"] .w-md-editor-preview table td {
          border: 1px solid var(--mantine-color-dark-4) !important;
          color: var(--mantine-color-dark-0) !important;
        }
        
        [data-mantine-color-scheme="dark"] .w-md-editor-preview table th {
          background-color: var(--mantine-color-dark-6) !important;
        }
      `}</style>
    </Box>
  );
}