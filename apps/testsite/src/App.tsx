import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/layout/Navbar'
import Home from './pages/Home'
import Blog from './pages/Blog'
import Gallery from './pages/Gallery'
import Contact from './pages/Contact'
import ArticleDetail from './pages/ArticleDetail'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-background font-sans text-foreground">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<ArticleDetail />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </main>
        <footer className="border-t py-6 md:py-0">
          <div className="container mx-auto flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row px-4">
            <p className="text-sm leading-loose text-muted-foreground text-center md:text-left">
              Built by Antigravity for BeechCMS DX Testing.
            </p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  )
}

export default App
