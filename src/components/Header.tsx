import { ArrowRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "./ui/button";

export function Header() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  const isAuthPage =
    location.pathname === "/login" || location.pathname === "/signup";

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="container">
        <div className="flex h-16 items-center justify-between">
          <Link
            to="/"
            className="flex flex-col gap-1 hover:opacity-80 transition-opacity"
          >
            <span className="font-serif text-[24px] font-medium leading-none tracking-[0.02em]">
              Feed<span className="text-je-teal">Lens</span>
            </span>
            <span className="hidden sm:inline text-[9px] font-semibold uppercase leading-none tracking-[0.18em] text-je-ink-3">
              JamesEdition · T&amp;S
            </span>
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
