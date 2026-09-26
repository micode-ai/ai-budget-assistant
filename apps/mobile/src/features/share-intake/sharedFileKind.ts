/** Some apps share a PDF as application/octet-stream; trust the extension then. */
export function sharedFileKind(mimeType: string, name: string): 'pdf' | 'image' {
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  return 'image';
}
