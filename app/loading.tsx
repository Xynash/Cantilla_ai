export default function Loading() {
  return (
    <div className="flex h-[350px] w-full flex-col items-center justify-center space-y-3">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-xs font-medium text-muted-foreground animate-pulse">
        Loading procurement workspace...
      </p>
    </div>
  );
}
