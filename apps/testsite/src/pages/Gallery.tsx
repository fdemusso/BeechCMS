import { useEffect, useState } from 'react';
import { fetchSeed } from '../lib/cms';

export default function Gallery() {
  const [images, setImages] = useState<{url: string, title?: string}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSeed('prodotti')
      .then(res => {
        const items = res.data || res.items || res;
        // Estrai le immagini da ogni prodotto
        const extracted: {url: string, title?: string}[] = [];
        items.forEach((item: any) => {
           if(item.images && Array.isArray(item.images)) {
              item.images.forEach((imgUrl: string) => {
                 extracted.push({ url: imgUrl, title: item.name || "Senza descrizione" });
              });
           }
        });
        setImages(extracted);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground animate-pulse">Caricamento galleria...</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">Galleria (List Field)</h1>
        <p className="text-muted-foreground">Test aggregazione media dal seed 'prodotti'.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((img, i) => (
          <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border bg-muted shadow-sm">
            <img 
              src={img.url} 
              alt={img.title} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
              <span className="text-white text-sm font-medium">{img.title}</span>
            </div>
          </div>
        ))}

        {images.length === 0 && (
          <div className="col-span-full py-24 text-center text-muted-foreground border border-dashed rounded-xl">
            Nessuna immagine trovata nei record dei prodotti.
          </div>
        )}
      </div>
    </div>
  );
}
