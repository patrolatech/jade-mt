import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ValidationStatusSchema, type ValidationStatus } from '@jade/schemas';
import './style.css';

const statuses: ValidationStatus[] = ValidationStatusSchema.anyOf.map(
  (status) => status.const,
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main>
      <p className="eyebrow">UFMT · Research prototype</p>
      <h1>JADE-MT</h1>
      <p>Environmental Validation Research Prototype</p>
      <p className="note">Shared screening statuses: {statuses.join(' · ')}</p>
      <p className="note">
        Methodology under investigation. No environmental decision has been
        made.
      </p>
    </main>
  </StrictMode>,
);
