import React from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<div>task-management</div>);
}
