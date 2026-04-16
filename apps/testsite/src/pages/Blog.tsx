import { useEffect, useState } from 'react'
import { fetchApi, type GetListResponse, type Entry } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

interface ArticleData {
  title: string
  publishedAt: string
  coverImage: string
  tags: Record<string, string> | string
  body: string
  metaTitle: string
  metaDescription: string
}

export default function Blog() {
  const [articles, setArticles] = useState<Entry<ArticleData>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchApi<GetListResponse<ArticleData>>('/articoli')
        setArticles(result.data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="container px-4 py-12 mx-auto max-w-5xl">
      <div className="space-y-4 mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">The BeechCMS Blog</h1>
        <p className="text-xl text-muted-foreground">Stories, guides, and engineering updates.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[1,2,3,4].map(k => (
            <div key={k} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {articles.map(article => {
            let tags = {}
            if (typeof article.tags === 'object') {
              tags = article.tags || {}
            } else {
              try { tags = JSON.parse(article.tags || '{}') } catch {}
            }
            
            return (
              <Card key={article.id} className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
                <div className="aspect-video w-full overflow-hidden">
                  <img 
                    src={article.coverImage} 
                    alt={article.title} 
                    className="object-cover w-full h-full hover:scale-105 transition-transform duration-500" 
                  />
                </div>
                <CardHeader>
                  <div className="flex gap-2 mb-2">
                    {Object.keys(tags).map(tag => (
                      <span key={tag} className="text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full uppercase tracking-wider">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <CardTitle className="text-2xl line-clamp-2">{article.title}</CardTitle>
                  <CardDescription>{new Date(article.publishedAt || article.created_at * 1000).toLocaleDateString()}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground line-clamp-3">{article.metaDescription}</p>
                </CardContent>
                <CardFooter>
                  <Button variant="default" asChild>
                    <Link to={`/blog/${article.slug}`}>Read Article</Link>
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
