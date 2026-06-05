import { useConvexAuth } from "convex/react";
import { ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { APP_NAME } from "@/lib/constants";
import { Button } from "./ui/button";

export function Header() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const location = useLocation();

  const isAuthPage =
    location.pathname === "/login" || location.pathname === "/signup";

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="container">
        <div className="flex h-16 items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="size-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="size-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
                <line x1="8" y1="8" x2="14" y2="8" />
                <line x1="8" y1="11" x2="14" y2="11" />
                <line x1="8" y1="14" x2="14" y2="14" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="hidden sm:inline font-semibold text-lg leading-tight">
                Feed<span className="text-blue-600">Lens</span>
              </span>
              <span className="hidden sm:inline text-[10px] text-muted-foreground leading-none tracking-wide">
                moderation
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-2">
            {isLoading ? null : isAuthenticated ? (
              <Button size="sm" asChild>
                <Link to="/dashboard">
                  Open App
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              !isAuthPage && (
                <Button size="sm" asChild>
                  <Link to="/login">Sign In</Link>
                </Button>
              )
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
