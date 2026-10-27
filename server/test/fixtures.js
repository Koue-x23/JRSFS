// Test fixtures: makes the browser-logic suites runnable against an empty database.
// These records are created by the tests only — the application never seeds demo data.
export async function ensureFixtures(api, post) {
  const customers = api ? await api('/customers') : [];
  if (!api) {
    const res = await fetch(`${process.env.BASE || 'http://localhost:3000'}/api/customers`);
    customers.push(...(await res.json()));
  }
  if (customers.length) return { seeded: false };

  const customer = await post('/customers', {
    name: 'Fixture Customer',
    companyName: 'Fixture Eatery',
    phone: '0917 123 4567',
    email: 'fixture@example.com',
    billingAddress: '88 Fixture Street, Davao City',
    projectLocations: 'Matina, Davao City',
  });
  const product = await post('/products', {
    name: 'Fixture Stainless Counter',
    description: '304 stainless steel counter with undershelf',
    category: 'Kitchen Equipment',
    unit: 'unit',
    defaultPrice: 12500,
  });
  const quotation = await post('/quotations', {
    customerId: customer.id,
    customerName: customer.name,
    companyName: customer.companyName,
    contactNumber: customer.phone,
    email: customer.email,
    address: customer.billingAddress,
    issueDate: '2026-10-02',
    validUntil: '2026-11-02',
    projectName: 'Fixture Kitchen',
    projectLocation: 'Matina, Davao City',
    discountType: 'amount',
    discountValue: 0,
    taxRate: 0,
    paymentTerms: '50% downpayment',
    preparedBy: 'Fixture Tester',
    status: 'approved',
    items: [
      { productId: product.id, description: product.description, quantity: 1, unit: 'unit', unitPrice: 12500 },
      { description: 'Installation', quantity: 1, unit: 'lot', unitPrice: 2500 },
    ],
  });
  const conversion = await post(`/quotations/${quotation.id}/convert`);
  const invoice = conversion.invoice;
  await post(`/invoices/${invoice.id}/payments`, {
    amount: 5000,
    paymentDate: '2026-10-10',
    method: 'Cash',
    details: 'Fixture downpayment',
  });
  await post('/service-reports', {
    customerId: customer.id,
    customerName: customer.name,
    contactNumber: customer.phone,
    serviceDate: '2026-10-05',
    location: 'Matina, Davao City',
    equipment: 'Fixture exhaust hood',
    reportedProblem: 'Vibration',
    findings: 'Loose bolts',
    workPerformed: 'Re-tightened anchors',
    technician: 'Fixture Technician',
    status: 'completed',
    materials: [{ description: 'Anchor bolt', quantity: 4, unit: 'pcs', unitCost: 40 }],
    laborCost: 500,
    preparedBy: 'Fixture Tester',
  });
  await post('/billing-statements', {
    customerId: customer.id,
    periodFrom: '2026-10-01',
    periodTo: '2026-10-31',
    statementDate: '2026-10-31',
    preparedBy: 'Fixture Tester',
  });
  return { seeded: true, customer, product, quotation, invoice };
}
