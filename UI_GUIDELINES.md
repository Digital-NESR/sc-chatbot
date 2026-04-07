# UI GUIDELINES

This document serves as the definitive reference and system prompt for future AI frontend developers working on this project. By strict adherence to these guidelines, developers will maintain the enterprise-grade, minimalist, and dynamic aesthetics established in the core application.

---

## 1. Design Philosophy & Global Rules

- **Tailwind CSS is Mandatory:** All styling must be achieved through strictly applying Tailwind CSS (v4) utility classes. Avoid writing custom CSS unless absolutely required for a specific animation or raw dynamic token injection.
- **Enterprise-Grade Minimalism:** Interfaces must feel clean, breathable, and modern. Emphasize subtle borders (`border-gray-100`), smooth background differences (between `bg-white` and `bg-gray-50`), and sparse use of heavy shadows.
- **Glassmorphism & Layering:** When items float (like the chat header or input wrapper), utilize `bg-white/80` or `bg-white/90` with `backdrop-blur-md` or `backdrop-blur-xl`.
- **Absolute Mobile Responsiveness:** Never assume a desktop width. Use Tailwind's prefixes (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) properly. Fixed desktop sidebars must transition to `z-50` overlays with `backdrop-blur` backing on mobile devices.
- **Viewport Layouts for Web Apps:** The application root wrapper should use `h-[100dvh]` rather than `100vh` to prevent layout breaking due to mobile browser navigation bars. 

---

## 2. Color Palette & Theming

The primary brand color for the project is **NESR Green**, defined as `#307c4c`.

### Surface & Background Colors
- **Main Background & Containers:** `bg-white`
- **Sidebars, Table Headers, Soft Backgrounds:** `bg-gray-50`, `bg-slate-50`, or `bg-slate-100`

### Text Colors
- **Primary Text:** `text-gray-900` or `text-slate-800` (for strong readability on light surfaces).
- **Secondary/Informational Text:** `text-gray-500` or `text-slate-500`.
- **Helper/Micro-copy Text:** `text-gray-400` or `text-slate-400`.

### State Colors
- **Primary Brand Interactions (NESR Green):**
  - **Text:** `text-nesr-green` (which maps to `#307c4c`) or custom inline mapped variations `text-[#307c4c]`.
  - **Background (subtle):** `bg-nesr-green/5` or `bg-nesr-green/10` for hovered or active items.
  - **Solid Buttons:** `bg-nesr-green`.
  - **Borders/Rings:** `border-nesr-green/10`, `ring-nesr-green/20`.
- **Destructive/Danger (Red):** `text-red-500` or `text-red-600` on a soft background `bg-red-50`.
- **Disabled State:** `text-gray-300`, `bg-gray-100` with `cursor-not-allowed`.

---

## 3. Typography & Spacing

### Typography
- **Font Family:** Uses the `Geist` font family with `antialiased` rendering on the `body`.
- **H1 (Main Titles or Branding):** `text-lg font-bold text-gray-900 tracking-tight`
- **H2 (Secondary Headers, Dashboards Data):** `text-lg font-semibold text-slate-800` (for card headers) or `text-3xl font-bold text-slate-800` (for KPIs).
- **H3 (Sub-headers):** `text-sm font-semibold mb-1 mt-2`
- **Body Text:** `text-sm text-slate-700` or `text-base font-medium text-gray-700`.
- **Helper text (Small Labels):** `text-[10px] text-gray-500 font-normal opacity-80 leading-tight` or `text-xs font-semibold text-gray-400 uppercase tracking-wider`.

### Spacing & Layout Scaling
- **Container Paddings:** Standard cards use `p-6` or `p-4 sm:p-6`.
- **Main Layout Paddings:** `px-4 md:px-8` on headers, `py-8` on lists.
- **Flex Gaps:** Use `gap-2` or `gap-3` for inline elements (icons + text), `gap-4` or `gap-6` for larger structural components (like KPI grid layouts).

---

## 4. Component Library (The Exact Recipes)

### Main Layout Wrapper
The layout ensures the app matches device viewport vertically with non-scrollable sidebars and a deeply scrollable main content area.

