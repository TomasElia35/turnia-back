# Galart — Backend

API REST en **Node + Express**, base de datos **Supabase (PostgreSQL)**, desplegable en **Vercel** como función serverless. Vive junto al frontend en el monorepo (`/backend`).

```
backend/
├── api/index.js            # entrypoint serverless (Vercel)
├── src/
│   ├── app.js              # app Express (rutas + middleware)
│   ├── server.js           # server local (dev)
│   ├── config/             # env + cliente Supabase
│   ├── middleware/         # auth (JWT), roles, manejo de errores
│   ├── utils/              # bcrypt, jwt
│   ├── services/           # email (reset de contraseña)
│   └── routes/             # auth, businesses, services, professionals, products, bookings, subscriptions
├── sql/
│   ├── 001_schema.sql      # creación de las tablas (DDL)
│   ├── 002_seed.sql        # datos de ejemplo (negocios, planes, servicios, etc.)
│   └── 003_users.sql       # usuarios demo (contraseñas bcrypt) + vínculo admins
├── scripts/seed.js         # seed de usuarios demo (con bcrypt)
├── vercel.json
└── .env.example
```

Se conecta a Postgres vía `DATABASE_URL` (driver `pg`), así que corre igual en
**Postgres local** (desarrollo) y en **Supabase** (producción) — solo cambia la variable.

## Desarrollo local (Postgres en tu PC)

### 1. Crear la base
```bash
createdb galart          # o en psql:  CREATE DATABASE galart;
```

### 2. Configurar y poblar
```bash
cd backend
cp .env.example .env          # DATABASE_URL=postgres://postgres:postgres@localhost:5432/galart
                              # DB_SSL=false · JWT_SECRET=<algo largo>
npm install
npm run db:setup              # corre 001_schema.sql + 002_seed.sql + usuarios demo (bcrypt)
npm run dev                   # http://localhost:4000
```

### 3. Levantar el frontend (otra terminal)
```bash
cd ../Frontend
# .env ya tiene VITE_API_URL=http://localhost:4000/api
npm install
npm run dev                   # http://localhost:5173
```

## Producción (Supabase + Vercel)
1. Crear proyecto en [supabase.com](https://supabase.com) (nombre del proyecto: **galart**). La base siempre se llama `postgres` — no se elige.
2. **SQL Editor** → ejecutar en orden: `sql/001_schema.sql`, `sql/002_seed.sql` y `sql/003_users.sql` (este último crea los usuarios demo con contraseñas ya hasheadas).
3. En Vercel (root = `backend`) cargar las env: `DATABASE_URL` (connection string *pooler* de Supabase, termina en `/postgres`), `DB_SSL=true`, `JWT_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS`.
4. El frontend en Vercel apunta `VITE_API_URL` a la URL del backend desplegado.

## Usuarios demo (tras `npm run seed`)
| Rol         | Email                  | Password    |
|-------------|------------------------|-------------|
| SuperAdmin  | super@estetica.app     | super123    |
| Admin       | admin@elegance.com     | admin123    |
| Empleado    | pedro@elegance.com     | emp123      |
| Cliente     | ana@test.com           | cliente123  |

## Endpoints principales
- **Auth**: `POST /api/auth/register` · `/login` · `/google` · `/forgot-password` · `/reset-password` · `GET /me`
- **Negocios**: `GET /api/businesses` · `GET /:id` · `POST` · `PATCH /:id`
- **Servicios**: `GET /api/services?businessId=` · `POST` · `PATCH/:id` · `DELETE/:id`
- **Profesionales**: `GET /api/professionals?businessId=` · `POST` · `PATCH/:id` · `DELETE/:id`
- **Productos**: `GET /api/products` · `POST` · `PATCH/:id` · `DELETE/:id` · `POST /:id/sell`
- **Turnos**: `GET /api/bookings?businessId=&date=` · `GET /mine` · `POST` · `PATCH/:id` · `POST /:id/payment` · `/:id/confirm-deposit` · `/:id/cancel-request` · `/:id/resolve-cancel`
- **Suscripciones**: `GET /api/subscriptions` · `GET /plans` · `PATCH/:id`

## Autenticación
- JWT propio firmado con `JWT_SECRET` (header `Authorization: Bearer <token>`).
- Contraseñas con **bcrypt**. Google OAuth: endpoint preparado (`/api/auth/google`), falta verificar el `id_token` en producción.
- Reset de contraseña: token con expiración (30 min) en tabla `password_reset_tokens`; el email se simula si no hay proveedor configurado (ver `src/services/email.js`).

## Deploy en Vercel
- Importar la carpeta `backend/` como proyecto (root directory = `backend`).
- Cargar las variables de entorno del `.env` en Vercel.
- `vercel.json` rutea todo a `api/index.js` (Express serverless).
- **Connection pooling**: usar la *Connection string* de Supabase en modo pooler para serverless.
