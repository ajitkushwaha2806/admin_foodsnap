import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <h2 className="text-3xl font-extrabold tracking-tight">404 - Page Not Found</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild size="sm">
        <Link href="/">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
