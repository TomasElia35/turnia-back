import { Router } from 'express';
import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { env } from '../config/env.js';

const router = Router();

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB (además el front reduce la imagen antes de subir)

// Deja el nombre de archivo seguro para usar como path en Storage.
const safeName = (name = 'imagen') =>
  String(name).toLowerCase().replace(/[^a-z0-9.\-_]/g, '-').replace(/-+/g, '-').slice(-80) || 'imagen';

// POST /api/uploads/image?folder=businesses/<id>&filename=foto.jpg
// Body: bytes crudos de la imagen (Content-Type = tipo de la imagen).
// Sube al bucket público de Supabase usando la service_role key (bypassa RLS)
// y devuelve la URL pública. La clave nunca llega al frontend.
router.post(
  '/image',
  requireAuth,
  requireRole('admin', 'employee', 'superadmin'),
  express.raw({ type: '*/*', limit: MAX_BYTES }),
  asyncHandler(async (req, res) => {
    if (!env.supabaseUrl || !env.supabaseServiceKey) {
      return res.status(500).json({
        error: 'La subida de imágenes no está configurada. Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el backend.',
      });
    }

    const contentType = req.headers['content-type'] || '';
    if (!ALLOWED_MIME.includes(contentType)) {
      return res.status(400).json({ error: 'Formato no permitido. Subí una imagen JPG, PNG, WEBP o GIF.' });
    }
    const buffer = req.body;
    if (!buffer || !buffer.length) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
    if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'La imagen es demasiado grande (máximo 6 MB).' });

    const folder = safeName(req.query.folder || 'general').replace(/^-+|-+$/g, '') || 'general';
    // path único (no hay Math.random disponible en algunos entornos → usamos time + nombre)
    const path = `${folder}/${Date.now()}-${safeName(req.query.filename)}`;

    const base = env.supabaseUrl.replace(/\/+$/, '');
    const uploadUrl = `${base}/storage/v1/object/${env.supabaseBucket}/${path}`;

    const resp = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.supabaseServiceKey}`,
        apikey: env.supabaseServiceKey,
        'Content-Type': contentType,
        'x-upsert': 'true',
        'cache-control': '3600',
      },
      body: buffer,
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return res.status(502).json({ error: 'No se pudo subir la imagen a Supabase.', detail: detail.slice(0, 300) });
    }

    const publicUrl = `${base}/storage/v1/object/public/${env.supabaseBucket}/${path}`;
    res.status(201).json({ url: publicUrl, path });
  })
);

export default router;
