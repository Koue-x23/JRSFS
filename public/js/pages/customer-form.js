import { api } from '../api.js';
import {
  icon,
  esc,
  toast,
  setPageMeta,
  field,
  markInvalid,
  clearInvalid,
  setBusy,
  navigate,
  loadingBlock,
} from './shared.js';

export async function render({ view, params }) {
  const isEdit = Boolean(params.id);
  setPageMeta({
    title: isEdit ? 'Edit customer' : 'New customer',
    subtitle: isEdit ? 'Editing customer details never changes saved documents.' : 'Add a customer to reuse their details on documents.',
  });

  let customer = null;
  if (isEdit) {
    view.innerHTML = loadingBlock('Loading customer…');
    customer = await api.get(`/customers/${params.id}`);
  }

  view.innerHTML = `
    <form id="customer-form" novalidate autocomplete="off">
      <div class="page-head">
        <div>
          <h2 style="font-size:15px">${isEdit ? esc(customer.code) : 'Customer details'}</h2>
          <p>Documents keep the customer information they were issued with. Editing a customer updates their profile and future documents.</p>
        </div>
        <div class="actions">
          <a class="btn" href="${isEdit ? `#/customers/${params.id}` : '#/customers'}">${icon('back', 15)} Cancel</a>
          <button class="btn btn-primary" type="submit" id="save-btn">${icon('save', 15)} ${isEdit ? 'Save changes' : 'Save customer'}</button>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="form-grid">
            ${field({ label: 'Customer name', name: 'name', value: customer?.name || '', required: true, placeholder: 'Contact person or walk-in customer name' })}
            ${field({ label: 'Company name', name: 'companyName', value: customer?.companyName || '', placeholder: 'If applicable' })}
            ${field({ label: 'Phone number', name: 'phone', value: customer?.phone || '' })}
            ${field({ label: 'Email address', name: 'email', type: 'email', value: customer?.email || '' })}
            ${field({ label: 'Billing address', name: 'billingAddress', type: 'textarea', value: customer?.billingAddress || '', span: 2, attrs: 'rows="2"' })}
            ${field({
              label: 'Project locations',
              name: 'projectLocations',
              type: 'textarea',
              value: customer?.projectLocations || '',
              span: 2,
              attrs: 'rows="2"',
              hint: 'One location per line. Used to fill in project and service locations.',
            })}
            ${field({ label: 'Remarks', name: 'remarks', type: 'textarea', value: customer?.remarks || '', span: 2, attrs: 'rows="3"' })}
          </div>
        </div>
      </div>

      <div class="form-actions">
        <a class="btn" href="${isEdit ? `#/customers/${params.id}` : '#/customers'}">Cancel</a>
        <div class="spacer"></div>
        <button class="btn btn-primary" type="submit">${icon('save', 15)} ${isEdit ? 'Save changes' : 'Save customer'}</button>
      </div>
    </form>
  `;

  const form = view.querySelector('#customer-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearInvalid(form);
    const payload = {
      name: form.querySelector('[name="name"]').value.trim(),
      companyName: form.querySelector('[name="companyName"]').value.trim(),
      phone: form.querySelector('[name="phone"]').value.trim(),
      email: form.querySelector('[name="email"]').value.trim(),
      billingAddress: form.querySelector('[name="billingAddress"]').value,
      projectLocations: form.querySelector('[name="projectLocations"]').value,
      remarks: form.querySelector('[name="remarks"]').value,
    };
    if (!payload.name) {
      markInvalid(form, 'name', 'Customer name is required.');
      return;
    }
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      markInvalid(form, 'email', 'Enter a valid email address.');
      return;
    }
    const button = form.querySelector('#save-btn');
    setBusy(button, true);
    try {
      const saved = isEdit ? await api.put(`/customers/${params.id}`, payload) : await api.post('/customers', payload);
      toast(`${saved.name} saved.`, 'success', isEdit ? 'Customer updated' : 'Customer added');
      navigate(`/customers/${saved.id}`);
    } catch (err) {
      toast(err.message, 'error', 'Could not save customer');
      setBusy(button, false);
    }
  });
}
