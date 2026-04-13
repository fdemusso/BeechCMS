import { Link, Outlet } from 'react-router-dom';
import { LayoutGrid, FileText, Send, Home } from 'lucide-react';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center space-x-6">
            <Link to="/" className="flex items-center space-x-2 font-bold text-xl">
              <Home className="h-5 w-5" />
              <span>CMS Test Site</span>
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link to="/articoli" className="flex items-center gap-2 hover:text-primary transition-colors">
                <FileText className="h-4 w-4" /> Articoli
              </Link>
              <Link to="/galleria" className="flex items-center gap-2 hover:text-primary transition-colors">
                <LayoutGrid className="h-4 w-4" /> Galleria
              </Link>
              <Link to="/contatto" className="flex items-center gap-2 hover:text-primary transition-colors">
                <Send className="h-4 w-4" /> Contattaci
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <Outlet />
        </div>
      </main>
      <footer className="border-t py-6 md:py-0">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row px-4">
          <p className="text-sm text-muted-foreground text-center">
            Test environments connect directly to BeechCMS Public APIs.
          </p>
        </div>
      </footer>
    </div>
  );
}
