import { api } from '../api.js';
import { prepareLogo, prepareSignature, pickFile } from '../images.js';
import {
  icon,
  esc,
  toast,
  setPageMeta,
  ensureLookups,
  refreshLookups,
  getState,
  field,
  setBusy,
  openModal,
  confirmDialog,
} from './shared.js';

export async function render({ view }) {
  setPageMeta({ title: 'Business Settings', subtitle: 'One business profile drives every document you generate.' });
  const state = await ensureLookups({ force: true });
  const s = state.settings;

  let form;

  view.innerHTML = `
    <form id="settings-form" novalidate autocomplete="off">
      <div class="page-head">
        <div>
          <h2 style="font-size:15px">Business profile</h2>
          <p>Changes are saved to the local database and applied to every new quotation, invoice, service report and billing statement immediately.</p>
        </div>
        <div class="actions">
          <button class="btn" type="button" id="preview-doc">${icon('eye', 15)} Preview documents</button>
          <button class="btn" type="button" id="cancel-changes">Cancel changes</button>
          <button class="btn btn-primary" type="submit" id="save-btn">${icon('save', 15)} Save changes</button>
        </div>
      </div>

      <div class="callout info mb-16">${icon('info', 16)}
        <div><strong>Verified information only.</strong> The business name, location and Facebook page were taken from the public page. Phone, email, logo, TIN and registration details are intentionally blank — enter your official details here; blank optional fields are allowed.</div>
      </div>

      <div class="grid grid-2">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h2>Business identity</h2></div>
            <div class="card-body">
              <div class="form-grid">
                ${field({ label: 'Business name', name: 'businessName', value: s.businessName, required: true, span: 2 })}
                ${field({ label: 'Tagline', name: 'tagline', value: s.tagline, span: 2, placeholder: 'e.g. Custom stainless steel fabrication' })}
                ${field({ label: 'Phone number', name: 'phone', value: s.phone, placeholder: 'Landline' })}
                ${field({ label: 'Mobile number', name: 'mobile', value: s.mobile })}
                ${field({ label: 'Email address', name: 'email', type: 'email', value: s.email })}
                ${field({ label: 'Website URL', name: 'websiteUrl', value: s.websiteUrl, placeholder: 'https://…' })}
                ${field({ label: 'Facebook URL', name: 'facebookUrl', value: s.facebookUrl, span: 2 })}
                ${field({ label: 'Complete business address', name: 'address', type: 'textarea', value: s.address, span: 2, attrs: 'rows="2"' })}
                ${field({ label: 'Authorized representative', name: 'representative', value: s.representative, hint: 'Name printed on the signature line.' })}
                ${field({ label: 'Tax identification number (TIN)', name: 'tin', value: s.tin, hint: 'Leave blank if not applicable.' })}
                ${field({ label: 'Business registration information', name: 'registrationInfo', type: 'textarea', value: s.registrationInfo, span: 2, attrs: 'rows="2"', placeholder: 'e.g. DTI / business permit details — leave blank if not applicable' })}
              </div>
              <div class="form-section">
                <div class="form-section-head"><h3>Other social media links</h3><span class="hint">Optional</span></div>
                <div id="social-rows"></div>
                <button type="button" class="btn btn-sm mt-8" id="add-social">${icon('plus', 14)} Add social link</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Document defaults</h2></div>
            <div class="card-body">
              <div class="form-grid">
                ${field({ label: 'Default payment terms', name: 'defaultPaymentTerms', type: 'textarea', value: s.defaultPaymentTerms, span: 2, attrs: 'rows="2"', placeholder: 'e.g. 50% downpayment, balance upon completion' })}
                ${field({ label: 'Default document notes', name: 'defaultNotes', type: 'textarea', value: s.defaultNotes, span: 2, attrs: 'rows="2"' })}
                ${field({ label: 'Default document footer', name: 'defaultFooter', type: 'textarea', value: s.defaultFooter, span: 2, attrs: 'rows="2"', hint: 'Printed at the bottom of every page of each document.' })}
                ${field({ label: 'Default payment due days', name: 'defaultDueDays', type: 'number', value: s.defaultDueDays, attrs: 'min="0" max="365" step="1"' })}
              </div>
              <div class="form-section">
                <div class="form-section-head"><h3>Document number prefixes</h3><span class="hint">2–6 letters</span></div>
                <div class="form-grid three">
                  ${field({ label: 'Quotation', name: 'quotationPrefix', value: s.quotationPrefix })}
                  ${field({ label: 'Invoice', name: 'invoicePrefix', value: s.invoicePrefix })}
                  ${field({ label: 'Service report', name: 'servicePrefix', value: s.servicePrefix })}
                  ${field({ label: 'Billing statement', name: 'statementPrefix', value: s.statementPrefix })}
                  ${field({ label: 'Payment', name: 'paymentPrefix', value: s.paymentPrefix })}
                </div>
                <p class="small muted mt-8">Numbers are assigned sequentially per year, e.g. ${esc(s.invoicePrefix)}-${new Date().getFullYear()}-0001. Changing a prefix does not renumber existing documents.</p>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Tax &amp; payment methods</h2></div>
            <div class="card-body">
              <div class="form-grid">
                <div class="field">
                  <label>Tax</label>
                  <label class="checkbox"><input type="checkbox" name="taxEnabled" ${s.taxEnabled ? 'checked' : ''} /> Apply tax by default on new documents</label>
                  <div class="hint">Leave disabled if you do not charge tax.</div>
                </div>
                ${field({ label: 'Tax label', name: 'taxLabel', value: s.taxLabel, placeholder: 'VAT' })}
                ${field({ label: 'Default tax rate (%)', name: 'taxRate', type: 'number', value: s.taxRate, attrs: 'min="0" max="100" step="0.01"' })}
              </div>
              <div class="form-section">
                <div class="form-section-head"><h3>Payment methods</h3><span class="hint">Shown when recording payments</span></div>
                <div id="method-chips" class="btn-row"></div>
                <div class="upload-row mt-8">
                  <input class="input" id="new-method" placeholder="Add another method (e.g. Maya)" style="max-width:260px" />
                  <button type="button" class="btn btn-sm" id="add-method">${icon('plus', 14)} Add method</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-head"><h2>Logo</h2><span class="sub">PNG, JPG or WebP</span></div>
            <div class="card-body">
              <div class="logo-drop" id="logo-drop">
                ${s.logoImage ? `<img id="logo-preview" src="${s.logoImage}" alt="Business logo" />` : `<div class="placeholder" id="logo-preview">No logo uploaded</div>`}
              </div>
              <div class="upload-row mt-12">
                <button type="button" class="btn btn-sm" id="upload-logo">${icon('upload', 14)} Upload logo</button>
                <button type="button" class="btn btn-sm btn-danger" id="remove-logo" ${s.logoImage ? '' : 'disabled'}>${icon('trash', 14)} Remove</button>
              </div>
              <div class="form-grid mt-12">
                <div class="field">
                  <label for="logo-height">Logo size on documents</label>
                  <div class="range-row">
                    <input type="range" id="logo-height" min="24" max="120" step="2" value="${s.logoHeight}" />
                    <span class="small tabular" id="logo-height-value">${s.logoHeight}px</span>
                  </div>
                </div>
                <div class="field">
                  <label for="logo-align">Logo position</label>
                  <select class="select" id="logo-align">
                    <option value="left" ${s.logoAlign === 'left' ? 'selected' : ''}>Left</option>
                    <option value="center" ${s.logoAlign === 'center' ? 'selected' : ''}>Center</option>
                    <option value="right" ${s.logoAlign === 'right' ? 'selected' : ''}>Right</option>
                  </select>
                </div>
              </div>
              <p class="small muted mt-8">Aspect ratio is always preserved. The logo is placed in the document header area and appears on every generated PDF.</p>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Authorized signature</h2><span class="sub">Optional</span></div>
            <div class="card-body">
              <div class="sig-preview" id="sig-preview">
                ${s.signatureImage ? `<img src="${s.signatureImage}" alt="Signature" />` : '<span class="small muted">No signature image uploaded</span>'}
              </div>
              <div class="upload-row mt-12">
                <button type="button" class="btn btn-sm" id="upload-signature">${icon('upload', 14)} Upload signature</button>
                <button type="button" class="btn btn-sm btn-danger" id="remove-signature" ${s.signatureImage ? '' : 'disabled'}>${icon('trash', 14)} Remove</button>
              </div>
              <p class="small muted mt-8">A signature image appears above the “Authorized signature” line on documents.</p>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Data &amp; backup</h2></div>
            <div class="panel-list">
              <div class="panel-row">
                <div class="label">Full JSON backup</div>
                <div class="value"><a href="/api/backup/json" download>${icon('download', 14)} Download backup (.json)</a></div>
              </div>
              <div class="panel-row">
                <div class="label">SQLite database file</div>
                <div class="value"><a href="/api/backup/database" download>${icon('download', 14)} Download database (.db)</a></div>
              </div>
              <div class="panel-row">
                <div class="label">Storage</div>
                <div class="value small muted">Records are stored in a SQLite database on the application server. They remain after refreshing the browser or restarting the website.</div>
              </div>
            </div>
          </div>

          <div class="callout warn">${icon('warn', 16)}
            <div>This site is a single-shop management tool with no login by design. Anyone who can reach the URL can manage the records, so only publish it to people you trust and keep backups.</div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn" type="button" id="cancel-changes-2">Cancel changes</button>
        <div class="spacer"></div>
        <button class="btn" type="button" id="preview-doc-2">${icon('eye', 15)} Preview documents</button>
        <button class="btn btn-primary" type="submit">${icon('save', 15)} Save changes</button>
      </div>
    </form>
  `;

  form = view.querySelector('#settings-form');
  let logoImage = s.logoImage || '';
  let signatureImage = s.signatureImage || '';
  let logoHeight = s.logoHeight;
  let logoAlign = s.logoAlign;
  let socialLinks = (s.socialLinks || []).map((l) => ({ ...l }));
  let methods = [...s.paymentMethods];

  // Social links ----------------------------------------------------------------
  const socialRows = view.querySelector('#social-rows');
  function renderSocial() {
    socialRows.innerHTML = socialLinks.length
      ? socialLinks
          .map(
            (l, i) => `<div class="upload-row mb-8" data-social-row="${i}">
              <input class="input" data-social="label" data-idx="${i}" value="${esc(l.label)}" placeholder="Label (e.g. Instagram)" style="max-width:180px" />
              <input class="input" data-social="url" data-idx="${i}" value="${esc(l.url)}" placeholder="https://…" style="flex:1;min-width:180px" />
              <button type="button" class="icon-btn" data-social-remove="${i}" aria-label="Remove link">${icon('trash', 15)}</button>
            </div>`
          )
          .join('')
      : '<p class="small muted">No additional social links.</p>';
  }
  renderSocial();
  socialRows.addEventListener('input', (e) => {
    const target = e.target.closest('[data-social]');
    if (!target) return;
    socialLinks[Number(target.dataset.idx)][target.dataset.social] = target.value;
  });
  socialRows.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-social-remove]');
    if (!btn) return;
    socialLinks.splice(Number(btn.dataset.socialRemove), 1);
    renderSocial();
  });
  view.querySelector('#add-social').addEventListener('click', () => {
    socialLinks.push({ label: '', url: '' });
    renderSocial();
  });

  // Payment methods ---------------------------------------------------------------
  const chips = view.querySelector('#method-chips');
  function renderMethods() {
    chips.innerHTML = methods.length
      ? methods
          .map(
            (m, i) =>
              `<span class="badge plain draft" style="padding:5px 9px;font-size:12px">${esc(m)}
                <button type="button" class="icon-btn" style="width:18px;height:18px" data-method-remove="${i}" aria-label="Remove ${esc(
                m
              )}">${icon('close', 11)}</button></span>`
          )
          .join('')
      : '<span class="small muted">No payment methods configured.</span>';
  }
  renderMethods();
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-method-remove]');
    if (!btn) return;
    if (methods.length <= 1) {
      toast('Keep at least one payment method.', 'error');
      return;
    }
    methods.splice(Number(btn.dataset.methodRemove), 1);
    renderMethods();
  });
  view.querySelector('#add-method').addEventListener('click', () => {
    const input = view.querySelector('#new-method');
    const value = input.value.trim();
    if (!value) return;
    if (methods.some((m) => m.toLowerCase() === value.toLowerCase())) {
      toast('That payment method already exists.', 'error');
      return;
    }
    methods.push(value);
    input.value = '';
    renderMethods();
  });
  view.querySelector('#new-method').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      view.querySelector('#add-method').click();
    }
  });

  // Logo & signature ---------------------------------------------------------------
  function setLogoPreview(src) {
    const drop = view.querySelector('#logo-drop');
    drop.innerHTML = src ? `<img id="logo-preview" src="${src}" alt="Business logo" />` : `<div class="placeholder">No logo uploaded</div>`;
    view.querySelector('#remove-logo').disabled = !src;
  }
  function setSignaturePreview(src) {
    view.querySelector('#sig-preview').innerHTML = src
      ? `<img src="${src}" alt="Signature" />`
      : '<span class="small muted">No signature image uploaded</span>';
    view.querySelector('#remove-signature').disabled = !src;
  }

  view.querySelector('#upload-logo').addEventListener('click', async () => {
    try {
      const file = await pickFile();
      const prepared = await prepareLogo(file);
      logoImage = prepared.dataUrl;
      setLogoPreview(logoImage);
      toast(`Logo ready (${prepared.width}×${prepared.height}). Save changes to apply it.`, 'success', 'Logo uploaded');
    } catch (err) {
      if (err.message !== 'cancelled') toast(err.message, 'error', 'Could not use that image');
    }
  });
  view.querySelector('#remove-logo').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Remove logo?', message: 'The logo will be removed from new documents once you save.', confirmLabel: 'Remove logo', variant: 'btn-danger' }))) return;
    logoImage = '';
    setLogoPreview('');
  });
  view.querySelector('#upload-signature').addEventListener('click', async () => {
    try {
      const file = await pickFile();
      const prepared = await prepareSignature(file);
      signatureImage = prepared.dataUrl;
      setSignaturePreview(signatureImage);
      toast('Signature ready. Save changes to apply it.', 'success', 'Signature uploaded');
    } catch (err) {
      if (err.message !== 'cancelled') toast(err.message, 'error', 'Could not use that image');
    }
  });
  view.querySelector('#remove-signature').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Remove signature?', message: 'The signature image will be removed once you save.', confirmLabel: 'Remove', variant: 'btn-danger' }))) return;
    signatureImage = '';
    setSignaturePreview('');
  });
  view.querySelector('#logo-height').addEventListener('input', (e) => {
    logoHeight = Number(e.target.value);
    view.querySelector('#logo-height-value').textContent = `${logoHeight}px`;
  });
  view.querySelector('#logo-align').addEventListener('change', (e) => {
    logoAlign = e.target.value;
  });

  // Save / cancel / preview ---------------------------------------------------------
  async function save(button) {
    const payload = {
      businessName: form.querySelector('[name="businessName"]').value.trim(),
      tagline: form.querySelector('[name="tagline"]').value.trim(),
      phone: form.querySelector('[name="phone"]').value.trim(),
      mobile: form.querySelector('[name="mobile"]').value.trim(),
      email: form.querySelector('[name="email"]').value.trim(),
      websiteUrl: form.querySelector('[name="websiteUrl"]').value.trim(),
      facebookUrl: form.querySelector('[name="facebookUrl"]').value.trim(),
      address: form.querySelector('[name="address"]').value,
      representative: form.querySelector('[name="representative"]').value.trim(),
      tin: form.querySelector('[name="tin"]').value.trim(),
      registrationInfo: form.querySelector('[name="registrationInfo"]').value,
      defaultPaymentTerms: form.querySelector('[name="defaultPaymentTerms"]').value,
      defaultNotes: form.querySelector('[name="defaultNotes"]').value,
      defaultFooter: form.querySelector('[name="defaultFooter"]').value,
      defaultDueDays: Number(form.querySelector('[name="defaultDueDays"]').value) || 0,
      quotationPrefix: form.querySelector('[name="quotationPrefix"]').value.trim().toUpperCase(),
      invoicePrefix: form.querySelector('[name="invoicePrefix"]').value.trim().toUpperCase(),
      servicePrefix: form.querySelector('[name="servicePrefix"]').value.trim().toUpperCase(),
      statementPrefix: form.querySelector('[name="statementPrefix"]').value.trim().toUpperCase(),
      paymentPrefix: form.querySelector('[name="paymentPrefix"]').value.trim().toUpperCase(),
      taxEnabled: form.querySelector('[name="taxEnabled"]').checked,
      taxLabel: form.querySelector('[name="taxLabel"]').value.trim(),
      taxRate: Number(form.querySelector('[name="taxRate"]').value) || 0,
      socialLinks,
      paymentMethods: methods,
      logoImage,
      logoHeight,
      logoAlign,
      signatureImage,
    };
    if (!payload.businessName) {
      toast('Business name is required.', 'error');
      form.querySelector('[name="businessName"]').focus();
      return;
    }
    setBusy(button, true);
    try {
      await api.put('/settings', payload);
      await refreshLookups();
      await ensureLookups({ force: true });
      toast('Business settings saved. New documents will use this information.', 'success', 'Settings saved');
      setBusy(button, false);
    } catch (err) {
      toast(err.message, 'error', 'Could not save settings');
      setBusy(button, false);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save(view.querySelector('#save-btn'));
  });
  ['#cancel-changes', '#cancel-changes-2'].forEach((sel) =>
    view.querySelector(sel).addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Discard changes?',
        message: 'Unsaved edits on this page will be discarded and the saved business profile will be reloaded.',
        confirmLabel: 'Discard changes',
        variant: 'btn-danger',
      });
      if (ok) render({ view });
    })
  );
  const previewUrl = '/api/settings/preview-pdf';
  const openPreview = () => {
    openModal({
      title: 'Document design preview',
      size: 'xwide',
      closeOnBackdrop: false,
      body: `<div class="doc-toolbar">
          <a class="btn btn-sm btn-primary" href="${previewUrl}?download=1" download>${icon('download', 14)} Download sample</a>
          <a class="btn btn-sm" href="${previewUrl}" target="_blank" rel="noopener">${icon('external', 14)} Open</a>
          <span class="doc-meta">Preview uses your last saved settings — sample content only</span>
        </div>
        <iframe class="doc-frame" title="Document preview" src="${previewUrl}"></iframe>`,
      actions: [{ label: 'Close', onClick: ({ close }) => close() }],
    });
  };
  ['#preview-doc', '#preview-doc-2'].forEach((sel) => view.querySelector(sel).addEventListener('click', openPreview));
}
