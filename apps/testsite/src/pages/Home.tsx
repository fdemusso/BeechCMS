import { Link } from 'react-router-dom';
import { FileText, LayoutGrid, Send } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="space-y-4">
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
          Benvenuto nel sito di test
        </h1>
        <p className="max-w-[42rem] mx-auto text-xl text-muted-foreground">
          Questa applicazione frontend si auto-alimenta utilizzando esclusivamente il layer Public API di BeechCMS.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3 max-w-4xl pt-8">
        {[
          { title: "Articoli", icon: FileText, to: "/articoli", desc: "Test di lettura seed 'articoli' e layout richtext." },
          { title: "Galleria", icon: LayoutGrid, to: "/galleria", desc: "Estrapolazione di list media dal seed 'prodotti'." },
          { title: "Contatti", icon: Send, to: "/contatto", desc: "Invio payload POST al seed 'messaggi'." }
        ].map((item, i) => (
          <Link
            key={i}
            to={item.to}
            className="group flex flex-col items-center justify-center gap-4 rounded-xl border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:border-primary/50"
          >
            <div className="rounded-full bg-primary/10 p-4 text-primary group-hover:scale-110 transition-transform">
              <item.icon className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
