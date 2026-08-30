import { Link, useLocation } from "wouter";
import { Activity, PlaySquare, Database, Settings, HardDrive } from "lucide-react";
import { motion } from "framer-motion";

const tabs = [
  { href: "/", icon: Activity, label: "Dashboard" },
  { href: "/loop", icon: PlaySquare, label: "Loop" },
  { href: "/models", icon: Database, label: "Models" },
  { href: "/checkpoints", icon: HardDrive, label: "States" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function MobileNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 pb-safe">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map(({ href, icon: Icon, label }) => {
          const isActive = location === href;
          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center justify-center w-14 h-full gap-0.5"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-[1px] w-8 h-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <Icon
                className={`w-5 h-5 transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span
                className={`text-[10px] font-mono tracking-wider transition-colors ${
                  isActive ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
