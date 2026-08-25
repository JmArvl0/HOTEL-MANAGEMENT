# Dependencies

From `package.json` (name: haven-hotel-management).

## Runtime
| Package | Why |
|---|---|
| next ^16.3.2 | Framework (App Router) |
| react / react-dom ^18.3.1 | UI |
| next-auth ^4.24.15 | Credentials auth, JWT sessions |
| @supabase/supabase-js ^2.57.4 | Server-side DB client (service-role) |
| bcryptjs ^3.0.2 | Password hashing for `app_users` login path |
| zod ^3.25.76 | Validation |
| recharts ^2.15.4 | Dashboard charts (trend, room mix) |
| lucide-react ^0.468.0 | Icons |

## Dev
typescript ^5.7.2 · @types/* (node, react, react-dom, bcryptjs) · eslint ^9.38 + eslint-config-next

Related: [[Setup & Commands]]
