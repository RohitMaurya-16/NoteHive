import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { StoreProvider } from './store/useStore';
import Dashboard from './pages/Dashboard';
import NotesExplorer from './pages/NotesExplorer';
import NoteEditor from './pages/NoteEditor';
import KnowledgeBase from './pages/KnowledgeBase';
import MachineLearningSolution from './pages/MachineLearningSolution';
import Profile from './pages/Profile';
import Navbar from './components/Navbar';
import './App.css';

function AppShell() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/explorer" element={<NotesExplorer />} />
            <Route path="/editor" element={<NoteEditor />} />
            <Route path="/kb" element={<KnowledgeBase />} />
            <Route path="/pdf-notes" element={<MachineLearningSolution />} />
            <Route path="/ml-solution" element={<Navigate to="/pdf-notes" replace />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
