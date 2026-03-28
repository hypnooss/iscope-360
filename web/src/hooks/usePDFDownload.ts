import { useState, useCallback } from 'react';
import { pdf } from '@react-pdf/renderer';

interface UsePDFDownloadReturn {
  downloadPDF: (document: React.ReactElement, filename: string) => Promise<void>;
  isGenerating: boolean;
  error: Error | null;
}

export function usePDFDownload(): UsePDFDownloadReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const downloadPDF = useCallback(async (document: React.ReactElement, filename: string) => {
    setIsGenerating(true);
    setError(null);

    try {
      // Generate PDF blob from React document
      const blob = await pdf(document).toBlob();

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
      
      // Trigger download
      window.document.body.appendChild(link);
      link.click();
      
      // Cleanup
      window.document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate PDF');
      setError(error);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return { downloadPDF, isGenerating, error };
}

// Utility to sanitize filename for PDF export
export function sanitizePDFFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Generate formatted date string for PDF filenames
export function getPDFDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
}
