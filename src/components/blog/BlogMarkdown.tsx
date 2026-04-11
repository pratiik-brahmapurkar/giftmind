import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";

interface BlogMarkdownProps {
  content: string;
  className?: string;
}

export default function BlogMarkdown({ content, className }: BlogMarkdownProps) {
  return (
    <div
      className={cn(
        "prose prose-slate max-w-none",
        "prose-headings:font-semibold prose-headings:text-slate-950",
        "prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-3xl",
        "prose-h3:mt-7 prose-h3:mb-3 prose-h3:text-2xl",
        "prose-p:my-4 prose-p:text-[1.03rem] prose-p:leading-8 prose-p:text-slate-700",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:bg-primary/5 prose-blockquote:py-2 prose-blockquote:italic",
        "prose-li:text-slate-700 prose-strong:text-slate-950",
        "prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:text-primary",
        "prose-pre:overflow-x-auto prose-pre:rounded-2xl prose-pre:bg-slate-950 prose-pre:p-4 prose-pre:text-slate-50",
        "prose-img:rounded-2xl prose-img:shadow-sm",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ href, children, ...props }) => (
            <a
              {...props}
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noreferrer" : undefined}
            >
              {children}
            </a>
          ),
          img: ({ src, alt, ...props }) => (
            <img
              {...props}
              src={src}
              alt={alt || ""}
              loading="lazy"
              className="my-6 w-full rounded-2xl object-cover"
            />
          ),
          code({ className: codeClassName, children, ...props }) {
            const isBlock = !!codeClassName;
            if (isBlock) {
              return (
                <code {...props} className={codeClassName}>
                  {children}
                </code>
              );
            }
            return (
              <code {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
