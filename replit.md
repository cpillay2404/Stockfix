# StockFix - Retail Inventory Action & Feedback Tool

## Overview

StockFix is a mobile-first retail inventory management application designed for field representatives to track and complete stock-related tasks. The application allows users to view assigned inventory tasks, capture feedback with photos, and submit action completions. Managers can import task data via Excel files and monitor task completion status across stores and regions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS v4 with shadcn/ui component library
- **Build Tool**: Vite with custom plugins for Replit deployment

The frontend follows a page-based structure with shared components. Key pages include Dashboard (task list), TaskDetail (individual task view with action capture), and ImportData (Excel file upload for managers).

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful endpoints under `/api/` prefix
- **File Handling**: Multer for image and Excel file uploads

The server handles task CRUD operations, Excel import parsing (via xlsx library), and image uploads for task completion evidence.

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts`
- **Migrations**: Drizzle Kit with `db:push` command

The database stores users and tasks. Tasks contain comprehensive retail data including store information, product details, inventory metrics, action requirements, and feedback fields with image URLs.

### Key Design Decisions

1. **Shared Schema Pattern**: The `shared/` directory contains database schemas and types used by both frontend and backend, ensuring type safety across the stack.

2. **Mobile-First UI**: The layout uses a max-width container (max-w-md) optimized for mobile devices, reflecting the field rep use case.

3. **Role Simulation**: A local storage-based role switcher allows demo toggling between "manager" and "rep" views without authentication.

4. **Excel Import**: Tasks are bulk-imported from Excel files with column mapping, making it easy to integrate with existing retail data systems.

5. **IZON-Inspired Design (Dec 2025)**: The UI follows enterprise dashboard patterns with:
   - **Color Scheme**: Dark blue primary (#1e3a5f), orange accent (#f97316)
   - **Dashboard**: Dark blue header band, large KPI cards with monospace numbers, clickable store/rep tiles, client overview grid
   - **Store Landing Page**: Header with store stats, client breakdown grid with severity colors (red=urgent, orange=OOS, green=stable), Top 5 clients by issue type sections, quick filter chips
   - **Navigation Flow**: Dashboard → Store Landing Page → Task List (drill-down pattern)

### Recent Changes (Jan 19, 2026)

- Optimized `/api/store-overview` endpoint performance:
  - Filters tasks by latest week at SQL level instead of loading all historical data
  - Added `getChartAggregates()` function using SQL GROUP BY and aggregate functions for 12-week chart data
  - Added `staleTime: 60000` to frontend queries to reduce refetching
- Database has 11 indexes including composite indexes on (store_name, week_ending_date), (rep_name, week_ending_date)

### Previous Changes (Jan 2, 2026)

- Implemented email notifications using SMTP/Nodemailer when reps submit task completions
- Email utility in `server/email.ts` with hardcoded recipients (jjooste@meridiangroup.co.za, cpillay@meridiangroup.co.za)
- Email triggered in PATCH `/api/tasks/:uniqueId` route after successful task update
- Required secrets: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL

### Previous Changes (Dec 11, 2025)

- Implemented full IZON-inspired layout for Dashboard (`client/src/pages/home.tsx`)
- Created Store Summary page with client breakdown and Top 5 issue sections (`client/src/pages/store-summary.tsx`)
- Applied corporate color scheme: dark blue headers, orange accents, white cards on light grey backgrounds
- Added clickable tiles for stores, reps, and clients that navigate to filtered views

## External Dependencies

### Database
- **PostgreSQL**: Required via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database toolkit for type-safe queries
- **connect-pg-simple**: PostgreSQL session storage (available but not currently used)

### File Processing
- **xlsx**: Excel file parsing for task imports
- **multer**: Multipart form handling for file uploads

### UI Components
- **shadcn/ui**: Comprehensive component library built on Radix UI primitives
- **Lucide React**: Icon library
- **TailwindCSS**: Utility-first CSS framework

### Build & Development
- **Vite**: Frontend build tool with HMR
- **esbuild**: Server bundling for production
- **tsx**: TypeScript execution for development