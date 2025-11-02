# Finance Tracker Web App

Modern React frontend for the Finance Tracker application with Tailwind CSS and TypeScript.

## Features

- ✅ **Authentication** - JWT-based login with auto-redirect
- ✅ **Protected Routes** - Automatic redirect to login for unauthenticated users
- ✅ **Tailwind CSS** - Modern, responsive UI with custom color scheme
- ✅ **React Router** - Client-side routing with protected routes
- ✅ **TypeScript** - Full type safety
- ✅ **Vite** - Fast development and build

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **React Router v6** - Routing
- **Vite** - Build tool

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0.0+
- Backend API running on port 3001 (see apps/api/README.md)

### Installation

1. Install dependencies:
```bash
bun install
```

2. Configure environment:
```bash
cp .env.example .env
# Update VITE_API_URL if your API runs on a different port
```

3. Start development server:
```bash
bun run dev
```

The app will be available at http://localhost:3000

## Project Structure

```
src/
├── components/
│   ├── auth/           # Authentication components
│   │   └── ProtectedRoute.tsx
│   └── layout/         # Layout components
├── contexts/
│   └── AuthContext.tsx # Authentication context
├── hooks/              # Custom React hooks
├── pages/
│   ├── LoginPage.tsx   # Login page
│   └── DashboardPage.tsx # Dashboard page
├── services/
│   ├── api.ts          # API client
│   └── auth.service.ts # Authentication service
├── types/
│   └── auth.ts         # Authentication types
├── App.tsx             # Main app component with routing
├── main.tsx            # Entry point
└── index.css           # Global styles with Tailwind
```

## Authentication Flow

1. User visits the app
2. If not authenticated, redirected to `/login`
3. After successful login, JWT token is stored in localStorage
4. User is redirected to the page they were trying to access (or dashboard)
5. Token is automatically included in all API requests
6. If token expires or is invalid, user is logged out and redirected to login

## Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run type-check` - Run TypeScript type checking

## Tailwind Configuration

Custom color palette:
- **Primary** - Blue theme for main actions
- **Success** - Green for income and positive actions
- **Danger** - Red for expenses and destructive actions

Custom component classes:
- `.btn` - Base button styles
- `.btn-primary` - Primary button
- `.btn-secondary` - Secondary button
- `.btn-danger` - Danger button
- `.input` - Input field styles
- `.card` - Card container styles

## Environment Variables

```bash
# API Configuration
VITE_API_URL=http://localhost:3001

# App Configuration
VITE_APP_NAME=Finance Tracker
```

## API Integration

The app connects to the backend API at `VITE_API_URL`. All authenticated requests include the JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

### API Endpoints Used

- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- (More endpoints will be integrated as features are added)

## Authentication

### Login Credentials

Use the credentials configured in the backend .env file:
- Username: `admin` (default, from AUTH_USERNAME)
- Password: Your password from AUTH_PASSWORD

### Token Storage

- JWT token is stored in `localStorage` as `auth_token`
- User info is stored in `localStorage` as `auth_user`
- Both are cleared on logout

## Development

### Adding New Pages

1. Create page component in `src/pages/`
2. Add route in `App.tsx`
3. Wrap with `<ProtectedRoute>` if authentication required

Example:
```tsx
<Route
  path="/accounts"
  element={
    <ProtectedRoute>
      <AccountsPage />
    </ProtectedRoute>
  }
/>
```

### Using Authentication

Access auth state with the `useAuth` hook:

```tsx
import { useAuth } from './contexts/AuthContext';

function MyComponent() {
  const { user, isAuthenticated, login, logout } = useAuth();

  // Use auth state and methods
}
```

## Building for Production

```bash
bun run build
```

Output will be in the `dist/` directory.

Preview production build:
```bash
bun run preview
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

Private
