import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center px-4 mx-auto">
        <div className="mr-4 flex">
          <Link to="/" className="mr-6 flex items-center space-x-2">
            <span className="font-bold sm:inline-block">
              BeechCMS Test
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link to="/blog" className="transition-colors hover:text-foreground/80 text-foreground/60">
              Blog
            </Link>
            <Link to="/gallery" className="transition-colors hover:text-foreground/80 text-foreground/60">
              Gallery
            </Link>
            <Link to="/contact" className="transition-colors hover:text-foreground/80 text-foreground/60">
              Contact
            </Link>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <Button variant="outline" asChild>
            <a href="http://localhost:5173" target="_blank" rel="noreferrer">
              Dashboard
            </a>
          </Button>
        </div>
      </div>
    </nav>
  )
}
