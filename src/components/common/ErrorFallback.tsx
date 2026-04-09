import { Button } from "@/components/ui/button";

const ErrorFallback = () => {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-4 text-center gap-4">
      <h1 className="text-xl font-semibold text-foreground">Something went wrong.</h1>
      <p className="text-sm text-muted-foreground">Please refresh the page.</p>
      <Button onClick={() => window.location.reload()}>Refresh</Button>
    </div>
  );
};

export default ErrorFallback;
