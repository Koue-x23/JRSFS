import { api } from '../api.js';
import { computeTotals } from '../calc.js';
import { preparePhoto, pickFile } from '../images.js';
import {
  icon,
  esc,
  money,
  toast,
  setPageMeta,
  ensureLookups,
  getState,
  today,
  customerOptions,
  field,
  markInvalid,
  clearInvalid,
  setBusy,
  navigate,
  loadingBlock,
} from './shared.js';

export async function render({ view, params, query = {} }) {
  const isEdit = Boolean(params.id);
  const state = await ensureLookups();
  const settings = state.settings;
  setPageMeta({
    title: isEdit ? 'Edit service report' : 'New service report',
    subtitle: isEdit ? 'Update the service report details.' : 'Record fabrication, repair, maintenance, installation or inspection work.',
  });

  let report = null;
  if (isEdit) {
    view.innerHTML = loadingBlock('Loading service report…');
    report = await api.get(`/service-reports/${params.id}`);
  }

  const presetCustomer = !report && query.customer ? state.customers.find((c) => String(c.id) === String(query.customer)) : null;
  const materials = report?.materials?.length
    ? report.materials.map((m) => ({
        description: m.description,
        quantity: m.quantity ?? 0,
        unit: m.unit || '',
        unitCost: m.unitCost ?? 0,
      }))
    : [];
  const photos = report?.photos ? [...report.photos] : [];

  const data = {
    customerId: report?.customerId || presetCustomer?.id || '',
    customerName: report?.customerName || presetCustomer?.name || '',
    companyName: report?.companyName || presetCustomer?.companyName || '',
    contactNumber: report?.contactNumber || presetCustomer?.phone || '',
    email: report?.email || presetCustomer?.email || '',
    serviceDate: report?.serviceDate || today(),
    location: report?.location || (presetCustomer?.projectLocations || '').split('\n')[0] || '',
    equipment: report?.equipment || '',
    reportedProblem: report?.reportedProblem || '',
    findings: report?.findings || '',
    workPerformed: report?.workPerformed || '',
    technician: report?.technician || '',
    startTime: report?.startTime || '',
    endTime: report?.endTime || '',
    status: report?.status || 'scheduled',
    recommendations: report?.recommendations || '',
    remarks: report?.remarks || '',
    customerAck: report?.customerAck || '',
    preparedBy: report?.preparedBy || settings.representative,
    laborCost: report?.laborCost || 0,
  };

  view.innerHTML = `
    <form id="service-form" novalidate autocomplete="off">
      <div class="page-head">
        <div>
          <h2 style="font-size:15px">${isEdit ? esc(report.number) : 'Service report details'}</h2>
          <p>Only the customer name and service date are required. Fill in the sections that apply to this job.</p>
        </div>
        <div class="actions">
          <a class="btn" href="${isEdit ? `#/service-reports/${params.id}` : '#/service-reports'}">${icon('back', 15)} Cancel</a>
          <button class="btn btn-primary" type="submit" id="save-btn">${icon('save', 15)} ${isEdit ? 'Save changes' : 'Save service report'}</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Customer &amp; service details</h2></div>
        <div class="card-body">
          <div class="form-grid">
            ${field({ label: 'Select saved customer', name: 'customerId', type: 'select', span: 2, options: customerOptions(state.customers, data.customerId) })}
            ${field({ label: 'Customer name', name: 'customerName', value: data.customerName, required: true })}
            ${field({ label: 'Company name', name: 'companyName', value: data.companyName })}
            ${field({ label: 'Contact number', name: 'contactNumber', value: data.contactNumber })}
            ${field({ label: 'Email address', name: 'email', type: 'email', value: data.email })}
            ${field({ label: 'Service date', name: 'serviceDate', type: 'date', value: data.serviceDate, required: true })}
            ${field({
              label: 'Job status',
              name: 'status',
              type: 'select',
              options: [
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'completed', label: 'Completed' },
                { value: 'cancelled', label: 'Cancelled' },
              ]
                .map((o) => `<option value="${o.value}" ${o.value === data.status ? 'selected' : ''}>${o.label}</option>`)
                .join(''),
            })}
            ${field({ label: 'Service location', name: 'location', value: data.location, span: 2, placeholder: 'Site or project address' })}
            ${field({ label: 'Product or equipment serviced', name: 'equipment', value: data.equipment, span: 2, placeholder: 'e.g. Stainless kitchen exhaust hood, 3-door chiller' })}
            ${field({ label: 'Reported problem', name: 'reportedProblem', type: 'textarea', value: data.reportedProblem, span: 2, attrs: 'rows="2"' })}
            ${field({ label: 'Inspection findings', name: 'findings', type: 'textarea', value: data.findings, span: 2, attrs: 'rows="2"' })}
            ${field({ label: 'Work performed', name: 'workPerformed', type: 'textarea', value: data.workPerformed, span: 2, attrs: 'rows="2"' })}
            ${field({ label: 'Assigned technician / personnel', name: 'technician', value: data.technician })}
            ${field({ label: 'Prepared by', name: 'preparedBy', value: data.preparedBy })}
            ${field({ label: 'Start time', name: 'startTime', type: 'time', value: data.startTime })}
            ${field({ label: 'Completion time', name: 'endTime', type: 'time', value: data.endTime })}
            ${field({ label: 'Recommendations', name: 'recommendations', type: 'textarea', value: data.recommendations, span: 2, attrs: 'rows="2"' })}
            ${field({ label: 'Remarks', name: 'remarks', type: 'textarea', value: data.remarks, span: 2, attrs: 'rows="2"' })}
            ${field({ label: 'Customer acknowledgment (name)', name: 'customerAck', value: data.customerAck, span: 2, hint: 'Name of the customer representative who acknowledged the completed work.' })}
          </div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><h2>Materials &amp; parts used</h2><span class="sub">Optional</span></div>
          <div class="card-body tight">
            <div class="items-scroll">
              <table class="items-table">
                <thead><tr>
                  <th>Description</th><th style="width:74px">Qty</th><th style="width:70px">Unit</th>
                  <th style="width:110px">Unit cost</th><th class="num" style="width:100px;text-align:right">Amount</th><th></th>
                </tr></thead>
                <tbody id="materials-body"></tbody>
              </table>
            </div>
            <div class="items-foot">
              <button type="button" class="btn btn-sm" id="add-material">${icon('plus', 14)} Add material</button>
              <span class="small muted">Materials cost <strong id="materials-cost" class="tabular">₱0.00</strong></span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Costs</h2></div>
          <div class="card-body">
            <div class="form-grid">
              ${field({ label: 'Labor cost (₱)', name: 'laborCost', type: 'number', value: data.laborCost, attrs: 'min="0" step="0.01"' })}
              <div class="field"><label>Materials cost</label><div class="form-note" id="materials-cost-2">₱0.00</div></div>
            </div>
            <div class="divider"></div>
            <div class="totals-panel" style="max-width:none">
              <div class="totals-row grand"><span class="label">Total service cost</span><span class="value" id="total-cost">₱0.00</span></div>
            </div>
            <p class="small muted mt-8">Costs are informational and appear on the printed service report.</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Photo documentation</h2>
          <span class="sub">Optional — up to 6 photos (before, during and after)</span>
          <div class="card-actions"><button type="button" class="btn btn-sm" id="add-photo">${icon('image', 14)} Add photo</button></div>
        </div>
        <div class="card-body">
          <div id="photo-grid" class="photo-grid"></div>
          <div id="photo-empty" class="muted small">No photos attached. Photos are compressed automatically and included in the PDF report.</div>
        </div>
      </div>

      <div class="form-actions">
        <a class="btn" href="${isEdit ? `#/service-reports/${params.id}` : '#/service-reports'}">Cancel</a>
        <div class="spacer"></div>
        <span class="small muted">Report number is assigned automatically when saved.</span>
        <button class="btn btn-primary" type="submit">${icon('save', 15)} ${isEdit ? 'Save changes' : 'Save service report'}</button>
      </div>
    </form>
    <style>
      .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
      .photo-tile { border: 1px solid var(--line); border-radius: 7px; overflow: hidden; background: #fff; position: relative; }
      .photo-tile img { width: 100%; height: 110px; object-fit: cover; display: block; }
      .photo-tile .photo-meta { display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; font-size: 11px; color: var(--muted); }
    </style>
  `;

  const form = view.querySelector('#service-form');
  const materialsBody = view.querySelector('#materials-body');
  const photoGrid = view.querySelector('#photo-grid');
  const photoEmpty = view.querySelector('#photo-empty');

  const materialRow = (m, i) => `<tr data-mrow="${i}">
    <td><input class="input" data-midx="${i}" data-mkey="description" value="${esc(m.description)}" placeholder="Material or part" /></td>
    <td><input class="input num" type="number" min="0" step="any" data-midx="${i}" data-mkey="quantity" value="${esc(m.quantity)}" /></td>
    <td><input class="input" data-midx="${i}" data-mkey="unit" value="${esc(m.unit)}" placeholder="pc" /></td>
    <td><input class="input num" type="number" min="0" step="0.01" data-midx="${i}" data-mkey="unitCost" value="${esc(m.unitCost)}" /></td>
    <td><div class="line-amount" data-mamount="${i}">₱0.00</div></td>
    <td class="actions"><button type="button" class="icon-btn" data-mremove="${i}" title="Remove">${icon('trash', 15)}</button></td>
  </tr>`;

  function renderMaterials() {
    materialsBody.innerHTML = materials.map(materialRow).join('');
    updateCosts();
  }

  function updateCosts() {
    let materialsCost = 0;
    materials.forEach((m, i) => {
      const amount = (Number(m.quantity) || 0) * (Number(m.unitCost) || 0);
      materialsCost += amount;
      const cell = materialsBody.querySelector(`[data-mamount="${i}"]`);
      if (cell) cell.textContent = money(amount);
    });
    const labor = Number(form.querySelector('[name="laborCost"]').value) || 0;
    view.querySelector('#materials-cost').textContent = money(materialsCost);
    view.querySelector('#materials-cost-2').textContent = money(materialsCost);
    view.querySelector('#total-cost').textContent = money(materialsCost + labor);
  }

  materialsBody.addEventListener('input', (e) => {
    const target = e.target.closest('[data-mkey]');
    if (!target) return;
    const i = Number(target.dataset.midx);
    const key = target.dataset.mkey;
    if (!materials[i]) return;
    materials[i][key] = key === 'quantity' || key === 'unitCost' ? Number(target.value) || 0 : target.value;
    updateCosts();
  });
  materialsBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mremove]');
    if (!btn) return;
    materials.splice(Number(btn.dataset.mremove), 1);
    renderMaterials();
  });
  view.querySelector('#add-material').addEventListener('click', () => {
    materials.push({ description: '', quantity: 1, unit: 'pc', unitCost: 0 });
    renderMaterials();
    const rows = materialsBody.querySelectorAll('input[data-mkey="description"]');
    if (rows.length) rows[rows.length - 1].focus();
  });
  form.querySelector('[name="laborCost"]').addEventListener('input', updateCosts);

  function renderPhotos() {
    photoGrid.innerHTML = photos
      .map(
        (src, i) => `<div class="photo-tile">
          <img src="${src}" alt="Service photo ${i + 1}" />
          <div class="photo-meta"><span>Photo ${i + 1}</span>
            <button type="button" class="btn btn-sm btn-ghost" data-photo-remove="${i}" style="height:22px;padding:0 6px">Remove</button>
          </div>
        </div>`
      )
      .join('');
    photoEmpty.style.display = photos.length ? 'none' : 'block';
    view.querySelector('#add-photo').disabled = photos.length >= 6;
  }

  photoGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-photo-remove]');
    if (!btn) return;
    photos.splice(Number(btn.dataset.photoRemove), 1);
    renderPhotos();
  });

  view.querySelector('#add-photo').addEventListener('click', async () => {
    if (photos.length >= 6) return;
    try {
      const file = await pickFile();
      const prepared = await preparePhoto(file);
      photos.push(prepared.dataUrl);
      renderPhotos();
      toast('Photo attached. It will be saved with the report.', 'success', 'Photo added');
    } catch (err) {
      if (err.message !== 'cancelled') toast(err.message, 'error', 'Could not add photo');
    }
  });

  form.querySelector('[name="customerId"]').addEventListener('change', (e) => {
    const option = e.target.selectedOptions[0];
    if (!e.target.value || !option) return;
    form.querySelector('[name="customerName"]').value = option.dataset.name || '';
    form.querySelector('[name="companyName"]').value = option.dataset.company || '';
    form.querySelector('[name="contactNumber"]').value = option.dataset.phone || '';
    form.querySelector('[name="email"]').value = option.dataset.email || '';
    if (!form.querySelector('[name="location"]').value && option.dataset.locations) {
      form.querySelector('[name="location"]').value = option.dataset.locations;
    }
    clearInvalid(form);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearInvalid(form);
    const payload = {
      customerId: form.querySelector('[name="customerId"]').value || null,
      customerName: form.querySelector('[name="customerName"]').value.trim(),
      companyName: form.querySelector('[name="companyName"]').value.trim(),
      contactNumber: form.querySelector('[name="contactNumber"]').value.trim(),
      email: form.querySelector('[name="email"]').value.trim(),
      serviceDate: form.querySelector('[name="serviceDate"]').value,
      location: form.querySelector('[name="location"]').value.trim(),
      equipment: form.querySelector('[name="equipment"]').value.trim(),
      reportedProblem: form.querySelector('[name="reportedProblem"]').value,
      findings: form.querySelector('[name="findings"]').value,
      workPerformed: form.querySelector('[name="workPerformed"]').value,
      technician: form.querySelector('[name="technician"]').value.trim(),
      startTime: form.querySelector('[name="startTime"]').value,
      endTime: form.querySelector('[name="endTime"]').value,
      status: form.querySelector('[name="status"]').value,
      recommendations: form.querySelector('[name="recommendations"]').value,
      remarks: form.querySelector('[name="remarks"]').value,
      customerAck: form.querySelector('[name="customerAck"]').value.trim(),
      preparedBy: form.querySelector('[name="preparedBy"]').value.trim(),
      laborCost: Number(form.querySelector('[name="laborCost"]').value) || 0,
      materials: materials
        .filter((m) => String(m.description || '').trim())
        .map((m) => ({
          description: String(m.description).trim(),
          quantity: Number(m.quantity) || 0,
          unit: m.unit || '',
          unitCost: Number(m.unitCost) || 0,
        })),
      photos,
    };
    if (!payload.customerName) {
      markInvalid(form, 'customerName', 'Customer name is required.');
      return;
    }
    if (!payload.serviceDate) {
      markInvalid(form, 'serviceDate', 'Service date is required.');
      return;
    }
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      markInvalid(form, 'email', 'Enter a valid email address.');
      return;
    }
    if (payload.startTime && payload.endTime && payload.endTime < payload.startTime) {
      toast('Completion time is earlier than the start time. Please double-check the times.', 'error', 'Check times');
      return;
    }
    const button = view.querySelector('#save-btn');
    setBusy(button, true);
    try {
      const saved = isEdit
        ? await api.put(`/service-reports/${params.id}`, payload)
        : await api.post('/service-reports', payload);
      toast(`${saved.number} saved.`, 'success', isEdit ? 'Service report updated' : 'Service report created');
      navigate(`/service-reports/${saved.id}`);
    } catch (err) {
      toast(err.message, 'error', 'Could not save service report');
      setBusy(button, false);
    }
  });

  renderMaterials();
  renderPhotos();
}
