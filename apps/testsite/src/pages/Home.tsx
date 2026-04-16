import { useEffect, useState } from 'react'
import { fetchApi, type GetListResponse, type Entry } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

interface PaginaData {
  title: string
  coverImage: string
  body: string
}

export default function Home() {
  const [data, setData] = useState<Entry<PaginaData> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const result = await fetchApi<GetListResponse<PaginaData>>('/pagine', {
          params: { slug: 'test-home', limit: 1 }
        })
        if (result.data.length > 0) {
          setData(result.data[0])
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return <div className="h-[50vh] flex items-center justify-center animate-pulse">Loading DX Experience...</div>
  }

  if (!data) {
    return (
      <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-primary/5">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="flex flex-col items-center space-y-4 text-center">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
              Welcome to BeechCMS Test Site
            </h1>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
              Error loading page content. Did you run the database migrations?
            </p>
          </div>
        </div>
      </section>
    )
  }

  const { title, coverImage: heroImage, body: htmlBody } = data

  return (
    <section 
      className="w-full relative min-h-[60vh] flex items-center justify-center overflow-hidden"
    >
      <div className="absolute inset-0 z-0">
        <img 
          src={heroImage} 
          alt="Hero" 
          className="object-cover w-full h-full opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>
      <div className="container relative z-10 px-4 md:px-6 mx-auto">
        <div className="flex flex-col items-center space-y-8 text-center mt-16">
          <div className="space-y-4 max-w-3xl">
            <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl/none text-shadow-md">
              {title}
            </h1>
            <div 
              className="mx-auto max-w-[700px] text-foreground/80 md:text-xl md:leading-relaxed"
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          </div>
          <div className="space-x-4">
            <Button size="lg" asChild>
              <Link to="/blog">Explore the Blog</Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link to="/gallery">View Gallery</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
