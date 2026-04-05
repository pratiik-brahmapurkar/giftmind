import { useEffect } from "react";

interface BlogSeoProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

export default function BlogSeo({ title, description, image, url, type = "article" }: BlogSeoProps) {
  useEffect(() => {
    const fullTitle = title ? `${title} — GiftMind Blog` : "GiftMind Blog — Gift Ideas & Guides";
    document.title = fullTitle;

    const setMeta = (name: string, content: string, attr = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const desc = description || "Gift ideas, guides, and the psychology of thoughtful giving.";
    setMeta("description", desc);
    setMeta("og:title", fullTitle, "property");
    setMeta("og:description", desc, "property");
    setMeta("og:type", type, "property");
    if (image) setMeta("og:image", image, "property");
    if (url) {
      setMeta("og:url", url, "property");
      let canon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
      if (!canon) { canon = document.createElement("link"); canon.rel = "canonical"; document.head.appendChild(canon); }
      canon.href = url;
    }
    setMeta("twitter:card", "summary_large_image", "name");
    setMeta("twitter:title", fullTitle, "name");
    setMeta("twitter:description", desc, "name");
    if (image) setMeta("twitter:image", image, "name");

    return () => { document.title = "GiftMind"; };
  }, [title, description, image, url, type]);

  return null;
}
