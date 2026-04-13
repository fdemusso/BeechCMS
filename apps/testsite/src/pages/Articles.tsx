import { useEffect, useState } from 'react';
import { fetchSeed } from '../lib/cms';

export default function Articles() {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSeed('articoli')
      .then(res => setArticles(res.data || res.items || res))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground animate-pulse">Caricamento articoli...</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Articoli (Richtext & File)</h1>
        <p className="text-muted-foreground">Test della mappatura seed 'articoli'.</p>
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        {articles.map((article: any) => (
          <article key={article.id} className="cursor-pointer group rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all">
            {article.coverImage ? (
              <div className="aspect-video w-full overflow-hidden">
                <img 
                  src={article.coverImage} 
                  alt={article.title} 
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" 
                />
              </div>
            ) : (
              <div className="aspect-video w-full bg-muted flex items-center justify-center">
                <span className="text-muted-foreground text-sm flex items-center gap-2">Nessuna Immagine</span>
              </div>
            )}
            <div className="p-6 space-y-3">
              <h2 className="text-2xl font-bold font-serif leading-tight group-hover:text-primary transition-colors">
                {article.title || 'Senza titolo'}
              </h2>
              {article.publishedAt && (
                <time className="text-xs text-muted-foreground block">
                  {new Date(article.publishedAt).toLocaleDateString()}
                </time>
              )}
              {article.body && (
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground line-clamp-3"
                  dangerouslySetInnerHTML={{ __html: article.body }}
                />
              )}
            </div>
          </article>
        ))}
        {articles.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-xl">
            Nessun articolo presente nel CMS.
          </div>
        )}
      </div>
    </div>
  );
}
