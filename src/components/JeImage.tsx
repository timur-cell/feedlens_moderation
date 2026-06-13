import React from "react";

// Proxy JE images through our own /image-proxy endpoint (served by the Rails
// API — see rails/app/controllers/image_proxy_controller.rb).
// img.jamesedition.com returns HTTP 500 when a browser User-Agent is detected
// (their CDN image resizer is broken). The proxy fetches server-side without UA.
//
// The path is intentionally same-origin (relative): in every environment the
// SPA and the API share a host (Vite proxy in dev, Traefik/nginx in prod), so a
// relative URL resolves to the right backend. This used to be built from
// VITE_CONVEX_URL — a leftover from the pre-Rails Convex backend — which only
// worked because the var was unset and the empty prefix fell back to this same
// relative path. Setting it (e.g. from the stale root .env.example) would have
// pointed images at a dead convex.site host.

export function jeImageUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.includes('jamesedition.com')) {
    return `/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

type JeImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | undefined | null;
};

export const JeImage = React.forwardRef<HTMLImageElement, JeImageProps>(
  ({ src, ...props }, ref) => {
    return <img ref={ref} src={jeImageUrl(src)} {...props} />;
  }
);

JeImage.displayName = "JeImage";
