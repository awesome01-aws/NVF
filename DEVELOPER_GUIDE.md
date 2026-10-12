# ⚡ Developer Playbook: Extending New Vision Farms

Welcome to the New Vision Farms codebase! This guide acts as your map when expanding the app, adding custom screens, or integrating new data models as your Brahma farm grows.

---

## 🏗️ Technical Architecture Overview

New Vision Farms is built as a complete **full-stack unified React + Express** application:
1. **Frontend**: Styled exclusively with high-contrast, responsive **Tailwind CSS**, state management via standard React hooks, and icon coverage via **Lucide React**.
2. **Backend**: Custom **Node.js Express Server** (`server.ts`) which serves static production bundles and provides robust REST endpoints.
3. **Database**: Lightweight JSON transactional database (`db.json`) kept secure in server memory. This ensures rapid cold-starts and works without external database drivers.

All dates are standardized as `YYYY-MM-DD` strings inside the database to keep arithmetic robust.

---

## 🛠️ Step-by-Step: Adding a New Feature

Let's say you want to add a new **"🐓 Vaccination Schedule"** tracker. Follow this standard 4-step workflow:

### Step 1: Extend the Schema
Open `/src/types.ts` and add your type definitions:

```typescript
export interface VaccinationRecord {
  id: string;
  flockId: string;
  vaccineName: string;
  dateAdministered: string;
  administeredBy: string;
  notes?: string;
}
```

Then expand `DbSchema` key-value pairs to support it:
```typescript
export interface DbSchema {
  users: User[];
  clients: Client[];
  incubator_records: IncubatorRecord[];
  flocks: Flock[];
  feed_records: FeedRecord[];
  poultry_sales: PoultrySale[];
  mortality: Mortality[];
  expenses: Expense[];
  vaccinations: VaccinationRecord[]; // 🆕 Added
}
```

---

### Step 2: Declare Server Endpoints
Open `/server.ts` to add REST CRUD operations. The server uses utility loaders `loadDb()` and `saveDb()`.

```typescript
// GET vaccinations list
app.get("/api/vaccinations", authenticateToken, (req, res) => {
  const db = loadDb();
  if (!db.vaccinations) {
    db.vaccinations = [];
    saveDb(db);
  }
  res.json(db.vaccinations);
});

// POST new vaccination record
app.post("/api/vaccinations", authenticateToken, (req, res) => {
  const db = loadDb();
  if (!db.vaccinations) db.vaccinations = [];

  const newRecord = {
    id: "vac_" + Math.random().toString(36).substring(2, 9),
    ...req.body
  };

  db.vaccinations.push(newRecord);
  saveDb(db);
  res.status(201).json({ success: true, record: newRecord });
});
```

---

### Step 3: Implement the Frontend View Component
Create a new file `/src/components/VaccineMod.tsx` (modifying CSS with pre-styled inputs):

```tsx
import React, { useState } from 'react';
import { ShieldAlert, Plus, Save } from 'lucide-react';

export default function VaccineMod({ data, token, triggerRefresh }) {
  // your React form handlers, sort lists, and fetch triggers
  return (
    <div className="space-y-6 pb-28">
      <h2 className="text-xl font-bold uppercase">🐓 Flock Vaccination Planner</h2>
      {/* Forms, Lists, Sorts */}
    </div>
  );
}
```

---

### Step 4: Register Tab & Render inside App Navigation
Open `/src/App.tsx`.
1. Look for the bottom navigation list (`'home' | 'farm' | 'incubator' | 'reports'`).
2. You can add `'vaccines'` as a permitted tab state value.
3. Add a beautiful button pointing to your tab in the fixed client-side bottom navigation bar:
```tsx
<button
  onClick={() => setActiveTab('vaccines')}
  className={`flex flex-col items-center justify-center p-3 transition-colors ${
    activeTab === 'vaccines' ? 'text-emerald-750 font-black' : 'text-slate-400'
  }`}
>
  🛡️ Vaccines
</button>
```

---

## 💾 Local Dev & Build Verification

To boot up the application in developer sandbox mode:
```bash
npm run dev
```

To compile production assets:
```bash
npm run build
```

This guarantees that New Vision Farms stays robust, extensible, and completely responsive to your business requirements in Cameroon!
