export function normalizeObjectUrl(input: string | null | undefined): string {
  if (!input) return '';
  
  let result = input;
  
  // If it's an absolute URL, we need to handle the path part only
  if (result.startsWith('http://') || result.startsWith('https://')) {
    try {
      const url = new URL(result);
      let path = url.pathname;
      
      // Fix duplicate /objects/ patterns in path
      path = path.replace(/\/objects\/+objects\//g, '/objects/');
      path = path.replace(/\/objects\/\/objects\//g, '/objects/');
      
      // Fix any remaining double slashes in path (but not after protocol)
      path = path.replace(/\/\/+/g, '/');
      
      url.pathname = path;
      return url.toString();
    } catch {
      // If URL parsing fails, treat as path
    }
  }
  
  // For relative paths:
  // Fix duplicate /objects/ patterns
  result = result.replace(/\/objects\/+objects\//g, '/objects/');
  result = result.replace(/\/objects\/\/objects\//g, '/objects/');
  
  // Fix any double slashes
  result = result.replace(/\/\/+/g, '/');
  
  // Ensure it starts with /objects/ if it contains objects path
  if (result.includes('/objects/') && !result.startsWith('/objects/')) {
    const idx = result.indexOf('/objects/');
    result = result.slice(idx);
  }
  
  // If path is like "uploads/xxx" without /objects/, add it
  if (!result.startsWith('/objects/') && !result.startsWith('http')) {
    // Remove leading slash if present for clean join
    const cleanPath = result.startsWith('/') ? result.slice(1) : result;
    // Only add /objects/ if it looks like an upload path
    if (cleanPath.startsWith('uploads/') || cleanPath.startsWith('objects/')) {
      const pathWithoutObjects = cleanPath.replace(/^objects\//, '');
      result = `/objects/${pathWithoutObjects}`;
    }
  }
  
  return result;
}
