import { useState } from 'react';
import { postSeed } from '../lib/cms';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      await postSeed('messaggi', {
        data: {
          ...formData,
          read: false
        }
      });
      setStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Mettiti in contatto</h1>
        <p className="text-muted-foreground">Test del comando di POST. Il body viene incamerato nel seed 'messaggi'.</p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        {status === 'success' ? (
           <div className="py-12 text-center text-green-600 space-y-4">
             <div className="h-12 w-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto text-xl font-bold">✓</div>
             <p className="font-medium text-lg">Messaggio inviato con successo.</p>
             <button onClick={() => setStatus('idle')} className="text-sm text-primary hover:underline">Invia un altro messaggio</button>
           </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {status === 'error' && (
               <div className="p-3 bg-red-100 text-red-600 text-sm rounded-md mb-4 border border-red-200">
                 Si è verificato un errore di rete o di validazione durante l'invio. Verifica i log o se hai inserito correttamente la Public API Key.
               </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium leading-none">Nome</label>
                <input
                  id="name"
                  type="text"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium leading-none">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="subject" className="text-sm font-medium leading-none">Oggetto</label>
              <input
                id="subject"
                type="text"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.subject}
                onChange={e => setFormData(p => ({ ...p, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium leading-none">Messaggio</label>
              <textarea
                id="message"
                required
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.message}
                onChange={e => setFormData(p => ({ ...p, message: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              disabled={status ===('loading')}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full mt-4"
            >
              {status === 'loading' ? 'Invio in corso...' : 'Invia Messaggio'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
