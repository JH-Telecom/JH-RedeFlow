import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './team.css';
import './outcome.css';
import './activation.css';
import './imports.css';
import './dashboard.css';
import './sidebar.css';
import './admin.css';
import './filters.css';

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);