/**
 * Cloudflare Worker for serving R2 assets publicly
 * Serves files from graphics-compiler-public bucket
 * Paths: /demo/, /system/, /videos/
 */

// CORS headers for all requests
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Max-Age': '86400',
};

// Content-Type mappings
const CONTENT_TYPES = {
  'cpp': 'text/plain; charset=utf-8',
  'zip': 'application/zip',
  'mp4': 'video/mp4',
  'txt': 'text/plain; charset=utf-8',
  'pdf': 'application/pdf',
};

// Cache control by path
const CACHE_CONTROL = {
  '/demo/': 'public, max-age=2592000',        // 1 hour for demo files
  '/system/': 'public, max-age=31536000',  // 1 year for system files (immutable)
  '/videos/': 'public, max-age=604800',    // 1 week for videos
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle OPTIONS preflight for CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // Only allow GET and HEAD methods
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { 
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    // Root path - return info
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(JSON.stringify({
        service: 'Graphics.h Compiler - R2 Public Assets',
        version: '1.0.0',
        endpoints: {
          demo: '/demo/*.cpp',
          system: '/system/*.zip',
          videos: '/videos/*.mp4'
        },
        example: {
          demo: `${url.origin}/demo/graphics_demo.cpp`,
          system: `${url.origin}/system/tc-v1.zip`,
          videos: `${url.origin}/videos/vscode-demo-v2.mp4`
        }
      }, null, 2), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      });
    }

    try {
      // Extract path from URL
      const path = url.pathname;
      
      // Validate path starts with allowed prefixes
      const allowedPrefixes = ['/demo/', '/system/', '/videos/'];
      const isAllowed = allowedPrefixes.some(prefix => path.startsWith(prefix));
      
      if (!isAllowed) {
        return new Response(JSON.stringify({
          error: 'Not Found',
          message: 'Only /demo/, /system/, and /videos/ paths are accessible',
          available_paths: allowedPrefixes
        }, null, 2), {
          status: 404,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          },
        });
      }

      // Check if R2 bucket is bound
      if (!env.ASSETS_BUCKET) {
        return new Response(JSON.stringify({
          error: 'Configuration Error',
          message: 'R2 bucket not configured. Please bind ASSETS_BUCKET in wrangler.jsonc'
        }, null, 2), {
          status: 500,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          },
        });
      }

      // Remove leading slash for R2 key
      const r2Key = path.substring(1);
      
      console.log(`Fetching from R2: ${r2Key}`);
      
      // Fetch from R2
      const object = await env.ASSETS_BUCKET.get(r2Key);
      
      if (!object) {
        return new Response(JSON.stringify({
          error: 'File Not Found',
          message: `The requested file '${r2Key}' does not exist in R2`,
          path: path
        }, null, 2), {
          status: 404,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          },
        });
      }

      // Get file extension
      const extension = r2Key.split('.').pop().toLowerCase();
      const contentType = CONTENT_TYPES[extension] || 'application/octet-stream';
      
      // Determine cache control
      let cacheControl = 'public, max-age=3600';
      for (const [prefix, control] of Object.entries(CACHE_CONTROL)) {
        if (path.startsWith(prefix)) {
          cacheControl = control;
          break;
        }
      }

      // Build response headers
      const headers = {
        ...CORS_HEADERS,
        'Content-Type': contentType,
        'Content-Length': object.size,
        'Cache-Control': cacheControl,
        'ETag': object.httpEtag,
        'Last-Modified': object.uploaded.toUTCString(),
        'Accept-Ranges': 'bytes',
      };

      // Handle Range requests for video streaming
      const range = request.headers.get('Range');
      if (range && extension === 'mp4') {
        return handleRangeRequest(object, range, headers);
      }

      // Return full file
      return new Response(object.body, {
        status: 200,
        headers,
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
        stack: error.stack
      }, null, 2), {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      });
    }
  },
};

/**
 * Handle HTTP Range requests for video streaming
 */
async function handleRangeRequest(object, rangeHeader, baseHeaders) {
  const ranges = parseRange(rangeHeader, object.size);
  
  if (!ranges || ranges.length === 0) {
    return new Response('Invalid Range', {
      status: 416,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes */${object.size}`,
      },
    });
  }

  const { start, end } = ranges[0];
  const length = end - start + 1;

  // R2 supports range requests via slice
  const rangedBody = object.body.slice(start, end + 1);

  return new Response(rangedBody, {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${object.size}`,
      'Content-Length': length,
    },
  });
}

/**
 * Parse HTTP Range header
 */
function parseRange(rangeHeader, fileSize) {
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

  if (start >= fileSize || end >= fileSize || start > end) {
    return null;
  }

  return [{ start, end }];
}