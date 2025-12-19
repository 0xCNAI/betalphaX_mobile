import { generateGeminiContent, GEMINI_MODELS } from './geminiService';
import { db } from './firebase'; // Import db directly
import { updateDoc } from 'firebase/firestore';

// In-flight request deduplication map
// Key: "docId_field_lang" -> Value: Promise<string>
const translationQueue = new Map();

/**
 * Translates text to the target language using Gemini 2.5 Flash Lite.
 * Uses a strict prompt to preserve formatting and data.
 * 
 * @param {string} text - The text to translate.
 * @param {string} targetLang - The target language code (e.g., 'zh-TW').
 * @returns {Promise<string>} - The translated text or null on failure.
 */
export const translateText = async (text, targetLang = 'zh-TW') => {
    if (!text || !text.trim()) return text;

    // Strict System Instruction
    const prompt = `
    You are a professional translator. Translate the following text into Traditional Chinese (Taiwan, zh-TW).
    
    CRITICAL RULES:
    1. Do NOT add, remove, summarize, or reinterpret any information.
    2. Keep tickers, numbers, dates, percentages, and technical indicator names (e.g., RSI, MA, FDV, TVL, MACD, Bollinger Bands) in their ORIGINAL English/Numerical format.
    3. Preserve ALL original formatting, including line breaks, bullet points, numbering, and Markdown emphasis (**bold**, *italic*).
    4. Do not output any conversational filler (e.g., "Here is the translation"). Return ONLY the translated text.
    5. If the text is a JSON string, do NOT translate it. Return it distinct.
    
    Original Text:
    "${text}"
    `;

    try {
        // Use Flash Lite for speed and cost efficiency
        const translated = await generateGeminiContent(
            prompt,
            GEMINI_MODELS.FLASH_LITE_2_5,
            'translation_service',
            false // use cache if available (geminiService has its own cache)
        );

        return translated ? translated.trim() : null;
    } catch (error) {
        console.error('Translation failed:', error);
        return null; // Fallback to original will be handled by caller
    }
};

/**
 * Retrieves a translation or creates one if it doesn't exist, persisting it to Firestore.
 * Handles in-flight deduplication to prevent redundant API calls.
 * 
 * @param {Object} params
 * @param {DocumentReference} params.docRef - Firestore document reference (optional, if persistence is needed).
 * @param {string} params.fieldPath - The field name of the original text (e.g., 'ai_insight').
 * @param {string} params.originalText - The content to translate.
 * @param {string} params.targetLang - Target language code (default: 'zh-TW').
 * @returns {Promise<string>} - The translated text.
 */
export const getOrCreateTranslation = async ({ docRef, fieldPath, originalText, targetLang = 'zh-TW' }) => {
    if (!originalText) return '';

    // If target is English, just return original (assuming source is English)
    if (targetLang === 'en') return originalText;

    // 1. Generate a unique key for deduplication
    const docId = docRef ? docRef.id : 'ephemeral';
    const queueKey = `${docId}_${fieldPath}_${targetLang}_${originalText.substring(0, 20)}`; // Short hash substitute

    // 2. Check in-flight queue
    if (translationQueue.has(queueKey)) {
        console.log(`[Translation] Joining in-flight request for ${queueKey}`);
        return translationQueue.get(queueKey);
    }

    // 3. Define the async work
    const work = async () => {
        try {
            console.log(`[Translation] Starting translation for ${fieldPath}...`);
            const translatedText = await translateText(originalText, targetLang);

            if (!translatedText) {
                // Failure case: return original text
                return originalText;
            }

            // 4. Persist to Firestore if docRef and fieldPath are provided
            if (docRef && fieldPath) {
                const targetField = `${fieldPath}_${targetLang.replace('-', '')}`; // e.g., ai_insight_zhTW
                try {
                    await updateDoc(docRef, {
                        [targetField]: translatedText
                    });
                    console.log(`[Translation] Persisted ${targetField} to Firestore.`);
                } catch (dbError) {
                    console.warn('[Translation] Failed to persist to Firestore:', dbError);
                    // We still return the translation even if save fails
                }
            }

            return translatedText;
        } catch (error) {
            console.error('[Translation] Error in getOrCreateTranslation:', error);
            return originalText;
        } finally {
            // Clean up queue
            translationQueue.delete(queueKey);
        }
    };

    // 5. Add to queue and execute
    const promise = work();
    translationQueue.set(queueKey, promise);
    return promise;
};
