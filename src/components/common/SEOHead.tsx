import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  publishedAt?: string;
  author?: string;
  keywords?: string[];
  noIndex?: boolean;
}

export function SEOHead({
  title,
  description,
  image = 'https://giftmind.in/brand/giftmind-lockup.png',
  url = typeof window !== 'undefined' ? window.location.href : '',
  type = 'website',
  publishedAt,
  author,
  keywords,
  noIndex = false,
}: SEOProps) {
  useEffect(() => {
    // Title
    document.title = `${title} — GiftMind`;
    
    // Helper to set/create meta tags
    function setMeta(property: string, content: string, isName = false) {
      const attr = isName ? 'name' : 'property';
      let el = document.querySelector(`meta[${attr}="${property}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    }
    
    // Basic meta
    setMeta('description', description, true);
    if (keywords?.length) setMeta('keywords', keywords.join(', '), true);
    if (noIndex) setMeta('robots', 'noindex, nofollow', true);
    
    // Open Graph
    setMeta('og:title', title);
    setMeta('og:description', description);
    setMeta('og:image', image);
    setMeta('og:url', url);
    setMeta('og:type', type);
    setMeta('og:site_name', 'GiftMind');
    
    // Twitter Card
    setMeta('twitter:card', 'summary_large_image', true);
    setMeta('twitter:title', title, true);
    setMeta('twitter:description', description, true);
    setMeta('twitter:image', image, true);
    
    // Article specific
    if (type === 'article' && publishedAt) {
      setMeta('article:published_time', publishedAt);
      if (author) setMeta('article:author', author);
    }
    
    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);
    
    // JSON-LD (for articles)
    if (type === 'article') {
      let script = document.querySelector('script[data-seo-jsonld]');
      if (!script) {
        script = document.createElement('script');
        script.setAttribute('type', 'application/ld+json');
        script.setAttribute('data-seo-jsonld', 'true');
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title,
        "description": description,
        "image": image,
        "datePublished": publishedAt,
        "author": { "@type": "Person", "name": author || "GiftMind" },
        "publisher": {
          "@type": "Organization",
          "name": "GiftMind",
          "logo": { "@type": "ImageObject", "url": "https://giftmind.in/icons/icon-512.png" }
        }
      });
    }
  }, [title, description, image, url, type, publishedAt, author, keywords, noIndex]);

  return null; // This component only sets head tags
}
