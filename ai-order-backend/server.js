require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { checkInventory, saveOrder } = require('./src/controllers/order.controller');
const { extractData } = require('./src/services/ai.service');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/v1/extract', async (req, res) => {
    console.log("[Server] DA NHAN TIN HIEU TU EXTENSION! Dang nho Gemini boc tach...");
    try {
        // Đã sửa userConfigFields thành customFields để khớp với dữ liệu Extension gửi lên
        const { raw_text, admin_prompt, customFields } = req.body;
        const result = await extractData(raw_text, admin_prompt, customFields);
        
        // Trả thẳng result (đã có chứa sẵn { success: true, data: ... } từ ai.service)
        res.json(result);
    } catch (error) {
        console.error("[Server] LOI GEMINI:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/v1/check-inventory', checkInventory);
app.post('/api/v1/save-order', saveOrder);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[Server] Backend dang chay tai http://localhost:${PORT}`);
});