```javascript
<div className="flex h-[100dvh] w-full bg-white overflow-hidden font-sans text-slate-900">
  
  {/* Sidebar Area */}
  <aside className="fixed inset-y-0 left-0 z-50 w-[280px] bg-gray-50 border-r border-gray-100 flex-shrink-0 flex flex-col h-full transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 -translate-x-full">
    {/* Navigation */}
  </aside>

  {/* Main Content Area */}
  <main className="flex-1 flex flex-col h-full relative bg-white">
    {/* Header */}
    <header className="h-14 md:h-16 px-4 md:px-8 flex items-center justify-between border-b border-gray-50 bg-white/80 backdrop-blur-md sticky top-0 z-10 text-gray-800 shrink-0">
      {/* ... */}
    </header>
    
    {/* Main Overflow body */}
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-32 md:pb-40 scroll-smooth">
      {/* Scrollable Content */}
    </div>
  </main>

</div>
```

### Cards & Containers
**KPI/Dashboard Cards:**
```javascript
<div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center text-center">
  {/* Optional outline for an active/highlighted card */}
  {/* outline outline-2 outline-offset-2 outline-[#307c4c]/20 */}
</div>
```

**Premium Chat Input Container (Glassmorphism):**
```javascript
<div className="relative shadow-[0_8px_40px_rgb(0,0,0,0.08)] hover:shadow-[0_8px_40px_rgb(0,0,0,0.12)] transition-shadow duration-300 rounded-2xl bg-white/90 backdrop-blur-xl ring-1 ring-gray-200 group focus-within:ring-2 focus-within:ring-nesr-green/20">
  {/* input elements */}
</div>
```

### Buttons
**Primary Action Button (e.g. Chat Send):**
```javascript
<button className="h-9 w-9 rounded-lg flex items-center justify-center text-white transition-all duration-200 bg-nesr-green hover:bg-nesr-green/80 shadow-sm hover:scale-105 active:scale-95">
  <Icon />
</button>
```

**Secondary / Sidebar Navigation Item (Inactive):**
```javascript
<button className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm font-medium relative group text-gray-500 hover:bg-gray-100 hover:text-gray-900">
  <Icon />
</button>
```

**Active Navigation Item (NESR Green Tint):**
```javascript
<button className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm font-medium relative group bg-nesr-green/10 text-gray-900 shadow-sm ring-1 ring-black/5">
  {/* A left solid border line can be added using absolute positioning */}
  <div className="absolute left-0 top-1 bottom-1 w-1 bg-nesr-green rounded-r-md" />
  <Icon />
</button>
```

### Tables
Use minimal borders with a slightly off-white header and light hover state for rows.

```javascript
<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
  <table className="w-full text-left border-collapse">
    <thead>
      <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600 font-medium">
        <th className="p-4 pl-6 font-medium">Header</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100">
      <tr className="hover:bg-[#307c4c]/5 cursor-pointer transition-colors group">
        <td className="p-4 pl-6">Row Data</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Badges/Tags
**Brand Status Tag (Active Agent/Metric):**
```javascript
<span className="bg-[#307c4c]/10 border border-[#307c4c]/20 text-[#307c4c] px-3 py-1 rounded-full font-semibold text-sm">
  Active
</span>
```

**Standard Neutral Tag:**
```javascript
<span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200 text-slate-600">
  Standard Tag
</span>
```

**Warning/Deleted Tag:**
```javascript
<span className="bg-red-100/80 border border-red-200 text-red-700 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap">
  Deleted
</span>
```

### Inputs & Slicers
**Admin Dashboard Dropdown Slicer:**
```javascript
<select className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-[#307c4c] focus:border-[#307c4c] block w-full p-2.5">
  <option>All Items</option>
</select>
```

**Chat Textarea Input (Invisible integration):**
```javascript
<textarea className="w-full min-h-[52px] max-h-40 py-3.5 px-5 pr-14 bg-transparent border-none focus:ring-0 focus:outline-none placeholder-gray-400 text-gray-700 font-medium resize-none overflow-y-auto" />
```

---

## 5. Animations & Transitions

- **Standard Global Transitions:** Nearly all buttons, hoverable cards, and icons use `transition-all` or `transition-colors`. 
- **Transition Properties:** Default to `duration-200 ease-in-out` or `duration-150` for quick color snaps (like thumbs up / copy interactions).
- **Initial Load Animations:** Embellish empty states or welcoming UI with `animate-in fade-in duration-500`.
- **Micro-Interactions (Clicking):** Ensure primary action buttons pop under the finger or mouse cursor using `hover:scale-105 active:scale-95`.
- **Card Highlights:** Give heavy shadow components depth transitions with `transition-shadow duration-300`, pairing base `shadow-sm` up to `hover:shadow-md` or large custom shadow properties.
