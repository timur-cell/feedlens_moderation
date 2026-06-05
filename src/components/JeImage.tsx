import React from "react";

// Proxy JE images through our Convex HTTP endpoint.
// img.jamesedition.com returns HTTP 500 when browser User-Agent is detected
// (their CDN image resizer is broken). Our proxy fetches server-side without UA.

const CONVEX_SITE_URL = (import.meta.env.VITE_CONVEX_URL as string || '').replace('.cloud', '.site');

export function jeImageUrl(url: string | undefined | null): string {
  if (!url) return '';
  if (url.includes('jamesedition.com')) {
    return `${CONVEX_SITE_URL}/image-proxy?url=${encodeURIComponent(url)}`;
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
