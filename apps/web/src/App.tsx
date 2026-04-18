import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom';
import { Send } from 'lucide-react';

const API_BASE = 'http://localhost:8789/api/v1/public';
const API_KEY = 'dev-public-read-key-changeme';
const WRITE_KEY = 'dev-public-write-key-changeme';

// Fetch Utilities
const fetchApi = async (endpoint: string, options: RequestInit = {}) => {
  const isPost = options.method === 'POST' || options.method === 'PUT';
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': isPost ? WRITE_KEY : API_KEY,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error('API Error');
  return res.json();
};

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto flex h-14 items-center justify-between px-4">
            <Link to="/" className="font-bold text-xl flex items-center space-x-2">
              <span className="text-primary">Beech Site</span>
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link to="/articoli" className="transition-colors hover:text-foreground/80 text-foreground/60">Articoli</Link>
              <Link to="/gallery" className="transition-colors hover:text-foreground/80 text-foreground/60">Gallery</Link>
              <Link to="/contatti" className="transition-colors hover:text-foreground/80 text-foreground/60">Contatti</Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/articoli" element={<Articoli />} />
            <Route path="/articoli/:id" element={<Articolo />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/contatti" element={<Contatti />} />
          </Routes>
        </main>

        <footer className="py-6 border-t md:px-8 md:py-0">
          <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
            <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
              Built using Beech CMS for the live test.
            </p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

function Home() {
  return (
    <section className="container mx-auto px-4 grid items-center gap-6 pb-8 pt-6 md:py-20 lg:py-32">
      <div className="flex max-w-[980px] flex-col items-start gap-4">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tighter md:text-5xl lg:text-6xl text-primary">
          Benvenuto nel <br className="hidden sm:inline" />
          Test di Integrazione Beech CMS.
        </h1>
        <p className="max-w-[700px] text-lg text-muted-foreground">
          Sito web moderno e dinamico testato usando React, Tailwind v4 e Shadcn.
          I contenuti provengono in tempo reale dalla Public API.
        </p>
      </div>
      <div className="flex gap-4">
        <Link to="/articoli" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
          Leggi Articoli
        </Link>
        <Link to="/contatti" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
          Contattaci
        </Link>
      </div>
    </section>
  );
}

function Articoli() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetchApi('/articoli').then(res => setData(res.data)).catch(console.error);
  }, []);

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Articoli dal Web</h2>
        <p className="text-muted-foreground">Leggi i nostri articoli pubblici pescati da Wikipedia e aggiornati tramite Beech.</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((item: any) => (
          <Link key={item.id} to={`/articoli/${item.id}`} className="group flex flex-col space-y-2 relative border rounded-lg p-4 hover:shadow-lg transition-shadow">
            {item.coverImage && (
              <div className="overflow-hidden rounded-md bg-muted">
                <img src={item.coverImage} alt={item.title} className="h-[200px] w-full object-cover transition-transform group-hover:scale-105" />
              </div>
            )}
            <h3 className="text-xl font-semibold leading-tight">{item.title}</h3>
            {item.publishedAt && <p className="text-xs text-muted-foreground">{new Date(item.publishedAt).toLocaleDateString()}</p>}
            <p className="text-sm text-foreground/80 line-clamp-3">{item.metaDescription}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Articolo() {
  const { id } = useParams();
  const [item, setItem] = useState<any>(null);

  useEffect(() => {
    fetchApi(`/articoli?id=${id}`).then(res => setItem(res.data)).catch(console.error);
  }, [id]);

  if (!item) return <div className="container py-10">Generazione in corso...</div>;

  return (
    <article className="container mx-auto px-4 py-10 max-w-3xl">
      <h1 className="text-4xl font-extrabold tracking-tight mb-4">{item.title}</h1>
      {item.publishedAt && <p className="text-sm text-muted-foreground mb-8">Pubblicato il {new Date(item.publishedAt).toLocaleDateString()}</p>}
      {item.coverImage && (
        <img src={item.coverImage} alt={item.title} className="w-full rounded-lg mb-8" />
      )}
      <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: item.body }} />
    </article>
  );
}

function Gallery() {
  const [data, setData] = useState([]);

  useEffect(() => {
    // Usiamo il seed prodotti come gallery dato che ha listino immagini e immagini cover
    fetchApi('/prodotti').then(res => setData(res.data)).catch(console.error);
  }, []);

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Galleria Immagini</h2>
        <p className="text-muted-foreground">Esplora la nostra bellissima gallery powered by Unsplash.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {data.map((item: any) => {
          // uniamo l'immagine di copertina e quelle secondarie per mostrare tutto!
          const images = [];
          if(item.coverImage) images.push(item.coverImage);
          if(Array.isArray(item.images)) {
             try {
                // nel DB potrebbe essere un JSON string o Array
                const arr = typeof item.images[0] === 'string' && item.images[0].startsWith('[') ? JSON.parse(item.images[0]) : item.images;
                images.push(...arr);
             } catch(e) {}
          }
          
          return images.map((imgUrl, i) => (
             <div key={`${item.id}-${i}`} className="overflow-hidden rounded-xl border bg-muted group relative aspect-square">
               <img src={imgUrl} alt={item.name} className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-110" />
               <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                  <span className="text-white font-medium">{item.name}</span>
               </div>
             </div>
          ))
        })}
      </div>
    </div>
  );
}

function Contatti() {
  const [status, setStatus] = useState<'idle'|'loading'|'success'|'error'>('idle');

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setStatus('loading');
    const form = e.target;
    // msg_01: name, msg_02: email, msg_03: subject, msg_04: message
    const payload = {
      data: {
        name: form.name.value,
        email: form.email.value,
        subject: form.subject.value,
        message: form.message.value
      }
    };

    try {
      await fetchApi('/messaggi/add', {
        method: 'POST',
        headers: {
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify(payload)
      });
      setStatus('success');
      form.reset();
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="container mx-auto px-4 py-10 max-w-xl">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Contattaci</h2>
        <p className="text-muted-foreground mt-2">Compila il form per inviarci un messaggio tramite la Public API.</p>
      </div>

      {status === 'success' && (
        <div className="bg-green-100 text-green-800 p-4 rounded-md mb-6 relative">
          <p className="font-medium">Messaggio inviato con successo!</p>
          <p className="text-sm">Lo staff risponderà al più presto.</p>
        </div>
      )}
      
      {status === 'error' && (
        <div className="bg-red-100 text-red-800 p-4 rounded-md mb-6 relative">
          <p className="font-medium">Errore di invio.</p>
          <p className="text-sm">Cambiando public API policy o rate limit? Riprova.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 border p-6 rounded-lg shadow-sm bg-card">
        <div>
          <label className="text-sm font-medium leading-none" htmlFor="name">Nome completo</label>
          <input required id="name" name="name" className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1.5" />
        </div>
        <div>
          <label className="text-sm font-medium leading-none" htmlFor="email">Email</label>
          <input required type="email" id="email" name="email" className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1.5" />
        </div>
        <div>
          <label className="text-sm font-medium leading-none" htmlFor="subject">Oggetto</label>
          <input required id="subject" name="subject" className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1.5" />
        </div>
        <div>
          <label className="text-sm font-medium leading-none" htmlFor="message">Messaggio</label>
          <textarea required id="message" name="message" className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1.5" />
        </div>
        <button disabled={status === 'loading'} className="inline-flex w-full items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 mt-4">
          {status === 'loading' ? 'Invio in corso...' : 'Invia Messaggio'} <Send className="ml-2 h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
