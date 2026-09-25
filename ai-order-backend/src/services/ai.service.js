const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// CƠ CHẾ MỚI: Tự động dò khớp tên trường bất chấp hoa/thường + Xử lý Mảng Hàng Loạt
function normalizeExtractedData(parsed, fields) {
    const normalizeSingle = (obj) => {
        if (!obj || typeof obj !== 'object') return {};
        
        const lowerObj = {};
        for (const [k, v] of Object.entries(obj)) {
            lowerObj[String(k).toLowerCase().trim()] = v;
        }

        const normalized = {};
        for (const field of fields) {
            const exactKey = field.name;
            const lowerKey = String(exactKey).toLowerCase().trim();
            
            let val = obj[exactKey];
            if (val === undefined || val === null) {
                val = lowerObj[lowerKey]; // Dò bằng chữ thường nếu không khớp chính xác
            }
            
            normalized[exactKey] = (val === undefined || val === null) ? "" : String(val);
        }
        return normalized;
    };

    // Tự động nhận diện: Nếu AI trả về Mảng N khách -> Chuẩn hóa cả mảng
    if (Array.isArray(parsed)) {
        return parsed.map(item => normalizeSingle(item));
    }
    
    // Nếu AI trả về 1 khách -> Chuẩn hóa 1 object
    return normalizeSingle(parsed); 
}

// Bổ sung tham số isBulk = false để nhận biết đang quét 1 hay nhiều khách
// Thêm tham số catalogStr vào hàm
async function extractData(rawText, adminPrompt, customFields = [], isBulk = false, catalogStr = "", retries = 3) {
    const aiFields = customFields.filter(f => f.type === 'NORMAL' || f.type === 'PRODUCT_CODE');
    const fieldNames = aiFields.map(f => f.name);

    if (fieldNames.length === 0) return { success: true, data: isBulk ? [] : {} };

    // Câu thần chú ép AI dùng Từ điển kho
    const catalogPrompt = catalogStr ? `\nDưới đây là dữ liệu Tồn kho thực tế của shop:\n${catalogStr}\nLƯU Ý CỰC KỲ QUAN TRỌNG: Hãy đối chiếu tên sản phẩm khách gọi với dữ liệu Tồn kho ở trên để tìm ra [MÃ SẢN PHẨM] chính xác nhất và điền vào form. Không điền tên chung chung nếu trong kho có Mã tương ứng!` : '';

    const prompt = isBulk ? `
        Văn bản có nhiều khách hàng: "${rawText}"
        Lệnh: BẮT BUỘC trả về 1 MẢNG JSON (Array of Objects) chứa thông tin của TẤT CẢ các khách. 
        Mỗi khách là 1 Object với các key: ${fieldNames.map(f => `"${f}"`).join(', ')}.
        Nếu khách mua nhiều món, gộp vào trường "Mã SP" và gộp số lượng tương ứng, cách nhau dấu phẩy.
        ${catalogPrompt}
        Chỉ trả về định dạng [{}, {}, ...], tuyệt đối không giải thích thêm.
    ` : `
        ${adminPrompt}
        Văn bản cần xử lý: "${rawText}"
        Các trường bắt buộc phải có trong JSON (đúng key): ${fieldNames.map(f => `"${f}"`).join(', ')}.
        ${catalogPrompt}
        Chỉ trả về ĐÚNG 1 chuỗi JSON hợp lệ {...}, không kèm câu râu ria.
    `;


    for (let i = 0; i < retries; i++) {
        try {
            console.log(`[AI Service] Đang gửi Prompt lên Gemini (Lần thử ${i + 1} - Chế độ: ${isBulk ? 'HÀNG LOẠT' : '1 KHÁCH'})...`);
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: { 
                    responseMimeType: "application/json", 
                    temperature: 0.1
                   
                }
            });

            let textResult = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
            console.log("[AI Service] KẾT QUẢ THÔ TỪ GEMINI:\n", textResult);

            const parsed = JSON.parse(textResult);
            return { success: true, data: normalizeExtractedData(parsed, aiFields) };
        } catch (error) {
            console.error(`[AI Service] Lỗi bóc tách lần ${i + 1}:`, error.message);
            // Giảm delay xuống 500ms để thử lại nhanh hơn nếu mạng lag
            if ((error.status === 503 || error.status === 429) && i < retries - 1) {
                await delay(500);
                continue;
            }
            throw error;
        }
    }
}

module.exports = { extractData };