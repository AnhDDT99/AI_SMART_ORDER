const fieldsEl = document.getElementById('fields');
const emptyEl = document.getElementById('empty-state');
const msgEl = document.getElementById('msg');
const btnCheck = document.getElementById('btn-check');
const btnSave = document.getElementById('btn-save');

let customFields = [];
let appConfig = {};
let inventoryCodeCol = '';

function setMsg(text, type = 'info') {
    msgEl.textContent = text || '';
    msgEl.className = `msg${type ? ` is-${type}` : ''}`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sendToBackground(action, payload = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action, ...payload }, (response) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!response?.ok) return reject(new Error(response?.error || 'Lỗi không xác định'));
            resolve(response.data);
        });
    });
}

// KHỞI TẠO KHUNG FORM CHO 1 KHÁCH
function initFieldsDOM() {
    if (!customFields || customFields.length === 0) {
        emptyEl.hidden = false;
        fieldsEl.hidden = true;
        btnCheck.disabled = true;
        btnSave.disabled = true;
        emptyEl.innerHTML = 'Chưa có Field Mapping. Mở <strong>Options</strong> để cấu hình.';
        return;
    }

    emptyEl.hidden = true; 
    fieldsEl.hidden = false;
    btnCheck.disabled = false; 
    btnSave.disabled = false;
    fieldsEl.innerHTML = '';

    customFields.forEach((field) => {
        const safeName = escapeHtml(field.name);
        const wrap = document.createElement('div');
        wrap.className = 'field';
        wrap.innerHTML = `
            <label for="input_${safeName}">${safeName}</label>
            <input type="text" id="input_${safeName}" data-key="${safeName}" data-type="${field.type}" placeholder="Nhập ${safeName}...">
        `;
        fieldsEl.appendChild(wrap);
    });
}

// BƠM DỮ LIỆU TỪ AI VÀO FORM (1 KHÁCH)
function fillDataToFields(dataToFill) {
    if (!dataToFill) return;

    const lowerData = {};
    for (const [k, v] of Object.entries(dataToFill)) {
        lowerData[String(k).toLowerCase().trim()] = v;
    }

    customFields.forEach((field) => {
        const fieldName = field.name;
        const fieldNameLower = fieldName.toLowerCase().trim();
        
        let val = dataToFill[fieldName];
        if (val === undefined || val === null) {
            val = lowerData[fieldNameLower];
        }

        const input = fieldsEl.querySelector(`input[data-key="${CSS.escape(fieldName)}"]`);
        if (input && val !== undefined && val !== null && val !== '') {
            input.value = val;
        }
    });
}

function getFormData() {
    const data = {};
    customFields.forEach((field) => {
        const input = fieldsEl.querySelector(`input[data-key="${CSS.escape(field.name)}"]`);
        if (input) {
            data[field.name] = input.value.trim();
        }
    });
    return data;
}

// ================= GIAO DIỆN HÀNG LOẠT (BULK) =================

function hideBulkTable() {
    const bulkDiv = document.getElementById('bulk-container');
    if (bulkDiv) bulkDiv.style.display = 'none';
    
    fieldsEl.style.display = 'block';
    btnCheck.style.display = 'inline-block';
    btnSave.style.display = 'inline-block';
}

