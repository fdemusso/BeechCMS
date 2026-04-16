import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchApi, type GetListResponse, type Entry } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface ArticleData {
  title: string
  publishedAt: string
  coverImage: string
  tags: Record<string, string> | string
  body: string
  metaTitle: string
  metaDescription: string
}

export default function ArticleDetail() {
  const { slug } = useParams<{ slug: string }>()
  const [article, setArticle] = useState<Entry<ArticleData> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchApi<GetListResponse<ArticleData>>('/articoli', {
          params: { slug: slug || '', limit: 1 }
        })
        if (result.data.length > 0) {
          setArticle(result.data[0])
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    if (slug) load()
  }, [slug])

  if (loading) {
    return <div className="h-[50vh] flex items-center justify-center animate-pulse">Loading article...</div>
  }

  if (!article) {
    return <div className="h-[50vh] flex flex-col items-center justify-center">
      <h2 className="text-2xl font-bold mb-4">Article Not Found</h2>
      <Button asChild><Link to="/blog">Back to Blog</Link></Button>
    </div>
  }

  const data = article

  return (
    <article className="container px-4 py-12 mx-auto max-w-4xl">
      <Button variant="ghost" asChild className="mb-8">
        <Link to="/blog">← Back to Blog</Link>
      </Button>

      <div className="space-y-8">
        <header className="space-y-4 text-center">
          <h1 className="text-4xl font-black tracking-tight lg:text-6xl text-balance">
            {data.title}
          </h1>
          <p className="text-muted-foreground text-lg">
            Published on {new Date(data.publishedAt || data.created_at * 1000).toLocaleDateString()}
          </p>
        </header>

        <div className="w-full aspect-[2/1] rounded-2xl overflow-hidden shadow-2xl">
          <img src={data.coverImage} alt={data.title} className="w-full h-full object-cover" />
        </div>

        <div 
          className="prose prose-lg dark:prose-invert prose-p:leading-relaxed prose-a:text-primary max-w-none"
          dangerouslySetInnerHTML={{ __html: data.body }}
        />
      </div>
    </article>
  )
}
