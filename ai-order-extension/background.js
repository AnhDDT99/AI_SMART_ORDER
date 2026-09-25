const API_BASE = 'http://localhost:3000/api/v1';
const NOTIF_ORDER_READY = 'order-ready';
const NOTIF_ERROR = 'order-error';

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        // TẠO 3 NÚT CHUỘT PHẢI
        chrome.contextMenus.create({ id: 'extract_order_single', title: 'Chốt 1 khách (Text)', contexts: ['selection'] });
        chrome.contextMenus.create({ id: 'extract_order_bulk', title: 'Chốt HÀNG LOẠT (Text)', contexts: ['selection'] });
        chrome.contextMenus.create({ id: 'extract_order_image', title: 'Chốt đơn (Ảnh)', contexts: ['image'] });
    });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);

function notify(id, title, message) {
    chrome.notifications.create(id, { type: 'basic', iconUrl: 'assets/icon.png', title, message, priority: 2 });
}

// Logic chính bóc tách & xây mảng dữ liệu (ĐÃ NÂNG CẤP ĐỂ HỖ TRỢ HÀNG LOẠT)
async function extractAndBuildOrder({ text, imageUrl, tabUrl, isBulk }) {
    const { customFields = [], appConfig = {}, aiPrompt = '' } = await chrome.storage.sync.get(['customFields', 'appConfig', 'aiPrompt']);
    const adminPrompt = aiPrompt || 'Trích xuất dữ liệu đơn hàng theo các trường được yêu cầu.';

    let aiData = isBulk ? [] : {}; // Hàng loạt thì là Mảng, 1 khách thì là Object
    if (text) {
        const response = await fetch(`${API_BASE}/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw_text: text, admin_prompt: adminPrompt, customFields, is_bulk: isBulk, sheet_config: appConfig })        });
        const result = await response.json();
        if (!result.success && !result.data) throw new Error(result.message || 'Bóc tách thất bại');
        aiData = result.data || (isBulk ? [] : {});
    }

    let finalOrderData;

    if (isBulk) {
        // Xử lý Mảng cho N khách hàng
        finalOrderData = Array.isArray(aiData) ? aiData : [];
        finalOrderData = finalOrderData.map(order => {
            const mappedOrder = {};
            for (const field of customFields) {
                if (field.type === 'TAB_URL') mappedOrder[field.name] = tabUrl || '';
                else if (field.type === 'IMAGE_URL') mappedOrder[field.name] = imageUrl || '';
                else {
                    const val = order[field.name];
                    mappedOrder[field.name] = (val === undefined || val === null) ? '' : String(val);
                }
            }
            return mappedOrder;
        });
    } else {
        // Xử lý Object cho 1 khách hàng
        finalOrderData = {};
        for (const field of customFields) {
            if (field.type === 'TAB_URL') {
                finalOrderData[field.name] = tabUrl || '';
            } else if (field.type === 'IMAGE_URL') {
                finalOrderData[field.name] = imageUrl || '';
            } else {
                const val = aiData[field.name];
                finalOrderData[field.name] = (val === undefined || val === null) ? '' : String(val);
            }
        }
    }

    // Bổ sung timestamp và cờ isBulk để truyền sang Popup (ui.js)
    const payload = { 
        orderData: finalOrderData, 
        customFields, 
        tabUrl, 
        imageUrl, 
        rawText: text,
        isBulk: isBulk, 
        timestamp: Date.now() 
    };
    
    await chrome.storage.local.set({ temp_order_data: payload });
    return payload;
}

// Lắng nghe sự kiện click chuột phải
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (tab && tab.windowId) {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.warn);
    }

    (async () => {
        const tabUrl = info.pageUrl || tab?.url || '';
        const text = (info.selectionText || '').trim();
        let imageUrl = info.srcUrl || '';

        // Đọc ID của menu để xem bạn bấm chốt 1 người hay Hàng Loạt
        const isBulk = info.menuItemId === 'extract_order_bulk';

        // Chốt chặn ảnh Base64
        if (imageUrl.startsWith('data:image')) {
            imageUrl = '[Ảnh copy trực tiếp không có link]';
        }

        if (!text && !imageUrl && imageUrl !== '[Ảnh copy trực tiếp không có link]') {
            return notify(NOTIF_ERROR, 'Lỗi', 'Không có text hoặc ảnh để chốt đơn.');
        }

        try {
            notify('processing', isBulk ? 'Đang bóc tách HÀNG LOẠT...' : 'Đang bóc tách...', 'Vui lòng đợi AI xử lý dữ liệu.');
            await extractAndBuildOrder({ text, imageUrl, tabUrl, isBulk });
            chrome.notifications.clear('processing');
        } catch (error) {
            chrome.notifications.clear('processing');
            notify(NOTIF_ERROR, 'Lỗi kết nối', error.message || 'Không kết nối được Backend!');
        }
    })();
});

// Xử lý Check Kho và Lưu đơn từ SidePanel gọi sang
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
        try {
            const { appConfig } = await chrome.storage.sync.get(['appConfig']);
            if (message.action === 'CHECK_INVENTORY') {
                const response = await fetch(`${API_BASE}/check-inventory`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sheet_config: appConfig, ...message.payload })
                });
                sendResponse({ ok: true, data: await response.json() });
                return;
            }
            if (message.action === 'SAVE_ORDER') {
                const { customFields } = await chrome.storage.sync.get(['customFields']);
                const response = await fetch(`${API_BASE}/save-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sheet_config: appConfig, orderData: message.orderData, customFields })
                });
                const result = await response.json();
                if (result.success) await chrome.storage.local.remove('temp_order_data');
                sendResponse({ ok: true, data: result });
                return;
            }
        } catch (error) {
            sendResponse({ ok: false, error: error.message });
        }
    })();
    return true;
});