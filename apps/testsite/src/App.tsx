import { Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import Home from './pages/Home';
import Articles from './pages/Articles';
import Gallery from './pages/Gallery';
import Contact from './pages/Contact';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="articoli" element={<Articles />} />
        <Route path="galleria" element={<Gallery />} />
        <Route path="contatto" element={<Contact />} />
      </Route>
    </Routes>
  );
}

export default App;
