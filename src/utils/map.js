// Mapea filas de la BD (snake_case) a las formas que el frontend ya consume
// (camelCase, anidadas). Así la migración del frontend es mínima.

const DEFAULT_SLOTS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

export const mapService = (s) => ({
  id: s.id,
  category: s.category,
  name: s.name,
  duration: s.duration,
  price: s.price,
  recommendedProductIds: s.recommended_product_ids || [],
});

export const mapProduct = (p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  stock: p.stock,
  costPrice: p.cost_price,
  salePrice: p.sale_price,
});

// assignments: filas de professional_services para este profesional
export const mapProfessional = (p, assignments = []) => {
  const serviceCommissions = {};
  const assignedServices = [];
  for (const a of assignments) {
    assignedServices.push(a.service_id);
    if (a.commission_override != null) serviceCommissions[a.service_id] = a.commission_override;
  }
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    commission: p.commission,
    avatar: p.avatar_url,
    specialties: p.specialties || [],
    schedule: p.schedule || {},
    serviceCommissions,
    assignedServices,
  };
};

export const mapBusiness = (b, { services = [], professionals = [], products = [], monthlyStats } = {}) => ({
  id: b.id,
  adminId: b.admin_id,
  isActive: b.is_active,
  name: b.name,
  address: b.address,
  phone: b.phone,
  email: b.email,
  instagram: b.instagram,
  whatsapp: b.whatsapp,
  rating: b.rating != null ? Number(b.rating) : 0,
  reviews: b.reviews,
  photo: b.photo_url,
  gallery: [],
  description: b.description,
  categories: b.categories || [],
  openDays: b.open_days || [],
  openHours: b.open_hours,
  themeColor: b.theme_color,
  monthlyStats: monthlyStats || { bookings: 0, revenue: 0, newClients: 0 },
  depositConfig: {
    required: b.deposit_required,
    amount: b.deposit_amount,
    alias: b.deposit_alias,
    mpLink: b.deposit_mp_link,
    policy: b.deposit_policy,
    allowDirectCancelWithout: b.deposit_allow_direct_cancel,
  },
  promotionModal: {
    active: b.promo_active,
    title: b.promo_title,
    description: b.promo_description,
    imageUrl: '',
    cta: b.promo_cta,
    expiresAt: b.promo_expires_at,
  },
  services: services.map(mapService),
  professionals,        // ya vienen mapeados por mapProfessional
  products: products.map(mapProduct),
  availableSlots: DEFAULT_SLOTS,
});

export const mapBooking = (b) => ({
  id: b.id,
  salonId: b.business_id,
  serviceId: b.service_id,
  professionalId: b.professional_id,
  clientId: b.client_id,
  clientName: b.client_name,
  clientPhone: b.client_phone,
  clientEmail: b.client_email,
  date: b.booking_date instanceof Date ? b.booking_date.toISOString().split('T')[0] : b.booking_date,
  time: b.booking_time,
  status: b.status,
  notes: b.notes,
  discount: b.discount_type ? { type: b.discount_type, value: b.discount_value } : null,
  payment: b.payment_amount != null
    ? { amount: b.payment_amount, method: b.payment_method, paidAt: b.payment_paid_at }
    : null,
  deposit: b.deposit_amount != null
    ? { amount: b.deposit_amount, paid: b.deposit_paid, confirmedByAdmin: b.deposit_confirmed, refunded: b.deposit_refunded }
    : null,
  cancelRequest: b.cancel_requested_at
    ? { requestedAt: b.cancel_requested_at, reason: b.cancel_reason }
    : null,
  cancelRejected: b.cancel_rejected || false,
});

export const mapSubscription = (s) => ({
  id: s.id,
  businessId: s.business_id,
  businessName: s.business_name,
  plan: s.plan_id,
  billingCycle: s.billing_cycle,
  status: s.status,
  startDate: s.start_date instanceof Date ? s.start_date.toISOString().split('T')[0] : s.start_date,
  nextBillingDate: s.next_billing_date instanceof Date ? s.next_billing_date.toISOString().split('T')[0] : s.next_billing_date,
  monthlyPrice: s.monthly_price,
  annualPrice: s.annual_price,
  paymentMethod: s.payment_method,
  contactEmail: s.contact_email,
  notes: s.notes,
});

export const mapPlan = (p) => ({
  name: p.name,
  monthlyPrice: p.monthly_price,
  annualPrice: p.annual_price,
  maxProfessionals: p.max_professionals,
  maxServices: p.max_services,
  features: p.features || [],
});

export const mapUser = (u) => {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return {
    id: rest.id,
    role: rest.role,
    firstName: rest.first_name,
    lastName: rest.last_name,
    name: rest.name,
    email: rest.email,
    provider: rest.provider,
    phone: rest.phone,
    document: rest.document,
    birthDate: rest.birth_date,
    address: rest.address,
    avatar: rest.avatar_url,
    businessId: rest.business_id,
    businessName: rest.business_name || null,
    favoriteBusinessId: rest.favorite_business_id,
    favoriteProfessionalId: rest.favorite_professional_id,
  };
};
