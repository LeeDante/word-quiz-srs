/**
 * 職責：測驗內容生成與邏輯模組。
 * 負責根據使用者設定和錯題庫生成最終題目列表。包含：30% 錯題穿插邏輯、
 * 困難模式選擇題選項生成，以及寬鬆模式拼字檢查邏輯。
 */
const ERROR_INTERLEAVE_RATIO = 0.3; // 30% 錯題穿插比例

// --- 輔助函式 ---

/** Fisher-Yates 洗牌算法：用於打亂陣列 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- 核心函式 ---

/**
 * 檢查拼字答案是否正確，採用寬鬆模式 (忽略大小寫和空格)。
 * @param {string} userInput - 使用者輸入的答案。
 * @param {string} correctAnswer - 試算表中儲存的正確答案。
 * @returns {boolean} - 答案是否正確。
 */
export function checkSpelling(userInput, correctAnswer) {
    if (!userInput || !correctAnswer) {
        return false;
    }
    const cleanInput = userInput.trim().toLowerCase();
    const cleanCorrect = correctAnswer.trim().toLowerCase();
    return cleanInput === cleanCorrect;
}

/**
 * 根據設定、單字庫和錯題庫生成最終的測驗題目列表。
 * @param {Object} settings - { startID, endID, count, level }
 * @param {Array<Object>} allVocab - 完整的單字庫
 * @param {Array<Object>} errorLog - 錯題庫數據
 * @returns {Array<Object>} - 打亂順序的測驗題目列表
 */
export function generateQuizList(settings, allVocab, errorLog) {
    const { startID, endID, count } = settings;
    let finalQuizList = [];

    // 1. 篩選出題範圍內的所有單字 (RangeVocab)
    const rangeVocab = allVocab.filter(word => 
        word.ID >= startID && word.ID <= endID
    );
    
    // 2. 篩選「錯題池」：從錯題庫中找出在本次測驗範圍內的單字ID
    const uniqueErrorIDs = [...new Set(errorLog.map(err => err.WordID))];
    let errorCandidates = rangeVocab.filter(word => 
        uniqueErrorIDs.includes(word.ID)
    );

    // 3. 確定錯題和新題數量
    const errorCount = Math.min(Math.floor(count * ERROR_INTERLEAVE_RATIO), errorCandidates.length);
    const newWordCount = count - errorCount;
    
    // 4. 生成「錯題」列表 (E 步驟)
    errorCandidates = shuffleArray(errorCandidates);
    const errorWords = errorCandidates.slice(0, errorCount);
    finalQuizList.push(...errorWords);

    // 5. 生成「新題」列表 (F 步驟)
    //    - 排除已被選為錯題的單字
    const usedIDs = new Set(errorWords.map(w => w.ID));
    let newWordCandidates = rangeVocab.filter(word => !usedIDs.has(word.ID));
    
    newWordCandidates = shuffleArray(newWordCandidates);
    const newWords = newWordCandidates.slice(0, newWordCount);
    finalQuizList.push(...newWords);

    // 6. 混合與輸出 (G 步驟)
    return shuffleArray(finalQuizList);
}

/**
 * 為單字生成選擇題的選項 (困難模式：相同詞性優先)。
 * @param {Object} correctWord - 正確答案單字物件。
 * @param {Array<Object>} testRangeVocab - 本次測驗範圍內的所有單字 (用於干擾項池)。
 * @param {boolean} isChineseToEnglish - 是否為中翻英 (影響選項內容：單字 vs. 解釋)。
 * @returns {Array<string>} - 4個選項，已打亂順序。
 */
export function generateMultipleChoice(correctWord, testRangeVocab, isChineseToEnglish) {
    const correctAnswer = isChineseToEnglish ? correctWord.English : correctWord.Chinese;
    const correctPOS = correctWord.POS;
    const needed = 3;

    // 篩選干擾項池：同詞性且非正確答案
    let potentialDistractors = testRangeVocab.filter(word => 
        word.POS === correctPOS && word.ID !== correctWord.ID
    );

    let distractors = [];
    
    // 1. 優先從同詞性範圍內抽取
    while (distractors.length < needed && potentialDistractors.length > 0) {
        const randomIndex = Math.floor(Math.random() * potentialDistractors.length);
        const distractor = potentialDistractors.splice(randomIndex, 1)[0]; 
        
        const distractorValue = isChineseToEnglish ? distractor.English : distractor.Chinese;
        // 確保選項不重複
        if (!distractors.includes(distractorValue)) {
            distractors.push(distractorValue);
        }
    }

    // 2. 如果不足，從範圍內剩餘的不同詞性單字中補充
    let fallbackCandidates = testRangeVocab.filter(word => 
        word.ID !== correctWord.ID && !distractors.includes(isChineseToEnglish ? word.English : word.Chinese)
    );

    while (distractors.length < needed && fallbackCandidates.length > 0) {
        const randomIndex = Math.floor(Math.random() * fallbackCandidates.length);
        const fallbackWord = fallbackCandidates.splice(randomIndex, 1)[0];

        const fallbackValue = isChineseToEnglish ? fallbackWord.English : fallbackWord.Chinese;
        if (!distractors.includes(fallbackValue)) {
            distractors.push(fallbackValue);
        }
    }

    let options = [correctAnswer, ...distractors];
    // 確保只有 4 個選項
    if (options.length > 4) options = options.slice(0, 4);

    return shuffleArray(options);
}