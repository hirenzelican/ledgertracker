'use client';

/** Triggers a browser download of an in-memory string. */
export function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `mothers-money-transactions-2026-08-25.csv` */
export function timestampedFilename(prefix: string, extension: string, isoDate: string): string {
  return `${prefix}-${isoDate}.${extension}`;
}
