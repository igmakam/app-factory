import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { LayoutDashboard, AppWindow, PlusCircle } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "App Factory Dashboard",
  description: "Monitor and manage your AI-generated apps",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-background text-foreground min-h-screen`}>
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-56 border-r border-border bg-card flex flex-col">
            <div className="p-4 border-b border-border">
              <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                <span className="text-primary">⚙</span> App Factory
              </h1>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <LayoutDashboard size={16} /> Dashboard
              </Link>
              <Link
                href="/apps"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <AppWindow size={16} /> All Apps
              </Link>
              <Link
                href="/apps/new"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <PlusCircle size={16} /> New App
              </Link>
            </nav>
            <div className="p-3 border-t border-border text-xs text-muted-foreground">
              App Factory v1.0
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto">
            <div className="max-w-6xl mx-auto p-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
