import { Router } from 'express';
import { one, many, query } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { mapProduct } from '../utils/map.js';

const router = Router();

// GET /api/products/sales?businessId=&date=&from=&to=  — ventas de productos
router.get('/sales', requireAuth, asyncHandler(async (req, res) => {
  const { businessId, date, from, to } = req.query;
  const conds = [];
  const params = [];
  const add = (sql, v) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
  if (businessId) add('business_id = ?', businessId);
  if (date) add('sale_date = ?', date);
  if (from) add('sale_date >= ?', from);
  if (to) add('sale_date <= ?', to);
  const where = conds.length ? `where ${conds.join(' and ')}` : '';
  const rows = await many(`select * from product_sales ${where} order by sold_at desc`, params);
  res.json(rows.map((s) => ({
    id: s.id, productId: s.product_id, productName: s.product_name,
    quantity: s.quantity, unitPrice: s.unit_price, totalPrice: s.total_price,
    clientName: s.client_name, professionalId: s.professional_id,
    date: s.sale_date instanceof Date ? s.sale_date.toISOString().split('T')[0] : s.sale_date,
    soldAt: s.sold_at,
  })));
}));

// GET /api/products?businessId=...
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { businessId } = req.query;
  const rows = businessId
    ? await many('select * from products where business_id = $1 order by name', [businessId])
    : await many('select * from products order by name', []);
  res.json(rows.map(mapProduct));
}));

// POST /api/products
router.post('/', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await one(
    'insert into products (business_id, name, category, stock, cost_price, sale_price) values ($1,$2,$3,$4,$5,$6) returning *',
    [b.business_id || b.businessId, b.name, b.category, b.stock || 0, b.costPrice ?? b.cost_price ?? 0, b.salePrice ?? b.sale_price ?? 0]
  );
  res.status(201).json(mapProduct(row));
}));

// PATCH /api/products/:id (incluye ajuste de stock)
router.patch('/:id', requireAuth, requireRole('admin', 'employee', 'superadmin'), asyncHandler(async (req, res) => {
  const b = req.body;
  const row = await one(
    `update products set name = coalesce($2,name), category = coalesce($3,category),
       stock = coalesce($4,stock), cost_price = coalesce($5,cost_price), sale_price = coalesce($6,sale_price)
     where id = $1 returning *`,
    [req.params.id, b.name, b.category, b.stock, b.costPrice ?? b.cost_price, b.salePrice ?? b.sale_price]
  );
  if (!row) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json(mapProduct(row));
}));

// DELETE /api/products/:id
router.delete('/:id', requireAuth, requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
  await one('delete from products where id = $1 returning id', [req.params.id]);
  res.json({ success: true });
}));

// POST /api/products/:id/sell — registra venta y descuenta stock
router.post('/:id/sell', requireAuth, requireRole('admin', 'employee', 'superadmin'), asyncHandler(async (req, res) => {
  const { quantity = 1, clientName, professionalId } = req.body;
  const product = await one('select * from products where id = $1', [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
  if (product.stock < quantity) return res.status(400).json({ error: 'Stock insuficiente.' });

  const total = product.sale_price * quantity;
  const sale = await one(
    `insert into product_sales (business_id, product_id, product_name, quantity, unit_price, total_price, client_name, professional_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [product.business_id, product.id, product.name, quantity, product.sale_price, total, clientName || null, professionalId || null]
  );
  await query('update products set stock = stock - $1 where id = $2', [quantity, product.id]);
  res.status(201).json({
    id: sale.id, productId: sale.product_id, productName: sale.product_name,
    quantity: sale.quantity, unitPrice: sale.unit_price, totalPrice: sale.total_price,
    clientName: sale.client_name, date: sale.sale_date, soldAt: sale.sold_at,
  });
}));

export default router;
