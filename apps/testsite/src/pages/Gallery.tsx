import { useEffect, useState } from 'react'
import { fetchApi, type GetListResponse, type Entry } from '@/lib/api'

interface GalleryData {
  name: string
  coverImage: string
  images: string[] | string
  description: string
}

export default function Gallery() {
  const [items, setItems] = useState<Entry<GalleryData>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchApi<GetListResponse<GalleryData>>('/prodotti', {
          params: { limit: 10 }
        })
        setItems(result.data)
      } catch(e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="container px-4 py-12 mx-auto">
      <div className="mb-12 text-center max-w-3xl mx-auto space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">Photo Gallery</h1>
        <p className="text-xl text-muted-foreground">
          Showcasing BeechCMS asset-list support with premium Unsplash photography.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-square bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
          {items.map(item => {
            let images: string[] = []
            if (Array.isArray(item.images)) {
              images = item.images
            } else {
              try { images = JSON.parse(item.images as string || '[]') } catch {}
            }
            
            // Add cover if not in list
            const allImages = Array.from(new Set([item.coverImage, ...images].filter(Boolean)))

            return allImages.map((imgUrl, idx) => (
              <div key={`${item.id}-${idx}`} className="relative group overflow-hidden rounded-xl break-inside-avoid">
                <img 
                  src={imgUrl} 
                  alt={item.name} 
                  className="w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                  <h3 className="text-white font-semibold text-lg">{item.name}</h3>
                  <div className="text-white/80 text-sm line-clamp-2" dangerouslySetInnerHTML={{ __html: item.description }} />
                </div>
              </div>
            ))
          })}
        </div>
      )}
    </div>
  )
}
