const { getCapacityFromSheet, appendOrderToSheet, getFirstRow, writeHeaders, getInventoryCatalog } = require('../services/sheet.service.js');
const { extractData } = require('../services/ai.service.js'); 

exports.extractOrder = async (req, res) => {
    try {
        const { raw_text, admin_prompt, customFields, is_bulk, sheet_config } = req.body;
        if (!raw_text) return res.json({ success: false, message: "Không có văn bản để bóc tách." });

        console.log(`👉 ĐÃ NHẬN TÍN HIỆU TỪ EXTENSION! (Chế độ: ${is_bulk ? 'HÀNG LOẠT' : '1 KHÁCH'}). Đang nhờ Gemini bóc tách...`);

        // ĐỌC BẢNG KHO TỪ CẤU HÌNH SẴN CÓ ĐỂ LÀM "TỪ ĐIỂN" CHO AI
        let catalogStr = "";
        if (sheet_config && sheet_config.spreadsheet_id && sheet_config.inventory_sheet) {
            catalogStr = await getInventoryCatalog(sheet_config.spreadsheet_id, sheet_config.inventory_sheet);
            if (catalogStr) {
                console.log("📚 Đã load bảng Tồn Kho làm từ điển cho AI:", catalogStr.length, "ký tự");
            }
        }

        // Truyền thêm catalogStr vào AI service
        const result = await extractData(raw_text, admin_prompt, customFields, is_bulk, catalogStr);
        
        console.log("✅ BÓC TÁCH THÀNH CÔNG, ĐANG TRẢ VỀ POPUP");
        res.json(result);
    } catch (error) {
        console.error("❌ Lỗi Backend khi bóc tách:", error);
        res.status(500).json({ success: false, message: "Lỗi AI: " + error.message });
    }
};

exports.checkInventory = async (req, res) => {
    try {
        const { sheet_config, maSP, inventoryCodeCol, quantity } = req.body;
        const codeCol = inventoryCodeCol || sheet_config.inventoryCodeCol || sheet_config.col_id;
        const invSheet = sheet_config.inventory_sheet;

        if (!maSP) return res.json({ status: 'error', message: 'Thiếu mã/tên sản phẩm để kiểm tra!' });

        // Cắt chuỗi bằng dấu phẩy để check nhiều mã/tên cùng lúc
        const listMa = String(maSP).split(',').map(s => s.trim()).filter(Boolean);
        const listQty = String(quantity).split(',').map(s => parseInt(s.trim(), 10) || 1);

        let resultMsgs = [];
        let isAllOk = true;

        for (let i = 0; i < listMa.length; i++) {
            const currentCode = listMa[i];
            const currentQty = listQty[i] || 1; 

            const currentStock = await getCapacityFromSheet(
                sheet_config.spreadsheet_id, invSheet, codeCol, sheet_config.col_qty, currentCode
            );

            if (currentStock === null) {
                resultMsgs.push(`❌ [${currentCode}]: Không tìm thấy trong kho`);
                isAllOk = false;
                continue;
            }

            const ton = parseInt(currentStock, 10) || 0;
            if (ton >= currentQty) {
                resultMsgs.push(`✅ [${currentCode}]: Tồn ${ton}`);
            } else {
                resultMsgs.push(`⚠️ [${currentCode}]: Tồn ${ton} (Không đủ xuất ${currentQty})`);
                isAllOk = false;
            }
        }

        return res.json({ status: isAllOk ? 'success' : 'warning', message: resultMsgs.join(' | ') });
    } catch (error) {
        res.status(500).json({ status: 'error', message: "Lỗi đọc Sheets: " + error.message });
    }
};

exports.saveOrder = async (req, res) => {
    try {
        const { sheet_config, orderData, customFields } = req.body;
        
        const khoFieldConfig = customFields.find(f => f.type === 'PRODUCT_CODE');
        const qtyFieldConfig = customFields.find(f => f.name.toLowerCase().includes('số lượng') || f.name.toLowerCase().includes('quantity') || f.name.toLowerCase().includes('sl'));

        const firstRow = await getFirstRow(sheet_config.spreadsheet_id, sheet_config.order_sheet);
        if (!firstRow || firstRow.length === 0) {
            const headers = ['STT', ...customFields.map(f => f.name)];
            await writeHeaders(sheet_config.spreadsheet_id, sheet_config.order_sheet, headers);
        }

        const rawMaSP = khoFieldConfig ? orderData[khoFieldConfig.name] : '';
        const rawQty = qtyFieldConfig ? orderData[qtyFieldConfig.name] : '';
        
        const listMa = rawMaSP ? String(rawMaSP).split(',').map(s => s.trim()).filter(Boolean) : [''];
        const listQty = rawQty ? String(rawQty).split(',').map(s => s.trim()) : [''];

        // Xác định số dòng cần tách dựa trên số lượng sản phẩm
        const totalRows = Math.max(listMa.length, 1);

        for (let i = 0; i < totalRows; i++) {
            const rowData = ['=ROW()-1']; 

            for (const field of customFields) {
                let strValue = '';
                
                // Nhét đúng mã và số lượng cho từng dòng tách biệt
                if (khoFieldConfig && field.name === khoFieldConfig.name) {
                    strValue = listMa[i] || listMa[0] || ''; 
                } else if (qtyFieldConfig && field.name === qtyFieldConfig.name) {
                    strValue = listQty[i] || '1'; 
                } else {
                    // Copy dữ liệu khách hàng (Tên, SĐT, Địa chỉ) xuống các dòng
                    let val = orderData[field.name];
                    strValue = (val === undefined || val === null) ? '' : String(val);
                    if (strValue.length > 49000) {
                        strValue = strValue.substring(0, 100) + '... [Lỗi: Link Ảnh dạng Base64 quá dài]';
                    }
                }
                rowData.push(strValue);
            }

            await appendOrderToSheet(
                sheet_config.spreadsheet_id,
                sheet_config.order_sheet,
                sheet_config.order_start_cell || 'A1',
                rowData
            );
        }

        res.json({ success: true, message: `Đã tách và lưu ${totalRows} dòng đơn hàng!` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi ghi đơn: " + error.message });
    }
};