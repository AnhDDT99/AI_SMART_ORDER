const { google } = require('googleapis');
const path = require('path');

const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(__dirname, '../config/service-account.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

function colToIndex(colLetter) {
    let index = 0;
    for (let i = 0; i < colLetter.length; i++) {
        index = index * 26 + (colLetter.toUpperCase().charCodeAt(i) - 64);
    }
    return index - 1;
}

async function getCapacityFromSheet(spreadsheetId, inventorySheet, colIdLetter, colQtyLetter, resourceId) {
    const sheets = google.sheets({ version: 'v4', auth });
    const range = `${inventorySheet}!A:Z`; 

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = response.data.values;
    
    if (!rows || rows.length === 0) return null;

    const idIdx = colToIndex(colIdLetter);
    const qtyIdx = colToIndex(colQtyLetter);

    for (let row of rows) {
        const currentId = row[idIdx];
        const currentQty = row[qtyIdx];

        if (currentId && currentId.trim().toUpperCase() === resourceId.trim().toUpperCase()) {
            return parseInt(currentQty, 10) || 0;
        }
    }
    return null;
}

async function appendOrderToSheet(spreadsheetId, orderSheet, orderStartCell, orderDataArray) {
    const sheets = google.sheets({ version: 'v4', auth });
    const range = `${orderSheet}!${orderStartCell}`; 

    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [orderDataArray] },
    });
}

async function getFirstRow(spreadsheetId, sheetName) {
    const sheets = google.sheets({ version: 'v4', auth });
    const range = `${sheetName}!1:1`;
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        return response.data.values ? response.data.values[0] : null;
    } catch (e) {
        return null;
    }
}

async function writeHeaders(spreadsheetId, sheetName, headers) {
    const sheets = google.sheets({ version: 'v4', auth });
    const range = `${sheetName}!A1`;
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [headers] },
    });
}

// ================= HÀM MỚI BỔ SUNG: Lấy bảng kho làm Từ Điển cho AI =================
async function getInventoryCatalog(spreadsheetId, inventorySheet) {
    const sheets = google.sheets({ version: 'v4', auth });
    const range = `${inventorySheet}!A:E`; // Đọc 5 cột đầu (Mã, Tên, Mô tả...) tối ưu tốc độ
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        const rows = response.data.values;
        if (!rows || rows.length < 2) return "";

        let catalogText = "TỪ ĐIỂN TỒN KHO THỰC TẾ (Dùng để đối chiếu Mã SP):\n";
        rows.forEach((row, index) => {
            if (index === 0) return; // Bỏ qua dòng tiêu đề
            catalogText += `- ${row.join(' | ')}\n`;
        });
        return catalogText;
    } catch (error) {
        console.error("Lỗi lấy danh mục kho làm từ điển:", error.message);
        return "";
    }
}

module.exports = { 
    getCapacityFromSheet, 
    appendOrderToSheet, 
    getFirstRow, 
    writeHeaders, 
    getInventoryCatalog // Đã export hàm mới
};