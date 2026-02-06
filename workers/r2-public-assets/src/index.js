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
  'webm': 'video/webm',
  'mov': 'video/quicktime',
};

// Aggressive cache control by path
const CACHE_CONTROL = {
  '/demo/': 'public, max-age=31536000, immutable',      // 1 year for demo files
  '/system/': 'public, max-age=31536000, immutable',    // 1 year for system files
  '/videos/': 'public, max-age=31536000, immutable',    // 1 year for videos
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
        version: '1.0.1',
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
          'Cache-Control': 'public, max-age=3600',
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
      
      // Handle Range requests - fetch with range from R2
      const range = request.headers.get('Range');
      let object;
      
      if (range) {
        // Parse range header
        const rangeMatch = range.match(/bytes=(\d+)-(\d*)/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10);
          const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : undefined;
          
          // Fetch with range option from R2
          object = await env.ASSETS_BUCKET.get(r2Key, {
            range: end !== undefined ? { offset: start, length: end - start + 1 } : { offset: start }
          });
        } else {
          // Invalid range format, fetch full file
          object = await env.ASSETS_BUCKET.get(r2Key);
        }
      } else {
        // No range request, fetch full file
        object = await env.ASSETS_BUCKET.get(r2Key);
      }
      
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
      
      // Determine cache control - aggressive caching
      let cacheControl = 'public, max-age=31536000, immutable';
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
        'Cache-Control': cacheControl,
        'Accept-Ranges': 'bytes',
      };

      // Add ETag if available
      if (object.httpEtag) {
        headers['ETag'] = object.httpEtag;
      }

      // Add Last-Modified if available
      if (object.uploaded) {
        headers['Last-Modified'] = object.uploaded.toUTCString();
      }

      // Handle ranged response
      if (range && object.range) {
        const { offset, length } = object.range;
        const end = offset + length - 1;
        
        // Get total size from httpMetadata or use a default approach
        // R2 doesn't always provide size in ranged requests, but we can get it from the object
        const size = object.size || (end + 1);
        
        headers['Content-Range'] = `bytes ${offset}-${end}/${size}`;
        headers['Content-Length'] = length;
        
        return new Response(object.body, {
          status: 206,
          headers,
        });
      }

      // Return full file
      headers['Content-Length'] = object.size;
      
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