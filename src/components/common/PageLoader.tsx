const PageLoader = () => {
  return (
    <div className="min-h-[40vh] w-full flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
};

export default PageLoader;
