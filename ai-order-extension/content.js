chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_CONTEXT") {
        let imageUrl = "";
        let profileUrl = "";
        try {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const node = selection.anchorNode;
                const container = node.parentElement ? node.parentElement.closest('div') : null;
                if (container) {
                    const img = container.querySelector('img');
                    if (img) imageUrl = img.src;
                    const link = container.closest('div').querySelector('a');
                    if (link) profileUrl = link.href;
                }
            }
        } catch (e) {
            console.log("Lỗi quét DOM:", e);
        }
        sendResponse({ imageUrl, profileUrl });
    }
    return true;
});
