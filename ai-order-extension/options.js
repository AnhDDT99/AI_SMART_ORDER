const DEFAULT_CUSTOM_FIELDS = [
    { name: 'Mã SP', type: 'NORMAL' },
    { name: 'Số lượng', type: 'NORMAL' }
];

let manualFields = [];
const fieldsListEl = document.getElementById('fields-list');
const newFieldInput = document.getElementById('new-field-name');
const statusEl = document.getElementById('status');
const selectKhoEl = document.getElementById('inventory_field_name');

const cbAutoFb = document.getElementById('auto_fb');
const cbAutoImg = document.getElementById('auto_img');

function setStatus(text, isError = false) {
    statusEl.textContent = text || '';
    statusEl.style.color = isError ? '#ef4444' : '#16a34a';
    if (text) setTimeout(() => statusEl.textContent = '', 3000);
}

function escapeAttr(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// Cập nhật Dropdown để nối trường Tồn Kho
function updateKhoDropdown(selectedValue) {
    selectKhoEl.innerHTML = '<option value="">-- Chọn trường để dò tồn kho --</option>';
    manualFields.forEach(f => {
        if (!f.name.trim()) return;
        const opt = document.createElement('option');
        opt.value = f.name;
        opt.textContent = f.name;
        if (f.name === selectedValue) opt.selected = true;
        selectKhoEl.appendChild(opt);
    });
}

function renderFieldsList() {
    fieldsListEl.innerHTML = '';
    
    manualFields.forEach((field, index) => {
        const li = document.createElement('li');
        li.className = 'field-item';
        
        li.innerHTML = `
            <span class="idx">${index + 1}</span>
            <input type="text" class="field-name" value="${escapeAttr(field.name)}" placeholder="Nhập tên trường...">
            <div class="field-actions">
                <button type="button" class="icon-btn btn-up" title="Lên">↑</button>
                <button type="button" class="icon-btn btn-down" title="Xuống">↓</button>
                <button type="button" class="icon-btn danger btn-del" title="Xóa">×</button>
            </div>
        `;

        const nameInput = li.querySelector('.field-name');
        nameInput.addEventListener('change', () => {
            const oldName = manualFields[index].name;
            manualFields[index].name = nameInput.value.trim();
            const currentSelected = selectKhoEl.value;
            updateKhoDropdown(currentSelected === oldName ? manualFields[index].name : currentSelected);
        });

        li.querySelector('.btn-up').addEventListener('click', () => moveField(index, -1));
        li.querySelector('.btn-down').addEventListener('click', () => moveField(index, 1));
        li.querySelector('.btn-del').addEventListener('click', () => deleteField(index));

        fieldsListEl.appendChild(li);
    });
    
    updateKhoDropdown(selectKhoEl.value);
}

function moveField(index, delta) {
    const next = index + delta;
    if (next < 0 || next >= manualFields.length) return;
    const tmp = manualFields[index];
    manualFields[index] = manualFields[next];
    manualFields[next] = tmp;
    renderFieldsList();
}

function deleteField(index) {
    const deletedName = manualFields[index].name;
    manualFields.splice(index, 1);
    if (selectKhoEl.value === deletedName) updateKhoDropdown(''); 
    else renderFieldsList();
}

function addField() {
    const name = newFieldInput.value.trim();
    if (!name) return newFieldInput.focus();
    manualFields.push({ name, type: 'NORMAL' });
    newFieldInput.value = '';
    renderFieldsList();
}

document.getElementById('btn-add-field').addEventListener('click', addField);
newFieldInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addField(); });

// ---------------- Khởi chạy và Load dữ liệu ----------------
document.addEventListener('DOMContentLoaded', async () => {
    const sync = await chrome.storage.sync.get(['customFields', 'appConfig', 'inventoryCodeCol', 'aiPrompt']);
    let savedKhoName = '';

    if (Array.isArray(sync.customFields) && sync.customFields.length > 0) {
        sync.customFields.forEach(f => {
            if (!f) return;
            if (f.type === 'TAB_URL') {
                cbAutoFb.checked = true;
            } else if (f.type === 'IMAGE_URL') {
                cbAutoImg.checked = true;
            } else {
                manualFields.push({ name: f.name, type: 'NORMAL' });
                if (f.type === 'PRODUCT_CODE') savedKhoName = f.name;
            }
        });
    } else {
        manualFields = [...DEFAULT_CUSTOM_FIELDS];
        savedKhoName = 'Mã SP';
    }

    if (sync.appConfig) {
        document.getElementById('spreadsheet_id').value = sync.appConfig.spreadsheet_id || '';
        document.getElementById('order_sheet').value = sync.appConfig.order_sheet || '';
        document.getElementById('order_start_cell').value = sync.appConfig.order_start_cell || 'A1';
        document.getElementById('inventory_sheet').value = sync.appConfig.inventory_sheet || '';
        document.getElementById('col_qty').value = sync.appConfig.col_qty || '';
    }
    if (sync.inventoryCodeCol) document.getElementById('inventoryCodeCol').value = sync.inventoryCodeCol;
    if (sync.aiPrompt) document.getElementById('ai_prompt').value = sync.aiPrompt;

    renderFieldsList();
    if (savedKhoName) selectKhoEl.value = savedKhoName;
});

// ---------------- Lưu cấu hình mới ----------------
document.getElementById('save_btn').addEventListener('click', async () => {
    manualFields = manualFields.filter(f => f.name && f.name.trim() !== '');
    
    let finalFields = manualFields.map(f => ({ name: f.name.trim(), type: 'NORMAL' }));
    
    const selectedKho = selectKhoEl.value;
    if (selectedKho) {
        const match = finalFields.find(f => f.name === selectedKho);
        if (match) match.type = 'PRODUCT_CODE';
    }

    if (cbAutoFb.checked) finalFields.push({ name: 'Link FB', type: 'TAB_URL' });
    if (cbAutoImg.checked) finalFields.push({ name: 'Link Ảnh', type: 'IMAGE_URL' });

    if (finalFields.length === 0) return setStatus('Cần ít nhất 1 trường dữ liệu Form!', true);

    const appConfig = {
        spreadsheet_id: document.getElementById('spreadsheet_id').value.trim(),
        order_sheet: document.getElementById('order_sheet').value.trim(),
        order_start_cell: document.getElementById('order_start_cell').value.trim() || 'A1',
        inventory_sheet: document.getElementById('inventory_sheet').value.trim(),
        col_qty: document.getElementById('col_qty').value.trim()
    };
    
    const inventoryCodeCol = document.getElementById('inventoryCodeCol').value.trim();
    const aiPrompt = document.getElementById('ai_prompt').value;

    await chrome.storage.sync.set({ customFields: finalFields, appConfig, inventoryCodeCol, aiPrompt });
    await chrome.storage.local.set({ appConfig });

    renderFieldsList(); 
    setStatus('Đã lưu thành công cấu hình!');
});