function renderBulkTable(orders, fields) {
    // Ẩn form 1 khách đi
    fieldsEl.style.display = 'none';
    btnCheck.style.display = 'none';
    btnSave.style.display = 'none';

    let bulkDiv = document.getElementById('bulk-container');
    if (!bulkDiv) {
        bulkDiv = document.createElement('div');
        bulkDiv.id = 'bulk-container';
        fieldsEl.parentNode.insertBefore(bulkDiv, fieldsEl);
    }
    bulkDiv.style.display = 'block';

    // Tìm trường Mã SP và Số lượng để lấy data đi check kho
    const khoField = fields.find(f => f.type === 'PRODUCT_CODE')?.name;
    const qtyField = fields.find(f => f.name.toLowerCase().includes('số lượng') || f.name.toLowerCase().includes('sl') || f.name.toLowerCase().includes('quantity'))?.name;

    // Vẽ giao diện bảng HTML (Thêm cột Trạng thái Kho)
    let html = `<div style="background: #e8f5e9; padding: 10px; border-radius: 5px; margin-bottom: 10px; color: #2e7d32;">
                    <b>🔥 Đã bóc tách thành công ${orders.length} khách hàng!</b>
                </div>
                <div style="overflow-x: auto; margin-bottom: 15px; max-height: 400px; overflow-y: auto;">
                    <table border="1" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                        <thead style="background: #f1f1f1; position: sticky; top: 0;"><tr>`;
    
    fields.forEach(f => {
        html += `<th style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(f.name)}</th>`;
    });
    // Tiêu đề cột Check Kho
    html += `<th style="padding: 6px; border: 1px solid #ddd; background: #fff3e0; width: 120px;">Trạng thái Kho</th>`;
    html += `</tr></thead><tbody>`;
    
    orders.forEach((order, index) => {
        html += `<tr>`;
        fields.forEach(f => {
            html += `<td style="padding: 6px; border: 1px solid #ddd; word-break: break-word;">${escapeHtml(order[f.name])}</td>`;
        });
        // Ô chứa kết quả Check Kho của từng dòng (Mặc định là Dấu chấm hỏi)
        html += `<td id="bulk_status_${index}" style="padding: 6px; border: 1px solid #ddd; font-weight: bold; color: #777;">❔ Chờ check</td>`;
        html += `</tr>`;
    });
    
    html += `   </tbody></table>
             </div>
             <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                 <button id="btnCheckBulk" style="flex: 1; padding: 12px; background: #ff9800; color: white; border: none; font-weight: bold; cursor: pointer; border-radius: 4px;">
                     🔍 CHECK KHO TẤT CẢ
                 </button>
                 <button id="btnSaveBulk" style="flex: 1; padding: 12px; background: #4CAF50; color: white; border: none; font-weight: bold; cursor: pointer; border-radius: 4px;">
                     💾 LƯU ${orders.length} ĐƠN
                 </button>
             </div>
             <button id="btnCancelBulk" style="width: 100%; padding: 10px; background: #f44336; color: white; border: none; font-weight: bold; cursor: pointer; border-radius: 4px;">
                 Hủy bỏ (Quay lại Form)
             </button>`;
             
    bulkDiv.innerHTML = html;

    // ================= SỰ KIỆN: CHECK KHO HÀNG LOẠT =================
    document.getElementById('btnCheckBulk').addEventListener('click', async () => {
        if (!khoField) return setMsg('Lỗi: Bạn chưa cấu hình trường "Mã SP" trong Options!', 'err');
        
        const btnCheck = document.getElementById('btnCheckBulk');
        btnCheck.innerText = 'Đang dò kho...';
        btnCheck.disabled = true;

        for (let i = 0; i < orders.length; i++) {
            const tdStatus = document.getElementById(`bulk_status_${i}`);
            tdStatus.innerHTML = '🔄 Đang check...';
            
            const maSP = orders[i][khoField];
            const quantity = qtyField ? (orders[i][qtyField] || "1") : "1";
            
            if (!maSP) {
                tdStatus.innerHTML = '<span style="color: #ff9800;">⚠️ Trống mã</span>';
                continue;
            }

            try {
                // Tái sử dụng chính API check kho cũ, gửi ngầm xuống Backend
                const res = await sendToBackground('CHECK_INVENTORY', {
                    payload: { maSP, quantity, inventoryCodeCol }
                });
                
                // Cập nhật kết quả Xanh/Đỏ lên ô HTML
                if (res.status === 'success') {
                    tdStatus.innerHTML = `<span style="color: green;">${res.message}</span>`;
                } else {
                    tdStatus.innerHTML = `<span style="color: red;">${res.message}</span>`;
                }
            } catch (e) {
                tdStatus.innerHTML = '<span style="color: red;">❌ Lỗi mạng</span>';
            }
        }
        
        btnCheck.innerText = '✅ ĐÃ CHECK KHO XONG';
        setMsg('Hoàn tất kiểm tra kho cho toàn bộ danh sách!', 'ok');
    });

    // ================= SỰ KIỆN: BẤM LƯU TẤT CẢ =================
    document.getElementById('btnSaveBulk').addEventListener('click', async () => {
        const btnSave = document.getElementById('btnSaveBulk');
        const btnCancel = document.getElementById('btnCancelBulk');
        btnSave.innerText = 'Đang lưu đơn hàng...';
        btnSave.style.background = '#ff9800';
        btnSave.disabled = true;
        document.getElementById('btnCheckBulk').disabled = true;
        btnCancel.disabled = true;
        
        let successCount = 0;
        for (let i = 0; i < orders.length; i++) {
            btnSave.innerText = `Đang đẩy lên Sheets (${i + 1}/${orders.length})...`;
            try {
                const res = await sendToBackground('SAVE_ORDER', { orderData: orders[i] });
                if (res.success) successCount++;
            } catch (e) {
                console.error("Lỗi lưu đơn:", e);
            }
        }
        
        btnSave.innerText = `✅ ĐÃ LƯU XONG ${successCount} ĐƠN!`;
        btnSave.style.background = '#2196F3';
        setMsg(`Tuyệt vời! Đã ghi ${successCount} đơn hàng loạt lên Sheets.`, 'ok');
        
        setTimeout(() => { 
            chrome.storage.local.remove('temp_order_data'); 
            hideBulkTable();
            customFields.forEach((field) => {
                const input = fieldsEl.querySelector(`input[data-key="${CSS.escape(field.name)}"]`);
                if (input) input.value = '';
            });
        }, 3000);
    });

    // ================= SỰ KIỆN: HỦY BỎ =================
    document.getElementById('btnCancelBulk').addEventListener('click', () => {
        chrome.storage.local.remove('temp_order_data'); 
        hideBulkTable();
        setMsg('Đã hủy thao tác chốt hàng loạt.', 'info');
    });
}
// ----------------- SỰ KIỆN NÚT BẤM (CHO 1 KHÁCH) -----------------

