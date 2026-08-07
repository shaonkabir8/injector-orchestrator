import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-full w-full bg-background font-mono">
      <Card className="w-full max-w-md bg-card border-border rounded-none shadow-none">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            <AlertTriangle className="h-16 w-16 text-destructive animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold tracking-widest uppercase">404 - Not Found</h1>
          <p className="text-sm text-muted-foreground">
            The requested module path does not exist in the current execution context.
          </p>
          <div className="pt-4 border-t border-border">
            <Link href="/" className="text-primary hover:underline uppercase tracking-widest text-sm">
              [ Return to Dashboard ]
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
