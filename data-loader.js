/**
 * 職責：數據層與 GAS API 溝通模組。
 * 負責處理所有與 Google Apps Script Web App 的數據交換。
 * 包含：loadData() 讀取單字庫/錯題庫；saveRecord() 寫入紀錄/錯題。
 */
const GAS_URL = "https://script.google.com/macros/s/AKfycbxinzmkqyEnuBSJoWb3FCS8DvW_bIfVrI9huIklSmi-906Iuw8lzMo3SI1IIziQGStl/exec"; 

/**
 * 從 GAS 讀取指定的數據 ('vocab' 或 'errors')
 * @param {string} type - 數據類型 ('vocab' 或 'errors')
 * @returns {Promise<Array<Object>>} - 包含數據的 Promise
 */
export async function loadData(type) {
    console.log(`Loading data for type: ${type}`);
    try {
        const response = await fetch(`${GAS_URL}?type=${type}`);
        
        const text = await response.text(); 
        const data = JSON.parse(text); 

        if (data && data.error) {
            console.error(`Error loading ${type}:`, data.error);
            return [];
        }

        // 將 ID 確保為整數，方便後續比較
        if (type === 'vocab' && data.length > 0) {
            return data.map(item => ({
                ...item,
                ID: parseInt(item.ID)
            }));
        }
        
        return data;

    } catch (error) {
        console.error(`Failed to fetch ${type} data:`, error);
        return [];
    }
}

/**
 * 將測驗結果發送到 GAS 服務，儲存到 '測驗紀錄' 和 '錯題庫'。
 * @param {number} score - 最終得分百分比。
 * @param {string} level - 測驗級別 (如 'A', 'D')。
 * @param {number} timeSpent - 花費時間 (秒)。
 * @param {number} totalCorrect - 答對題數。
 * @param {number} totalWords - 總題數。
 * @param {Array<Object>} errorLog - 錯誤單字的詳細列表。
 * @returns {Promise<Object>} - 包含狀態的 Promise ('success'/'error')。
 */
export async function saveRecord(score, level, timeSpent, totalCorrect, totalWords, errorLog) { 
    const payload = {
        score,
        level,
        timeSpent,
        totalCorrect,
        totalWords,
        errors: errorLog
    };

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            // 使用 text/plain 兼容 GAS
            headers: {
                'Content-Type': 'text/plain;charset=utf-8', 
            },
            body: JSON.stringify(payload) 
        });

        const text = await response.text();
        const result = JSON.parse(text); 
        
        if (result.status === 'success') {
            console.log("GAS 紀錄儲存成功");
        } else {
            console.error("GAS 紀錄儲存失敗:", result.message);
        }
        
        return result;

    } catch (error) {
        console.error("發送儲存請求時發生網路錯誤:", error);
        return { status: 'network_error', message: error.toString() };
    }
}