btnCheck.addEventListener('click', async () => {
    setMsg('Đang kiểm tra tồn kho…', 'info');
    try {
        const khoFieldConfig = customFields.find(f => f.type === 'PRODUCT_CODE');
        if (!khoFieldConfig) return setMsg('Lỗi: Bạn chưa cấu hình trường "Mã SP" trong trang Options!', 'err');

        const form_data = getFormData();
        const maSP = form_data[khoFieldConfig.name];

        if (!maSP) return setMsg(`Ô "${khoFieldConfig.name}" đang trống — không thể check kho.`, 'warn');

        // BỎ PARSE_INT: Giữ nguyên chuỗi dạng "2, 1" để Backend tách dòng
        const qtyKey = Object.keys(form_data).find(k => k.toLowerCase().includes('số lượng') || k.toLowerCase().includes('quantity') || k.toLowerCase().includes('sl'));
        let quantity = qtyKey ? form_data[qtyKey] : "1";

        const res = await sendToBackground('CHECK_INVENTORY', {
            payload: { maSP, quantity, inventoryCodeCol }
        });

        const type = res.status === 'success' ? 'ok' : res.status === 'warning' ? 'warn' : 'err';
        setMsg(res.message || 'Xong', type);
    } catch (error) {
        setMsg(error.message || 'Lỗi kết nối Backend!', 'err');
    }
});

btnSave.addEventListener('click', async () => {
    setMsg('Đang lưu đơn…', 'info');
    try {
        const currentOrderData = getFormData();
        const res = await sendToBackground('SAVE_ORDER', { orderData: currentOrderData });
        
        if (res.success) {
            setMsg(res.message || 'Đã lưu đơn thành công!', 'ok');
            customFields.forEach((field) => {
                const input = fieldsEl.querySelector(`input[data-key="${CSS.escape(field.name)}"]`);
                if (input) input.value = '';
            });
        } else {
            setMsg(res.message || 'Lưu đơn thất bại', 'err');
        }
    } catch (error) {
        setMsg(error.message || 'Lỗi kết nối Backend!', 'err');
    }
});

// ----------------- ĐỒNG BỘ DỮ LIỆU TỪ CHROME STORAGE -----------------

async function loadFromStorage() {
    const sync = await chrome.storage.sync.get(['customFields', 'appConfig', 'inventoryCodeCol']);
    const local = await chrome.storage.local.get(['temp_order_data']);

    if (Array.isArray(sync.customFields) && sync.customFields.length > 0) customFields = sync.customFields;
    appConfig = sync.appConfig || {};
    inventoryCodeCol = sync.inventoryCodeCol || '';

    initFieldsDOM();

    const payload = local.temp_order_data;
    if (payload && payload.orderData) {
        if (payload.isBulk && Array.isArray(payload.orderData)) {
            renderBulkTable(payload.orderData, customFields);
        } else {
            fillDataToFields(payload.orderData);
        }
    }
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.customFields) {
        customFields = changes.customFields.newValue || [];
        initFieldsDOM();
    }
    if (area === 'sync' && changes.inventoryCodeCol) {
        inventoryCodeCol = changes.inventoryCodeCol.newValue || '';
    }
    
    if (area === 'local' && changes.temp_order_data) {
        const payload = changes.temp_order_data.newValue;
        if (payload && payload.orderData) {
            // Xác định là Hàng Loạt hay 1 Khách
            if (payload.isBulk && Array.isArray(payload.orderData)) {
                renderBulkTable(payload.orderData, customFields);
                setMsg('Đã bóc tách thành công hàng loạt!', 'ok');
            } else {
                hideBulkTable();
                fillDataToFields(payload.orderData);
                setMsg('AI đã bóc tách xong và điền dữ liệu!', 'ok');
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', loadFromStorage);